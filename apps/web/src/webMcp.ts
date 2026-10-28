/**
 * WebMCP (Web Model Context Protocol) Integration for NewsCG
 * Implements the W3C / Google Chrome emerging standard (document.modelContext / navigator.modelContext)
 * Allows in-browser AI agents (Gemini in Chrome, Chrome Built-in AI, Project Astra, Agent Extensions)
 * to natively inspect and execute broadcast graphics tools without pixel actuation or DOM scraping.
 */

import { mutate, api } from "./api";
import type { LiveState, MasterOverlayState, Rundown } from "@newscg/shared";

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: any) => Promise<any> | any;
}

export interface WebMcpContext {
  registerTool: (tool: WebMcpTool) => Promise<void> | void;
  getTools?: () => WebMcpTool[];
  executeTool?: (name: string, input: any) => Promise<any>;
}

declare global {
  interface Navigator {
    modelContext?: WebMcpContext;
  }
  interface Document {
    modelContext?: WebMcpContext;
  }
  interface Window {
    modelContext?: WebMcpContext;
    __newscgWebMcpRegistered?: boolean;
  }
}

export function isWebMcpNativeSupported(): boolean {
  if (typeof document !== "undefined" && "modelContext" in document) return true;
  if (typeof navigator !== "undefined" && "modelContext" in navigator) return true;
  return false;
}

export function initWebMcp(options: {
  getMaster: () => MasterOverlayState;
  getLiveState: () => LiveState;
  getRundowns: () => Rundown[];
  onUpdateMaster: (patch: Partial<MasterOverlayState>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const registeredTools: Map<string, WebMcpTool> = new Map();

  const tools: WebMcpTool[] = [
    {
      name: "take_graphic",
      description: "Tayangkan grafis lower-third yang sedang standby ke siaran langsung (ON AIR / Program) dengan animasi masuk halus.",
      inputSchema: {
        type: "object",
        properties: {
          graphicId: {
            type: "string",
            description: "ID cue grafis yang ingin ditayangkan (opsional; jika kosong menayangkan cue yang sedang standby)"
          }
        }
      },
      execute: async (args: { graphicId?: string }) => {
        const body: Record<string, unknown> = {};
        if (args?.graphicId) body.graphicId = args.graphicId;
        const res = await mutate("/api/live/take", "POST", body);
        await options.onReload();
        return { status: "success", message: "Grafis berhasil ditayangkan ke Program ON AIR", result: res };
      }
    },
    {
      name: "update_live_graphic",
      description: "Perbarui teks atau data pada grafis yang sedang tayang ON AIR secara instan tanpa mengulang animasi masuk.",
      inputSchema: {
        type: "object",
        properties: {
          headline: { type: "string", description: "Teks judul utama baru" },
          subline: { type: "string", description: "Teks subline / narasumber / detail baru" },
          location: { type: "string", description: "Teks lokasi baru" },
          kicker: { type: "string", description: "Teks topik / kicker baru" }
        }
      },
      execute: async (args: Record<string, string>) => {
        const live = options.getLiveState();
        if (!live.onAirGraphicId) {
          throw new Error("Tidak ada grafis yang sedang tayang ON AIR untuk di-update.");
        }
        const draftFields: Record<string, string> = {};
        if (args.headline !== undefined) draftFields.headline = args.headline;
        if (args.subline !== undefined) draftFields.subline = args.subline;
        if (args.location !== undefined) draftFields.location = args.location;
        if (args.kicker !== undefined) draftFields.kicker = args.kicker;

        await mutate(`/api/graphics/${live.onAirGraphicId}`, "PATCH", { draftFields });
        const res = await mutate("/api/live/update", "POST", { graphicId: live.onAirGraphicId });
        await options.onReload();
        return { status: "success", message: "Grafis ON AIR berhasil diperbarui tanpa animasi ulang", result: res };
      }
    },
    {
      name: "clear_graphic",
      description: "Tarik grafis lower third keluar dari siaran (OUT) dengan animasi keluar halus. Master logo dan ticker tetap aktif.",
      inputSchema: {
        type: "object",
        properties: {}
      },
      execute: async () => {
        const res = await mutate("/api/live/clear", "POST", {});
        await options.onReload();
        return { status: "success", message: "Lower third berhasil di-OUT", result: res };
      }
    },
    {
      name: "clear_all_blackout",
      description: "Hapus seketika seluruh grafis, logo, jam, dan ticker dari layar siaran (Blackout darurat total).",
      inputSchema: {
        type: "object",
        properties: {
          immediate: { type: "boolean", description: "True untuk blackout seketika tanpa animasi keluar" }
        }
      },
      execute: async (args: { immediate?: boolean }) => {
        const res = await mutate("/api/live/clear-all", "POST", { immediate: args?.immediate !== false });
        await options.onReload();
        return { status: "success", message: "Layar berhasil dibersihkan (Blackout)", result: res };
      }
    },
    {
      name: "update_master_overlay",
      description: "Atur konfigurasi master overlay: logo TV, badge LIVE, jam siaran, running ticker, dan template visual siaran.",
      inputSchema: {
        type: "object",
        properties: {
          broadcastTemplate: {
            type: "string",
            enum: ["cnn", "liputan7", "bcc"],
            description: "Pilihan template siaran: cnn (CNN/Studio), liputan7 (Liputan7/HOC TV), atau bcc (BCC News)"
          },
          showLogo: { type: "boolean", description: "Tampilkan atau sembunyikan kotak logo" },
          showLiveBadge: { type: "boolean", description: "Tampilkan atau sembunyikan badge LIVE" },
          showTicker: { type: "boolean", description: "Tampilkan atau sembunyikan running ticker bawah" },
          tickerText: { type: "string", description: "Teks berita berjalan ticker (khusus template BCC News)" },
          tickerSpeed: { type: "number", description: "Kecepatan gerak ticker (65 lambat, 85 normal, 105 cepat)" }
        }
      },
      execute: async (patch: Partial<MasterOverlayState>) => {
        await options.onUpdateMaster(patch);
        await options.onReload();
        return { status: "success", message: "Master overlay berhasil diperbarui", master: options.getMaster() };
      }
    },
    {
      name: "take_news_anchor",
      description: "Tayangkan CG News Anchor default (nama dan jabatan pembawa berita utama) ke siaran langsung.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama anchor (opsional; memakai nama default tersimpan jika kosong)" },
          role: { type: "string", description: "Jabatan anchor (opsional)" }
        }
      },
      execute: async (args: { name?: string; role?: string }) => {
        const payload: Record<string, unknown> = {};
        if (args?.name) {
          payload.defaults = { name: args.name, role: args.role || "News Anchor" };
        }
        const res = await mutate("/api/live/news-anchor", "POST", payload);
        await options.onReload();
        return { status: "success", message: "News Anchor berhasil ditayangkan ke Program", result: res };
      }
    },
    {
      name: "take_field_reporter",
      description: "Tayangkan CG Reporter Lapangan default (nama, peran, dan lokasi liputan) ke siaran langsung.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama reporter lapangan (opsional; memakai default jika kosong)" },
          role: { type: "string", description: "Jabatan reporter (default: Reporter Lapangan)" },
          location: { type: "string", description: "Lokasi siaran langsung (mis. JAKARTA)" }
        }
      },
      execute: async (args: { name?: string; role?: string; location?: string }) => {
        const payload: Record<string, unknown> = {};
        if (args?.name) {
          payload.defaults = {
            name: args.name,
            role: args.role || "Reporter Lapangan",
            location: args.location || ""
          };
        }
        const res = await mutate("/api/live/reporter", "POST", payload);
        await options.onReload();
        return { status: "success", message: "Reporter Lapangan berhasil ditayangkan ke Program", result: res };
      }
    },
    {
      name: "create_rundown",
      description: "Buat paket rundown siaran baru berisi daftar berita dan grafis lower third yang siap diproduksi.",
      inputSchema: {
        type: "object",
        properties: {
          programName: { type: "string", description: "Nama program siaran (mis. BCC NEWS UTAMA)" },
          title: { type: "string", description: "Judul edisi siaran (mis. Edisi Petang - 29 Oktober 2026)" },
          date: { type: "string", description: "Tanggal tayang format YYYY-MM-DD" },
          time: { type: "string", description: "Jam tayang format HH:mm" },
          timezone: { type: "string", enum: ["WIB", "WITA", "WIT"], description: "Zona waktu tayang" },
          tickerText: { type: "string", description: "Teks berita running ticker untuk rundown ini" },
          items: {
            type: "array",
            description: "Daftar berita dalam rundown beserta cue grafis",
            items: { type: "object" }
          }
        },
        required: ["programName", "title"]
      },
      execute: async (args: any) => {
        const payload = {
          programName: args.programName,
          title: args.title,
          broadcastSchedule: {
            date: args.date || new Date().toISOString().slice(0, 10),
            time: args.time || "18:00",
            timezone: args.timezone || "WIB"
          },
          ticker: {
            text: args.tickerText || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI",
            forDate: args.date || new Date().toISOString().slice(0, 10),
            speedMode: "auto",
            sources: []
          },
          items: args.items || []
        };
        const res = await mutate("/api/rundowns", "POST", payload);
        await options.onReload();
        return { status: "success", message: "Rundown berhasil dibuat", rundown: res };
      }
    },
    {
      name: "get_broadcast_status",
      description: "Ambil informasi status siaran langsung: grafis yang sedang ON AIR, master logo/jam/ticker, dan daftar rundown.",
      inputSchema: {
        type: "object",
        properties: {}
      },
      execute: async () => {
        return {
          liveState: options.getLiveState(),
          masterOverlay: options.getMaster(),
          rundownCount: options.getRundowns().length,
          rundownsSummary: options.getRundowns().map((r) => ({
            id: r.id,
            programName: r.programName,
            title: r.title,
            itemCount: r.items.length
          }))
        };
      }
    }
  ];

  // Register into internal map
  tools.forEach((t) => registeredTools.set(t.name, t));

  // 1. Native WebMCP Registration (document.modelContext or navigator.modelContext)
  const nativeApi =
    (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext);

  if (nativeApi && typeof nativeApi.registerTool === "function") {
    tools.forEach((t) => {
      try {
        nativeApi.registerTool(t);
      } catch (err) {
        console.warn(`[WebMCP] Native tool registration skipped for ${t.name}:`, err);
      }
    });
    console.info(`[WebMCP] Registered ${tools.length} native browser tools via document/navigator.modelContext`);
  }

  // 2. Global modelContext provider (Inspector & Agent Extensions Polyfill)
  const customContext: WebMcpContext = {
    registerTool: (tool: WebMcpTool) => {
      registeredTools.set(tool.name, tool);
    },
    getTools: () => Array.from(registeredTools.values()),
    executeTool: async (name: string, input: any) => {
      const tool = registeredTools.get(name);
      if (!tool) throw new Error(`[WebMCP] Tool '${name}' tidak ditemukan.`);
      return await tool.execute(input);
    }
  };

  if (typeof window !== "undefined") {
    window.modelContext = customContext;
    window.__newscgWebMcpRegistered = true;
    window.dispatchEvent(
      new CustomEvent("webmcp:ready", {
        detail: {
          version: "1.0.0",
          spec: "W3C WebMCP (Google Chrome Model Context Protocol)",
          tools: Array.from(registeredTools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        }
      })
    );
    console.info(`[WebMCP] NewsCG Web Model Context Protocol initialized (${tools.length} tools ready).`);
  }

  return customContext;
}
