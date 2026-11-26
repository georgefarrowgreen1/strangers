import { readBytes } from "./http";

const CLICK_DROP = "https://api.parcel.royalmail.com/api/v1";
const TRACKING_V2 = "https://api.royalmail.net/mailpieces/v2";
const TIMEOUT_MS = 12000;
const JSON_LIMIT = 128 * 1024;
const CREATE_LIMIT = 1024 * 1024;
const PDF_LIMIT = 4 * 1024 * 1024;
const MISSING_ORDER = Symbol("missing-order");
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const UK_POSTCODE = /^(?:GIR0AA|[A-Z]{1,2}\d[\dA-Z]?\d[A-Z]{2})$/;
const TRACKING_NUMBER = /^(?:[A-Z]{2}\d{9}GB|[0-9A-F]{21})$/;

type RoyalMailCode =
  | "royal_mail_configuration"
  | "royal_mail_invalid_shipment"
  | "royal_mail_auth"
  | "royal_mail_denied"
  | "royal_mail_rejected"
  | "royal_mail_rate_limited"
  | "royal_mail_unavailable"
  | "royal_mail_invalid_response"
  | "royal_mail_label_unavailable";

export class RoyalMailError extends Error {
  constructor(public code: RoyalMailCode, message: string, public status?: number, public uncertain = false) {
    super(message);
    this.name = "RoyalMailError";
  }
}

export interface RoyalMailOrderInput {
  reference: string;
  orderDate: string;
  recipient: {
    name: string;
    companyName?: string;
    addressLine1: string;
    addressLine2?: string;
    addressLine3?: string;
    city: string;
    county?: string;
    postcode: string;
  };
  parcel: {
    weightInGrams: number;
    format: "parcel" | "smallParcel" | "mediumParcel";
  };
  serviceCode: string;
  serviceRegisterCode?: string;
  shippingAccountName?: string;
  subtotalPence: number;
  shippingPence: number;
  totalPence: number;
  taxPence?: number;
}

export interface RoyalMailOrder {
  orderId: number;
  reference: string;
  trackingNumber: string | null;
  providerState: "created" | "labelled" | "dispatched";
}

function invalidShipment(message: string): never {
  throw new RoyalMailError("royal_mail_invalid_shipment", message);
}

function invalidResponse(uncertain = false): RoyalMailError {
  return new RoyalMailError("royal_mail_invalid_response", "Royal Mail returned an unexpected response.", undefined, uncertain);
}

function orderReference(reference: string): string {
  if (typeof reference !== "string" || !REFERENCE.test(reference)) invalidShipment("Use a valid Royal Mail order reference.");
  return reference;
}

function addressPart(value: string | undefined, limit: number, required = false): string | undefined {
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (cleaned && cleaned.length <= limit && !/[\u0000-\u001f\u007f]/.test(value)) return cleaned;
    if (cleaned || /[\u0000-\u001f\u007f]/.test(value)) {
      invalidShipment("Check the names and lines in the Royal Mail delivery address.");
    }
  }
  if (required || (value !== undefined && typeof value !== "string")) {
    invalidShipment("Check the required fields in the Royal Mail delivery address.");
  }
  return undefined;
}

function dateValue(value: unknown): boolean {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function orderBody(input: RoyalMailOrderInput) {
  const { reference, orderDate, recipient, parcel, serviceCode, serviceRegisterCode, shippingAccountName } = input;
  const orderRef = orderReference(reference);
  if (!dateValue(orderDate)) invalidShipment("Use a valid Royal Mail order date.");
  const postcode = addressPart(recipient.postcode, 20, true)!.toUpperCase().replace(/ /g, "");
  if (!UK_POSTCODE.test(postcode) || /^(?:BT|GY|JE|IM)/.test(postcode)) {
    invalidShipment("Enter a valid Great Britain postcode for this Royal Mail shipment.");
  }
  const { format, weightInGrams } = parcel;
  if (!["parcel", "smallParcel", "mediumParcel"].includes(format) ||
      !Number.isSafeInteger(weightInGrams) || weightInGrams < 1 || weightInGrams > 30000) {
    invalidShipment("Choose a parcel format and enter its packed weight in grams.");
  }
  if (!/^[A-Z0-9]{1,10}$/.test(serviceCode) || (serviceRegisterCode !== undefined && !/^\d{2}$/.test(serviceRegisterCode)) ||
      (shippingAccountName !== undefined && (typeof shippingAccountName !== "string" || !shippingAccountName.trim()
        || shippingAccountName.length > 50 || /[\u0000-\u001f\u007f]/.test(shippingAccountName)))) {
    invalidShipment("Choose a Royal Mail service configured for this account.");
  }

  const { subtotalPence, shippingPence, totalPence } = input;
  const taxPence = input.taxPence ?? totalPence - subtotalPence - shippingPence;
  if (![subtotalPence, shippingPence, taxPence, totalPence].every(value =>
      Number.isSafeInteger(value) && value >= 0 && value <= 99_999_900) ||
      subtotalPence + shippingPence + taxPence !== totalPence) {
    invalidShipment("Check the order totals before creating the Royal Mail shipment.");
  }

  return { items: [{
    orderReference: orderRef,
    orderDate: new Date(orderDate).toISOString(),
    isRecipientABusiness: true,
    recipient: { address: {
      fullName: addressPart(recipient.name, 210, true),
      companyName: addressPart(recipient.companyName, 100),
      addressLine1: addressPart(recipient.addressLine1, 100, true),
      addressLine2: addressPart(recipient.addressLine2, 100),
      addressLine3: addressPart(recipient.addressLine3, 100),
      city: addressPart(recipient.city, 100, true),
      county: addressPart(recipient.county, 100),
      postcode: postcode.slice(0, -3) + " " + postcode.slice(-3),
      countryCode: "GBR",
    } },
    packages: [{ weightInGrams, packageFormatIdentifier: format }],
    currencyCode: "GBP",
    subtotal: subtotalPence / 100,
    shippingCostCharged: shippingPence / 100,
    orderTax: taxPence / 100,
    total: totalPence / 100,
    postageDetails: { serviceCode, serviceRegisterCode, shippingAccountName },
    label: { includeLabelInResponse: true, includeReturnsLabel: false, includeCN: false },
  }] };
}

function responseError(status: number, posting: boolean, label = false): RoyalMailError {
  if (status === 401) return new RoyalMailError("royal_mail_auth", "Royal Mail did not accept the Click & Drop key.", status);
  if (status === 403) return new RoyalMailError("royal_mail_denied", label
    ? "This Click & Drop account cannot retrieve labels by API."
    : "This Click & Drop account does not have access to this operation.", status);
  if (status === 429) return new RoyalMailError("royal_mail_rate_limited", "Royal Mail is rate limiting requests. Try again shortly.", status, posting);
  if (label && status === 404) return new RoyalMailError("royal_mail_label_unavailable", "Royal Mail does not have a label ready for this order.", status);
  if (status === 400 || status === 422) {
    return new RoyalMailError("royal_mail_rejected", "Royal Mail rejected the shipment details. Check the address, parcel and service.", status);
  }
  return new RoyalMailError("royal_mail_unavailable", "Royal Mail did not confirm this request.", status, posting);
}

async function clickDrop(
  key: string,
  path: string,
  { body, label = false, missingOkay = false }: { body?: unknown; label?: boolean; missingOkay?: boolean },
  fetcher: typeof fetch,
): Promise<unknown> {
  const token = typeof key === "string" ? key.trim() : "";
  if (!/^[!-~]{1,512}$/.test(token)) throw new RoyalMailError("royal_mail_configuration", "Configure a valid Royal Mail Click & Drop key.");
  const posting = body !== undefined;
  const headers = new Headers({ Authorization: "Bearer " + token, Accept: label ? "application/pdf" : "application/json" });
  if (posting) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetcher(CLICK_DROP + path, {
      method: posting ? "POST" : "GET", body: posting ? JSON.stringify(body) : undefined, headers,
      redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RoyalMailError("royal_mail_unavailable", "Royal Mail did not confirm this request.", undefined, posting);
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 404 && missingOkay) return MISSING_ORDER;
    throw responseError(response.status, posting, label);
  }

  return readProviderResponse(response, label, posting);
}

async function readProviderResponse(response: Response, label = false, posting = false): Promise<unknown> {
  const type = response.headers.get("content-type") || "";
  const validType = label ? /^(?:application\/pdf|application\/octet-stream)(?:\s*;|$)/i : /^application\/json(?:\s*;|$)/i;
  if (!validType.test(type)) {
    void response.body?.cancel().catch(() => {});
    throw invalidResponse(posting);
  }
  try {
    const bytes = await readBytes(response, label ? PDF_LIMIT : posting ? CREATE_LIMIT : JSON_LIMIT, "Royal Mail response exceeded its limit.");
    if (label) {
      if (bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") return bytes;
      throw invalidResponse();
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    void response.body?.cancel().catch(() => {});
    throw invalidResponse(posting);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function royalMailTrackingNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const number = value.trim().toUpperCase();
  return TRACKING_NUMBER.test(number) ? number : null;
}

function publicOrder(value: unknown, reference: string, posting = false): RoyalMailOrder {
  const item = record(value);
  if (!item || item.orderReference !== reference || typeof item.orderIdentifier !== "number" ||
      !Number.isSafeInteger(item.orderIdentifier) || item.orderIdentifier <= 0) {
    throw invalidResponse(posting);
  }
  const packageItem = Array.isArray(item.packages) && item.packages.length === 1 ? record(item.packages[0]) : null;
  const labelled = dateValue(item.printedOn) || dateValue(item.manifestedOn) ||
    (posting && typeof item.label === "string" && item.label.startsWith("JVBERi0"));
  return {
    orderId: item.orderIdentifier,
    reference,
    trackingNumber: royalMailTrackingNumber(item.trackingNumber) ?? royalMailTrackingNumber(packageItem?.trackingNumber),
    providerState: dateValue(item.shippedOn) ? "dispatched" : labelled ? "labelled" : "created",
  };
}

/** Create once. An uncertain result must be reconciled by reference by the caller. */
export async function createRoyalMailOrder(key: string, input: RoyalMailOrderInput, fetcher = fetch): Promise<RoyalMailOrder> {
  const result = record(await clickDrop(key, "/orders", { body: orderBody(input) }, fetcher));
  const failures = result?.failedOrders;
  if (result?.successCount === 0 && result.errorsCount === 1 &&
      (result.createdOrders === undefined || (Array.isArray(result.createdOrders) && result.createdOrders.length === 0)) &&
      Array.isArray(failures) && failures.length === 1) {
    const failure = record(failures[0]);
    if (record(failure?.order)?.orderReference === input.reference && Array.isArray(failure?.errors) && failure.errors.length > 0) {
      throw new RoyalMailError("royal_mail_rejected", "Royal Mail rejected the shipment details. Check the address, parcel and service.", 400);
    }
  }
  if (result?.successCount !== 1 || result.errorsCount !== 0 || !Array.isArray(result.createdOrders) || result.createdOrders.length !== 1) {
    throw invalidResponse(true);
  }
  return publicOrder(result.createdOrders[0], input.reference, true);
}

/** The provider accepts a quoted, encoded order reference. Ambiguous matches are unsafe. */
export async function findRoyalMailOrder(key: string, reference: string, fetcher = fetch): Promise<RoyalMailOrder | null> {
  const knownReference = orderReference(reference);
  const path = "/orders/" + encodeURIComponent('"' + knownReference + '"');
  const result = await clickDrop(key, path, { missingOkay: true }, fetcher);
  if (result === MISSING_ORDER || (Array.isArray(result) && result.length === 0)) return null;
  if (!Array.isArray(result) || result.length !== 1) throw invalidResponse();
  return publicOrder(result[0], knownReference);
}

/** Retrieve the label for an existing order. Never make another shipment to reprint. */
export async function fetchRoyalMailLabel(key: string, orderId: number, fetcher = fetch): Promise<Uint8Array> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) invalidShipment("Use a valid Royal Mail order identifier.");
  const path = "/orders/" + orderId + "/label?documentType=postageLabel&includeReturnsLabel=false&includeCN=false";
  return await clickDrop(key, path, { label: true }, fetcher) as Uint8Array;
}

export interface RoyalMailTrackingCredentials {
  clientId: string;
  clientSecret: string;
  acceptTerms: true;
}

export interface RoyalMailTrackingSummary {
  trackingNumber: string;
  status: "available" | "not-found";
  statusCategory: string | null;
  lastEventCode: string | null;
  lastEventName: string | null;
  lastEventAt: string | null;
}

function trackingText(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim() || null : null;
}

function trackingSummary(value: unknown): RoyalMailTrackingSummary {
  const item = record(value);
  const trackingNumber = royalMailTrackingNumber(item?.mailPieceId);
  if (!trackingNumber || (item?.status !== "200" && item?.status !== "404")) throw invalidResponse();
  const summary = item.status === "200" ? record(item.summary) : null;
  const eventAt = summary?.lastEventDateTime;
  return {
    trackingNumber,
    status: item.status === "200" ? "available" : "not-found",
    statusCategory: trackingText(summary?.statusCategory, 80),
    lastEventCode: trackingText(summary?.lastEventCode, 20),
    lastEventName: trackingText(summary?.lastEventName, 120),
    lastEventAt: typeof eventAt === "string" && dateValue(eventAt) ? new Date(eventAt).toISOString() : null,
  };
}

/** Tracking V2 is separately provisioned. The caller must use approved credentials and terms. */
export async function fetchRoyalMailTracking(
  { clientId, clientSecret, acceptTerms }: RoyalMailTrackingCredentials, trackingNumbers: readonly string[], fetcher = fetch,
): Promise<RoyalMailTrackingSummary[]> {
  const validKey = (value: string) => typeof value === "string" && /^[!-~]{1,512}$/.test(value);
  if (!validKey(clientId) || !validKey(clientSecret) || acceptTerms !== true) {
    throw new RoyalMailError("royal_mail_configuration", "Configure approved Royal Mail Tracking API credentials.");
  }
  if (!Array.isArray(trackingNumbers) || trackingNumbers.length < 1 || trackingNumbers.length > 30) {
    invalidShipment("Check the Royal Mail tracking references.");
  }
  const numbers = new Set<string>();
  for (const reference of trackingNumbers) {
    const number = royalMailTrackingNumber(reference);
    if (!number) invalidShipment("Check the Royal Mail tracking references.");
    numbers.add(number);
  }
  const query = new URLSearchParams({ mailPieceId: [...numbers].join(",") });
  const headers = new Headers({
    "X-IBM-Client-Id": clientId,
    "X-IBM-Client-Secret": clientSecret,
    "X-Accept-RMG-Terms": "yes",
    Accept: "application/json",
  });
  let response: Response;
  try {
    response = await fetcher(TRACKING_V2 + "/summary?" + query, {
      method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RoyalMailError("royal_mail_unavailable", "Royal Mail Tracking is temporarily unavailable.");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) {
      throw new RoyalMailError("royal_mail_auth", "Royal Mail did not accept the Tracking API credentials.", response.status);
    }
    throw responseError(response.status, false);
  }
  const pieces = record(await readProviderResponse(response))?.mailPieces;
  if (!Array.isArray(pieces) || pieces.length !== numbers.size) throw invalidResponse();
  const results = new Map<string, RoyalMailTrackingSummary>();
  for (const piece of pieces) {
    const summary = trackingSummary(piece);
    if (!numbers.has(summary.trackingNumber) || results.has(summary.trackingNumber)) throw invalidResponse();
    results.set(summary.trackingNumber, summary);
  }
  return [...numbers].map(number => results.get(number)!);
}
