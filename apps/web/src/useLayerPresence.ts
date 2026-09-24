import { broadcastMotion } from "@newscg/shared";
import { useEffect, useState } from "react";

/** Retain a layer through OUT and cancel stale removal when it is enabled again. */
export function useLayerPresence(visible: boolean, duration: number = broadcastMotion.retainMs) {
  const [retained, setRetained] = useState(visible);
  useEffect(() => {
    if (visible) { setRetained(true); return; }
    const timeout = setTimeout(() => setRetained(false), duration);
    return () => clearTimeout(timeout);
  }, [visible, duration]);
  return { present: visible || retained, exiting: !visible };
}
