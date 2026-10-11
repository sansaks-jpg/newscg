import { useEffect, useRef, useState } from "react";
import { calculateTickerSpeed, emptyRundownTicker, getTickerResearchWindow, rundownBroadcastSchema } from "@newscg/shared";
import type { BroadcastSchedule, Rundown, RundownTicker } from "@newscg/shared";
import { mutate } from "./api";

export function RundownBroadcastEditor({ rundown, reload, toast }: {
  rundown: Rundown; reload: () => Promise<void>; toast: (message: string) => void;
}) {
  const [date, setDate] = useState(rundown.broadcastSchedule?.date ?? "");
  const [time, setTime] = useState(rundown.broadcastSchedule?.time ?? "");
  const [timezone, setTimezone] = useState<BroadcastSchedule["timezone"]>(rundown.broadcastSchedule?.timezone ?? "WIB");
  const [text, setText] = useState(rundown.ticker?.text ?? "");
  const [speedMode, setSpeedMode] = useState<NonNullable<RundownTicker["speedMode"]>>(rundown.ticker?.speedMode ?? "auto");
  const [manualSpeed, setManualSpeed] = useState(rundown.ticker?.speed ?? 85);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    if (dirty) return;
    setDate(rundown.broadcastSchedule?.date ?? "");
    setTime(rundown.broadcastSchedule?.time ?? "");
    setTimezone(rundown.broadcastSchedule?.timezone ?? "WIB");
    setText(rundown.ticker?.text ?? "");
    setSpeedMode(rundown.ticker?.speedMode ?? "auto");
    setManualSpeed(rundown.ticker?.speed ?? 85);
  }, [rundown, dirty]);
  const window = date ? getTickerResearchWindow(date) : null;
  const automaticSpeed = calculateTickerSpeed(text);
  async function save() {
    if (savingRef.current) return;
    const input = {
      broadcastSchedule: date || time ? { date, time, timezone } : null,
      ticker: { ...(rundown.ticker ?? emptyRundownTicker), text, speedMode, speed: speedMode === "auto" ? automaticSpeed : manualSpeed, forDate: text.trim() ? date || null : null,
        sources: (rundown.ticker?.sources ?? []).filter(source => text.includes(source.headline)) }
    };
    const parsed = rundownBroadcastSchema.safeParse(input);
    if (!parsed.success) { toast(parsed.error.issues.map(issue => issue.message).join("; ")); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await mutate(`/api/rundowns/${encodeURIComponent(rundown.id)}`, "PATCH", parsed.data);
      await reload();
      setDirty(false);
      toast("Jadwal dan ticker rundown tersimpan; Program tetap seperti sebelumnya");
    } catch (error) { toast((error as Error).message); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <details className="rundown-broadcast-settings">
    <summary>Jadwal tayang & ticker rundown · {rundown.broadcastSchedule ? `${rundown.broadcastSchedule.date} ${rundown.broadcastSchedule.time} ${rundown.broadcastSchedule.timezone}` : "Jadwal belum diisi"}</summary>
    <div className="form-grid">
      <label>Tanggal tayang<input type="date" value={date} disabled={saving} onChange={event => { setDate(event.target.value); setDirty(true); }} /></label>
      <label>Jam tayang<input type="time" value={time} disabled={saving} onChange={event => { setTime(event.target.value); setDirty(true); }} /></label>
      <label>Zona waktu<select value={timezone} disabled={saving} onChange={event => { setTimezone(event.target.value as BroadcastSchedule["timezone"]); setDirty(true); }}><option>WIB</option><option>WITA</option><option>WIT</option></select></label>
      <label className="wide">Ticker untuk rundown ini<textarea rows={3} maxLength={10000} value={text} disabled={saving} onChange={event => { setText(event.target.value); setDirty(true); }} placeholder="Headline singkat dipisahkan dengan •" /></label>
      <label>Kecepatan ticker<select value={speedMode} disabled={saving} onChange={event => { setSpeedMode(event.target.value as NonNullable<RundownTicker["speedMode"]>); setDirty(true); }}><option value="auto">Otomatis seimbang · {automaticSpeed} px/detik</option><option value="manual">Manual oleh operator</option></select></label>
      {speedMode === "manual" ? <label>Kecepatan manual (px/detik)<input type="number" min={30} max={250} step={1} value={manualSpeed} disabled={saving} onChange={event => { setManualSpeed(Number(event.target.value)); setDirty(true); }} /></label> : null}
    </div>
    <p>{window ? `Riset berita ${window.from} sampai ${window.to} (${timezone}, H−2/H−1).` : "Isi jadwal tayang sebelum membuat ticker."} Isi ticker boleh berbeda dari berita rundown. Tidak dipakai pada rundown lain.</p>
    <small>Kecepatan otomatis {automaticSpeed} px/detik dihitung dari headline yang paling padat angka, kata panjang, dan tanda baca. Teks panjang tidak otomatis dipercepat. Kecepatan tersimpan per rundown dan diterapkan bersama tickernya.</small>
    <small>{rundown.ticker?.sources.length ? `${rundown.ticker.sources.length} sumber tersimpan melalui API.` : "Belum ada bukti sumber tersimpan. Penyuntingan manual tidak melakukan riset internet otomatis."}</small>
    {rundown.ticker?.sources.length ? <ul>{rundown.ticker.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.headline}</a> · {source.sourceName} · {source.publishedAt}</li>)}</ul> : null}
    <button type="button" className="btn-prep-secondary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Menyimpan…" : "Simpan jadwal & ticker"}</button>
  </details>;
}
