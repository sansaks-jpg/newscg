import { z } from "zod";

export const templateTypes = ["HEADLINE", "REPORTER", "LOCATION", "BREAKING"] as const;
export type TemplateType = (typeof templateTypes)[number];
export type MaterialStatus = "DRAFT" | "READY";
export type CommandStatus = "idle" | "queued" | "pending" | "confirmed" | "failed" | "unknown";
export type ConnectionStatus = "CONNECTED" | "STANDALONE";

export const timezoneModes = ["WIB", "WITA", "WIT", "CUSTOM"] as const;
export type TimezoneMode = (typeof timezoneModes)[number];
export const outputFrameRates = [25, 30, 60] as const;
export type OutputFrameRate = (typeof outputFrameRates)[number];

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
  tickerSpeed?: number;
  outputFps: OutputFrameRate;
  tickerRevision?: number;
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
  tickerSpeed: 85,
  outputFps: 30,
  logoType: "text",
  logoImage: null,
  logoText: "CNN",
  logoSub: "Indonesia",
  timezone: "WIB",
  customTimezoneLabel: "WIB"
};

export type OverlayEvent =
  | { type: "SYNC"; onAir: boolean; graphic: GraphicItem | null; fields: Record<string, string> | null; master: MasterOverlayState; revision?: number }
  | { type: "TAKE"; graphic: GraphicItem; fields: Record<string, string>; master: MasterOverlayState; revision?: number }
  | { type: "UPDATE"; graphicId: string; fields: Record<string, string>; master: MasterOverlayState; revision?: number }
  | { type: "CLEAR"; master: MasterOverlayState; revision?: number }
  | { type: "MASTER_UPDATE"; master: MasterOverlayState; revision?: number }
  | { type: "CLEAR_ALL"; immediate?: boolean; revision?: number }
  | { type: "CLEAR_ALL_IMMEDIATE"; revision?: number }
  | { type: "CLEAR_ALL_ANIMATED"; revision?: number };

// The panel OUT includes its text-first delay; removal must wait for both.
export const broadcastMotion = {
  panelInMs: 600, panelOutMs: 360, panelOutDelayMs: 260, retainMs: 620,
  textInMs: 360, textInDelayMs: 160, textOutMs: 180,
  topicInMs: 420, topicInDelayMs: 80, topicOutMs: 240,
  detailInMs: 300, detailInDelayMs: 240, detailOutMs: 180,
  locationInMs: 420, locationOutMs: 320,
  logoInMs: 500, logoOutMs: 400,
  liveInMs: 340, liveInDelayMs: 100, liveOutMs: 240,
  tickerInMs: 560, tickerOutMs: 420,
  tickerItemInMs: 300, tickerItemInDelayMs: 140, tickerItemOutMs: 180
} as const;
export const tickerPresets = { slow: 65, normal: 85, fast: 105 } as const;
export type OverlayPlaybackState = {
  graphic: GraphicItem | null;
  fields: Record<string, string> | null;
  master: MasterOverlayState;
  exiting: boolean;
  exitAll: boolean;
  blackout: boolean;
  synced: boolean;
  animationKey: number;
};

export const masterOverlayPatchSchema = z.object({
  showLogo: z.boolean(), showLiveBadge: z.boolean(), showTicker: z.boolean(),
  brandText: z.string().max(120), tickerText: z.string().max(10000),
  tickerSpeed: z.number().min(30).max(250), tickerRevision: z.number().int().nonnegative(),
  outputFps: z.union([z.literal(25), z.literal(30), z.literal(60)]),
  logoType: z.enum(["text", "image"]), logoImage: z.string().nullable(),
  logoText: z.string().max(120), logoSub: z.string().max(120),
  timezone: z.enum(timezoneModes), customTimezoneLabel: z.string().max(40)
}).partial();

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
    showLocation: z.string().optional().default("true"),
    showDetail: z.string().optional().default("false")
  }).passthrough(),
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
    showLocation: z.string().optional().default("false"),
    showDetail: z.string().optional().default("false"),
    headline: z.string().trim().max(120).optional().default(""),
    subline: z.string().trim().max(160).optional().default("")
  }).passthrough(),
  LOCATION: z.object({ visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")), location: z.string().trim().min(1).max(50) }).passthrough(),
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
    showLocation: z.string().optional().default("false"),
    showDetail: z.string().optional().default("false")
  }).passthrough()
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

export function validateGraphicPatch(
  current: GraphicItem,
  patch: z.infer<typeof graphicPatchSchema>
): { success: true; data: Record<string, string> } | { success: false; error: z.ZodError } {
  const targetTemplateType = (patch.templateType || current.templateType) as TemplateType;
  const schema = fieldSchemas[targetTemplateType];
  const mergedFields = patch.draftFields
    ? { ...current.draftFields, ...patch.draftFields }
    : current.draftFields;
  const result = schema.safeParse(mergedFields);
  if (result.success) {
    return { success: true, data: result.data as Record<string, string> };
  }
  return { success: false, error: result.error };
}

export const rundownItemInputSchema = z.object({
  slug: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(120),
  format: z.enum(["PKG", "VO", "LIVE", "READER", "LAINNYA"]).default("READER"),
  cgRequired: z.boolean().optional(),
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
  cgRequired: boolean; estimatedDurationSeconds: number; sortOrder: number; graphics: GraphicItem[];
};
export type Rundown = { id: string; programName: string; title: string; updatedAt: string; items: RundownItem[] };
export type OverlayState = { overlayNumber: number; inputGuid: string | null };
export type AppSettings = Record<string, any>;
export type LiveState = {
  connection: ConnectionStatus;
  commandStatus: CommandStatus;
  selectedGraphicId: string | null;
  onAirGraphicId: string | null;
  actualOverlayInputGuid: string | null;
  onAirSnapshot: Record<string, string> | null;
  lastActionAt: string | null;
  error: string | null;
  overlayClientsCount: number;
};
export type HeadlineVisibility = {
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

export type LiveShortcut =
  | "master"
  | "take"
  | "update"
  | "clear"
  | "clear-all"
  | "logo"
  | "full"
  | "headline"
  | "location"
  | "topic"
  | "detail"
  | "previous"
  | "next";
