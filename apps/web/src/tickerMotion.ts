import { tickerPresets } from "@newscg/shared";
import type { OutputFrameRate } from "@newscg/shared";

export function tickerCopies(viewportWidth: number, copyWidth: number) {
  return Math.max(2, Math.ceil(viewportWidth / Math.max(1, copyWidth)) + 1);
}

export function tickerFrameDue(now: number, nextFrameAt: number | undefined, fps: OutputFrameRate) {
  const interval = 1000 / fps;
  if (nextFrameAt === undefined) return { render: true, nextFrameAt: now + interval };
  if (now + 0.5 < nextFrameAt) return { render: false, nextFrameAt };
  const missedIntervals = Math.max(0, Math.floor((now - nextFrameAt) / interval));
  return { render: true, nextFrameAt: nextFrameAt + (missedIntervals + 1) * interval };
}

export function advanceTicker(position: number, elapsedMs: number, speed: number, width: number) {
  const safeSpeed = Number.isFinite(speed) ? Math.max(30, Math.min(250, speed)) : tickerPresets.normal;
  // A suspended browser resumes at the current picture rather than jumping ahead.
  const next = position + safeSpeed * Math.max(0, Math.min(elapsedMs, 100)) / 1000;
  return { position: width > 0 ? next % width : 0, wrapped: width > 0 && next >= width };
}
