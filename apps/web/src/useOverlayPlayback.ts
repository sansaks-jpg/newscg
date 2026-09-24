import { useEffect, useState } from "react";
import type { OverlayEvent } from "@newscg/shared";
import { createOverlayPlayback } from "./overlayPlayback";

/** Program and browser output consume the same events and retain the same OUT frames. */
export function useOverlayPlayback() {
  const [playback] = useState(() => createOverlayPlayback((next) => setState(next)));
  const [state, setState] = useState(playback.initial);
  useEffect(() => {
    const stream = new EventSource("/api/live/stream");
    stream.onmessage = (event) => {
      try { playback.receive(JSON.parse(event.data) as OverlayEvent); }
      catch (error) { console.error("Gagal memproses event overlay:", error); }
    };
    return () => { stream.close(); playback.dispose(); };
  }, [playback]);
  return state;
}
