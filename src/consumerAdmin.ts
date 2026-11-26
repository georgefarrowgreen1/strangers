import { ApiError, Env, json, readJson, readBytes } from "./http";

const PREVIEW_ORIGIN = "https://strangers-coffee-retail-demo.magicloom512.chatgpt.site";
const CONTROL_PATH = "/api/control/consumer";
const MAX_OVERVIEW_BYTES = 2 * 1024 * 1024;
const ORDER_STATES = new Set(["placed", "preparing", "ready", "completed", "cancelled"]);

function offline(detail: string) {
  return json({
    connected: false,
    previewUrl: PREVIEW_ORIGIN + "/",
    readiness: [{ label: "Consumer preview connection", state: "blocked", detail }],
    orders: [],
    customers: [],
    products: [],
    settings: { acceptOrders: false },
  });
}

/** Uses a server-only credential to manage the separate test storefront. */
export async function handleConsumerAdmin(req: Request, env: Env, route: string): Promise<Response> {
  const reading = route === "" && req.method === "GET";
  const order = /^orders\/(SC-[A-F0-9]{8})$/.exec(route);
  const product = /^products\/([a-z0-9][a-z0-9-]{0,99})$/.exec(route);
  const updatingSettings = route === "settings" && req.method === "PUT";
  const patching = (order || product) && req.method === "PATCH";
  if (!reading && !updatingSettings && !patching) {
    throw new ApiError(404, "not_found", "Consumer preview action not found.");
  }

  const token = env.CONSUMER_ADMIN_TOKEN;
  if (!token) {
    if (reading) return offline("Configure the Consumer preview connection on both Workers.");
    throw new ApiError(503, "consumer_unavailable", "Connect the Consumer preview before making changes.");
  }

  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  let body: string | undefined;
  if (!reading) {
    const input = await readJson(req, 2048);
    if (order && typeof input?.status === "string" && ORDER_STATES.has(input.status)) {
      body = JSON.stringify({ status: input.status });
    } else if (product && typeof input?.available === "boolean") {
      body = JSON.stringify({ available: input.available });
    } else if (updatingSettings && typeof input?.acceptOrders === "boolean") {
      body = JSON.stringify({ acceptOrders: input.acceptOrders });
    } else {
      throw new ApiError(400, "invalid_argument", "Check the Consumer preview change and try again.");
    }
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(PREVIEW_ORIGIN + CONTROL_PATH + (route ? "/" + route : ""), {
      method: req.method, headers, body, redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const bytes = await readBytes(response, MAX_OVERVIEW_BYTES, "The preview response was too large.");
      return json(JSON.parse(new TextDecoder().decode(bytes)));
    }
    if (!reading && response.status === 404) {
      throw new ApiError(404, "not_found", "The Consumer preview record was not found.");
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw error;
    // A preview outage must not expose credentials or break the staff dashboard.
  }

  if (reading) return offline("The Consumer preview could not be reached. Check the connection and try again.");
  throw new ApiError(503, "consumer_unavailable", "The Consumer preview could not save your change. Refresh and try again.");
}
