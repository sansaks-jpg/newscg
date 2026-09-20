import { z } from "zod";

export const templateTypes = ["HEADLINE", "REPORTER", "LOCATION", "BREAKING"] as const;
export type TemplateType = (typeof templateTypes)[number];
export type MaterialStatus = "DRAFT" | "READY";
export type CommandStatus = "idle" | "queued" | "pending" | "confirmed" | "failed" | "unknown";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "AUTH_FAILED" | "MOCK" | "STANDALONE";
export type OutputMode = "web" | "vmix-gt";

export const timezoneModes = ["WIB", "WITA", "WIT", "CUSTOM"] as const;
export type TimezoneMode = (typeof timezoneModes)[number];

export const layoutStyles = ["single", "sub"] as const;
export type LayoutStyle = (typeof layoutStyles)[number];

export const contentModes = ["headline", "paragraph", "presenter"] as const;
export type ContentMode = (typeof contentModes)[number];

export type MasterOverlayState = {
  showLogo: boolean;
  showLiveBadge: boolean;
  showTicker: boolean;
  brandText: string;
  tickerText: string;
  logoType: "text" | "image";
  logoImage: string | null;
  logoText: string;
  logoSub: string;
  timezone: TimezoneMode;
  customTimezoneLabel: string;
};

export const defaultMasterOverlayState: MasterOverlayState = {
  showLogo: false,
  showLiveBadge: false,
  showTicker: false,
  brandText: "CNNINDONESIA.COM",
  tickerText: "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI",
  logoType: "text",
  logoImage: null,
  logoText: "CNN",
  logoSub: "Indonesia",
  timezone: "WIB",
  customTimezoneLabel: "WIB"
};

export type OverlayEvent =
  | { type: "SYNC"; onAir: boolean; graphic: GraphicItem | null; fields: Record<string, string> | null; master: MasterOverlayState }
  | { type: "TAKE"; graphic: GraphicItem; fields: Record<string, string>; master: MasterOverlayState }
  | { type: "UPDATE"; graphicId: string; fields: Record<string, string>; master: MasterOverlayState }
  | { type: "CLEAR"; master: MasterOverlayState }
  | { type: "MASTER_UPDATE"; master: MasterOverlayState }
  | { type: "CLEAR_ALL" };

export const fieldSchemas: Record<TemplateType, z.ZodObject<any>> = {
  HEADLINE: z.object({
    headline: z.string().trim().min(1).max(120),
    kicker: z.string().trim().max(60).optional().default(""),
    subline: z.string().trim().max(160).optional().default(""),
    location: z.string().trim().max(60).optional().default(""),
    ticker: z.string().trim().max(160).optional().default(""),
    brand: z.string().trim().max(40).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    layoutStyle: z.enum(layoutStyles).optional().default("sub"),
    contentMode: z.enum(contentModes).optional().default("headline"),
    socialHandle: z.string().trim().max(80).optional().default(""),
    showKicker: z.string().optional().default("true"),
    showLocation: z.string().optional().default("true")
  }),
  REPORTER: z.object({
    name: z.string().trim().min(1).max(60),
    role: z.string().trim().max(60).default("REPORTER"),
    location: z.string().trim().max(50).optional().default(""),
    ticker: z.string().trim().max(160).optional().default(""),
    brand: z.string().trim().max(40).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    layoutStyle: z.enum(layoutStyles).optional().default("sub"),
    contentMode: z.enum(contentModes).optional().default("presenter"),
    socialHandle: z.string().trim().max(80).optional().default(""),
    showKicker: z.string().optional().default("true"),
    showLocation: z.string().optional().default("false")
  }),
  LOCATION: z.object({ visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")), location: z.string().trim().min(1).max(50) }),
  BREAKING: z.object({
    headline: z.string().trim().min(1).max(120),
    kicker: z.string().trim().max(60).optional().default("BREAKING NEWS"),
    subline: z.string().trim().max(160).optional().default(""),
    location: z.string().trim().max(60).optional().default(""),
    ticker: z.string().trim().max(160).optional().default(""),
    brand: z.string().trim().max(40).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    layoutStyle: z.enum(layoutStyles).optional().default("sub"),
    contentMode: z.enum(contentModes).optional().default("headline"),
    socialHandle: z.string().trim().max(80).optional().default(""),
    showKicker: z.string().optional().default("true"),
    showLocation: z.string().optional().default("false")
  })
};

export const graphicInputSchema = z.object({
  templateType: z.enum(templateTypes),
  sortOrder: z.number().int().nonnegative().default(0),
  status: z.enum(["DRAFT", "READY"]).default("DRAFT"),
  draftFields: z.record(z.string(), z.string())
}).superRefine((value, ctx) => {
  const parsed = fieldSchemas[value.templateType].safeParse(value.draftFields);
  if (!parsed.success) parsed.error.issues.forEach(issue => ctx.addIssue({ ...issue, path: ["draftFields", ...issue.path] }));
});

export const graphicPatchSchema = z.object({
  templateType: z.enum(templateTypes).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  status: z.enum(["DRAFT", "READY"]).optional(),
  draftFields: z.record(z.string(), z.string()).optional()
});

export const rundownItemInputSchema = z.object({
  slug: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(120),
  format: z.enum(["PKG", "VO", "LIVE", "READER", "LAINNYA"]).default("READER"),
  estimatedDurationSeconds: z.number().int().min(0).max(21600).default(0),
  sortOrder: z.number().int().nonnegative().default(0)
});

export const rundownInputSchema = z.object({
  programName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  items: z.array(rundownItemInputSchema.extend({
    id: z.string().optional(),
    graphics: z.array(graphicInputSchema.extend({ id: z.string().optional() })).default([])
  })).default([])
});

export const storyInputSchema = rundownItemInputSchema.extend({
  graphics: z.array(graphicInputSchema.extend({ id: z.string().optional() })).default([])
});

export type GraphicItem = {
  id: string; itemId: string; templateType: TemplateType; sortOrder: number; status: MaterialStatus;
  draftFields: Record<string, string>; lastPushedFields: Record<string, string> | null;
};
export type RundownItem = {
  id: string; rundownId: string; slug: string; title: string; format: string;
  estimatedDurationSeconds: number; sortOrder: number; graphics: GraphicItem[];
};
export type Rundown = { id: string; programName: string; title: string; updatedAt: string; items: RundownItem[] };
export type VmixInput = { guid: string; number: number; title: string; type: string; textFields: string[] };
export type OverlayState = { overlayNumber: number; inputGuid: string | null };
export type VmixMapping = { templateType: TemplateType; inputGuid: string; inputTitle: string; fieldMap: Record<string, string> };
export type AppSettings = {
  outputMode: OutputMode; mode: "mock" | "http"; vmixHost: string; vmixPort: number; overlayNumber: number;
  pollingIntervalMs: number; username: string; passwordConfigured: boolean; mappings: VmixMapping[];
};
export type LiveState = {
  connection: ConnectionStatus; commandStatus: CommandStatus; selectedGraphicId: string | null;
  onAirGraphicId: string | null; actualOverlayInputGuid: string | null; onAirSnapshot: Record<string, string> | null;
  lastActionAt: string | null; error: string | null; mode: "mock" | "http"; outputMode: OutputMode;
  overlayClientsCount: number;
};export type HeadlineVisibility = {
  showLocation: boolean;
  showKicker: boolean;
  showDetail: boolean;
};

export type LiveVariantAction =
  | "clean-headline"
  | "toggle-location"
  | "toggle-kicker"
  | "toggle-detail";

export const headlineDefaultsSchema = z.object({
  headline: z.string().trim().max(120).default(""),
  location: z.string().trim().max(60).default(""),
  kicker: z.string().trim().max(60).default(""),
  subline: z.string().trim().max(160).default("")
});
export type HeadlineDefaults = z.infer<typeof headlineDefaultsSchema>;

export const defaultHeadlineDefaults: HeadlineDefaults = {
  headline: "",
  location: "",
  kicker: "",
  subline: ""
};
