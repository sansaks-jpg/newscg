import { useEffect, useState, type CSSProperties } from "react";

/**
 * Engine animasi running ticker siaran televisi.
 * Menggunakan arsitektur dua segmen identik (mirrored dual-segment) dengan translasi -50%.
 * Menjamin putaran looping 100% mulus (seamless), bebas race-condition piksel,
 * dan berjalan stabil baik pada layar output 1080p maupun pratinjau monitor kecil.
 */
export function BroadcastTicker({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState(text);
  const changing = displayText !== text;

  useEffect(() => {
    if (text === displayText) return;
    const timer = setTimeout(() => setDisplayText(text), 150);
    return () => clearTimeout(timer);
  }, [text, displayText]);

  const safeText = (displayText || "").trim() || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI";
  const charLength = safeText.length;

  // Pastikan segmen cukup panjang melebihi lebar layar kanvas (minimal 2000px)
  const repeatCount = Math.max(2, Math.ceil(120 / Math.max(1, charLength)));

  // Hitung durasi agar kecepatan linear stabil di kisaran 85 px/detik
  const estimatedSegmentWidth = repeatCount * (charLength * 18 + 80);
  const durationSec = Math.max(14, Math.min(60, Math.round(estimatedSegmentWidth / 85)));

  return (
    <div className={`cg-ticker-content ${changing ? "ticker-changing" : ""}`}>
      <div
        className="cg-ticker-track"
        style={{
          "--ticker-duration": `${durationSec}s`
        } as CSSProperties}
      >
        {/* Segmen Utama */}
        <div className="cg-ticker-segment">
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
