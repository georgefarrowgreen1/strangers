import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { build } from "esbuild";
import { ROOT, startServer } from "./harness.mjs";

const brandedHost = "preview.staffstrangerscoffee.com";
const brandedOrigin = `https://${brandedHost}`;
const wholesaleHost = "strangerscoffee.trade";
const sitesOrigin = "https://strangers-coffee-retail-demo.magicloom512.chatgpt.site";
const retailCookie = "__Host-strangers_consumer_session";
const loginCookie = "__Host-strangers_consumer_login";
const retailToken = Buffer.alloc(32, 19).toString("base64url");
const exchangeCode = Buffer.alloc(32, 23).toString("base64url");
const staffCookies = "sfbb_session=fixture-staff; sf_wholesale_session=fixture-wholesale";
const hosts = {
  PREVIEW_HOST: wholesaleHost,
  LEGACY_PREVIEW_HOST: brandedHost,
  ADMIN_HOST: "admin.staffstrangerscoffee.com",
};

function request(base, path, init = {}) {
  return fetch(base + path, { redirect: "manual", ...init });
}

function cookieFrom(response, name) {
  const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  assert.ok(cookie, `missing ${name} cookie`);
  return cookie;
}

function assertHostOnlyCookie(cookie) {
  assert.match(cookie, /(?:^|;\s*)Path=\//i);
  assert.match(cookie, /(?:^|;\s*)HttpOnly(?:;|$)/i);
  assert.match(cookie, /(?:^|;\s*)Secure(?:;|$)/i);
  assert.match(cookie, /(?:^|;\s*)SameSite=Lax(?:;|$)/i);
  assert.doesNotMatch(cookie, /(?:^|;\s*)Domain=/i);
}

describe("branded retail routes on the Worker", () => {
  let branded;
  let wholesale;
  let diary;

  before(async () => {
    branded = await startServer({ host: brandedHost, vars: hosts });
    wholesale = await startServer({ host: wholesaleHost, vars: hosts });
    diary = await startServer({ host: "staffstrangerscoffee.com", vars: hosts });
  });
  after(async () => {
    await Promise.all([branded?.stop(), wholesale?.stop(), diary?.stop()]);
  });

  test("the branded hostname serves the new retail pages and their same-origin assets", async () => {
    let appPath;
    for (const path of ["/", "/account/", "/coffee/", "/location/", "/about/", "/brewguides/", "/contact/", "/shipping/", "/privacy-policy/", "/terms-conditions/"]) {
      const page = await request(branded.base, path);
      assert.equal(page.status, 200, path);
      assert.match(page.headers.get("content-type"), /text\/html/, path);
      assert.match(page.headers.get("cache-control"), /no-store/, path);
      const policy = page.headers.get("content-security-policy");
      if (path === "/brewguides/") assert.match(policy, /frame-src https:\/\/www\.youtube-nocookie\.com(?:;|$)/);
      else assert.doesNotMatch(policy, /youtube-nocookie\.com/);
      const text = await page.text();
      assert.match(text, /Strangers Coffee/i, path);
      assert.match(text, /\/consumer-preview\/assets\//, path);
      if (path === "/account/") {
        assert.match(text, /My account/i);
        assert.doesNotMatch(text, /<body[^>]*\bdata-retail-signed-in/);
        appPath = text.match(/src="([^"\s]*\/consumer-preview\/assets\/app\.js[^"\s]*)"/)?.[1];
      }
    }

    const page = await request(branded.base, "/account/", { method: "HEAD" });
    assert.equal(page.status, 200);
    assert.equal(await page.text(), "");
    assert.ok(appPath, "the account loads its branded app module");
    for (const path of new Set([appPath, "/consumer-preview/assets/app.js"])) {
      const script = await request(branded.base, path);
      assert.equal(script.status, 200, path);
      assert.match(script.headers.get("content-type"), /javascript/, path);
      assert.doesNotMatch(await script.text(), /<!doctype html>/i, path);
      assert.equal((await request(wholesale.base, path)).status, 404, path);
      assert.equal((await request(diary.base, path)).status, 404, path);
    }
  });

  test("private assets, account endpoints, and branded documents stay in their own routes", async () => {
    for (const path of ["/consumer-preview/", "/consumer-preview/account/", "/consumer-preview/assets/not-present.js"]) {
      assert.equal((await request(branded.base, path)).status, 404, path);
    }
    for (const path of ["/consumer-preview/assets/app.js", "/api/account", "/consumer-auth/availability", "/signin-with-chatgpt"]) {
      assert.equal((await request(wholesale.base, path)).status, 404, path);
    }
    for (const path of ["/account/", "/coffee/"]) {
      const response = await request(wholesale.base, path);
      assert.ok([302, 404].includes(response.status), path);
      if (response.status === 302) assert.equal(response.headers.get("location"), "/signin", path);
      assert.doesNotMatch(await response.text(), /\/consumer-preview\/assets\//, path);
    }
    for (const cookie of [undefined, staffCookies]) {
      const response = await request(branded.base, "/api/account", { headers: cookie ? { cookie } : {} });
      assert.equal(response.status, 401);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
  });

  test("the old wholesale preview still routes to its own sign-in, sessions and assets", async () => {
    const legacy = await request(branded.base, "/signin?order=WS-example");
    assert.equal(legacy.status, 302);
    assert.equal(legacy.headers.get("location"), "/wholesale/signin?order=WS-example");
    const oldOrderLink = await request(branded.base, "/?order=WS-example");
    assert.equal(oldOrderLink.status, 302);
    assert.equal(oldOrderLink.headers.get("location"), "/wholesale/?order=WS-example");
    const signin = await request(branded.base, "/wholesale/signin");
    assert.equal(signin.status, 200);
    assert.match(await signin.text(), /Wholesale sign-in/);
    const wholesaleHome = await request(branded.base, "/wholesale/");
    assert.equal(wholesaleHome.status, 302);
    assert.equal(wholesaleHome.headers.get("location"), "/wholesale/signin");
    const asset = await request(branded.base, "/wholesale/signin.js?v=existing");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.match(asset.headers.get("cache-control"), /private.*immutable/);
    assert.equal((await request(branded.base, "/api/wholesale/catalogue")).status, 401);

    const root = await request(wholesale.base, "/");
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/signin");
    const staff = await request(wholesale.base, "/wholesale/staff-signin");
    const staffLocation = new URL(staff.headers.get("location"));
    assert.equal(staffLocation.origin, "https://staffstrangerscoffee.com");
    assert.equal(staffLocation.searchParams.get("next"), brandedOrigin + "/wholesale/");

    const credentials = { username: "legacy.gateway", password: "legacy-gateway-password", business: "Legacy Café", contact: "Buyer", email: "buyer@example.test" };
    const post = path => request(branded.base, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) });
    assert.equal((await post("/api/wholesale/auth/register")).status, 201);
    branded.sql("UPDATE wholesale_accounts SET approval_status = 'approved', active = 1;");
    const login = await post("/api/wholesale/auth/login");
    assert.equal(login.status, 200, await login.clone().text());
    const cookie = cookieFrom(login, "sf_wholesale_session");
    assertHostOnlyCookie(cookie);
    assert.ok(!login.headers.getSetCookie().some(value => value.startsWith(`${retailCookie}=`)));
    const sessionHeaders = { cookie: cookie.split(";")[0] };
    assert.equal((await request(branded.base, "/wholesale/", { headers: sessionHeaders })).status, 200);
    assert.equal((await request(branded.base, "/api/account", { headers: sessionHeaders })).status, 401);
  });

  test("sign-in redirects to the fixed Sites bridge and issues a host-only login cookie", async () => {
    const response = await request(branded.base, "/signin-with-chatgpt?return_to=%2Faccount%2F");
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, sitesOrigin);
    assert.equal(location.pathname, "/consumer-bridge/connect");
    assert.match(location.searchParams.get("state"), /^[A-Za-z0-9_-]{43}$/);
    assert.match(location.searchParams.get("challenge"), /^[A-Za-z0-9_-]{43}$/);
    const cookie = cookieFrom(response, loginCookie);
    assertHostOnlyCookie(cookie);
    assert.match(cookie, /Max-Age=600/i);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  });
});

let gatewayModule;
async function callGateway(path, init = {}) {
  gatewayModule ??= build({
    absWorkingDir: ROOT,
    entryPoints: ["src/brandedRetail.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  }).then(({ outputFiles: [file] }) => import(`data:text/javascript;base64,${Buffer.from(file.contents).toString("base64")}`));
  const { handleBrandedRetail } = await gatewayModule;
  const req = new Request(brandedOrigin + path, init);
  try {
    return await handleBrandedRetail(req, hosts, new URL(req.url));
  } catch (error) {
    if (!Number.isInteger(error.status)) throw error;
    return Response.json({ code: error.code }, { status: error.status });
  }
}

function useSitesBridge(t, fetchResponse) {
  return t.mock.method(globalThis, "fetch", async (input, init) => {
    const outgoing = new Request(input, init);
    const target = new URL(outgoing.url);
    assert.equal(target.origin, sitesOrigin, "the Worker only calls the fixed Sites origin");
    assert.equal(outgoing.headers.get("cookie"), null, "browser cookies stay on the branded hostname");
    assert.notEqual(outgoing.redirect, "follow", "the upstream cannot redirect with attached credentials");
    return fetchResponse(outgoing, target.pathname);
  });
}

test("login callback proves its state, exchanges the verifier and keeps the session token in a host-only cookie", async (t) => {
  let expectedChallenge;
  const upstream = useSitesBridge(t, async (outgoing, path) => {
    assert.equal(path, "/consumer-bridge/exchange");
    assert.equal(outgoing.method, "POST");
    assert.equal(outgoing.headers.get("authorization"), null);
    const body = await outgoing.json();
    assert.deepEqual(Object.keys(body).sort(), ["code", "verifier"]);
    assert.equal(body.code, exchangeCode);
    assert.equal(createHash("sha256").update(body.verifier).digest("base64url"), expectedChallenge);
    return Response.json({ token: retailToken, expiresIn: 14400 });
  });

  const started = await callGateway("/signin-with-chatgpt?return_to=https%3A%2F%2Foutside.example%2F");
  const bridge = new URL(started.headers.get("location"));
  assert.equal(bridge.origin, sitesOrigin);
  assert.equal(bridge.pathname, "/consumer-bridge/connect");
  expectedChallenge = bridge.searchParams.get("challenge");
  const state = bridge.searchParams.get("state");
  const cookie = `${cookieFrom(started, loginCookie).split(";")[0]}; ${staffCookies}`;

  const unrelatedState = Buffer.alloc(32, 29).toString("base64url");
  const rejected = await callGateway(`/consumer-auth/callback?state=${unrelatedState}&code=${exchangeCode}`, { headers: { cookie } });
  assert.equal(upstream.mock.callCount(), 0, "a callback with the wrong state never spends the code");
  assert.ok(!rejected.headers.getSetCookie().some(value => value.startsWith(`${retailCookie}=`)));

  const completed = await callGateway(`/consumer-auth/callback?state=${state}&code=${exchangeCode}`, { headers: { cookie } });
  assert.equal(upstream.mock.callCount(), 1);
  assert.ok([302, 303].includes(completed.status));
  const location = new URL(completed.headers.get("location"), brandedOrigin);
  assert.equal(location.href, brandedOrigin + "/account/", "unrecognised return addresses fall back to the branded account page");
  const session = cookieFrom(completed, retailCookie);
  assertHostOnlyCookie(session);
  assert.match(session, /Max-Age=14400/i);
  assert.equal(session.split(";")[0], `${retailCookie}=${retailToken}`);
  assert.match(completed.headers.get("cache-control"), /no-store/);
  assert.equal(completed.headers.get("referrer-policy"), "no-referrer");
  assert.ok(!location.href.includes(retailToken));
  assert.ok(!(await completed.text()).includes(retailToken));
});

test("sign-out revokes the retail session from the branded account and clears only its own cookies", async (t) => {
  const upstream = useSitesBridge(t, (outgoing, path) => {
    assert.equal(path, "/consumer-bridge/revoke");
    assert.equal(outgoing.method, "POST");
    assert.equal(outgoing.headers.get("authorization"), `Bearer ${retailToken}`);
    return Response.json({ ok: true });
  });
  const cookie = `${retailCookie}=${retailToken}; ${staffCookies}`;
  const rejected = await callGateway("/signout-with-chatgpt", { headers: { cookie, "sec-fetch-site": "cross-site" } });
  assert.equal(rejected.status, 403);
  assert.equal(upstream.mock.callCount(), 0);
  assert.deepEqual(rejected.headers.getSetCookie(), []);

  const signedOut = await callGateway("/signout-with-chatgpt", { headers: { cookie, "sec-fetch-site": "same-origin" } });
  assert.equal(signedOut.status, 302);
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal(signedOut.headers.get("referrer-policy"), "no-referrer");
  const location = new URL(signedOut.headers.get("location"));
  assert.equal(location.origin, sitesOrigin);
  assert.equal(location.pathname, "/signout-with-chatgpt");
  assert.equal(location.searchParams.get("return_to"), "/consumer-bridge/return");
  assert.equal(signedOut.headers.getSetCookie().length, 2);
  for (const name of [retailCookie, loginCookie]) {
    const cookie = cookieFrom(signedOut, name);
    assertHostOnlyCookie(cookie);
    assert.match(cookie, /Max-Age=0/i);
    assert.equal(cookie.split(";")[0], `${name}=`);
  }
});

test("account requests use only the retail cookie and accept writes only from the branded origin", async (t) => {
  const account = { profile: { name: "Sample Buyer" }, orders: [] };
  const order = { reference: "SC-0000000A", lines: [{ id: "bom-jesus", size: "250g", grind: "Whole bean", qty: 1 }] };
  const upstream = useSitesBridge(t, async (outgoing, path) => {
    assert.equal(outgoing.headers.get("authorization"), `Bearer ${retailToken}`);
    if (path.endsWith("/orders")) {
      assert.equal(outgoing.method, "POST");
      assert.equal(outgoing.headers.get("origin"), brandedOrigin);
      assert.deepEqual(await outgoing.json(), order);
      return Response.json({ order }, { status: 201 });
    }
    assert.equal(path, "/api/account");
    if (outgoing.method === "PUT") {
      assert.equal(outgoing.headers.get("origin"), brandedOrigin);
      assert.deepEqual(await outgoing.json(), account.profile);
    } else assert.equal(outgoing.method, "GET");
    return Response.json(account, { headers: { "set-cookie": "upstream-test=private; Path=/" } });
  });
  const cookie = `${retailCookie}=${retailToken}; ${staffCookies}`;

  for (const origin of [undefined, "null", "https://staffstrangerscoffee.com", "https://outside.example"]) {
    const response = await callGateway("/api/account", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(account.profile),
    });
    assert.equal(response.status, 403, origin ?? "missing origin");
  }

  for (const [body, contentType, status] of [
    [JSON.stringify(account.profile), "text/plain", 415],
    [new Uint8Array([0xc3, 0x28]), "application/json", 400],
    [JSON.stringify({ name: "x".repeat(24 * 1024) }), "application/json", 413],
  ]) {
    const invalidBody = await callGateway("/api/account", {
      method: "PUT",
      headers: { cookie, origin: brandedOrigin, "content-type": contentType },
      body,
    });
    assert.equal(invalidBody.status, status);
  }
  assert.equal(upstream.mock.callCount(), 0);

  const read = await callGateway("/api/account", { headers: { cookie, authorization: "Bearer fixture-staff" } });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), account);
  assert.equal(read.headers.get("set-cookie"), null);
  assert.match(read.headers.get("cache-control"), /no-store/);

  const update = await callGateway("/api/account", {
    method: "PUT",
    headers: { cookie, origin: brandedOrigin, "content-type": "application/json" },
    body: JSON.stringify(account.profile),
  });
  assert.equal(update.status, 200);
  const result = await update.text();
  assert.deepEqual(JSON.parse(result), account);
  assert.ok(!result.includes(retailToken));

  const recorded = await callGateway("/api/account/orders", {
    method: "POST",
    headers: { cookie, origin: brandedOrigin, "content-type": "application/json" },
    body: JSON.stringify(order),
  });
  assert.equal(recorded.status, 201);
  assert.deepEqual(await recorded.json(), { order });
  assert.equal(upstream.mock.callCount(), 3);
});

test("availability exposes only valid unavailable product identifiers", async (t) => {
  const upstream = useSitesBridge(t, (outgoing, path) => {
    assert.equal(path, "/consumer-bridge/availability");
    assert.equal(outgoing.method, "GET");
    assert.equal(outgoing.headers.get("authorization"), null);
    return Response.json({ unavailable: ["bom-jesus", "rocko", "Not a product id", 12], token: retailToken, internal: true });
  });
  const availability = await callGateway("/consumer-auth/availability", { headers: { cookie: `${retailCookie}=${retailToken}; ${staffCookies}` } });
  assert.equal(availability.status, 200);
  assert.deepEqual(await availability.json(), { unavailable: ["bom-jesus", "rocko"] });
  assert.equal(upstream.mock.callCount(), 1);
});
