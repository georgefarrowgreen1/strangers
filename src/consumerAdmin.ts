import { ApiError, Env, json, readJson, readBytes } from "./http";
import { BRANDED_RETAIL_ORIGIN } from "./brandedRetail";
import { retailServiceRequest } from "./retailService";

const CONTROL_PATH = "/api/control/consumer";
const MAX_OVERVIEW_BYTES = 2 * 1024 * 1024;
const ORDER_STATES = new Set(["placed", "preparing", "ready", "completed", "cancelled"]);

function offline(detail: string) {
  return json({
    connected: false,
    previewUrl: BRANDED_RETAIL_ORIGIN + "/",
    readiness: [{ label: "Consumer preview connection", state: "blocked", detail }],
    orders: [],
    customers: [],
    products: [],
    settings: { acceptOrders: false },
  });
}

/** Signs requests that manage the separate test storefront. */
export async function handleConsumerAdmin(req: Request, env: Env, route: string): Promise<Response> {
  const reading = route === "" && req.method === "GET";
  const order = /^orders\/(SC-[A-F0-9]{8})$/.exec(route);
  const product = /^products\/([a-z0-9][a-z0-9-]{0,99})$/.exec(route);
  const updatingSettings = route === "settings" && req.method === "PUT";
  const patching = (order || product) && req.method === "PATCH";
  if (!reading && !updatingSettings && !patching) {
    throw new ApiError(404, "not_found", "Consumer preview action not found.");
  }

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
  }

  try {
    const response = await retailServiceRequest(env, CONTROL_PATH + (route ? "/" + route : ""), {
      method: req.method, body,
    });
    if (response.ok) {
      const bytes = await readBytes(response, MAX_OVERVIEW_BYTES, "The preview response was too large.");
      const result = JSON.parse(new TextDecoder().decode(bytes));
      if (reading) result.previewUrl = BRANDED_RETAIL_ORIGIN + "/";
      return json(result);
    }
    await response.body?.cancel();
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
