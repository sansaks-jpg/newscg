import { useEffect, useState } from "react";
import type { GraphicItem, MasterOverlayState } from "@newscg/shared";
import { BroadcastPreviewBox } from "./BroadcastGraphic";

/** Keep the program's old copy mounted until OUT finishes, like the output window. */
export function ProgramPreview({ graphic, fields, master }: {
  graphic: GraphicItem | null;
  fields: Record<string, string> | null;
  master: MasterOverlayState;
}) {
  const [rendered, setRendered] = useState({ graphic, fields });
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (graphic && fields) {
      setRendered({ graphic, fields }); setExiting(false);
      return;
    }
    setExiting(true);
    const timer = setTimeout(() => { setRendered({ graphic: null, fields: null }); setExiting(false); }, 560);
    return () => clearTimeout(timer);
  }, [graphic?.id, fields]);
  return <BroadcastPreviewBox graphic={rendered.graphic} fields={rendered.fields} master={master}
    isExiting={exiting} emptyText="OUTPUT BERSIH" />;
}
