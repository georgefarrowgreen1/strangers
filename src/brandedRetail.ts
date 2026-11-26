import { type Env, ApiError, json, readBytes } from "./http";
import { cleanEmail } from "./email/address";
import { sendRetailAccountMail } from "./retailAccountMail";
import { retailServicePublicKey, retailServiceRequest } from "./retailService";
import { noStore, staticFile, withFingerprints } from "./siteAssets";

export const BRANDED_RETAIL_ORIGIN = "https://preview.staffstrangerscoffee.com";
const ACCOUNT_ORIGIN = "https://strangers-coffee-retail-demo.magicloom512.chatgpt.site";
const SESSION_COOKIE = "__Host-strangers_consumer_session";
const MAX_SESSION_SECONDS = 4 * 60 * 60;
const PROOF = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const AUTH_ROUTE = /^\/consumer-auth\/(register|setup|login|forgot|reset|logout)$/;
const ASSET = /^(?:\/_releases\/[0-9a-f]{20})?\/consumer-preview\/assets\/[a-z0-9][a-z0-9_.-]{0,110}\.(?:css|js|svg|webp|woff2|txt)$/i;
const PAGES = new Set([
  "/", "/coffee/", "/account/", "/location/", "/about/", "/brewguides/", "/contact/",
  "/shipping/", "/privacy-policy/", "/terms-conditions/",
]);
function proof(value: unknown): value is string {
  return typeof value === "string" && PROOF.test(value);
}

function cookie(req: Request, name: string): string {
  const prefix = name + "=";
  return req.headers.get("cookie")?.split(";").map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function setCookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
}

function redirect(destination: string, status = 302): Response {
  const headers = new Headers({ location: destination, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  return new Response(null, { status, headers });
}

function unavailable(): Response {
  return json({ error: "retail_unavailable", message: "The preview account service is temporarily unavailable. Please try again." }, 503);
}

function methodNotAllowed(allow: string): Response {
  return json({ error: "method_not_allowed" }, 405, { Allow: allow });
}

// This connection carries only the minimum fields needed for a retail request. Staff and wholesale
// session cookies, browser identity headers, and arbitrary upstream redirects never cross it.
async function accountService(path: string, method = "GET", session = "", body?: string, origin?: string) {
  const headers = new Headers({ accept: "application/json" });
  if (session) headers.set("authorization", "Bearer " + session);
  if (body !== undefined) headers.set("content-type", "application/json");
  if (origin) headers.set("origin", origin);
  try {
    const response = await fetch(ACCOUNT_ORIGIN + path, {
      method, headers, body, redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    return await serviceResult(response, 2 * 1024 * 1024);
  } catch {
    return null;
  }
}

async function serviceResult(response: Response, limit: number) {
  if ((response.status >= 300 && response.status < 400)
      || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel();
    return null;
  }
  const bytes = await readBytes(response, limit, "The preview account response was too large.");
  const data: unknown = JSON.parse(decode(bytes));
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return { status: response.status, data: data as Record<string, unknown>, retryAfter: response.headers.get("retry-after") };
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
}

async function authApi(req: Request, env: Env, action: string, ctx?: ExecutionContext): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  if (req.headers.get("origin") !== BRANDED_RETAIL_ORIGIN) {
    return json({ error: "bad_origin", message: "Open My Account to make this change." }, 403);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) {
    return json({ error: "unsupported_media_type", message: "Send this request as JSON." }, 415);
  }
  const sendingLink = action === "register" || action === "forgot";
  if (sendingLink && !env.RESEND_API_KEY) return unavailable();
  const bytes = await readBytes(req, 2048, "The account request was too large.");
  let body: string;
  try {
    body = decode(bytes);
  } catch {
    return json({ error: "invalid_json", message: "This request must use UTF-8." }, 400);
  }

  const current = cookie(req, SESSION_COOKIE);
  const signedOut = () => json({ signedIn: false }, 200, { "set-cookie": setCookie(SESSION_COOKIE, "", 0) });
  if (action === "logout" && !proof(current)) return signedOut();
  let result;
  try {
    const upstream = await retailServiceRequest(env, "/consumer-auth-service/" + action, {
      method: "POST", body, client: req.headers.get("cf-connecting-ip"),
      session: action === "logout" ? current : undefined,
    });
    result = await serviceResult(upstream, 8192);
  } catch {
    return action === "logout" ? signedOut() : unavailable();
  }
  if (action === "logout") return signedOut();
  if (!result) return unavailable();
  if (result.status >= 400) {
    const code = result.data.error;
    const message = result.data.message;
    const headers = new Headers();
    if (result.retryAfter && /^\d{1,6}$/.test(result.retryAfter)) headers.set("retry-after", result.retryAfter);
    return json({
      error: typeof code === "string" ? code : "retail_auth_unavailable",
      message: typeof message === "string" ? message : "The account service could not complete this request.",
    }, result.status, headers);
  }
  if (sendingLink && result.status === 202) {
    const mail = result.data.mail as { kind?: unknown; email?: unknown; token?: unknown } | undefined;
    const kind = action === "register" ? "verify" : "reset";
    const email = typeof mail?.email === "string" ? cleanEmail(mail.email) : "";
    if (email && mail?.kind === kind && proof(mail.token)) {
      const delivery = sendRetailAccountMail(env, BRANDED_RETAIL_ORIGIN, kind, email, mail.token);
      if (ctx) ctx.waitUntil(delivery);
      else await delivery;
    }
    return json({ accepted: true }, 202);
  }
  const session = result.data.session as { token?: unknown; expiresIn?: unknown } | undefined;
  const seconds = session?.expiresIn;
  if (result.status !== 200 || !proof(session?.token) || typeof seconds !== "number"
      || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SESSION_SECONDS) return unavailable();
  return json({ signedIn: true }, 200, { "set-cookie": setCookie(SESSION_COOKIE, session.token, seconds) });
}

async function accountApi(req: Request, path: string): Promise<Response> {
  const profile = path === "/api/account";
  const writing = req.method === (profile ? "PUT" : "POST");
  if (!writing && !(profile && req.method === "GET")) return methodNotAllowed(profile ? "GET, PUT" : "POST");
  if (writing && req.headers.get("origin") !== BRANDED_RETAIL_ORIGIN) {
    return json({ error: "bad_origin", message: "Open checkout or My Account to make this change." }, 403);
  }
  const session = cookie(req, SESSION_COOKIE);
  if (!proof(session)) return json({ error: "sign_in_required", message: "Sign in to open your account." }, 401);

  let body: string | undefined;
  if (writing) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) {
      return json({ error: "unsupported_media_type", message: "Send this request as JSON." }, 415);
    }
    const bytes = await readBytes(req, 24 * 1024, "The account request was too large.");
    try {
      body = decode(bytes);
    } catch {
      throw new ApiError(400, "invalid_json", "This request must use UTF-8.");
    }
  }

  const result = await accountService(path, req.method, session, body, writing ? BRANDED_RETAIL_ORIGIN : undefined);
  if (!result) return unavailable();
  const headers = new Headers();
  if (result.status === 401) headers.append("set-cookie", setCookie(SESSION_COOKIE, "", 0));
  return json(result.data, result.status, headers);
}

async function availability(): Promise<Response> {
  const result = await accountService("/consumer-bridge/availability");
  if (!result || result.status !== 200 || !Array.isArray(result.data.unavailable)) return unavailable();
  const unavailableIds = result.data.unavailable.filter((id): id is string =>
    typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(id)).slice(0, 100);
  return json({ unavailable: unavailableIds });
}

async function retailPage(req: Request, env: Env, url: URL): Promise<Response> {
  const path = "/consumer-preview" + url.pathname;
  const asset = await env.ASSETS.fetch(new Request(new URL(path, url), { method: req.method }));
  if (!asset.ok || !(asset.headers.get("content-type") || "").startsWith("text/html")) {
    await asset.body?.cancel();
    return new Response("The consumer storefront is temporarily unavailable.", { status: 503 });
  }
  let response = noStore(asset);
  if (url.pathname === "/account/") response.headers.set("referrer-policy", "no-referrer");
  // The marker makes checkout check the saved profile before taking an order. The account API
  // verifies the actual session before returning customer data or accepting any write.
  if (proof(cookie(req, SESSION_COOKIE)) && response.body) {
    response = new HTMLRewriter().on("body", {
      element(element) { element.setAttribute("data-retail-signed-in", ""); },
    }).transform(response);
  }
  return withFingerprints(response, env, url);
}

export async function handleBrandedRetail(req: Request, env: Env, url: URL, ctx?: ExecutionContext): Promise<Response | undefined> {
  if (url.origin !== BRANDED_RETAIL_ORIGIN) return undefined;
  const path = url.pathname;
  const reading = req.method === "GET" || req.method === "HEAD";

  if (path === "/api/account" || path === "/api/account/orders") return accountApi(req, path);
  if (path === "/signin") return reading ? redirect("/account/") : methodNotAllowed("GET, HEAD");
  if (path === "/consumer-auth/service-key") {
    return req.method === "GET" ? retailServicePublicKey(env).catch(unavailable) : methodNotAllowed("GET");
  }
  const action = AUTH_ROUTE.exec(path)?.[1];
  if (action) return authApi(req, env, action, ctx);
  if (path === "/consumer-auth/availability") return req.method === "GET" ? availability() : methodNotAllowed("GET");
  if (ASSET.test(path)) {
    if (!reading) return methodNotAllowed("GET, HEAD");
    const conditionals = new Headers();
    for (const name of ["if-none-match", "if-modified-since"]) {
      const value = req.headers.get(name);
      if (value) conditionals.set(name, value);
    }
    return staticFile(new Request(url, { method: req.method, headers: conditionals }), env, path);
  }
  if (path === "/consumer-preview" || path.startsWith("/consumer-preview/") || path.startsWith("/consumer-auth/")) {
    return new Response("Not found", { status: 404 });
  }
  if (!reading) return undefined;
  if (PAGES.has(path)) return retailPage(req, env, url);
  if (PAGES.has(path + "/")) return redirect(path + "/" + url.search, 308);
  return undefined;
}
