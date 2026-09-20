import { useLayoutEffect, useRef, type CSSProperties } from "react";

export function AutoSquishText({ text, className, minScale = 0.72, style }: {
  text: string; className?: string; minScale?: number; style?: CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    let disposed = false;
    const adjust = () => {
      const container = containerRef.current;
      const span = textRef.current;
      if (disposed || !container || !span || !container.clientWidth) return;
      // Use layout pixels so preview scaling never changes the text fit.
      span.style.transform = "none";
      span.style.fontSize = "inherit";
      const width = container.clientWidth;
      const natural = span.scrollWidth;
      const floor = Math.max(0.72, Math.min(1, minScale));
      if (natural > width / floor) {
        const baseSize = parseFloat(getComputedStyle(container).fontSize);
        span.style.fontSize = `${baseSize * width / (natural * floor)}px`;
      }
      span.style.transform = `scaleX(${Math.min(1, width / Math.max(1, span.scrollWidth))})`;
    };
    adjust();
    document.fonts.ready.then(adjust).catch(() => {});
    const observer = new ResizeObserver(adjust);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { disposed = true; observer.disconnect(); };
  }, [text, minScale, className]);
  return (
    <div ref={containerRef} className={className} style={{ width: "100%", minWidth: 0,
      overflow: "hidden", whiteSpace: "nowrap", display: "flex", alignItems: "center", ...style }}>
      <span ref={textRef} style={{ display: "inline-block", flexShrink: 0,
        whiteSpace: "nowrap", transformOrigin: "left center" }}>{text}</span>
    </div>
  );
}
