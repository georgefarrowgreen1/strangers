import { audit } from "./audit";
import { ApiError, type Env, invalid, json, readJson } from "./http";
import { createRoyalMailOrder, fetchRoyalMailLabel, fetchRoyalMailTracking, findRoyalMailOrder, RoyalMailError } from "./royalMail";
import { get, object, text, version } from "./wholesaleStore";

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
}

export const ROYAL_MAIL_ORDER_ROUTE = /^orders\/(WS-[A-F0-9]{32})\/shipping(?:\/(label|refresh))?$/;

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

function shipmentView(row: Shipment | null, orderVersion: number) {
  if (!row) return null;
  return {
    state: row.state,
    orderId: row.provider_id,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_number ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(row.tracking_number)}` : null,
    carrierStatus: row.carrier_status,
    carrierEventAt: row.carrier_event_at,
    weightGrams: row.weight_grams,
    updatedAt: row.updated_at,
    orderChanged: row.order_version !== orderVersion,
  };
}

async function getShipment(env: Env, id: string) {
  return env.DB.prepare(`SELECT state, operation, order_version, provider_id, tracking_number, carrier_status, carrier_event_at, weight_grams, updated_at
    FROM wholesale_royal_mail_shipments WHERE order_id = ?`).bind(id).first<Shipment>();
}

async function recordCarrier(env: Env, id: string, operation: string, carrier: Awaited<ReturnType<typeof createRoyalMailOrder>>) {
  await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET state = CASE
    WHEN state = 'dispatched' OR (state = 'labelled' AND ? = 'created') THEN state ELSE ? END, provider_id = ?,
    carrier_status = CASE WHEN ? IS NOT NULL AND tracking_number IS NOT ? THEN NULL ELSE carrier_status END,
    carrier_event_at = CASE WHEN ? IS NOT NULL AND tracking_number IS NOT ? THEN NULL ELSE carrier_event_at END,
    tracking_number = COALESCE(?,tracking_number), updated_at = ? WHERE order_id = ? AND operation = ?`)
    .bind(carrier.providerState, carrier.providerState, carrier.orderId,
      carrier.trackingNumber, carrier.trackingNumber, carrier.trackingNumber, carrier.trackingNumber,
      carrier.trackingNumber, Date.now(), id, operation).run();
}

export async function handleWholesaleRoyalMail(req: Request, env: Env, id: string, action: string | undefined, actor: { role: string; name: string }): Promise<Response> {
  const order = await get<Order>(env, "order", id);
  if (!order || order.deletedAt != null || order.preview !== false || !order.customerId ||
      !/^(?:delivery|courier)$/i.test(order.delivery)) {
    throw new ApiError(404, "not_found", "Royal Mail shipping is available on wholesale delivery orders.");
  }
  const settings = config(env);
  const tracking = trackingConfig(env);
  const getView = async (status = 200, trackingWarning?: string) => {
    const [latest, shipment] = await Promise.all([get<Order>(env, "order", id), getShipment(env, id)]);
    if (!latest || latest.deletedAt != null) throw new ApiError(404, "not_found", "This order is no longer available.");
    return json({ enabled: !!settings,
      canCreate: !!settings && actor.role === "admin" && latest.status === "Ready" && !latest.skipped,
      orderVersion: latest.version, shipment: shipmentView(shipment, latest.version), trackingEnabled: !!tracking,
      ...(trackingWarning ? { trackingWarning } : {}),
    }, status);
  };
  if (!action && req.method === "GET") return getView();
  if ((!action && req.method !== "POST") || (action === "label" && req.method !== "GET") ||
      (action === "refresh" && req.method !== "POST")) throw new ApiError(405, "method_not_allowed", "This shipping action is unavailable.");
  if (!settings) throw new ApiError(503, "royal_mail_not_configured", "Royal Mail Click & Drop requires an account key and a service code.");

  const existing = await getShipment(env, id);
  if (action === "label") {
    if (!existing?.provider_id) throw new ApiError(409, "label_pending", "Create and confirm the Royal Mail shipment before downloading a label.");
    try {
      const pdf = await fetchRoyalMailLabel(settings.key, existing.provider_id);
      return new Response(pdf, { headers: { "content-type": "application/pdf", "cache-control": "no-store",
        "content-disposition": `attachment; filename="Royal-Mail-${id}.pdf"` } });
    } catch {
      throw new ApiError(503, "label_unavailable", "The label is not available. Check its status in Royal Mail Click & Drop.");
    }
  }
  if (action === "refresh") {
    if (!existing || existing.state === "failed" || (Date.now() - existing.updated_at < 15_000)) return getView();
    try {
      const carrier = await findRoyalMailOrder(settings.key, id);
      if (carrier) await recordCarrier(env, id, existing.operation, carrier);
      else if (!existing.provider_id) await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET state = 'review', updated_at = ?
        WHERE order_id = ? AND operation = ? AND provider_id IS NULL`).bind(Date.now(), id, existing.operation).run();
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
  if (!Number.isInteger(weight) || weight < Math.max(1, order.grams) || weight > 30_000) {
    throw invalid("Enter the packed weight in grams. It must cover all the coffee and be at most 30 kg for one parcel.");
  }
  const recipient = object(body.recipient);
  const postcode = field(recipient.postcode, "the UK postcode", 12).toUpperCase().replace(/ /g, "");
  if (!/^(?:GIR0AA|[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-Z]{2})$/.test(postcode)) throw invalid("Enter a valid UK postcode.");
  const address = { name: field(recipient.name, "recipient name", 100), companyName: order.business.slice(0, 100),
    addressLine1: field(recipient.line1, "address line 1", 100), addressLine2: field(recipient.line2, "address line 2", 100, false),
    city: field(recipient.city, "town or city", 100), postcode: postcode.slice(0, -3) + " " + postcode.slice(-3) };

  const operation = crypto.randomUUID();
  const reserved = await env.DB.prepare(`INSERT INTO wholesale_royal_mail_shipments
      (order_id, state, operation, order_version, weight_grams, updated_at)
    SELECT ?, 'booking', ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM wholesale_preview WHERE kind='order' AND id=? AND version=? AND json_extract(data,'$.status')='Ready'
    ) ON CONFLICT(order_id) DO UPDATE SET state=excluded.state, operation=excluded.operation,
      order_version=excluded.order_version, weight_grams=excluded.weight_grams, updated_at=excluded.updated_at
    WHERE wholesale_royal_mail_shipments.state = 'failed' RETURNING operation`)
    .bind(id, operation, order.version, weight, Date.now(), id, order.version).first();
  if (!reserved) {
    if (await getShipment(env, id)) return getView(202);
    throw new ApiError(409, "conflict", "The order changed. Review it before creating postage.");
  }

  let outcome: "lookup" | "requested" | "known" = "lookup";
  try {
    const prior = await findRoyalMailOrder(settings.key, id);
    if (!prior) {
      const latest = await get<Order>(env, "order", id);
      if (!latest || latest.version !== order.version || latest.status !== "Ready" || latest.deletedAt != null || latest.skipped) {
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
    await recordCarrier(env, id, operation, carrier);
  } catch (error) {
    const state = outcome === "lookup" || (outcome === "requested" && error instanceof RoyalMailError && !error.uncertain) ? "failed" : "review";
    await env.DB.prepare(`UPDATE wholesale_royal_mail_shipments SET state = ?, updated_at = ?
      WHERE order_id = ? AND operation = ? AND provider_id IS NULL`).bind(state, Date.now(), id, operation).run();
    if (error instanceof ApiError) throw error;
    return getView(state === "review" ? 202 : 200);
  }
  await audit(env, "wholesale_royal_mail", actor.name, `Royal Mail shipment recorded for ${id}.`);
  return getView(201);
}
