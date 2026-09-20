import { XMLParser } from "fast-xml-parser";
import type { OverlayState, VmixInput } from "@newscg/shared";

export interface VmixAdapter {
  checkConnection(): Promise<{ ok: boolean; authFailed?: boolean; message: string }>;
  listInputs(): Promise<VmixInput[]>;
  getOverlayState(overlayNumber: number): Promise<OverlayState>;
  setTitleFields(inputGuid: string, fields: Record<string, string>): Promise<void>;
  showOnOverlay(inputGuid: string, overlayNumber: number): Promise<void>;
  hideOwnedOverlay(inputGuid: string, overlayNumber: number): Promise<void>;
}

export class MockVmixAdapter implements VmixAdapter {
  connected = true;
  overlay: OverlayState = { overlayNumber: 1, inputGuid: null };
  fields = new Map<string, Record<string,string>>();
  inputs: VmixInput[] = [
    { guid:"mock-headline-guid", number:1, title:"NewsCG Headline", type:"GT", textFields:["Headline.Text","Kicker.Text"] },
    { guid:"mock-reporter-guid", number:2, title:"NewsCG Reporter", type:"GT", textFields:["Name.Text","Role.Text","Location.Text"] },
    { guid:"mock-location-guid", number:3, title:"NewsCG Location", type:"GT", textFields:["Location.Text"] },
    { guid:"mock-breaking-guid", number:4, title:"NewsCG Breaking", type:"GT", textFields:["Headline.Text","Kicker.Text"] }
  ];
  async checkConnection() { return { ok:this.connected, message:this.connected ? "Mock vMix siap" : "Mock vMix terputus" }; }
  async listInputs() { if (!this.connected) throw new Error("Mock vMix terputus"); return this.inputs; }
  async getOverlayState(overlayNumber: number) { if (!this.connected) throw new Error("Mock vMix terputus"); return { ...this.overlay, overlayNumber }; }
  async setTitleFields(inputGuid: string, fields: Record<string,string>) { if (!this.connected) throw new Error("Mock vMix terputus"); this.fields.set(inputGuid, {...fields}); }
  async showOnOverlay(inputGuid: string, overlayNumber: number) { if (!this.connected) throw new Error("Mock vMix terputus"); this.overlay = { overlayNumber, inputGuid }; }
  async hideOwnedOverlay(inputGuid: string, overlayNumber: number) { if (this.overlay.overlayNumber !== overlayNumber || this.overlay.inputGuid !== inputGuid) throw new Error("Overlay tidak dimiliki NewsCG"); this.overlay = { overlayNumber, inputGuid:null }; }
}

type HttpConfig = { host:string; port:number; username?:string; password?:string };
export class HttpVmixAdapter implements VmixAdapter {
  private parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"" });
  constructor(private config: HttpConfig) {}
  private base() { return `http://${this.config.host}:${this.config.port}/API/`; }
  private headers(): Record<string,string> { return this.config.username || this.config.password ? { Authorization:`Basic ${Buffer.from(`${this.config.username || ""}:${this.config.password || ""}`).toString("base64")}` } : {}; }
  private async request(params?: URLSearchParams) {
    const url = new URL(this.base()); if (params) url.search = params.toString();
    const response = await fetch(url, { headers:this.headers(), signal:AbortSignal.timeout(3000) });
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error("Autentikasi vMix ditolak"), { authFailed:true });
    if (!response.ok) throw new Error(`vMix merespons HTTP ${response.status}`);
    return response.text();
  }
  private async state() { return this.parser.parse(await this.request()).vmix; }
  async checkConnection() { try { await this.state(); return { ok:true, message:"Terhubung ke vMix" }; } catch (e:any) { return { ok:false, authFailed:Boolean(e.authFailed), message:e.message || "Tidak dapat menjangkau vMix" }; } }
  async listInputs(): Promise<VmixInput[]> {
    const state = await this.state(); const raw = state.inputs?.input; const list = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    return list.map((i:any) => ({ guid:String(i.key), number:Number(i.number), title:String(i.title || i["#text"] || "Input"), type:String(i.type || "Unknown"), textFields:((i.text ? (Array.isArray(i.text) ? i.text : [i.text]) : []) as any[]).map(t => `${t.name}.Text`) }));
  }
  async getOverlayState(overlayNumber:number): Promise<OverlayState> {
    const state = await this.state(); const overlays = state.overlays?.overlay; const list = overlays ? (Array.isArray(overlays) ? overlays : [overlays]) : [];
    const overlay = list.find((o:any) => Number(o.number) === overlayNumber); const inputRef = typeof overlay === "object" ? overlay["#text"] : overlay;
    if (!inputRef) return { overlayNumber, inputGuid:null };
    const inputs = await this.listInputs(); const match = inputs.find(i => String(i.number) === String(inputRef) || i.guid === String(inputRef));
    return { overlayNumber, inputGuid:match?.guid || String(inputRef) };
  }
  async setTitleFields(inputGuid:string, fields:Record<string,string>) {
    for (const [selectedName, value] of Object.entries(fields)) await this.request(new URLSearchParams({ Function:"SetText", Input:inputGuid, SelectedName:selectedName, Value:value }));
  }
  async showOnOverlay(inputGuid:string, overlayNumber:number) { await this.request(new URLSearchParams({ Function:`OverlayInput${overlayNumber}In`, Input:inputGuid })); }
  async hideOwnedOverlay(inputGuid:string, overlayNumber:number) { const state = await this.getOverlayState(overlayNumber); if (state.inputGuid !== inputGuid) throw new Error("CLEAR diblokir: overlay berisi input yang bukan milik NewsCG"); await this.request(new URLSearchParams({ Function:`OverlayInput${overlayNumber}Out`, Input:inputGuid })); }
}
