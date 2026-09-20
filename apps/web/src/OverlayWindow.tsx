import { useEffect, useState } from "react";
import type { GraphicItem, MasterOverlayState, OverlayEvent } from "@newscg/shared";
import { defaultMasterOverlayState } from "@newscg/shared";
import { BroadcastGraphic } from "./BroadcastGraphic";

export default function OverlayWindow() {
  const [activeGraphic, setActiveGraphic] = useState<GraphicItem | null>(null);
  const [fields, setFields] = useState<Record<string, string> | null>(null);
  const [master, setMaster] = useState<MasterOverlayState>(defaultMasterOverlayState);
  const [isExiting, setIsExiting] = useState(false);
  const [exitAll, setExitAll] = useState(false);
  const [animKey, setAnimKey] = useState(0);
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

    let clearingAll = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelExit = () => { clearTimeout(exitTimer); clearingAll = false; setExitAll(false); };
    const es = new EventSource("/api/live/stream");

    es.onmessage = (event) => {
      try {
        const payload: OverlayEvent = JSON.parse(event.data);
        if (payload.type === "SYNC") {
          cancelExit();
          if (payload.master) setMaster(payload.master);
          if (payload.onAir && payload.graphic && payload.fields) {
            setIsExiting(false);
            setActiveGraphic(payload.graphic);
            setFields(payload.fields);
            setAnimKey((k) => k + 1);
          } else {
            setActiveGraphic(null);
            setFields(null);
            setIsExiting(false);
          }
        } else if (payload.type === "TAKE") {
          cancelExit();
          if (payload.master) setMaster(payload.master);
          setIsExiting(false);
          setActiveGraphic(payload.graphic);
          setFields(payload.fields);
          setAnimKey((k) => k + 1);
        } else if (payload.type === "UPDATE") {
          if (payload.master) setMaster(payload.master);
          setFields({ ...payload.fields });
        } else if (payload.type === "CLEAR") {
          cancelExit();
          if (payload.master) setMaster(payload.master);
          setIsExiting(true);
          exitTimer = setTimeout(() => {
            setActiveGraphic(null);
            setFields(null);
            setIsExiting(false);
          }, 560);
        } else if (payload.type === "MASTER_UPDATE") {
          if (clearingAll) {
            cancelExit(); setActiveGraphic(null); setFields(null); setIsExiting(false);
          }
          setExitAll(false);
          setMaster(payload.master);
        } else if (payload.type === "CLEAR_ALL") {
          cancelExit();
          clearingAll = true;
          setExitAll(true);
          setIsExiting(true);
          exitTimer = setTimeout(() => {
            setActiveGraphic(null);
            setFields(null);
            setMaster((m) => ({ ...m, showLogo: false, showTicker: false, showLiveBadge: false }));
            clearingAll = false;
            setExitAll(false);
            setIsExiting(false);
          }, 560);
        }
      } catch (err) {
        console.error("Gagal memproses event overlay:", err);
      }
    };

    return () => {
      clearTimeout(exitTimer);
      es.close();
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
        className={`overlay-stage-1080 ${isExiting ? "exiting" : ""}`}
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          position: "absolute"
        }}
      >
        <BroadcastGraphic
          type={activeGraphic?.templateType || null}
          fields={fields}
          master={master}
          isExiting={isExiting}
          exitAll={exitAll}
          contentKey={animKey}
        />
      </div>
    </div>
  );
}
