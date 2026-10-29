/**
 * Cloudflare Pages Advanced Mode Worker
 * Proxies API requests and SSE live streams to the backend server
 * and serves static assets and SPA fallback for NewsCG.
 */

const BACKEND_HOST = "freemusic.duckdns.org";
const BACKEND_ORIGIN = `https://${BACKEND_HOST}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Proxy API & Uploads
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
      const targetUrl = new URL(url.pathname + url.search, BACKEND_ORIGIN);

      const reqHeaders = new Headers(request.headers);
      reqHeaders.set("host", BACKEND_HOST);
      reqHeaders.set("x-forwarded-host", url.host);
      reqHeaders.set("x-forwarded-proto", url.protocol.replace(":", ""));

      // For SSE requests, enforce stream headers
      if (url.pathname === "/api/live/stream") {
        reqHeaders.set("accept", "text/event-stream");
        reqHeaders.set("cache-control", "no-cache");
      }

      try {
        const response = await fetch(targetUrl.toString(), {
          method: request.method,
          headers: reqHeaders,
          body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
          redirect: "follow",
        });

        const resHeaders = new Headers(response.headers);
        resHeaders.set("access-control-allow-origin", "*");
        resHeaders.set("access-control-allow-credentials", "true");

        // If it's an SSE stream or text/event-stream, pass it through without buffering
        if (
          url.pathname === "/api/live/stream" ||
          response.headers.get("content-type")?.includes("text/event-stream")
        ) {
          resHeaders.set("content-type", "text/event-stream; charset=utf-8");
          resHeaders.set("cache-control", "no-cache, no-transform");
          resHeaders.set("connection", "keep-alive");
          resHeaders.set("x-accel-buffering", "no");
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: resHeaders,
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Backend server unreachable",
            message: err instanceof Error ? err.message : String(err),
            offline: true,
          }),
          {
            status: 502,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "*",
            },
          }
        );
      }
    }

    // 2. Fetch static assets via Pages ASSETS binding
    let response = await env.ASSETS.fetch(request);

    // 3. SPA fallback to index.html for 404s on HTML/navigation routes (e.g. /output, /overlay, /templates/*)
    if (response.status === 404 && request.method === "GET") {
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      if (!hasExtension) {
        const indexUrl = new URL("/index.html", request.url);
        response = await env.ASSETS.fetch(new Request(indexUrl, request));
      }
    }

    return response;
  },
};
