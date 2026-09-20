import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** Two identical copies travel one copy-width, so the loop has no empty reset. */
export function BroadcastTicker({ text }: { text: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const [displayText, setDisplayText] = useState(text);
  const [distance, setDistance] = useState(1920);
  const [copies, setCopies] = useState(2);
  const changing = displayText !== text;
  useEffect(() => {
    if (text === displayText) return;
    const timer = setTimeout(() => setDisplayText(text), 180);
    return () => clearTimeout(timer);
  }, [text, displayText]);
  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !copy.current || !viewport.current) return;
      // offsetWidth is independent of the scaled preview canvas.
      setDistance(copy.current.offsetWidth);
      setCopies(Math.max(2, Math.ceil(viewport.current.clientWidth / Math.max(1, copy.current.offsetWidth)) + 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (copy.current) observer.observe(copy.current);
    document.fonts.ready.then(measure).catch(() => {});
    return () => { cancelled = true; observer.disconnect(); };
  }, [displayText]);
  return (
    <div ref={viewport} className={`cg-ticker-content ${changing ? "ticker-changing" : ""}`}>
      <div key={displayText} className="cg-ticker-track" style={{
        "--ticker-distance": `${distance}px`, "--ticker-duration": `${Math.max(8, distance / 90)}s`,
      } as CSSProperties}>
        <span ref={copy} className="cg-ticker-copy"><span className="cg-ticker-text">{displayText}</span></span>
        {Array.from({ length: copies - 1 }, (_, index) => (
          <span key={index} className="cg-ticker-copy" aria-hidden="true"><span className="cg-ticker-text">{displayText}</span></span>
        ))}
      </div>
    </div>
  );
}
