import { broadcastMotion, defaultMasterOverlayState, getGraphicRetainMs, hasVisibleMasterLayers, liputan7Motion } from "@newscg/shared";
import type { OverlayEvent, OverlayPlaybackState } from "@newscg/shared";

export function createOverlayPlayback(publish: (state: OverlayPlaybackState) => void) {
  let state: OverlayPlaybackState = {
    graphic: null, fields: null, master: defaultMasterOverlayState,
    exiting: false, exitAll: false, blackout: false, synced: true, animationKey: 0
  };
  let revision = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Extract<OverlayEvent, { type: "TAKE" | "SWITCH_DETAIL" }> | null = null;
  const commit = (patch: Partial<OverlayPlaybackState>) => {
    state = { ...state, ...patch };
    publish(state);
  };
  const cancel = () => { clearTimeout(timer); timer = undefined; pending = null; };
  const enter = (event: Extract<OverlayEvent, { type: "TAKE" | "SWITCH_DETAIL" }>) => commit({
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
        case "SYNC": {
          cancel();
          const hasLiveGraphic = Boolean(event.onAir && event.graphic && event.fields);
          const hasMaster = hasVisibleMasterLayers(event.master);
          commit({ graphic: event.onAir ? event.graphic : null, fields: event.onAir ? event.fields : null,
            master: event.master, exiting: false, exitAll: false, blackout: !hasLiveGraphic && !hasMaster, synced: true });
          break;
        }
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
            }, getGraphicRetainMs(state.master));
          } else if (state.graphic && !state.exiting) {
            commit({ fields: event.fields });
          } else enter(event);
          break;
        }
        case "SWITCH_DETAIL": {
          if (state.exiting && pending && timer) {
            // A full panel OUT is already running. Replace its queued destination
            // without cutting the outgoing graphic or restarting the timer.
            pending = event;
            commit({ master: event.master, exitAll: false, blackout: false });
            break;
          }
          cancel();
          if (!state.graphic || state.exiting) {
            commit({ master: event.master });
            enter({ ...event, type: "TAKE" });
            break;
          }
          const oldFields = state.fields || {};
          const hasDetail = state.graphic.templateType === "SOT" ||
            (oldFields.layoutStyle !== "single" && Boolean(oldFields.subline?.trim()));
          if (hasDetail) {
            pending = event;
            commit({ fields: { ...oldFields, showDetail: "false", layoutStyle: "single", showSot: "false" }, master: event.master });
            timer = setTimeout(() => {
              const next = pending;
              pending = null;
              timer = undefined;
              // Master changes are broadcast independently during the detail OUT.
              // Preserve the latest master instead of restoring the switch snapshot.
              if (next) commit({ graphic: next.graphic, fields: next.fields });
            }, broadcastMotion.detailOutMs + 20);
          } else commit({ graphic: event.graphic, fields: event.fields, master: event.master });
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
          commit({ ...(event.master ? { master: event.master } : {}), exiting: true, synced: false });
          timer = setTimeout(() => {
            timer = undefined;
            commit({ graphic: null, fields: null, exiting: false });
          }, getGraphicRetainMs(state.master));
          break;
        default: {
          cancel();
          const finish = () => {
            timer = undefined;
            commit({ graphic: null, fields: null, exiting: false, exitAll: false, blackout: true,
              master: { ...state.master, showLogo: false, showTicker: false, showLiveBadge: false, showProgramLogo: false, showWeather: false } });
          };
          if (event.type === "CLEAR_ALL_ANIMATED" || (event.type === "CLEAR_ALL" && event.immediate === false)) {
            commit({ exiting: true, exitAll: true, synced: false });
            timer = setTimeout(() => {
              commit({ graphic: null, fields: null, exiting: false,
                master: { ...state.master, showTicker: false } });
              timer = setTimeout(() => {
                if (state.master.broadcastTemplate === "liputan7") {
                  commit({ master: { ...state.master, showProgramLogo: false, showWeather: false } });
                  timer = setTimeout(() => {
                    commit({ master: { ...state.master, showLogo: false, showLiveBadge: false } });
                    timer = setTimeout(finish, liputan7Motion.logoOutMs + 20);
                  }, Math.max(liputan7Motion.logoOutMs, liputan7Motion.weatherMorphMs) + 20);
                  return;
                }
                const hideLogos = () => {
                  commit({ master: { ...state.master, showLogo: false, showLiveBadge: false, showProgramLogo: false } });
                  timer = setTimeout(finish, Math.max(broadcastMotion.logoOutMs, broadcastMotion.liveOutMs) + 20);
                };
                hideLogos();
              }, broadcastMotion.tickerOutMs + 20);
            }, state.graphic ? getGraphicRetainMs(state.master) : 0);
          } else finish();
        }
      }
    }
  };
}
