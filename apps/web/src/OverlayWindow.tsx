import { useEffect, useState } from "react";
import { useOverlayPlayback } from "./useOverlayPlayback";
import { BroadcastGraphic } from "./BroadcastGraphic";

export default function OverlayWindow() {
  const state = useOverlayPlayback();
  const [scale, setScale] = useState(1);

  // Lock to exact 1920x1080 canvas and 16:9 ratio without distortion
  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.classList.add("overlay-mode");
    const rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.classList.add("overlay-mode");
      rootEl.style.setProperty("background", "transparent", "important");
      rootEl.style.setProperty("background-color", "transparent", "important");
    }
    document.body.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background-color", "transparent", "important");
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.documentElement.style.setProperty("background-color", "transparent", "important");

    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Proportional fitting inside viewport - strictly locks 16:9
      const s = Math.min(w / 1920, h / 1080);
      setScale(s);
    };

    updateScale();
    window.addEventListener("resize", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      document.body.classList.remove("overlay-mode");
      document.documentElement.classList.remove("overlay-mode");
      if (rootEl) {
        rootEl.classList.remove("overlay-mode");
        rootEl.style.removeProperty("background");
        rootEl.style.removeProperty("background-color");
      }
      document.body.style.removeProperty("background");
      document.body.style.removeProperty("background-color");
      document.documentElement.style.removeProperty("background");
      document.documentElement.style.removeProperty("background-color");
    };
  }, []);

  return (
    <div className="overlay-root">
      <div
        className="overlay-stage-1080"
        data-broadcast-motion
        style={{
          width: 1920,
          height: 1080,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "center center",
          position: "absolute"
        }}
      >
        {!state.blackout && <BroadcastGraphic
          type={state.graphic?.templateType || null}
          fields={state.fields}
          master={state.master}
          isExiting={state.exiting}
          exitAll={state.exitAll}
          contentKey={state.animationKey}
        />}
      </div>
    </div>
  );
}
