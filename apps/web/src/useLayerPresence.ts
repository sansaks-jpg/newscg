import { broadcastMotion } from "@newscg/shared";
import { useEffect, useState } from "react";

/** Retain through OUT, but never carry a retained layer into a different cue. */
export function useLayerPresence(visible: boolean, duration: number = broadcastMotion.retainMs, identity?: string | number) {
  const [retained, setRetained] = useState({ visible, identity });
  useEffect(() => {
    if (visible) {
      setRetained(current => current.visible && current.identity === identity ? current : { visible: true, identity });
      return;
    }
    const timeout = setTimeout(() => setRetained(current => !current.visible && current.identity === identity ? current : { visible: false, identity }), duration);
    return () => clearTimeout(timeout);
  }, [visible, duration, identity]);
  return { present: visible || (retained.identity === identity && retained.visible), exiting: !visible };
}
