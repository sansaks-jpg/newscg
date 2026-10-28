import React from "react";
import "./magic-ui.css";

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "take" | "update" | "ai";
  shimmerColor?: string;
  className?: string;
  children: React.ReactNode;
}

export function ShimmerButton({
  variant = "default",
  shimmerColor,
  className = "",
  children,
  style,
  ...props
}: ShimmerButtonProps) {
  const variantClass = variant !== "default" ? `variant-${variant}` : "";
  const customStyle: React.CSSProperties = {
    ...style,
    ...(shimmerColor ? { "--shimmer-color": shimmerColor } : {})
  } as React.CSSProperties;

  return (
    <button
      className={`magic-shimmer-btn ${variantClass} ${className}`.trim()}
      style={customStyle}
      {...props}
    >
      <div className="shimmer-spark-container" aria-hidden="true">
        <div className="shimmer-spark">
          <div className="shimmer-spark-rotator" />
        </div>
      </div>
      <div className="shimmer-backdrop" aria-hidden="true" />
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}

export function BorderBeam({
  colorFrom = "#ef4444",
  colorTo = "#f97316",
  duration = 5,
  size = 90,
  theme = "ruby",
  className = ""
}: {
  colorFrom?: string;
  colorTo?: string;
  duration?: number;
  size?: number;
  theme?: "ruby" | "cyan";
  className?: string;
}) {
  const themeClass = theme === "cyan" ? "beam-cyan" : "beam-ruby";
  return (
    <div className={`border-beam-container ${className}`.trim()} aria-hidden="true">
      <div
        className={`border-beam-spark ${themeClass}`}
        style={
          {
            "--beam-from": colorFrom,
            "--beam-to": colorTo,
            "--beam-duration": `${duration}s`,
            width: `${size}px`
          } as React.CSSProperties
        }
      />
    </div>
  );
}

export function PulsingLed({
  color = "#ef4444",
  active = true,
  className = ""
}: {
  color?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`magic-pulse-indicator ${className}`.trim()}
      style={{ "--pulse-color": color } as React.CSSProperties}
      aria-hidden="true"
    >
      {active && <span className="ping-ring" />}
      <span className="solid-dot" />
    </span>
  );
}
