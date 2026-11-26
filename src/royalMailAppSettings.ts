import { audit } from "./audit";
import { ApiError, type Env, invalid, json, readJson } from "./http";
import { keyBytes, seal, unseal } from "./quickbooks/crypto";
import { type RoyalMailTrackingCredentials, validRoyalMailCredential, validRoyalMailService } from "./royalMail";
import { object, text, version } from "./wholesaleStore";

interface RoyalMailPolicy {
  enabled: number;
  version: number;
  booking_config: string | null;
  tracking_config: string | null;
}

interface BookingOptions {
  key: string | null;
  serviceCode: string | null;
  serviceRegisterCode?: string;
  shippingAccountName?: string;
}
type BookingCredentials = BookingOptions & { key: string; serviceCode: string };
type ConnectionKind = "booking" | "tracking";
const PURPOSE = "strangers/wholesale/royal-mail/credentials/v1";
const emptyBooking: BookingOptions = { key: null, serviceCode: null };

export async function readRoyalMailPolicy(env: Env): Promise<RoyalMailPolicy> {
  return await env.DB.prepare("SELECT enabled, version, booking_config, tracking_config FROM wholesale_royal_mail_settings WHERE id = 1").first<RoyalMailPolicy>()
    ?? { enabled: 0, version: 0, booking_config: null, tracking_config: null };
}

function hostingKey(env: Env) {
  try { return keyBytes(env.QUICKBOOKS_TOKEN_KEY?.trim() || ""); }
  catch { return null; }
}

async function credentialKey(hostKey: Uint8Array) {
  const rootKey = await crypto.subtle.importKey("raw", hostKey, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({
    name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(PURPOSE),
  }, rootKey, 256);
  return btoa(String.fromCharCode(...new Uint8Array(derived)));
}

function workerBooking(env: Env): BookingOptions {
  const key = env.WHOLESALE_ROYAL_MAIL_CLICK_DROP_KEY?.trim();
  const serviceCode = env.WHOLESALE_ROYAL_MAIL_SERVICE_CODE?.trim();
  const serviceRegisterCode = env.WHOLESALE_ROYAL_MAIL_SERVICE_REGISTER_CODE?.trim() || undefined;
  const shippingAccountName = env.WHOLESALE_ROYAL_MAIL_SHIPPING_ACCOUNT?.trim() || undefined;
  return {
    key: validRoyalMailCredential(key) ? key : null,
    serviceCode: validRoyalMailService(serviceCode, serviceRegisterCode, shippingAccountName) ? serviceCode : null,
    serviceRegisterCode, shippingAccountName,
  };
}

function validatedTracking(clientId: unknown, clientSecret: unknown, acceptTerms: boolean): RoyalMailTrackingCredentials | null {
  return validRoyalMailCredential(clientId) && validRoyalMailCredential(clientSecret) && acceptTerms
    ? { clientId, clientSecret, acceptTerms: true } : null;
}

function validBooking(value: unknown): value is BookingCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { key, serviceCode, serviceRegisterCode, shippingAccountName } = value as Partial<BookingOptions>;
  return validRoyalMailCredential(key) && (serviceRegisterCode === undefined || typeof serviceRegisterCode === "string") &&
    validRoyalMailService(serviceCode, serviceRegisterCode, shippingAccountName);
}

function validTracking(value: unknown): value is RoyalMailTrackingCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { clientId, clientSecret, acceptTerms } = value as Partial<RoyalMailTrackingCredentials>;
  return !!validatedTracking(clientId, clientSecret, acceptTerms === true);
}

async function openBundle<T>(encrypted: string | null, key: string | null, kind: ConnectionKind, validate: (value: unknown) => value is T): Promise<T | null> {
  if (!encrypted || !key) return null;
  try {
    const { generation, data } = JSON.parse(encrypted);
    if (typeof generation !== "string" || !/^[a-f0-9-]{36}$/.test(generation) || typeof data !== "string") return null;
    const value = await unseal<unknown>(data, key, kind, generation, PURPOSE);
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

export async function loadRoyalMailConnections(env: Env, policy: RoyalMailPolicy) {
  const hostKey = hostingKey(env);
  const hasBookingOverride = policy.booking_config !== null;
  const hasTrackingOverride = policy.tracking_config !== null;
  const key = hostKey && (hasBookingOverride || hasTrackingOverride) ? await credentialKey(hostKey) : null;
  const [savedBooking, savedTracking] = await Promise.all([
    openBundle(policy.booking_config, key, "booking", validBooking),
    openBundle(policy.tracking_config, key, "tracking", validTracking),
  ]);
  const booking = hasBookingOverride ? savedBooking ?? emptyBooking : workerBooking(env);
  const tracking = hasTrackingOverride ? savedTracking : validatedTracking(env.WHOLESALE_ROYAL_MAIL_TRACKING_CLIENT_ID?.trim(),
    env.WHOLESALE_ROYAL_MAIL_TRACKING_CLIENT_SECRET?.trim(), env.WHOLESALE_ROYAL_MAIL_TRACKING_TERMS_ACCEPTED === "yes");
  return {
    booking, tracking,
    bookingConfigured: !!booking.key && !!booking.serviceCode,
    credentialSetup: {
      storageReady: !!hostKey,
      bookingSource: hasBookingOverride ? "admin" : booking.key || booking.serviceCode ? "worker" : null,
      trackingSource: hasTrackingOverride ? "admin" : tracking ? "worker" : null,
      bookingReadable: !hasBookingOverride || !!savedBooking,
      trackingReadable: !hasTrackingOverride || !!savedTracking,
      serviceRegisterCode: booking.serviceRegisterCode ?? null,
      shippingAccountName: booking.shippingAccountName ?? null,
    },
  };
}

function savedCredential(value: unknown, previous: string | null | undefined, label: string) {
  const candidate = text(value, label, 512) || previous;
  if (!validRoyalMailCredential(candidate)) throw invalid(`Enter a valid ${label}.`);
  return candidate;
}

function settingsView(policy: RoyalMailPolicy, connections: Awaited<ReturnType<typeof loadRoyalMailConnections>>) {
  return json({
    enabled: policy.enabled === 1, version: policy.version, bookingConfigured: connections.bookingConfigured,
    trackingConfigured: !!connections.tracking, serviceCode: connections.booking.serviceCode,
    credentialSetup: connections.credentialSetup,
  });
}

export async function handleRoyalMailSettings(req: Request, env: Env, actor: string, credentials = false): Promise<Response> {
  if (req.method !== "PUT" && (credentials || req.method !== "GET")) {
    throw new ApiError(405, "method_not_allowed", credentials ? "Use PUT to save Royal Mail credentials." : "Use GET or PUT for Royal Mail setup.");
  }
  const policy = await readRoyalMailPolicy(env);
  const current = await loadRoyalMailConnections(env, policy);
  if (req.method === "GET") return settingsView(policy, current);
  const body = object(await readJson(req, credentials ? 4096 : 1024));
  const expected = version(body.ifVersion);
  const conflict = () => new ApiError(409, "conflict", "Royal Mail setup changed on another device. Reload it before saving.");
  if (policy.version !== expected) throw conflict();

  if (!credentials) {
    if (typeof body.enabled !== "boolean") throw invalid("Choose whether new Royal Mail bookings are on or off.");
    if (body.enabled && !current.bookingConfigured) {
      throw new ApiError(409, "royal_mail_not_configured", "Configure the Click & Drop key and service before turning on bookings.");
    }
    if (policy.enabled === Number(body.enabled)) return settingsView(policy, current);
    const saved = await env.DB.prepare(`UPDATE wholesale_royal_mail_settings SET enabled = ?, version = version + 1, updated_at = ?
      WHERE id = 1 AND version = ? RETURNING enabled,version`).bind(Number(body.enabled), Date.now(), expected).first<Pick<RoyalMailPolicy, "enabled" | "version">>();
    if (!saved) throw conflict();
    await audit(env, "wholesale_royal_mail", actor, `New Royal Mail bookings turned ${saved.enabled ? "on" : "off"}.`);
    return settingsView({ ...policy, ...saved }, current);
  }

  const hostKey = hostingKey(env);
  if (!hostKey) throw new ApiError(409, "royal_mail_encryption_required", "Set up the site's existing encryption key before saving Royal Mail credentials.");
  const kind = body.kind;
  let values: BookingCredentials | RoyalMailTrackingCredentials;
  if (kind === "booking") {
    const previous = current.credentialSetup.bookingSource === "admin" ? current.booking.key : null;
    const key = savedCredential(body.key, previous, "Click & Drop key");
    const serviceCode = text(body.serviceCode, "booking service code", 10);
    const serviceRegisterCode = text(body.serviceRegisterCode, "service register code", 2) || undefined;
    const shippingAccountName = text(body.shippingAccountName, "shipping account name", 50) || undefined;
    if (!validRoyalMailService(serviceCode, serviceRegisterCode, shippingAccountName)) {
      throw invalid("Check the Royal Mail booking service, optional service register code and account name.");
    }
    values = { key, serviceCode, serviceRegisterCode, shippingAccountName };
  } else if (kind === "tracking") {
    if (body.acceptTerms !== true) throw invalid("Confirm acceptance of the Royal Mail Tracking API terms.");
    const previous = current.credentialSetup.trackingSource === "admin" ? current.tracking : null;
    const clientId = savedCredential(body.clientId, previous?.clientId, "Tracking client ID");
    values = {
      clientId,
      clientSecret: savedCredential(body.clientSecret, previous?.clientId === clientId ? previous.clientSecret : null, "Tracking client secret"),
      acceptTerms: true,
    };
  } else {
    throw invalid("Choose Click & Drop or Carrier tracking.");
  }
  const generation = crypto.randomUUID();
  const data = await seal(values, await credentialKey(hostKey), kind, generation, PURPOSE);
  const column = kind === "booking" ? "booking_config" : "tracking_config";
  const saved = await env.DB.prepare(`UPDATE wholesale_royal_mail_settings SET ${column} = ?, version = version + 1, updated_at = ?
    WHERE id = 1 AND version = ? RETURNING enabled, version, booking_config, tracking_config`)
    .bind(JSON.stringify({ generation, data }), Date.now(), expected).first<RoyalMailPolicy>();
  if (!saved) throw conflict();
  await audit(env, "wholesale_royal_mail", actor, kind === "booking" ? "Royal Mail Click & Drop credentials saved." : "Royal Mail tracking credentials saved.");
  return settingsView(saved, await loadRoyalMailConnections(env, saved));
}
