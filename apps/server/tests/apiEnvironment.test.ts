import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mutate } from "../../web/src/api";

afterEach(() => vi.unstubAllGlobals());

function mockTransport() {
  const transport = vi.fn(async () => ({ ok: true, status: 204 }));
  vi.stubGlobal("fetch", transport);
  return transport;
}

function requestKey(transport: ReturnType<typeof mockTransport>, index = 0): string | undefined {
  const [, options] = transport.mock.calls[index] as unknown as [string, RequestInit];
  return (options.headers as Record<string, string>)["Idempotency-Key"];
}

describe("operator requests in supported browser environments", () => {
  it("sends the browser UUID and retains the command payload", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "request-uuid" });
    const transport = mockTransport();
    await mutate("/api/live/take", "POST", { graphicId: "cue-1" }, true);
    expect(transport).toHaveBeenCalledWith("/api/live/take", expect.objectContaining({
      method: "POST", body: '{"graphicId":"cue-1"}',
      headers: { "Content-Type": "application/json", "Idempotency-Key": "request-uuid" }
    }));
  });

  it("still sends distinct live commands when HTTP LAN has no randomUUID", async () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const transport = mockTransport();
    await mutate("/api/live/take", "POST", { graphicId: "cue-1" }, true);
    await mutate("/api/live/clear", "POST", undefined, true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(requestKey(transport)).toMatch(/^[0-9a-f]{32}$/);
    expect(requestKey(transport, 1)).not.toBe(requestKey(transport));
  });

  it("keeps requests distinct even in a browser context without crypto", async () => {
    vi.stubGlobal("crypto", undefined);
    const transport = mockTransport();
    await mutate("/api/live/take", "POST", undefined, true);
    await mutate("/api/live/take", "POST", undefined, true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(requestKey(transport)).toBeTruthy();
    expect(requestKey(transport, 1)).not.toBe(requestKey(transport));
  });

  it("does not add an idempotency key to ordinary draft saves", async () => {
    vi.stubGlobal("crypto", undefined);
    const transport = mockTransport();
    await mutate("/api/graphics/cue-1", "PATCH", { draftFields: { headline: "BARU" } });
    expect(requestKey(transport)).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
