import { useId } from "react";
import { broadcastColorThemeIds, broadcastColorThemes, getBroadcastColorTheme } from "@newscg/shared";
import type { BroadcastColorThemeId } from "@newscg/shared";

export function BroadcastColorThemePicker({ value, onChange, disabled = false, compact = false }: {
  value?: BroadcastColorThemeId;
  onChange: (value: BroadcastColorThemeId) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const groupId = useId();
  const selected = getBroadcastColorTheme(value);
  if (compact) return (
    <label className="broadcast-color-select">
      <span>Warna template</span>
      <select value={selected.id} disabled={disabled} onChange={(event) => onChange(getBroadcastColorTheme(event.target.value).id)}>
        {broadcastColorThemeIds.map((id) => <option key={id} value={id}>{broadcastColorThemes[id].label}{id === "studio-navy" ? " · Rekomendasi" : ""}</option>)}
      </select>
    </label>
  );
  return (
    <fieldset className="broadcast-color-picker" disabled={disabled}>
      <legend>Warna template siaran</legend>
      <div className="broadcast-color-options">
        {broadcastColorThemeIds.map((id) => {
          const theme = broadcastColorThemes[id];
          return (
            <label key={id} className={`broadcast-color-option ${selected.id === id ? "selected" : ""}`}>
              <input type="radio" name={groupId} value={id} checked={selected.id === id} onChange={() => onChange(id)} />
              <span className="broadcast-color-sample" aria-hidden="true">
                <span style={{ background: theme.colors.panel, color: theme.colors.text }}>BERITA UTAMA</span>
                <b style={{ background: theme.colors.panel, color: theme.colors.brand }}>{id === "cnn" ? "CNN" : "NEWS"}</b>
                <i style={{ background: theme.colors.brand }} />
                <i style={{ background: theme.colors.ticker }} />
                <i style={{ background: theme.colors.accent }} />
              </span>
              <span className="broadcast-color-title">{theme.label}{id === "studio-navy" && <em>Rekomendasi</em>}</span>
              <small>{theme.description}</small>
            </label>
          );
        })}
      </div>
      <small className="broadcast-color-help">Susunan, ukuran, dan animasi sama seperti CNN. Yang berubah adalah warna.</small>
    </fieldset>
  );
}

export function BroadcastTemplateInfo({ colorTheme }: { colorTheme?: BroadcastColorThemeId }) {
  const theme = getBroadcastColorTheme(colorTheme);
  return (
    <div className="broadcast-template-info">
      <span><b>{theme.label}</b> · 16:9 · Animasi CNN</span>
      <a href={`/templates/studio?warna=${theme.id}`} target="_blank" rel="noreferrer">Contoh warna & animasi ↗</a>
    </div>
  );
}
