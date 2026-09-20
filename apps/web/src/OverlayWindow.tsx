import { useEffect, useRef, useState } from "react";
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

  const activeGraphicRef = useRef<GraphicItem | null>(null);
  const revisionRef = useRef<number>(0);

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

    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let transitionTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = undefined;
      }
      if (transitionTimer) {
        clearTimeout(transitionTimer);
        transitionTimer = undefined;
      }
    };

    const es = new EventSource("/api/live/stream");

    es.onmessage = (event) => {
      try {
        const payload: OverlayEvent = JSON.parse(event.data);
        if (payload.revision !== undefined) {
          if (payload.revision < revisionRef.current) {
            // Abaikan event lama yang datang out-of-order
            return;
          }
          revisionRef.current = payload.revision;
        }

        if (payload.type === "SYNC") {
          clearTimers();
          if (payload.master) setMaster(payload.master);
          if (payload.onAir && payload.graphic && payload.fields) {
            const isSame = activeGraphicRef.current?.id === payload.graphic.id;
            setIsExiting(false);
            setExitAll(false);
            activeGraphicRef.current = payload.graphic;
            setActiveGraphic(payload.graphic);
            setFields(payload.fields);
            if (!isSame) {
              setAnimKey((k) => k + 1);
            }
          } else {
            activeGraphicRef.current = null;
            setActiveGraphic(null);
            setFields(null);
            setIsExiting(false);
            setExitAll(false);
          }
        } else if (payload.type === "TAKE") {
          clearTimers();
          if (payload.master) setMaster(payload.master);

          const currentOnAir = activeGraphicRef.current;
          const isDifferent = currentOnAir && currentOnAir.id !== payload.graphic.id;

          if (isDifferent) {
            // Pergantian headline beruntun: transisi OUT pada konten lama lalu IN pada konten baru
            setIsExiting(true);
            transitionTimer = setTimeout(() => {
              activeGraphicRef.current = payload.graphic;
              setActiveGraphic(payload.graphic);
              setFields(payload.fields);
              setIsExiting(false);
              setAnimKey((k) => k + 1);
              transitionTimer = undefined;
            }, 320);
          } else {
            activeGraphicRef.current = payload.graphic;
            setActiveGraphic(payload.graphic);
            setFields(payload.fields);
            setIsExiting(false);
            setAnimKey((k) => k + 1);
          }
        } else if (payload.type === "UPDATE") {
          if (payload.master) setMaster(payload.master);
          setFields({ ...payload.fields });
        } else if (payload.type === "CLEAR") {
          clearTimers();
          if (payload.master) setMaster(payload.master);
          setIsExiting(true);
          exitTimer = setTimeout(() => {
            activeGraphicRef.current = null;
            setActiveGraphic(null);
            setFields(null);
            setIsExiting(false);
            exitTimer = undefined;
          }, 500);
        } else if (payload.type === "MASTER_UPDATE") {
          if (payload.master) setMaster(payload.master);
        } else if (
          payload.type === "CLEAR_ALL" ||
          payload.type === "CLEAR_ALL_IMMEDIATE" ||
          payload.type === "CLEAR_ALL_ANIMATED"
        ) {
          clearTimers();
          const isImmediate =
            payload.type === "CLEAR_ALL_IMMEDIATE" ||
            (payload.type === "CLEAR_ALL" && payload.immediate !== false);

          if (isImmediate) {
            activeGraphicRef.current = null;
            setActiveGraphic(null);
            setFields(null);
            setMaster((m) => ({ ...m, showLogo: false, showTicker: false, showLiveBadge: false }));
            setIsExiting(false);
            setExitAll(false);
          } else {
            setExitAll(true);
            setIsExiting(true);
            exitTimer = setTimeout(() => {
              activeGraphicRef.current = null;
              setActiveGraphic(null);
              setFields(null);
              setMaster((m) => ({ ...m, showLogo: false, showTicker: false, showLiveBadge: false }));
              setExitAll(false);
              setIsExiting(false);
              exitTimer = undefined;
            }, 500);
          }
        }
      } catch (err) {
        console.error("Gagal memproses event overlay:", err);
      }
    };

    return () => {
      clearTimers();
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
