import "dotenv/config";
import express from "express";
import { actionLogLimitSchema, broadcastLogoMimeTypeSchema, broadcastLogoUploadSpec, liveStageInputSchema, storySaveInputSchema, masterOverlayPatchSchema, livePrepareInputSchema, liveTakeInputSchema, liveUpdateInputSchema, liveVariantInputSchema, liveClearInputSchema, liveClearAllInputSchema, rundownReorderInputSchema, rundownImportInputSchema } from "@newscg/shared";
import { saveStory } from "./db.js";
import { setStage } from "./live.js";
import cors from "cors";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { graphicInputSchema, graphicPatchSchema, headlineDefaultsPatchSchema, rundownInputSchema, rundownItemInputSchema, rundownPatchSchema, rundownItemPatchSchema, settingsPatchSchema, validateGraphicPatch } from "@newscg/shared";
import { createGraphic, createItem, createRundown, deleteGraphic, deleteItem, deleteRundown, getActions, getGraphic, getHeadlineDefaults, getItem, getMasterOverlay, getRundown, getRundowns, getSettings, reorderRundownItems, saveHeadlineDefaults, saveSettings, seedIfEmpty, updateGraphic, updateItem, updateRundown } from "./db.js";
import { addOverlaySubscriber, clearAllLive, clearLive, getLiveState, prepare, take, takeVariantLive, updateLive, updateMasterState } from "./live.js";
import { LogoUploadError, validateLogoImage } from "./logoUpload.js";
import { agentApiDiscovery, agentOpenApi } from "./agentApi.js";
import { liveTickerInputSchema, rundownBroadcastSchema } from "@newscg/shared";
import { applyRundownTicker } from "./live.js";
import { weatherLocationSchema } from "@newscg/shared";
import { getWeatherForecast } from "./weather.js";
import { liveNewsAnchorInputSchema, liveReporterInputSchema, newsAnchorDefaultsPatchSchema, reporterDefaultsPatchSchema } from "@newscg/shared";
import { getNewsAnchorDefaults, getReporterDefaults, saveNewsAnchorDefaults, saveReporterDefaults } from "./db.js";
import { takeFieldReporter, takeNewsAnchor } from "./live.js";

seedIfEmpty();
const app=express(); const port=Number(process.env.PORT||3001);
const serverDir = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(serverDir, process.env.UPLOADS_PATH || "../data/uploads");
mkdirSync(uploadsDir, { recursive: true });
const configuredOrigin = process.env.WEB_ORIGIN;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (configuredOrigin) {
      if (configuredOrigin === "*") return callback(null, true);
      const allowed = configuredOrigin.split(",").map(o => o.trim());
      if (allowed.includes(origin)) return callback(null, true);
    }
    const isLocalOrLan = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
    if (isLocalOrLan) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));

app.use("/uploads", express.static(uploadsDir));
app.use(express.json({limit:"2mb"}));

app.get("/api/agent", (_req, res) => res.json(agentApiDiscovery));
app.get("/api/weather", async (req, res) => {
  const parsed = weatherLocationSchema.shape.adm4.safeParse(req.query.adm4);
  if (!parsed.success) return res.status(400).json({ error: "Pilih kode wilayah cuaca BMKG yang valid, misalnya 31.71.03.1001." });
  try { return res.json(await getWeatherForecast(parsed.data)); }
  catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Prakiraan BMKG belum tersedia" }); }
});
app.get("/api/agent/openapi.json", (_req, res) => res.json(agentOpenApi));
app.get("/api/agent/guide.md", (_req, res) => {
  res.type("text/markdown; charset=utf-8").sendFile(fileURLToPath(new URL("../../../docs/AI_AGENT_API.md", import.meta.url)));
});
app.get("/api/agent/rundown-guide.md", (_req, res) => {
  res.type("text/markdown; charset=utf-8").sendFile(fileURLToPath(new URL("../../../docs/AI_RUNDOWN_GUIDE.md", import.meta.url)));
});
app.get("/api/agent/cg-guide.md", (_req, res) => {
  res.type("text/markdown; charset=utf-8").sendFile(fileURLToPath(new URL("../../../docs/CG_GUIDE.md", import.meta.url)));
});

app.post("/api/uploads/logo", (req, res, next) => {
  const contentType = req.get("Content-Type")?.toLowerCase().split(";")[0]?.trim();
  const parsed = broadcastLogoMimeTypeSchema.safeParse(contentType);
  if (!parsed.success) return res.status(415).json({ error: "Format logo tidak didukung. Pilih PNG, JPEG, WebP, atau SVG." });
  res.locals.logoMimeType = parsed.data;
  next();
}, express.raw({ type: () => true, limit: broadcastLogoUploadSpec.maxBytes }), async (req, res) => {
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "File gambar logo tidak valid atau kosong" });
  }
  const image = await validateLogoImage(req.body, res.locals.logoMimeType);
  const filename = `logo-${randomUUID()}.${image.extension}`;
  const filePath = resolve(uploadsDir, filename);
  await writeFile(filePath, req.body, { flag: "wx" });
  return res.json({ url: `/uploads/${filename}`, width: image.width, height: image.height });
});
const asyncRoute=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res,next)).catch(next);
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"NewsCG",time:new Date().toISOString()}));
app.get("/api/rundowns",(_req,res)=>res.json(getRundowns()));
app.put("/api/rundowns/:id/story", (req,res,next) => {
  const parsed = storySaveInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Periksa judul, durasi, dan isi CG.", details:parsed.error.issues});
  const rundown = getRundown(req.params.id);
  if (!rundown) return res.status(404).json({error:"Rundown tidak ditemukan"});
  if (parsed.data.itemId && !rundown.items.some(item => item.id === parsed.data.itemId)) {
    return res.status(404).json({error:"Berita tidak ditemukan"});
  }
  try { return res.json(saveStory(req.params.id, parsed.data.itemId ?? null, parsed.data)); }
  catch(error) {
    if (error instanceof Error && ["ID grafis tidak valid", "CG sedang tayang", "Tipe CG yang sedang ON AIR"].some(message => error.message.startsWith(message))) {
      return res.status(409).json({error:error.message});
    }
    return next(error);
  }
});
app.get("/api/rundowns/:id",(req,res)=>{const r=getRundown(req.params.id);return r?res.json(r):res.status(404).json({error:"Rundown tidak ditemukan"});});
app.post("/api/rundowns",(req,res)=>{const parsed=rundownInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data rundown tidak valid",details:parsed.error.issues});return res.status(201).json(createRundown(parsed.data,{regenerateIds:true}));});
app.patch("/api/rundowns/:id",(req,res)=>{
  const parsed=rundownPatchSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Data pembaruan rundown tidak valid",details:parsed.error.issues});
  const current=getRundown(req.params.id);
  if(!current)return res.status(404).json({error:"Rundown tidak ditemukan"});
  const broadcast=rundownBroadcastSchema.safeParse({...current,...parsed.data});
  if(!broadcast.success)return res.status(400).json({error:"Jadwal atau sumber ticker tidak sesuai rundown",details:broadcast.error.issues});
  return res.json(updateRundown(req.params.id,parsed.data));
});
app.post("/api/rundowns/:id/reorder", (req, res) => {
  const parsed = rundownReorderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "itemIds harus memuat ID berita unik dalam urutan yang diinginkan", details: parsed.error.issues });
  const rundown = getRundown(req.params.id);
  if (!rundown) return res.status(404).json({ error: "Rundown tidak ditemukan" });
  const ids = new Set(rundown.items.map(item => item.id));
  if (parsed.data.itemIds.length !== ids.size || parsed.data.itemIds.some(id => !ids.has(id))) {
    return res.status(400).json({ error: "Sertakan seluruh ID berita dari rundown ini tepat satu kali." });
  }
  return res.json(reorderRundownItems(req.params.id, parsed.data.itemIds));
});
app.delete("/api/rundowns/:id", (req, res) => {
  const tickerMaster = getMasterOverlay();
  if (tickerMaster.tickerRundownId === req.params.id && tickerMaster.tickerText.trim()) return res.status(409).json({error:"Rundown masih menjadi sumber ticker ON AIR/Program. Terapkan ticker rundown lain atau CLEAR ALL dengan instruksi operator sebelum menghapus."});
  const live = getLiveState();
  const r = getRundown(req.params.id);
  if (!r) return res.status(404).json({ error: "Rundown tidak ditemukan" });
  if (r.items.some(i => i.graphics.some(g => g.id === live.onAirGraphicId))) {
    return res.status(409).json({ error: "Grafis dalam rundown ini sedang ON AIR. CLEAR siaran terlebih dahulu." });
  }
  return res.status(deleteRundown(req.params.id) ? 204 : 404).end();
});
app.post("/api/rundowns/:id/items",(req,res)=>{const r=getRundown(req.params.id);if(!r)return res.status(404).json({error:"Rundown tidak ditemukan"});const parsed=rundownItemInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data berita tidak valid",details:parsed.error.issues});return res.status(201).json(createItem(req.params.id,parsed.data));});
app.get("/api/items/:id", (req, res) => {
  const item = getItem(req.params.id);
  return item ? res.json(item) : res.status(404).json({ error: "Berita tidak ditemukan" });
});
app.patch("/api/items/:id",(req,res)=>{const parsed=rundownItemPatchSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data pembaruan berita tidak valid",details:parsed.error.issues});const r=updateItem(req.params.id,parsed.data);return r?res.json(r):res.status(404).json({error:"Berita tidak ditemukan"});});
app.delete("/api/items/:id",(req,res)=>{const item=getItem(req.params.id);if(!item)return res.status(404).json({error:"Berita tidak ditemukan"});if(item.graphics.some(g=>g.id===getLiveState().onAirGraphicId))return res.status(409).json({error:"Berita terkait ON AIR. CLEAR terlebih dahulu."});deleteItem(req.params.id);return res.status(204).end();});
app.post("/api/items/:id/graphics",(req,res)=>{const item=getItem(req.params.id);if(!item)return res.status(404).json({error:"Berita tidak ditemukan"});const parsed=graphicInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data grafis tidak valid",details:parsed.error.issues});return res.status(201).json(createGraphic(req.params.id,parsed.data));});
app.get("/api/graphics/:id", (req, res) => {
  const graphic = getGraphic(req.params.id);
  return graphic ? res.json(graphic) : res.status(404).json({ error: "Grafis tidak ditemukan" });
});
app.patch("/api/graphics/:id", (req, res) => {
  const current = getGraphic(req.params.id);
  if (!current) return res.status(404).json({ error: "Grafis tidak ditemukan" });
  const parsed = graphicPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data grafis tidak valid", details: parsed.error.issues });
  if (Object.keys(parsed.data).length === 1 && parsed.data.draftFields && Object.keys(parsed.data.draftFields).length === 0) {
    return res.status(400).json({ error: "Isi minimal satu field grafis yang dapat diperbarui." });
  }
  if (getLiveState().onAirGraphicId === current.id && parsed.data.templateType && parsed.data.templateType !== current.templateType) {
    return res.status(409).json({ error: "Tipe CG yang sedang ON AIR tidak dapat diganti. Buat cue baru atau CLEAR dengan instruksi operator terlebih dahulu." });
  }
  const validated = validateGraphicPatch(current, parsed.data);
  if (!validated.success) return res.status(400).json({ error: "Validasi field grafis gagal", details: validated.error.issues });
  return res.json(updateGraphic(req.params.id, { ...parsed.data, draftFields: validated.data }));
});
app.delete("/api/graphics/:id",(req,res)=>{if(!getGraphic(req.params.id))return res.status(404).json({error:"Grafis tidak ditemukan"});if(getLiveState().onAirGraphicId===req.params.id)return res.status(409).json({error:"Grafis sedang ON AIR. CLEAR terlebih dahulu."});deleteGraphic(req.params.id);return res.status(204).end();});
app.get("/api/rundowns/:id/export",(req,res)=>{const r=getRundown(req.params.id);if(!r)return res.status(404).json({error:"Rundown tidak ditemukan"});res.setHeader("Content-Disposition",`attachment; filename=\"${r.id}.json\"`);return res.json({schemaVersion:1,exportedAt:new Date().toISOString(),rundown:r});});
app.post("/api/rundowns/import",(req,res)=>{const parsed=rundownImportInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Berkas impor tidak valid",details:parsed.error.issues});const rundown="rundown" in parsed.data?parsed.data.rundown:parsed.data;return res.status(201).json(createRundown(rundown,{regenerateIds:true}));});
app.get("/api/settings",(_req,res)=>res.json(getSettings()));
app.patch("/api/settings",(req,res)=>{const parsed=settingsPatchSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data pengaturan tidak valid",details:parsed.error.issues});return res.json(saveSettings(parsed.data));});
app.get("/api/settings/headline-defaults",(_req,res)=>res.json(getHeadlineDefaults()));
app.get("/api/settings/news-anchor-defaults", (_req, res) => res.json(getNewsAnchorDefaults()));
app.patch("/api/settings/news-anchor-defaults", (req, res) => {
  const parsed = newsAnchorDefaultsPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Default news anchor tidak valid.", details: parsed.error.issues });
  return res.json(saveNewsAnchorDefaults(parsed.data));
});
app.get("/api/settings/reporter-defaults", (_req, res) => res.json(getReporterDefaults()));
app.patch("/api/settings/reporter-defaults", (req, res) => {
  const parsed = reporterDefaultsPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Default reporter lapangan tidak valid.", details: parsed.error.issues });
  return res.json(saveReporterDefaults(parsed.data));
});
app.patch("/api/settings/headline-defaults",(req,res)=>{const parsed=headlineDefaultsPatchSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data default headline tidak valid. Sertakan minimal satu field.",details:parsed.error.issues});return res.json(saveHeadlineDefaults(parsed.data));});
app.get("/api/live/state",(_req,res)=>res.json(getLiveState()));
// Apply the same key constraints to headers as to the shared live request bodies.
app.use(["/api/live/news-anchor", "/api/live/reporter", "/api/live/take", "/api/live/update", "/api/live/variant", "/api/live/clear", "/api/live/clear-all", "/api/live/stage", "/api/live/ticker"], (req, res, next) => {
  if (req.method !== "POST") return next();
  const header = req.get("Idempotency-Key");
  if (header === undefined) return next();
  const parsed = liveClearInputSchema.shape.idempotencyKey.safeParse(header);
  if (!parsed.success) return res.status(400).json({error:"Idempotency-Key harus berupa teks sepanjang 1–200 karakter."});
  res.locals.idempotencyKey = parsed.data;
  return next();
});
app.post("/api/live/prepare", (req, res, next) => {
  const parsed = livePrepareInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "graphicId wajib diisi dengan ID CG", details: parsed.error.issues });
  try { return res.json(prepare(parsed.data.graphicId)); }
  catch (error) {
    if (error instanceof Error && error.message === "Grafis tidak ditemukan") return res.status(404).json({ error: error.message });
    return next(error);
  }
});
app.post("/api/live/take", asyncRoute(async (req:any, res:any) => {
  const parsed = liveTakeInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data TAKE tidak valid", details: parsed.error.issues });
  return res.json(await take(parsed.data.graphicId, res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID(), { presentation: parsed.data.presentation }));
}));
app.post("/api/live/news-anchor", asyncRoute(async (req: express.Request, res: express.Response) => {
  const parsed = liveNewsAnchorInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Perintah news anchor tidak valid.", details: parsed.error.issues });
  return res.json(await takeNewsAnchor(parsed.data, res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID()));
}));
app.post("/api/live/reporter", asyncRoute(async (req: express.Request, res: express.Response) => {
  const parsed = liveReporterInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Perintah reporter lapangan tidak valid.", details: parsed.error.issues });
  return res.json(await takeFieldReporter(parsed.data, res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID()));
}));
app.post("/api/live/variant", asyncRoute(async (req:any, res:any) => {
  const parsed = liveVariantInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "graphicId dan action varian wajib diisi dengan benar", details: parsed.error.issues });
  return res.json(await takeVariantLive(parsed.data.graphicId, parsed.data.action, res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID()));
}));
app.post("/api/live/update", asyncRoute(async (req:any, res:any) => {
  const parsed = liveUpdateInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data UPDATE tidak valid", details: parsed.error.issues });
  return res.json(await updateLive(parsed.data.graphicId, res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID(), { syncComposition: parsed.data.syncComposition }));
}));
app.post("/api/live/clear", asyncRoute(async (req:any, res:any) => {
  const parsed = liveClearInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Data CLEAR tidak valid", details: parsed.error.issues });
  return res.json(await clearLive(res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID()));
}));
app.post("/api/live/clear-all", asyncRoute(async (req:any, res:any) => {
  const parsed = liveClearAllInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Data CLEAR ALL tidak valid. immediate harus boolean true/false.", details: parsed.error.issues });
  return res.json(await clearAllLive(res.locals.idempotencyKey || parsed.data.idempotencyKey || randomUUID(), { immediate: parsed.data.immediate }));
}));
app.post("/api/live/stage",asyncRoute(async(req:any,res:any) => {
  const parsed = liveStageInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Preset tidak valid. Isi mode dengan empty, logo, atau full.",details:parsed.error.issues});
  return res.json(await setStage(parsed.data.mode,res.locals.idempotencyKey || randomUUID()));
}));
app.get("/api/live/master",(_req,res)=>res.json(getMasterOverlay()));
app.post("/api/live/ticker", asyncRoute(async (req:any,res:any) => {
  const parsed=liveTickerInputSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Pilih rundown untuk menerapkan ticker",details:parsed.error.issues});
  return res.json(await applyRundownTicker(parsed.data.rundownId, res.locals.idempotencyKey || randomUUID(), parsed.data.immediate));
}));
app.patch("/api/live/master", asyncRoute(async (req:any, res:any) => {
  const parsed = masterOverlayPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pengaturan master tidak valid. Teks dan kecepatan ticker diatur melalui rundown.", details: parsed.error.issues });
  return res.json(await updateMasterState(parsed.data));
}));
app.get("/api/live/stream", (req, res) => {
  if (req.query.role !== undefined && req.query.role !== "monitor" && req.query.role !== "output") {
    return res.status(400).json({error:"Parameter role harus monitor atau output."});
  }
  const role = req.query.role === "monitor" ? "monitor" : "output";
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.write(": connected\n\n");
  const unsubscribe = addOverlaySubscriber(event => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }, role);
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
app.get("/api/actions",(req,res)=>{
  const parsed = actionLogLimitSchema.safeParse(req.query.limit);
  if (!parsed.success) return res.status(400).json({error:"Batas riwayat aksi harus berupa bilangan bulat antara 1 dan 200."});
  return res.json(getActions(parsed.data));
});
app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint API tidak ditemukan" }));
const webDist=fileURLToPath(new URL("../../web/dist",import.meta.url)); if(existsSync(webDist)){app.use(express.static(webDist));app.get("/{*path}",(_req,res)=>res.sendFile(resolve(webDist,"index.html")));}
app.use((err:any,req:any,res:any,next:any)=>{
  if (res.headersSent) return next(err);
  if (err?.code === "IDEMPOTENCY_KEY_CONFLICT" && err?.status === 409) return res.status(409).json({error:err.message});
  if (err instanceof LogoUploadError) return res.status(err.status).json({error:err.message});
  if (req.path === "/api/live/ticker" && [404,409].includes(err.status)) return res.status(err.status).json({error:err.message});
  if (err.type === "entity.too.large") return res.status(413).json({error:req.path === "/api/uploads/logo" ? "Ukuran logo melebihi batas 2 MB." : "Ukuran data melebihi batas 2 MB. Kurangi isi permintaan."});
  if (err.type === "entity.parse.failed") return res.status(400).json({error:"Format JSON tidak valid. Periksa data yang dikirim."});
  if (err.type === "charset.unsupported" || err.type === "encoding.unsupported") return res.status(415).json({error:"Encoding data tidak didukung. Gunakan UTF-8 tanpa kompresi yang tidak didukung."});
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({error:"Permintaan tidak valid atau tidak dapat dibaca. Periksa alamat dan data yang dikirim."});
  console.error("Kesalahan server NewsCG", err);
  return res.status(500).json({error:"Terjadi kesalahan server. Periksa log NewsCG atau coba kembali."});
});
if(process.env.NODE_ENV!=="test")app.listen(port,"0.0.0.0",()=>console.log(`NewsCG server http://localhost:${port}`));
export default app;
