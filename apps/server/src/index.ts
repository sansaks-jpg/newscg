import "dotenv/config";
import express from "express";
import { storyInputSchema } from "@newscg/shared";
import { saveStory } from "./db.js";
import { setStage } from "./live.js";
import cors from "cors";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { graphicInputSchema, graphicPatchSchema, rundownInputSchema, rundownItemInputSchema } from "@newscg/shared";
import { createGraphic, createItem, createRundown, deleteGraphic, deleteItem, deleteRundown, getActions, getGraphic, getMasterOverlay, getRundown, getRundowns, getSettings, saveSettings, seedIfEmpty, updateGraphic, updateItem, updateRundown } from "./db.js";
import { addOverlaySubscriber, checkConnection, clearAllLive, clearLive, getLiveState, listInputs, prepare, setMockConnection, take, updateLive, updateMasterState } from "./live.js";

seedIfEmpty();
const app=express(); const port=Number(process.env.PORT||3001);
app.use(cors({origin:process.env.WEB_ORIGIN||"http://localhost:5173"})); app.use(express.json({limit:"2mb"}));
const asyncRoute=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res,next)).catch(next);
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"NewsCG",time:new Date().toISOString()}));
app.get("/api/rundowns",(_req,res)=>res.json(getRundowns()));
app.put("/api/rundowns/:id/story", (req,res) => {
  const parsed = storyInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Periksa judul, durasi, dan isi CG.", details:parsed.error.issues});
  try { return res.json(saveStory(req.params.id, req.body.itemId || null, parsed.data)); }
  catch(e:any) { return res.status(409).json({error:e.message}); }
});
app.get("/api/rundowns/:id",(req,res)=>{const r=getRundown(req.params.id);return r?res.json(r):res.status(404).json({error:"Rundown tidak ditemukan"});});
app.post("/api/rundowns",(req,res)=>{const parsed=rundownInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data rundown tidak valid",details:parsed.error.issues});return res.status(201).json(createRundown(parsed.data));});
app.patch("/api/rundowns/:id",(req,res)=>{const r=updateRundown(req.params.id,req.body);return r?res.json(r):res.status(404).json({error:"Rundown tidak ditemukan"});});
app.delete("/api/rundowns/:id",(req,res)=>res.status(deleteRundown(req.params.id)?204:404).end());
app.post("/api/rundowns/:id/items",(req,res)=>{const parsed=rundownItemInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data berita tidak valid",details:parsed.error.issues});return res.status(201).json(createItem(req.params.id,parsed.data));});
app.patch("/api/items/:id",(req,res)=>{const r=updateItem(req.params.id,req.body);return r?res.json(r):res.status(404).json({error:"Berita tidak ditemukan"});});
app.delete("/api/items/:id",(req,res)=>{const live=getLiveState();const rundown=getRundowns().find(r=>r.items.some(i=>i.id===req.params.id));const item=rundown?.items.find(i=>i.id===req.params.id);if(item?.graphics.some(g=>g.id===live.onAirGraphicId))return res.status(409).json({error:"Berita terkait ON AIR. CLEAR terlebih dahulu."});return res.status(deleteItem(req.params.id)?204:404).end();});
app.post("/api/items/:id/graphics",(req,res)=>{const parsed=graphicInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data grafis tidak valid",details:parsed.error.issues});return res.status(201).json(createGraphic(req.params.id,parsed.data));});
app.patch("/api/graphics/:id",(req,res)=>{const current=getGraphic(req.params.id);if(!current)return res.status(404).json({error:"Grafis tidak ditemukan"});const parsed=graphicPatchSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Data grafis tidak valid",details:parsed.error.issues});return res.json(updateGraphic(req.params.id,parsed.data));});
app.delete("/api/graphics/:id",(req,res)=>{if(getLiveState().onAirGraphicId===req.params.id)return res.status(409).json({error:"Grafis sedang ON AIR. CLEAR terlebih dahulu."});return res.status(deleteGraphic(req.params.id)?204:404).end();});
app.get("/api/rundowns/:id/export",(req,res)=>{const r=getRundown(req.params.id);if(!r)return res.status(404).json({error:"Rundown tidak ditemukan"});res.setHeader("Content-Disposition",`attachment; filename=\"${r.id}.json\"`);return res.json({schemaVersion:1,exportedAt:new Date().toISOString(),rundown:r});});
app.post("/api/rundowns/import",(req,res)=>{const payload=req.body.rundown||req.body;const parsed=rundownInputSchema.safeParse(payload);if(!parsed.success)return res.status(400).json({error:"Berkas impor tidak valid",details:parsed.error.issues});return res.status(201).json(createRundown(parsed.data));});
app.get("/api/settings",(_req,res)=>res.json(getSettings()));
app.patch("/api/settings",(req,res)=>res.json(saveSettings(req.body)));
app.get("/api/vmix/status",(_req,res)=>res.json(getLiveState()));
app.post("/api/vmix/test",asyncRoute(async(_req:any,res:any)=>res.json(await checkConnection())));
app.get("/api/vmix/inputs",asyncRoute(async(_req:any,res:any)=>res.json(await listInputs())));
app.post("/api/mock/connection",(req,res)=>res.json(setMockConnection(Boolean(req.body.connected))));
app.post("/api/live/prepare",(req,res)=>{try{return res.json(prepare(req.body.graphicId));}catch(e:any){return res.status(404).json({error:e.message});}});
app.post("/api/live/take",asyncRoute(async(req:any,res:any)=>res.json(await take(req.body?.graphicId,req.get("Idempotency-Key")||req.body?.idempotencyKey||crypto.randomUUID()))));
app.post("/api/live/update",asyncRoute(async(req:any,res:any)=>res.json(await updateLive(req.body?.graphicId,req.get("Idempotency-Key")||req.body?.idempotencyKey||crypto.randomUUID()))));
app.post("/api/live/clear",asyncRoute(async(req:any,res:any)=>res.json(await clearLive(req.get("Idempotency-Key")||req.body?.idempotencyKey||crypto.randomUUID()))));
app.post("/api/live/clear-all",asyncRoute(async(req:any,res:any)=>res.json(await clearAllLive(req.get("Idempotency-Key")||req.body?.idempotencyKey||crypto.randomUUID()))));
app.post("/api/live/stage",asyncRoute(async(req:any,res:any) => {
  if (!["empty","logo","full"].includes(req.body.mode)) return res.status(400).json({error:"Preset tidak valid"});
  return res.json(await setStage(req.body.mode,req.get("Idempotency-Key") || crypto.randomUUID()));
}));
app.get("/api/live/master",(_req,res)=>res.json(getMasterOverlay()));
app.patch("/api/live/master",(req,res)=>res.json(updateMasterState(req.body)));
app.get("/api/live/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.write(": connected\n\n");
  const unsubscribe = addOverlaySubscriber(event => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
app.get("/api/actions",(req,res)=>res.json(getActions(Math.min(Number(req.query.limit)||50,200))));
const webDist=fileURLToPath(new URL("../../web/dist",import.meta.url)); if(existsSync(webDist)){app.use(express.static(webDist));app.get("/{*path}",(_req,res)=>res.sendFile(resolve(webDist,"index.html")));}
app.use((err:any,_req:any,res:any,_next:any)=>{console.error(err);res.status(500).json({error:err.message||"Kesalahan server"});});
if(process.env.NODE_ENV!=="test")app.listen(port,"0.0.0.0",()=>console.log(`NewsCG server http://localhost:${port}`));
export default app;
