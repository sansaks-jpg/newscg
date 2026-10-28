import { useLayoutEffect, useRef, type CSSProperties } from "react";

export function AutoSquishText({ text, className, minScale = 0.72, fillHeight, maxVerticalScale = 1, style }: {
  text: string; className?: string; minScale?: number; fillHeight?: number;
  maxVerticalScale?: number; style?: CSSProperties;
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
      const floor = Math.max(0.1, Math.min(1, minScale));
      if (natural > width / floor) {
        const baseSize = parseFloat(getComputedStyle(container).fontSize);
        span.style.fontSize = `${baseSize * width / (natural * floor)}px`;
      }
      if (floor === 1) {
        // Fixed letter spacing survives a font-size change. Re-measure it instead
        // of correcting the remaining overflow by distorting the glyphs.
        for (let attempt = 0; attempt < 3 && span.scrollWidth > width; attempt++) {
          const fontSize = parseFloat(getComputedStyle(span).fontSize);
          span.style.fontSize = `${Math.max(.1, fontSize * width / span.scrollWidth - .1)}px`;
        }
        return;
      }
      for (let attempt = 0; attempt < 3 && span.scrollWidth * floor > width; attempt++) {
        const fontSize = parseFloat(getComputedStyle(span).fontSize);
        span.style.fontSize = `${Math.max(.1, fontSize * width / (span.scrollWidth * floor) - .1)}px`;
      }
      const scaleX = Math.min(1, width / Math.max(1, span.scrollWidth));
      let scaleY = 1;
      let offsetY = 0;
      if (fillHeight && container.clientHeight) {
        const css = getComputedStyle(span);
        const context = document.createElement("canvas").getContext("2d");
        if (context) {
          context.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
          const ink = context.measureText(text);
          const inkHeight = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
          if (inkHeight > 0) {
            scaleY = Math.max(1, Math.min(maxVerticalScale, container.clientHeight * fillHeight / inkHeight));
            // Center the visible capitals, rather than the font's unused descent.
            const fontAscent = ink.fontBoundingBoxAscent;
            const fontDescent = ink.fontBoundingBoxDescent;
            if (Number.isFinite(fontAscent) && Number.isFinite(fontDescent)) {
              offsetY = (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent - fontAscent + fontDescent) * scaleY / 2;
            }
          }
        }
      }
      span.style.transform = `translateY(${offsetY}px) scale(${scaleX}, ${scaleY})`;
    };
    adjust();
    document.fonts.ready.then(adjust).catch(error => console.error("Font grafis gagal dimuat:", error));
    const observer = new ResizeObserver(adjust);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { disposed = true; observer.disconnect(); };
  }, [text, minScale, fillHeight, maxVerticalScale, className]);
  return (
    <div ref={containerRef} className={className} style={{ width: "100%", minWidth: 0,
      overflow: "hidden", whiteSpace: "nowrap", display: "flex", alignItems: "center", ...style }}>
      <span ref={textRef} style={{ display: "inline-block", flexShrink: 0,
        whiteSpace: "nowrap", transformOrigin: "left center" }}>{text}</span>
    </div>
  );
}
