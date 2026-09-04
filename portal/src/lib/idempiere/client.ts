import { Agent } from "undici";
import type { RawTokenResponse } from "./types";

const BASE_URL = process.env.IDEMPIERE_BASE_URL ?? "";

// The UAT host presents a self-signed certificate, so verification is
// disabled for this internal client only — it never runs in the browser.
// Node's fetch (undici) takes TLS options via a `dispatcher`, not the
// `agent` option `https.Agent` would suggest.
const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

let cachedToken: { token: string; expiresAt: number } | null = null;

function decodeJwtExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

// The backend host is an internal-network-only IP. On a deployment that
// can't reach it (e.g. Vercel), fail fast instead of hanging until the
// platform's own timeout.
const CONNECT_TIMEOUT_MS = 5000;

async function fetchToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    // @ts-expect-error -- dispatcher is an undici-specific fetch option, not in the DOM lib types
    dispatcher: insecureDispatcher,
    body: JSON.stringify({
      userName: process.env.IDEMPIERE_USERNAME,
      password: process.env.IDEMPIERE_PASSWORD,
      parameters: {
        clientId: Number(process.env.IDEMPIERE_CLIENT_ID),
        roleId: Number(process.env.IDEMPIERE_ROLE_ID),
        organizationId: Number(process.env.IDEMPIERE_ORG_ID),
        warehouseId: Number(process.env.IDEMPIERE_WAREHOUSE_ID),
        language: process.env.IDEMPIERE_LANGUAGE ?? "en_US",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`iDempiere auth failed: ${res.status} ${await res.text()}`);
  }

  const data: RawTokenResponse = await res.json();
  const expiresAt = decodeJwtExpiry(data.token) ?? Date.now() + 50 * 60 * 1000;
  cachedToken = { token: data.token, expiresAt };
  return data.token;
}

async function getToken(): Promise<string> {
  // Refresh a little before actual expiry so an in-flight request never
  // races the token's expiry.
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.token;
  }
  return fetchToken();
}

/**
 * Calls the iDempiere Supplier API with a valid bearer token, retrying once
 * with a freshly-issued token if the cached one was rejected.
 */
export async function idempiereFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const call = async (token: string) =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      // @ts-expect-error -- dispatcher is an undici-specific fetch option, not in the DOM lib types
      dispatcher: insecureDispatcher,
    });

  let token = await getToken();
  let res = await call(token);

  if (res.status === 401) {
    cachedToken = null;
    token = await fetchToken();
    res = await call(token);
  }

  return res;
}
