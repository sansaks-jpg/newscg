import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { useOverlayPlayback } from "./useOverlayPlayback";

export function ProgramMonitor() {
  const state = useOverlayPlayback();
  return <BroadcastPreviewBox graphic={state.graphic} fields={state.fields} master={state.master}
    isExiting={state.exiting} exitAll={state.exitAll} blackout={state.blackout}
    animationKey={state.animationKey} emptyText="OUTPUT KOSONG" />;
}
