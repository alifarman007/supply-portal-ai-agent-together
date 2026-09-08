import { Agent } from "undici";
import type { RawTokenResponse } from "./types";

/**
 * Read at call time, not at module scope.
 *
 * A module-scope capture is baked in at first evaluation, so setting
 * IDEMPIERE_BASE_URL afterwards has no effect until the dev server restarts —
 * and `isErpConfigured()` below, which does read per call, would then disagree
 * with the URL actually being fetched. Same reasoning as billcheck/client.ts.
 */
function baseUrl(): string {
  return process.env.IDEMPIERE_BASE_URL?.trim() ?? "";
}

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

// Writes get longer. A bill submission may carry a base64 attachment of a few
// megabytes, and the ERP decodes it, sniffs the real file type and commits a
// record inside the request — none of which fits in the 5 s that is right for
// a cheap read.
const WRITE_TIMEOUT_MS = 30_000;

async function fetchToken(): Promise<string> {
  const res = await fetch(`${baseUrl()}/auth/tokens`, {
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
 *
 * The 401 retry replays the request. That is safe here: a 401 means the ERP
 * rejected the token before doing any work, so a write cannot have been
 * committed by the attempt that produced it.
 */
export async function idempiereFetch(
  path: string,
  init: RequestInit = {},
  { timeoutMs = CONNECT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Response> {
  const call = async (token: string) =>
    fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      // Set after the spread on purpose: the caller picks the budget through
      // `timeoutMs`, and a stale `signal` on `init` must not silently win.
      signal: AbortSignal.timeout(timeoutMs),
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

/** True when the ERP is configured at all. Reads env at call time, never at module scope. */
export function isErpConfigured(): boolean {
  return Boolean(process.env.IDEMPIERE_BASE_URL?.trim());
}

/**
 * Writes are opt-in, separately from reads.
 *
 * Reading a purchase order from a UAT ERP is free; posting a bill or a payment
 * creates a real record in it. A developer who fills in IDEMPIERE_* to see live
 * purchase orders has not thereby asked to write to the company's ERP, so the
 * two capabilities are separate switches — the same reasoning that puts the
 * internal bill-checking screens behind BILLCHECK_INTERNAL.
 */
export function erpWritesEnabled(): boolean {
  return process.env.IDEMPIERE_WRITES_ENABLED?.trim().toLowerCase() === "true";
}

/** Thrown when the ERP is unreachable, times out, or fails to authenticate. */
export class ErpUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ErpUnavailableError";
  }
}

/** Thrown when the ERP answered with `status: "error"` and told us why. */
export class ErpRejectedError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ErpRejectedError";
  }
}

/**
 * POST a JSON body to the ERP and unwrap its `{status, message}` envelope.
 *
 * The specification documents no HTTP status codes for the write endpoints, so
 * `res.ok` proves nothing on its own — an error commonly arrives as HTTP 200
 * with `status: "error"`. Both are funnelled into ErpRejectedError carrying the
 * ERP's own message, because that message ("error 'billAmount' must be greater
 * than zero") is far more useful in front of a user than "submission failed".
 */
export async function erpPostJson<TSuccess extends { status: string }>(
  path: string,
  body: unknown,
): Promise<TSuccess> {
  let res: Response;
  try {
    res = await idempiereFetch(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { timeoutMs: WRITE_TIMEOUT_MS },
    );
  } catch (err) {
    throw new ErpUnavailableError(`iDempiere POST ${path} failed`, { cause: err });
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A non-JSON body means a proxy, a login page or a stack trace — not the
    // API. Treat it as the service being unavailable rather than a rejection,
    // so the caller does not report a nonsense reason to the user.
    throw new ErpUnavailableError(
      `iDempiere POST ${path} returned ${res.status} with a non-JSON body: ${text.slice(0, 200)}`,
    );
  }

  const envelope = parsed as { status?: string; message?: string };
  if (envelope.status === "error" || !res.ok) {
    throw new ErpRejectedError(
      envelope.message?.trim() || `iDempiere rejected the request (HTTP ${res.status})`,
      res.status,
    );
  }

  // Require the success marker rather than inferring it from the absence of an
  // error. A 200 with an unrecognised body — a proxy's JSON, a changed contract,
  // a partial write — would otherwise be cast to TSuccess and read for fields
  // that are not there, and the caller would report a submission reference of
  // `undefined` as though it had succeeded.
  if (envelope.status !== "success") {
    throw new ErpUnavailableError(
      `iDempiere POST ${path} returned HTTP ${res.status} with no status field: ` +
        `${text.slice(0, 200)}`,
    );
  }

  return parsed as TSuccess;
}
