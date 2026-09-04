import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  requestAccess,
  type RequestAccessDependencies,
} from "./handler.ts";

const publicErrors = new Set([
  "DISPLAY_NAME_INVALID",
  "USERNAME_INVALID",
  "PASSWORD_INVALID",
  "CITY_REQUIRED",
  "CITY_INVALID",
  "TRACKING_SECRET_INVALID",
  "SUBMISSION_KEY_REQUIRED",
  "ACCOUNT_ALREADY_EXISTS",
  "ACCESS_REQUEST_PENDING",
]);

export async function handleRequestAccessHttp(
  request: Request,
  createRuntime: () => RequestAccessDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const result = await requestAccess(await request.json(), createRuntime());
    return jsonResponse(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = [...publicErrors].find((candidate) => message.includes(candidate));
    return jsonResponse({ error: code || "ACCESS_REQUEST_FAILED" }, code ? 400 : 500);
  }
}
