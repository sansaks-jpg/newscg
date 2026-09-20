import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Engine animasi running ticker siaran televisi.
 * Menggunakan arsitektur dua segmen identik (mirrored dual-segment) dengan translasi -50%.
 * Menjamin putaran looping 100% mulus (seamless), bebas race-condition piksel,
 * dan berjalan stabil baik pada layar output 1080p maupun pratinjau monitor kecil.
 */
export function BroadcastTicker({ text, speed = 85 }: { text: string; speed?: number }) {
  const [displayText, setDisplayText] = useState(text);
  const changing = displayText !== text;
  const segmentRef = useRef<HTMLDivElement>(null);
  const [actualSegmentWidth, setActualSegmentWidth] = useState<number>(0);

  useEffect(() => {
    if (text === displayText) return;
    const timer = setTimeout(() => setDisplayText(text), 150);
    return () => clearTimeout(timer);
  }, [text, displayText]);

  const safeText = (displayText || "").trim() || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI";
  const charLength = safeText.length;

  // Pastikan segmen cukup panjang melebihi lebar layar kanvas (minimal 2000px)
  const repeatCount = Math.max(3, Math.ceil(140 / Math.max(1, charLength)));

  // Ukur lebar aktual segmen menggunakan ResizeObserver
  useEffect(() => {
    const el = segmentRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.getBoundingClientRect().width || el.scrollWidth;
      if (width > 0) {
        setActualSegmentWidth(width);
      }
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) setActualSegmentWidth(w);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [displayText, repeatCount]);

  // Hitung durasi agar kecepatan linear sesuai prop speed (default 85 px/detik)
  const currentSpeed = Math.max(30, Math.min(250, speed || 85));
  const effectiveWidth = actualSegmentWidth > 0 ? actualSegmentWidth : repeatCount * (charLength * 18 + 80);
  const durationSec = Math.max(6, Math.min(180, Math.round(effectiveWidth / currentSpeed)));

  return (
    <div className={`cg-ticker-content ${changing ? "ticker-changing" : ""}`}>
      <div
        className="cg-ticker-track"
        style={{
          "--ticker-duration": `${durationSec}s`
        } as CSSProperties}
      >
        {/* Segmen Utama */}
        <div ref={segmentRef} className="cg-ticker-segment">
          {Array.from({ length: repeatCount }, (_, index) => (
            <span key={index} className="cg-ticker-copy">
              <span className="cg-ticker-text">{safeText}</span>
              <span className="cg-ticker-bullet" aria-hidden="true">■</span>
            </span>
          ))}
        </div>

        {/* Segmen Duplikat (Menjamin loop -50% tanpa jeda/gap) */}
        <div className="cg-ticker-segment" aria-hidden="true">
          {Array.from({ length: repeatCount }, (_, index) => (
            <span key={`dup-${index}`} className="cg-ticker-copy">
              <span className="cg-ticker-text">{safeText}</span>
              <span className="cg-ticker-bullet" aria-hidden="true">■</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
