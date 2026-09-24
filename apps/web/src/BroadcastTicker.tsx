import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tickerPresets } from "@newscg/shared";
import type { OutputFrameRate } from "@newscg/shared";
import { advanceTicker, tickerCopies, tickerFrameDue } from "./tickerMotion";

export function BroadcastTicker({ text, speed = tickerPresets.normal, revision = 0, fps = 60 }: {
  text: string; speed?: number; revision?: number; fps?: OutputFrameRate;
}) {
  const normalized = text.trim() || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI";
  const [segments, setSegments] = useState<[string, string]>([normalized, normalized]);
  const [copies, setCopies] = useState([2, 2]);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const position = useRef(0);
  const segmentWidth = useRef(0);
  const latest = useRef({ text: normalized, speed });
  const activeSegments = useRef(segments);
  const revisionRef = useRef(revision);

  useLayoutEffect(() => {
    latest.current = { text: normalized, speed };
    if (revisionRef.current !== revision) {
      revisionRef.current = revision;
      position.current = 0;
      setSegments([normalized, normalized]);
    }
  }, [normalized, speed, revision]);

  useLayoutEffect(() => {
    activeSegments.current = segments;
    if (track.current) track.current.style.transform = `translate3d(${-position.current}px,0,0)`;
    const measure = () => {
      const children = track.current?.children;
      if (!children || !viewport.current) return;
      segmentWidth.current = children[0] ? parseFloat(getComputedStyle(children[0]).width) || 0 : 0;
      // Computed widths remain in canvas pixels even inside a scaled preview.
      const next = segments.map((_, index) => tickerCopies(
        viewport.current!.clientWidth,
        children[index]?.firstElementChild
          ? parseFloat(getComputedStyle(children[index].firstElementChild!).width) || 1 : 1
      ));
      setCopies((old) => old.every((count, index) => count === next[index]) ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    for (const child of Array.from(track.current?.children || [])) {
      observer.observe(child);
      if (child.firstElementChild) observer.observe(child.firstElementChild);
    }
    return () => observer.disconnect();
  }, [segments, copies]);

  useEffect(() => {
    let frame = 0;
    let lastTime: number | undefined;
    let nextFrameAt: number | undefined;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const cadence = tickerFrameDue(now, nextFrameAt, fps);
      nextFrameAt = cadence.nextFrameAt;
      if (!cadence.render) return;
      const el = track.current;
      const width = segmentWidth.current;
      const elapsed = lastTime === undefined ? 0 : now - lastTime;
      lastTime = now;
      if (el && width > 0) {
        const next = advanceTicker(position.current, elapsed, latest.current.speed, width);
        position.current = next.position;
        if (next.wrapped) {
          setSegments([activeSegments.current[1], latest.current.text]);
        } else if (position.current + (viewport.current?.clientWidth || 0) < width
          && activeSegments.current[1] !== latest.current.text) {
          // Replace the following segment only while it is completely off screen.
          setSegments([activeSegments.current[0], latest.current.text]);
        }
        el.style.transform = `translate3d(${-position.current}px,0,0)`;
      }
    };
    const resetClock = () => { lastTime = undefined; nextFrameAt = undefined; };
    document.addEventListener("visibilitychange", resetClock);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resetClock);
    };
  }, [fps]);

  return (
    <div ref={viewport} className="cg-ticker-content">
      <div ref={track} className="cg-ticker-track">
        {segments.map((segment, index) => (
          <div key={index} className="cg-ticker-segment" aria-hidden={index === 1 || undefined}>
            {Array.from({ length: copies[index] || 2 }, (_, copy) => (
              <span key={copy} className="cg-ticker-copy">
                <span className="cg-ticker-text">{segment}</span>
                <span className="cg-ticker-bullet" aria-hidden="true">■</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
