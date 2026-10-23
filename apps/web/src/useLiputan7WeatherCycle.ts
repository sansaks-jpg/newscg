import { useEffect, useState } from "react";
import { getLiputan7WeatherFrame } from "@newscg/shared";

/** Forecast refreshes and CG updates do not restart the persistent program bug. */
export function useLiputan7WeatherCycle(enabled: boolean, locationKey: string, count: number) {
  const [frame, setFrame] = useState(() => ({ key: "", ...getLiputan7WeatherFrame(0, 0) }));
  useEffect(() => {
    if (!enabled || !count) {
      setFrame(current => current.key ? { ...current, key: "" } : current);
      return;
    }
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const next = getLiputan7WeatherFrame(Date.now() - start, count);
      setFrame({ key: locationKey, ...next });
      timer = setTimeout(update, Math.max(1, next.nextChangeInMs));
    };
    update();
    return () => clearTimeout(timer);
  }, [enabled, locationKey, count]);
  return enabled && frame.key === locationKey ? frame : getLiputan7WeatherFrame(0, 0);
}
