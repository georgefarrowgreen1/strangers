import { audit } from "./audit";
import { isWholesaleDelivery } from "../public/wholesale/shipping.js";
import { ApiError, type Env, invalid, json, readJson } from "./http";
import { createRoyalMailOrder, fetchRoyalMailLabel, fetchRoyalMailTracking, findRoyalMailOrder, RoyalMailError, royalMailTrackingNumber } from "./royalMail";
import { get, object, text, version, type Versioned } from "./wholesaleStore";
import type { CustomerLocation } from "./wholesaleCustomers";

interface Order {
  preview?: boolean;
  customerId?: string | null;
  deletedAt?: number;
  skipped?: unknown;
  status: string;
  delivery: string;
  business: string;
  createdAt: number;
  grams: number;
  pence: number;
  deliveryPence?: number;
  totalPence?: number;
  locationId?: string;
  locationSnapshot?: CustomerLocation;
  customerSnapshot?: Pick<CustomerLocation, "address" | "postcode" | "contact">;
  lines?: Array<{ productId: string; pack: string; grind?: string; quantity: number; grams: number }>;
}

interface Shipment {
  state: "booking" | "review" | "created" | "labelled" | "dispatched" | "failed";
  operation: string;
  order_version: number;
  provider_id: number | null;
  tracking_number: string | null;
  carrier_status: string | null;
  carrier_event_at: string | null;
  weight_grams: number;
  updated_at: number;
  shipping_fingerprint: string | null;
  review_required: number;
  problem: string | null;
  requested_at: number | null;
  checked_at: number | null;
  destination_address: string | null;
  destination_postcode: string | null;
}

type ShippingOrder = Order & Versioned;
export type ShippingGuard = { sql: string; args: (string | number | null)[] };
const REFRESH_INTERVAL = 30_000;
const BOOKING_GRACE = 60_000;
export const ROYAL_MAIL_ORDER_ROUTE = /^orders\/(WS-[A-F0-9]{32})\/shipping(?:\/(label|refresh|verify))?$/;

function config(env: Env) {
  const key = env.WHOLESALE_ROYAL_MAIL_CLICK_DROP_KEY?.trim();
  const serviceCode = env.WHOLESALE_ROYAL_MAIL_SERVICE_CODE?.trim();
  return key && serviceCode ? { key, serviceCode,
    serviceRegisterCode: env.WHOLESALE_ROYAL_MAIL_SERVICE_REGISTER_CODE?.trim() || undefined,
    shippingAccountName: env.WHOLESALE_ROYAL_MAIL_SHIPPING_ACCOUNT?.trim() || undefined,
  } : null;
}

function trackingConfig(env: Env) {
  const clientId = env.WHOLESALE_ROYAL_MAIL_TRACKING_CLIENT_ID?.trim();
  const clientSecret = env.WHOLESALE_ROYAL_MAIL_TRACKING_CLIENT_SECRET?.trim();
  return clientId && clientSecret && env.WHOLESALE_ROYAL_MAIL_TRACKING_TERMS_ACCEPTED === "yes"
    ? { clientId, clientSecret, acceptTerms: true as const } : null;
}

function field(value: unknown, name: string, limit: number, required = true) {
  const cleaned = text(value, name, limit, required);
  if (/[\u0000-\u001f\u007f]/.test(cleaned)) throw invalid(`Check ${name}.`);
  return cleaned;
}

function eligibleOrder(order: Order | null): order is Order {
  return !!order && order.deletedAt == null && order.preview === false && !!order.customerId && isWholesaleDelivery(order.delivery);
}

function canUseShipment(order: Order) {
  return eligibleOrder(order) && !order.skipped && ["Ready", "Dispatched"].includes(order.status);
}

function labelReady(row: Shipment) {
  return row.state === "labelled" || row.state === "dispatched";
}

async function shippingFingerprint(order: Order) {
  const location = order.locationSnapshot;
  const customer = order.customerSnapshot;
  const contents = (order.lines ?? []).map(line => JSON.stringify([line.productId, line.pack, line.grind, line.quantity, line.grams])).sort();
  const details = JSON.stringify([order.customerId, order.locationId, order.business, order.delivery,
    location?.address ?? customer?.address, location?.postcode ?? customer?.postcode,
    location?.contact ?? customer?.contact, order.grams, contents]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(details));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function orderChanged(row: Shipment, order: ShippingOrder) {
  if (!canUseShipment(order)) return true;
  return row.shipping_fingerprint ? await shippingFingerprint(order) !== row.shipping_fingerprint : row.order_version !== order.version;
}

function trackingLink(number: string | null) {
  return number ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(number)}` : null;
}

async function shipmentView(row: Shipment | null, order: ShippingOrder) {
  if (!row) return null;
  const changed = await orderChanged(row, order);
  const reviewRequired = !!row.review_required;
  return {
    state: row.state,
    orderId: row.provider_id,
    trackingNumber: row.tracking_number,
    trackingUrl: !changed && !reviewRequired && labelReady(row) ? trackingLink(row.tracking_number) : null,
    carrierStatus: row.carrier_status,
    carrierEventAt: row.carrier_event_at,
    weightGrams: row.weight_grams,
    updatedAt: row.updated_at,
    requestedAt: row.requested_at || null,
    checkedAt: row.checked_at,
    orderChanged: changed,
    reviewRequired,
    problem: row.problem,
  };
}

async function getShipment(env: Env, id: string) {
  return env.DB.prepare(`SELECT state, operation, order_version, provider_id, tracking_number, carrier_status, carrier_event_at,
    weight_grams, updated_at, shipping_fingerprint, review_required, problem, requested_at, checked_at,
    destination_address, destination_postcode
    FROM wholesale_royal_mail_shipments WHERE order_id = ?`).bind(id).first<Shipment>();
}

function handoverReview() {
  return new ApiError(409, "royal_mail_handover_review", "Review the Royal Mail shipment before dispatching. If you used a different courier, enter its tracking link.");
}

function isRoyalMailLink(link: string) {
  try { return /(?:^|\.)royalmail\.(?:com|net)$/.test(new URL(link).hostname); }
  catch { return false; }
}

/** Resolve the local label at handover and guard the order and email writes against racing shipment changes. */
export async function resolveWholesaleHandover(env: Env, order: ShippingOrder, link: string) {
  const row = await getShipment(env, order.id);
  const exclude = (condition: string): ShippingGuard => ({
    sql: ` AND NOT EXISTS (SELECT 1 FROM wholesale_royal_mail_shipments WHERE order_id = ? AND ${condition})`,
    args: [order.id],
  });
  if (link && !isRoyalMailLink(link)) {
    if (row?.state === "booking") throw handoverReview();
    return { trackingUrl: link, guard: exclude("state = 'booking'") };
  }
  if (!row || row.state === "failed") return { trackingUrl: link, guard: exclude("state <> 'failed'") };
  if (!row.provider_id || !labelReady(row) || row.review_required || await orderChanged(row, order)) throw handoverReview();
  const canonical = trackingLink(row.tracking_number);
  if (link && link !== canonical) throw handoverReview();
  const guard: ShippingGuard = {
    sql: ` AND EXISTS (SELECT 1 FROM wholesale_royal_mail_shipments WHERE order_id = ? AND operation = ?
      AND provider_id = ? AND tracking_number IS ? AND review_required = 0 AND state IN ('labelled','dispatched'))`,
    args: [order.id, row.operation, row.provider_id, row.tracking_number],
  };
  const destination = row.requested_at && row.destination_address && row.destination_postcode
    ? { address: row.destination_address, postcode: row.destination_postcode } : undefined;
  return { trackingUrl: canonical || "", guard, destination };
}

async function recordCarrier(env: Env, id: string, operation: string,
  carrier: Awaited<ReturnType<typeof createRoyalMailOrder>>, requireReview = false, replaceTracking = false) {
  const result = await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET state = CASE
    WHEN state = 'dispatched' OR (state = 'labelled' AND ? = 'created') THEN state ELSE ? END, provider_id = ?,
    carrier_status = CASE WHEN ? IS NOT NULL AND tracking_number IS NOT ? THEN NULL ELSE carrier_status END,
    carrier_event_at = CASE WHEN ? IS NOT NULL AND tracking_number IS NOT ? THEN NULL ELSE carrier_event_at END,
    review_required = MAX(review_required, ?), problem = NULL,
    tracking_number = COALESCE(?,tracking_number), updated_at = ? WHERE order_id = ? AND operation = ?
    AND (provider_id IS NULL OR provider_id = ?)
    AND (tracking_number IS NULL OR ? IS NULL OR tracking_number = ? OR ? = 1)`)
    .bind(carrier.providerState, carrier.providerState, carrier.orderId,
      carrier.trackingNumber, carrier.trackingNumber, carrier.trackingNumber, carrier.trackingNumber,
      Number(requireReview), carrier.trackingNumber, Date.now(), id, operation, carrier.orderId,
      carrier.trackingNumber, carrier.trackingNumber, Number(replaceTracking)).run();
  if (result.meta.changes) return true;
  await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET review_required = 1, updated_at = ?
    WHERE order_id = ? AND operation = ? AND
    (provider_id <> ? OR (tracking_number IS NOT NULL AND ? IS NOT NULL AND tracking_number <> ?))`)
    .bind(Date.now(), id, operation, carrier.orderId, carrier.trackingNumber, carrier.trackingNumber).run();
  return false;
}

export async function handleWholesaleRoyalMail(req: Request, env: Env, id: string, action: string | undefined, actor: { role: string; name: string }): Promise<Response> {
  const order = await get<Order>(env, "order", id);
  if (!eligibleOrder(order)) {
    throw new ApiError(404, "not_found", "Royal Mail shipping is available on wholesale delivery orders.");
  }
  const settings = config(env);
  const tracking = trackingConfig(env);
  const getView = async (status = 200, trackingWarning?: string) => {
    const [latest, shipment] = await Promise.all([get<Order>(env, "order", id), getShipment(env, id)]);
    if (!eligibleOrder(latest)) throw new ApiError(404, "not_found", "This order is no longer available.");
    return json({ enabled: !!settings,
      canCreate: !!settings && actor.role === "admin" && latest.status === "Ready" && !latest.skipped,
      orderVersion: latest.version, shipment: await shipmentView(shipment, latest), trackingEnabled: !!tracking,
      ...(trackingWarning ? { trackingWarning } : {}),
    }, status);
  };
  if (!action && req.method === "GET") return getView();
  if (req.method !== (action === "label" ? "GET" : "POST")) {
    throw new ApiError(405, "method_not_allowed", "This shipping action is unavailable.");
  }
  if (!settings) throw new ApiError(503, "royal_mail_not_configured", "Royal Mail Click & Drop requires an account key and a service code.");

  const existing = await getShipment(env, id);
  if (action === "label") {
    if (!existing?.provider_id || !labelReady(existing)) {
      throw new ApiError(409, "label_pending", "Complete the label in Click & Drop, then check the shipment before downloading it.");
    }
    const review = () => new ApiError(409, "label_needs_review", "Check the label in Click & Drop before using it for this order.");
    if (existing.review_required || await orderChanged(existing, order)) throw review();
    let pdf: Uint8Array;
    try {
      // Verify the pinned identifier in the active account before requesting private label bytes.
      const carrier = await findRoyalMailOrder(settings.key, id);
      if (!carrier || carrier.orderId !== existing.provider_id ||
          existing.tracking_number && carrier.trackingNumber && carrier.trackingNumber !== existing.tracking_number) {
        await env.DB.prepare("UPDATE wholesale_royal_mail_shipments SET review_required = 1 WHERE order_id = ? AND operation = ?")
          .bind(id, existing.operation).run();
        throw review();
      }
      pdf = await fetchRoyalMailLabel(settings.key, existing.provider_id);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "label_unavailable", "The label is not available. Check its status in Royal Mail Click & Drop.");
    }
    const [latest, shipment] = await Promise.all([get<Order>(env, "order", id), getShipment(env, id)]);
    if (!latest || !shipment || shipment.operation !== existing.operation || shipment.provider_id !== existing.provider_id ||
        shipment.tracking_number !== existing.tracking_number || !labelReady(shipment) || shipment.review_required || await orderChanged(shipment, latest)) {
      throw review();
    }
    return new Response(pdf, { headers: { "content-type": "application/pdf", "cache-control": "no-store",
      "content-disposition": `attachment; filename="Royal-Mail-${id}.pdf"` } });
  }
  if (action === "verify") {
    if (actor.role !== "admin") throw new ApiError(403, "permission_denied", "An admin must verify the Royal Mail shipment.");
    const body = object(await readJson(req, 1024));
    if (version(body.ifVersion) !== order.version) throw new ApiError(409, "conflict", "Review the latest order before verifying the shipment.");
    const number = royalMailTrackingNumber(body.trackingNumber);
    if (body.confirmed !== true || !number) throw invalid("Confirm the label details and enter its Royal Mail tracking number.");
    if (!existing?.review_required || !existing.provider_id || await orderChanged(existing, order)) throw handoverReview();
    let carrier: Awaited<ReturnType<typeof findRoyalMailOrder>>;
    try { carrier = await findRoyalMailOrder(settings.key, id); }
    catch { throw new ApiError(503, "royal_mail_unavailable", "Royal Mail could not verify the shipment. Try again shortly."); }
    if (!carrier || carrier.orderId !== existing.provider_id || carrier.trackingNumber !== number ||
        carrier.providerState === "created" && (!labelReady(existing) || number !== existing.tracking_number)) throw handoverReview();
    if (!await recordCarrier(env, id, existing.operation, carrier, false, true)) throw handoverReview();
    const checkedAt = Date.now();
    const verified = await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET review_required = 0, checked_at = ?, updated_at = ?
      WHERE order_id = ? AND operation = ? AND provider_id = ? AND tracking_number = ? AND review_required = 1
      AND EXISTS (SELECT 1 FROM wholesale_preview WHERE kind = 'order' AND id = ? AND version = ?)`)
      .bind(checkedAt, checkedAt, id, existing.operation, existing.provider_id, number, id, order.version).run();
    if (!verified.meta.changes) throw handoverReview();
    await audit(env, "wholesale_royal_mail", actor.name, `Royal Mail shipment verified for ${id}.`);
    return getView();
  }
  if (action === "refresh") {
    if (!existing || existing.state === "failed") return getView();
    const now = Date.now();
    const claimed = await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET refresh_after = ?
      WHERE order_id = ? AND operation = ? AND state <> 'failed' AND COALESCE(refresh_after, 0) <= ?
      AND (state <> 'booking' OR updated_at <= ?)`)
      .bind(now + REFRESH_INTERVAL, id, existing.operation, now, now - BOOKING_GRACE).run();
    if (!claimed.meta.changes) return getView();
    try {
      const carrier = await findRoyalMailOrder(settings.key, id);
      const checkedAt = Date.now();
      await env.DB.prepare("UPDATE wholesale_royal_mail_shipments SET checked_at = ? WHERE order_id = ? AND operation = ?")
        .bind(checkedAt, id, existing.operation).run();
      if (carrier) {
        if (!await recordCarrier(env, id, existing.operation, carrier, existing.requested_at === 0)) {
          return getView(200, "Royal Mail returned different shipment details. Check the label in Click & Drop.");
        }
      } else if (existing.provider_id) {
        await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET review_required = 1, updated_at = ?
          WHERE order_id = ? AND operation = ? AND provider_id = ?`).bind(checkedAt, id, existing.operation, existing.provider_id).run();
        return getView(200, "Royal Mail could not find the saved shipment. Check the original order in Click & Drop.");
      } else {
        await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET state = CASE WHEN requested_at = 0 THEN 'failed' ELSE 'review' END,
          problem = CASE WHEN requested_at = 0 THEN 'No label request was sent. You can review the parcel and try again.' ELSE NULL END,
          updated_at = ? WHERE order_id = ? AND operation = ? AND provider_id IS NULL
          AND (state = 'review' OR (state = 'booking' AND updated_at <= ?))`)
          .bind(checkedAt, id, existing.operation, now - BOOKING_GRACE).run();
        return getView();
      }
      const number = carrier?.trackingNumber || existing.tracking_number;
      let warning: string | undefined;
      if (tracking && number) {
        try {
          const [snapshot] = await fetchRoyalMailTracking(tracking, [number]);
          if (snapshot?.status === "available" && (snapshot.lastEventName || snapshot.statusCategory)) {
            const since = snapshot.lastEventAt;
            const time = since && Number.isFinite(Date.parse(since)) ? new Date(since).toISOString() : null;
            const description = snapshot.lastEventName || snapshot.statusCategory;
            await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET carrier_status = ?, carrier_event_at = ?
              WHERE order_id = ? AND operation = ? AND tracking_number = ?
              AND (carrier_event_at IS NULL OR (? IS NOT NULL AND carrier_event_at <= ?))`)
              .bind(description, time, id, existing.operation, number, time, time).run();
          } else if (snapshot?.status === "not-found") {
            warning = "Royal Mail does not recognise the tracking number yet. Check again after the first parcel scan.";
          }
        } catch {
          warning = "Royal Mail carrier scans could not be refreshed. Try again shortly.";
        }
      }
      return getView(200, warning);
    } catch {
      throw new ApiError(503, "royal_mail_unavailable", "Royal Mail did not return an update. Try again shortly.");
    }
  }

  if (actor.role !== "admin") throw new ApiError(403, "permission_denied", "An admin must create Royal Mail shipments.");
  if (order.status !== "Ready" || order.skipped) throw new ApiError(409, "order_not_ready", "Pack the order and mark it Ready before creating postage.");
  if (existing && existing.state !== "failed") return getView(existing.provider_id ? 200 : 202);

  const body = object(await readJson(req, 4096));
  if (version(body.ifVersion) !== order.version) throw new ApiError(409, "conflict", "Review the latest order before creating postage.");
  const weight = body.weightGrams;
  if (!Number.isInteger(weight) || !Number.isSafeInteger(order.grams) || weight < Math.max(1, order.grams) || weight > 30_000) {
    throw invalid("Enter the packed weight in grams. It must cover all the coffee and be at most 30 kg for one parcel.");
  }
  const recipient = object(body.recipient);
  const postcode = field(recipient.postcode, "the UK postcode", 12).toUpperCase().replace(/ /g, "");
  if (!/^(?:GIR0AA|[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-Z]{2})$/.test(postcode) || /^(?:BT|GY|JE|IM)/.test(postcode)) {
    throw invalid("Enter a valid Great Britain postcode.");
  }
  const address = { name: field(recipient.name, "recipient name", 100), companyName: order.business.slice(0, 100),
    addressLine1: field(recipient.line1, "address line 1", 100), addressLine2: field(recipient.line2, "address line 2", 100, false),
    city: field(recipient.city, "town or city", 100), postcode: postcode.slice(0, -3) + " " + postcode.slice(-3) };

  const operation = crypto.randomUUID();
  const fingerprint = await shippingFingerprint(order);
  const reserved = await env.DB.prepare(`INSERT INTO wholesale_royal_mail_shipments
      (order_id, state, operation, order_version, shipping_fingerprint, weight_grams, updated_at, requested_at,
      destination_address, destination_postcode)
    SELECT ?, 'booking', ?, ?, ?, ?, ?, 0, ?, ? WHERE EXISTS (
      SELECT 1 FROM wholesale_preview WHERE kind='order' AND id=? AND version=? AND json_extract(data,'$.status')='Ready'
    ) ON CONFLICT(order_id) DO UPDATE SET state=excluded.state, operation=excluded.operation,
      order_version=excluded.order_version, shipping_fingerprint=excluded.shipping_fingerprint,
      weight_grams=excluded.weight_grams, updated_at=excluded.updated_at, requested_at=0, checked_at=NULL, refresh_after=NULL, problem=NULL,
      destination_address=excluded.destination_address, destination_postcode=excluded.destination_postcode
    WHERE wholesale_royal_mail_shipments.state = 'failed' RETURNING operation`)
    .bind(id, operation, order.version, fingerprint, weight, Date.now(),
      [address.addressLine1, address.addressLine2, address.city].filter(Boolean).join(", "), address.postcode,
      id, order.version).first();
  if (!reserved) {
    if (await getShipment(env, id)) return getView(202);
    throw new ApiError(409, "conflict", "The order changed. Review it before creating postage.");
  }

  let outcome: "lookup" | "requested" | "known" = "lookup";
  try {
    const prior = await findRoyalMailOrder(settings.key, id);
    if (!prior) {
      // Commit the outbound marker before transmission. A process stopped before this point can release the reservation.
      const at = Date.now();
      const sending = await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET requested_at = ?, updated_at = ?
        WHERE order_id = ? AND operation = ? AND state = 'booking' AND requested_at = 0
        AND EXISTS (SELECT 1 FROM wholesale_preview WHERE kind = 'order' AND id = ? AND version = ?)`)
        .bind(at, at, id, operation, id, order.version).run();
      if (!sending.meta.changes) {
        throw new ApiError(409, "conflict", "The order changed while Royal Mail was checked. Review it before creating postage.");
      }
    }
    outcome = prior ? "known" : "requested";
    const carrier = prior ?? await createRoyalMailOrder(settings.key, { reference: id, orderDate: new Date(order.createdAt).toISOString(),
      recipient: address, parcel: { weightInGrams: weight, format: "parcel" }, serviceCode: settings.serviceCode,
      serviceRegisterCode: settings.serviceRegisterCode, shippingAccountName: settings.shippingAccountName,
      subtotalPence: order.pence, shippingPence: order.deliveryPence ?? 0, totalPence: order.totalPence ?? order.pence + (order.deliveryPence ?? 0),
    });
    outcome = "known";
    const latest = await get<Order>(env, "order", id);
    const latestChanged = !latest || !canUseShipment(latest) || await shippingFingerprint(latest) !== fingerprint;
    await recordCarrier(env, id, operation, carrier, !!prior || latestChanged);
  } catch (error) {
    const state = outcome === "lookup" || (outcome === "requested" && error instanceof RoyalMailError && !error.uncertain) ? "failed" : "review";
    const problem = state === "failed" ? error instanceof RoyalMailError ? error.message : "Royal Mail could not be reached. Review the order and try again." : null;
    await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET state = ?, problem = ?, updated_at = ?
      WHERE order_id = ? AND operation = ? AND provider_id IS NULL`).bind(state, problem, Date.now(), id, operation).run();
    if (error instanceof ApiError) throw error;
    return getView(state === "review" ? 202 : 200);
  }
  await audit(env, "wholesale_royal_mail", actor.name, `Royal Mail shipment recorded for ${id}.`);
  return getView(201);
}
