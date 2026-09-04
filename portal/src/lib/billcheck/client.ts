import type { AgentBillIn, AgentBillStatusResponse, AgentCheckResult } from "./types";

/**
 * Server-side client for the bill checking agent.
 *
 * This module must only ever be imported from a route handler. The agent has no
 * authentication and no CORS, and its address is meant to stay on the internal network,
 * so the browser must never talk to it directly. That is also why the environment
 * variable is `BILLCHECK_BASE_URL` and not `NEXT_PUBLIC_BILLCHECK_BASE_URL` — the
 * `NEXT_PUBLIC_` prefix would inline the address into the client bundle.
 *
 * The env var is read inside each call rather than at module scope, so the value is the
 * one present at request time rather than one baked in when the module was first
 * evaluated.
 */

export class BillCheckUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "BillCheckUnavailableError";
  }
}

export class BillCheckRejectedError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`agent rejected the request (${status}): ${detail}`);
    this.name = "BillCheckRejectedError";
  }
}

/** The deterministic check takes about 90 ms; this is generous even so. */
const TIMEOUT_MS = 30_000;

function baseUrl(): string | null {
  const raw = process.env.BILLCHECK_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function isConfigured(): boolean {
  return baseUrl() !== null;
}

/**
 * The agent reports validation failures in two different shapes: FastAPI's own 422 sends
 * `detail` as an array of field errors, while our own `HTTPException`s send it as a
 * plain string. Both have to become one readable sentence for the supplier.
 */
function readDetail(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const e = entry as { loc?: unknown[]; msg?: string };
        const where = Array.isArray(e.loc) ? e.loc.filter((l) => l !== "body").join(".") : "";
        return where ? `${where}: ${e.msg ?? ""}`.trim() : (e.msg ?? null);
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return fallback;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = baseUrl();
  if (!base) {
    throw new BillCheckUnavailableError(
      "BILLCHECK_BASE_URL is not set, so the bill checking agent is not configured.",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new BillCheckUnavailableError(
      `could not reach the bill checking agent at ${base}`,
      err,
    );
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* a non-JSON error body is fine; the status still tells us what happened */
    }
    throw new BillCheckRejectedError(
      res.status,
      readDetail(body, `${res.status} ${res.statusText}`),
    );
  }

  return (await res.json()) as T;
}

export function createBill(bill: AgentBillIn): Promise<{ id: string; status: string }> {
  return call("/bills", { method: "POST", body: JSON.stringify(bill) });
}

/**
 * Run the check.
 *
 * `llm` stays false on the submission path on purpose. The deterministic check takes
 * about 90 ms and needs no API key; the LLM path takes 15-45 seconds and the free tier
 * allows roughly 20 requests a day, so putting it here would make bill submission fail
 * once a day's quota ran out.
 */
export function checkBill(billId: string, llm = false): Promise<AgentCheckResult> {
  const query = llm ? "?llm=true" : "?llm=false";
  return call(`/bills/${encodeURIComponent(billId)}/check${query}`, { method: "POST" });
}

export function getBill(billId: string): Promise<AgentBillStatusResponse> {
  return call(`/bills/${encodeURIComponent(billId)}`);
}
