import { broadcastMotion, defaultMasterOverlayState } from "@newscg/shared";
import type { OverlayEvent, OverlayPlaybackState } from "@newscg/shared";

export function createOverlayPlayback(publish: (state: OverlayPlaybackState) => void) {
  let state: OverlayPlaybackState = {
    graphic: null, fields: null, master: defaultMasterOverlayState,
    exiting: false, exitAll: false, blackout: false, synced: true, animationKey: 0
  };
  let revision = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Extract<OverlayEvent, { type: "TAKE" }> | null = null;
  const commit = (patch: Partial<OverlayPlaybackState>) => {
    state = { ...state, ...patch };
    publish(state);
  };
  const cancel = () => { clearTimeout(timer); timer = undefined; pending = null; };
  const enter = (event: Extract<OverlayEvent, { type: "TAKE" }>) => commit({
    graphic: event.graphic, fields: event.fields, exiting: false, exitAll: false,
    blackout: false, synced: false, animationKey: state.animationKey + 1
  });
  return {
    initial: state,
    dispose: cancel,
    receive(event: OverlayEvent) {
      if (event.revision !== undefined) {
        if (event.type !== "SYNC" && event.revision <= revision) return;
        revision = event.revision;
      }
      switch (event.type) {
        case "SYNC":
          cancel();
          commit({ graphic: event.onAir ? event.graphic : null, fields: event.onAir ? event.fields : null,
            master: event.master, exiting: false, exitAll: false, blackout: false, synced: true });
          break;
        case "TAKE": {
          const needsOut = Boolean(state.graphic && state.graphic.id !== event.graphic.id);
          cancel();
          commit({ master: event.master, exitAll: false, blackout: false });
          if (needsOut) {
            pending = event;
            commit({ exiting: true, synced: false });
            timer = setTimeout(() => {
              const next = pending;
              pending = null;
              timer = undefined;
              if (next) enter(next);
            }, broadcastMotion.panelOutMs + broadcastMotion.panelOutDelayMs);
          } else if (state.graphic && !state.exiting) {
            commit({ fields: event.fields });
          } else enter(event);
          break;
        }
        case "UPDATE":
          commit({ master: event.master });
          if (pending?.graphic.id === event.graphicId) pending = { ...pending, fields: event.fields };
          else if (!pending && !state.exiting && state.graphic?.id === event.graphicId) commit({ fields: event.fields });
          break;
        case "MASTER_UPDATE":
          if (state.exitAll) {
            cancel();
            commit({ graphic: null, fields: null, exiting: false, exitAll: false });
          }
          commit({ master: event.master, blackout: false });
          break;
        case "CLEAR":
          cancel();
          commit({ master: event.master, exiting: true, synced: false });
          timer = setTimeout(() => {
            timer = undefined;
            commit({ graphic: null, fields: null, exiting: false });
          }, broadcastMotion.retainMs);
          break;
        default: {
          cancel();
          const finish = () => {
            timer = undefined;
            commit({ graphic: null, fields: null, exiting: false, exitAll: false, blackout: true,
              master: { ...state.master, showLogo: false, showTicker: false, showLiveBadge: false } });
          };
          if (event.type === "CLEAR_ALL_ANIMATED" || (event.type === "CLEAR_ALL" && event.immediate === false)) {
            commit({ exiting: true, exitAll: true, synced: false });
            timer = setTimeout(finish, broadcastMotion.retainMs);
          } else finish();
        }
      }
    }
  };
}
