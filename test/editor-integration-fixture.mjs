import { build } from "esbuild";
import { Miniflare, Response as WorkerResponse } from "miniflare";
import { ROOT, SETUP_CODE } from "./harness.mjs";

export const admin = "https://admin.staffstrangerscoffee.com";
export const retail = "https://preview.staffstrangerscoffee.com";
export const wholesale = "https://strangerscoffee.trade";
const diary = "https://staffstrangerscoffee.com";
export const editorPath = "/api/admin/consumer/editor";
const plain = value => ({ type: "text", value });

// All three production hostnames are dispatched inside one temporary Worker, so
// they share the editor binding. No request reaches the deployed sites.
export async function startEditorFixture() {
  const { outputFiles: [bundle] } = await build({
    absWorkingDir: ROOT, entryPoints: ["src/index.ts"], bundle: true, write: false,
    format: "esm", platform: "browser", target: "es2022", external: ["cloudflare:*"],
  });
  const name = "consumer-editor-integration";
  const runtime = new Miniflare({
    host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    workers: [{
      config: {
        name, compatibilityDate: "2026-10-01",
        manifest: { modulesRoot: ROOT, mainModule: "editor-fixture.mjs", modules: { "editor-fixture.mjs": { type: "esm", contents: bundle.text } } },
        assets: { directory: ROOT + "/public", runWorkerFirst: true, hasUserWorker: true },
        exports: {
          LiveHub: { type: "durable-object", storage: "sqlite" },
          ConsumerEditorStore: { type: "durable-object", storage: "sqlite" },
        },
        env: {
          DB: { type: "d1", name: "editor-fixture-db" }, FILES: { type: "kv", id: "editor-fixture-files" },
          ASSETS: { type: "assets" }, LIVE: { type: "durable-object", worker: name, exportName: "LiveHub" },
          CONSUMER_EDITOR: { type: "durable-object", worker: name, exportName: "ConsumerEditorStore" },
          ADMIN_HOST: plain(new URL(admin).host), PREVIEW_HOST: plain(new URL(wholesale).host),
          LEGACY_PREVIEW_HOST: plain(new URL(retail).host), COOKIE_DOMAIN: plain(new URL(diary).host),
          SETUP_CODE: plain(SETUP_CODE),
        },
      },
      // Stub optional account and stock reads. Catch any attempt to place an
      // order or contact an integration in the editor preview.
      dev: { outboundService: { type: "fetcher", handler: request => {
        if (new URL(request.url).pathname === "/consumer-bridge/availability" && request.method === "GET") {
          return WorkerResponse.json({ unavailable: [] });
        }
        return WorkerResponse.json({ message: "Local fixture" }, {status: 503});
      } } },
    }],
  });
  const request = (origin, path, method = "GET", body, cookie, headers = {}) => runtime.dispatchFetch(origin + path, {
    method, redirect: "manual", headers: {
      ...(body === undefined ? {} : {"content-type": "application/json", origin}),
      ...(cookie ? {cookie} : {}), ...headers,
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  try {
    const setup = await request(diary, "/api/auth/setup", "POST", {
      name: "Editor Reviewer", username: "editor.reviewer", password: "fixture-editor-password", code: SETUP_CODE,
    });
    const cookie = setup.headers.getSetCookie().find(value => /^sfbb_session=[\w-]/.test(value))?.split(";")[0];
    if (!setup.ok || !cookie) throw new Error("Could not create local reviewer: " + setup.status);
    return { runtime, request, cookie, stop: () => runtime.dispose() };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
