import { useEffect, useState } from "react";
import type { OverlayEvent } from "@newscg/shared";
import { createOverlayPlayback } from "./overlayPlayback";

/** Program and browser output consume the same events and retain the same OUT frames. */
export function useOverlayPlayback(options?: { role?: "output" | "monitor" }) {
  const role = options?.role || "output";
  const [playback] = useState(() => createOverlayPlayback((next) => setState(next)));
  const [state, setState] = useState(playback.initial);

  useEffect(() => {
    // 1. Local BroadcastChannel for peer sync across browser tabs/windows
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel("newscg-live-stream");
        channel.onmessage = (event) => {
          if (event.data) {
            try {
              playback.receive(event.data as OverlayEvent);
            } catch (err) {
              console.error("Gagal memproses event overlay via BroadcastChannel:", err);
            }
          }
        };
      } catch {
        // BroadcastChannel unavailable
      }
    }

    // 2. Server-Sent Events (SSE) from backend / Cloudflare proxy
    let stream: EventSource | null = null;
    try {
      stream = new EventSource(`/api/live/stream?role=${role}`);
      stream.onmessage = (event) => {
        try {
          playback.receive(JSON.parse(event.data) as OverlayEvent);
        } catch (error) {
          console.error("Gagal memproses event overlay:", error);
        }
      };
      stream.onerror = () => {
        // SSE reconnecting or unavailable; EventSource handles auto-retry
      };
    } catch {
      // EventSource failed to instantiate
    }

    return () => {
      if (stream) stream.close();
      if (channel) channel.close();
      playback.dispose();
    };
  }, [playback, role]);

  return state;
}
