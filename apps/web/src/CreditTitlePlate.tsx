import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { calculateCreditDurations, formatEydDetail, parseCreditEntries, type CreditEntry } from "@newscg/shared";
import { AutoSquishText } from "./AutoSquishText";

export interface CreditTitlePlateProps {
  fields: Record<string, string>;
  isExiting?: boolean;
  isMini?: boolean;
  onAutoClear?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function CreditTitlePlate({
  fields,
  isExiting = false,
  isMini = false,
  onAutoClear,
  className = "",
  style
}: CreditTitlePlateProps) {
  const rawList = fields.creditList || "";
  const rawClosing = fields.closingText;
  const currentYear = new Date().getFullYear();
  // Default closing text jika field closingText tidak diisi secara eksplisit tetapi ada list
  const defaultClosing = `PRODUKSI ${currentYear}`;
  const closingText = rawClosing !== undefined && rawClosing.trim().length > 0
    ? rawClosing.trim()
    : defaultClosing;
  const hasClosing = closingText.length > 0;

  const entries: CreditEntry[] = useMemo(() => {
    const parsed = parseCreditEntries(rawList);
    if (parsed.length > 0) return parsed;
    // Fallback entri jika belum diisi list teks
    const fallbackRole = fields.subline?.trim() || fields.role?.trim() || "Produser";
    const fallbackName = fields.headline?.trim() || fields.name?.trim() || "SANDI ARDIANSYAH";
    return [{ role: formatEydDetail(fallbackRole), name: fallbackName.toUpperCase() }];
  }, [rawList, fields.subline, fields.role, fields.headline, fields.name]);

  const totalSteps = entries.length + (hasClosing ? 1 : 0);

  const durations = useMemo(() => {
    return calculateCreditDurations({
      entryCount: entries.length,
      hasClosing,
      totalDurationSec: fields.totalDuration,
      customItemDurationSec: fields.itemDuration,
      customClosingDurationSec: fields.closingDuration
    });
  }, [entries.length, hasClosing, fields.totalDuration, fields.itemDuration, fields.closingDuration]);

  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const onAutoClearRef = useRef(onAutoClear);
  useEffect(() => {
    onAutoClearRef.current = onAutoClear;
  }, [onAutoClear]);

  // Siklus penayangan otomatis dan transisi fade antar nama
  useEffect(() => {
    if (isExiting) return;

    const isLastStep = step >= totalSteps - 1;
    const currentDurationMs = (isLastStep && hasClosing)
      ? durations.closingDurationMs
      : durations.itemDurationMs;

    const fadeDurationMs = 400;
    const holdDurationMs = Math.max(1000, currentDurationMs - fadeDurationMs);

    // Timer tahan tayang sebelum fade out
    const holdTimer = setTimeout(() => {
      if (isLastStep) {
        // Step terakhir selesai -> otomatis pemicu keluar (auto-CLEAR)
        onAutoClearRef.current?.();
      } else {
        // Mulai transisi fade out
        setFading(true);
        // Setelah fade out selesai, ganti step dan fade in kembali
        setTimeout(() => {
          setStep((prev) => (prev + 1 < totalSteps ? prev + 1 : prev));
          setFading(false);
        }, fadeDurationMs);
      }
    }, holdDurationMs);

    return () => {
      clearTimeout(holdTimer);
    };
  }, [step, totalSteps, isExiting, hasClosing, durations.itemDurationMs, durations.closingDurationMs]);

  const isClosingStep = hasClosing && step === entries.length;
  const currentItem = useMemo(() => {
    if (isClosingStep) {
      if (closingText.includes(":") || closingText.includes("|")) {
        const parts = closingText.split(/[:|]/);
        return {
          role: formatEydDetail(parts[0]?.trim() || ""),
          name: parts.slice(1).join(" ").trim().toUpperCase()
        };
      }
      return { role: "", name: closingText.toUpperCase() };
    }
    return entries[step] || entries[0] || { role: "Produser", name: "SANDI ARDIANSYAH" };
  }, [isClosingStep, closingText, entries, step]);

  const fadeStyle: CSSProperties = {
    opacity: fading ? 0 : 1,
    transform: fading ? "translateY(8px)" : "translateY(0)",
    transition: "opacity 400ms cubic-bezier(.16,1,.3,1), transform 400ms cubic-bezier(.16,1,.3,1)"
  };

  return (
    <div className={`cg-credit-box ${className} ${isMini ? "mini" : ""}`} style={style}>
      <div className="cg-credit-content" style={fadeStyle}>
        {currentItem.role ? (
          <div className="cg-credit-role-row">
            <AutoSquishText
              text={currentItem.role}
              minScale={0.5}
              className="cg-credit-role-squish"
            />
          </div>
        ) : null}
        <div className={`cg-credit-name-row ${!currentItem.role ? "single-centered" : ""}`}>
          <AutoSquishText
            text={currentItem.name}
            minScale={0.3}
            className="cg-credit-name-squish"
          />
        </div>
      </div>
    </div>
  );
}
