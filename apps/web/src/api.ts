const headers = { "Content-Type": "application/json" };
let fallbackSequence = 0;

function createIdempotencyKey(): string {
  const requestCrypto = globalThis.crypto;
  if (typeof requestCrypto?.randomUUID === "function") return requestCrypto.randomUUID();
  // getRandomValues also works when the operator opens the dashboard over HTTP LAN.
  if (typeof requestCrypto?.getRandomValues === "function") {
    const bytes = requestCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  fallbackSequence += 1;
  return `${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const mutate = <T>(path: string, method: string, body?: unknown, idempotent = false) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: idempotent ? { "Idempotency-Key": createIdempotencyKey() } : undefined
  });
