import { useRef, useState } from "react";
import { broadcastLogoUploadSpec, defaultWeatherLocations, getLiputan7WeatherLocations, weatherLocationSchema } from "@newscg/shared";
import type { MasterOverlayState } from "@newscg/shared";
import { useWeatherForecast } from "./useWeatherForecast";

export function Liputan7Settings({ master, onChange, disabled = false, onBusyChange }: {
  master: MasterOverlayState; onChange: (next: MasterOverlayState) => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const latestMaster = useRef(master);
  latestMaster.current = master;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const locations = getLiputan7WeatherLocations(master.weatherLocations);
  const valid = locations.every(location => weatherLocationSchema.safeParse(location).success) && new Set(locations.map(location => location.adm4)).size === locations.length;
  const isLiputan7 = master.broadcastTemplate === "liputan7";
  const weather = useWeatherForecast(isLiputan7 && Boolean(master.showWeather) && valid, locations);
  if (!isLiputan7) return null;
  const patch = (value: Partial<MasterOverlayState>) => onChange({ ...master, ...value });
  const busy = disabled || uploading;

  return <fieldset className="l7-settings" disabled={busy}>
    <legend>{isLiputan7 ? "Identitas Liputan7 & Cuaca Global" : "Pengaturan Cuaca Siaran Global"}</legend>
    {isLiputan7 && (
      <>
        <div className="l7-settings-logos">
          <img src={master.programLogoImage || "/branding/liputan7.svg"} alt="Logo Liputan7" />
        </div>
        <div className="l7-settings-toggles">
          <label><input type="checkbox" checked={Boolean(master.showProgramLogo)} onChange={event => patch({ showProgramLogo: event.target.checked })} />Logo program di kiri</label>
          <label><input type="checkbox" checked={Boolean(master.showWeather)} onChange={event => patch({ showWeather: event.target.checked })} />Cuaca di bawah logo program</label>
        </div>
        <label className="l7-upload-label">Ganti logo program<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > broadcastLogoUploadSpec.maxBytes) { setUploadError("Ukuran logo maksimal 2 MB."); return; }
          setUploading(true); onBusyChange?.(true); setUploadError("");
          try {
            const response = await fetch("/api/uploads/logo", { method: "POST", headers: { "Content-Type": file.type || "image/png" }, body: file });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || "Logo program gagal diunggah");
            onChange({ ...latestMaster.current, programLogoImage: body.url });
          } catch (error) { setUploadError(error instanceof Error ? error.message : "Logo program gagal diunggah"); }
          finally { setUploading(false); onBusyChange?.(false); }
        }} /></label>
        {master.programLogoImage && <button type="button" onClick={() => patch({ programLogoImage: null })}>Pakai logo Liputan7 bawaan</button>}
        {uploadError && <p role="alert">{uploadError}</p>}
      </>
    )}
    {master.showWeather && <>
      <p>Cuaca global aktif pada Logo Box siaran. Kota-kota akan tampil bergantian dengan durasi 3 detik tiap kota, lalu jeda logo 10 detik.</p>
      <details><summary>Info data prakiraan</summary><p>Sumber: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Waktu berikut memakai zona waktu wilayah asli. Rentang suhu dihitung dari data prakiraan harian. Informasi sumber tidak ditampilkan di grafis siaran.</p></details>
      <button type="button" onClick={() => patch({ weatherLocations: defaultWeatherLocations.map(location => ({ ...location })) })}>Pakai 7 kota besar Indonesia</button>
      {locations.map((location, index) => <div className="l7-weather-location" key={index}>
        <label>Nama di layar {index + 1}<input maxLength={24} value={location.label} onChange={event => patch({ weatherLocations: locations.map((item, row) => row === index ? { ...item, label: event.target.value } : item) })} /></label>
        <label>Kode wilayah / ID {index + 1}<input maxLength={13} placeholder="31.71.03.1001" value={location.adm4} onChange={event => patch({ weatherLocations: locations.map((item, row) => row === index ? { ...item, adm4: event.target.value } : item) })} /></label>
        <button type="button" aria-label={`Hapus wilayah ${index + 1}`} disabled={locations.length === 1} onClick={() => patch({ weatherLocations: locations.filter((_, row) => row !== index) })}>Hapus</button>
      </div>)}
      <button type="button" disabled={locations.length >= 8} onClick={() => patch({ weatherLocations: [...locations, { adm4: "", label: "" }] })}>Tambah wilayah cuaca</button>
      {!valid ? <p role="alert">Isi nama dan kode setiap wilayah; jangan gunakan kode yang sama dua kali.</p> : weather.error ? <p role="alert">{weather.error}. Wilayah yang gagal tidak ditayangkan.</p> : <small role="status">{weather.forecasts.length ? weather.forecasts.map(forecast => `${forecast.city} / ${forecast.village}: ${forecast.description}, ${forecast.minimum}–${forecast.maximum}°C · Berlaku ${new Intl.DateTimeFormat("id-ID", { timeZone: forecast.timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(forecast.validAt))} (${forecast.timezone})`).join(" | ") : "Memuat prakiraan…"}</small>}
    </>}
  </fieldset>;
}
