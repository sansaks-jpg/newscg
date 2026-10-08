import { z } from "zod";

export const templateTypes = ["HEADLINE", "REPORTER", "SOT", "LOCATION", "BREAKING"] as const;
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

export const contentModes = ["headline", "paragraph", "presenter", "sot", "location"] as const;
export type ContentMode = (typeof contentModes)[number];

export const broadcastColorThemeIds = ["cnn", "studio-navy", "studio-graphite", "studio-copper"] as const;
export type BroadcastColorThemeId = (typeof broadcastColorThemeIds)[number];
export const broadcastColorThemeSchema = z.enum(broadcastColorThemeIds);
export type BroadcastColorTheme = {
  id: BroadcastColorThemeId;
  label: string;
  description: string;
  colors: Record<"panel" | "text" | "secondary" | "brand" | "brand-text" | "accent" |
    "ticker" | "ticker-text" | "clock" | "clock-text" | "location" | "location-text" |
    "topic" | "topic-text" | "breaking" | "breaking-text", string>;
};

// These are color treatments of the same CNN layout and broadcast choreography.
export const broadcastColorThemes: Record<BroadcastColorThemeId, BroadcastColorTheme> = {
  cnn: {
    id: "cnn", label: "CNN · Bawaan", description: "Putih, merah, dan hitam seperti template awal.",
    colors: {
      panel: "#FFFFFF", text: "#080808", secondary: "#101010", brand: "#CC0000", "brand-text": "#FFFFFF",
      accent: "#D71920", ticker: "#171717", "ticker-text": "#FFFFFF", clock: "#484848", "clock-text": "#FFFFFF",
      location: "#171717", "location-text": "#FFFFFF", topic: "#282828", "topic-text": "#FFFFFF",
      breaking: "#CC0000", "breaking-text": "#FFFFFF"
    }
  },
  "studio-navy": {
    id: "studio-navy", label: "Studio Navy", description: "Biru meja studio, putih gading, dan aksen tembaga tipis.",
    colors: {
      panel: "#F1F0EA", text: "#172738", secondary: "#3F4C59", brand: "#18364F", "brand-text": "#F3F4F0",
      accent: "#B38D61", ticker: "#171F29", "ticker-text": "#F0F1ED", clock: "#314252", "clock-text": "#F3F4F0",
      location: "#1D2B39", "location-text": "#F3F4F0", topic: "#253D52", "topic-text": "#F3F4F0",
      breaking: "#813D40", "breaking-text": "#FBF6EF"
    }
  },
  "studio-graphite": {
    id: "studio-graphite", label: "Studio Graphite", description: "Abu arang dan perak kebiruan mengikuti dinding studio.",
    colors: {
      panel: "#E8EBED", text: "#222B34", secondary: "#44525D", brand: "#303C46", "brand-text": "#F3F4F0",
      accent: "#8CA4BA", ticker: "#181D22", "ticker-text": "#F0F1ED", clock: "#3B4854", "clock-text": "#F3F4F0",
      location: "#202932", "location-text": "#F3F4F0", topic: "#364652", "topic-text": "#F3F4F0",
      breaking: "#813D40", "breaking-text": "#FBF6EF"
    }
  },
  "studio-copper": {
    id: "studio-copper", label: "Studio Copper", description: "Tembaga redup dan krem hangat mengikuti lampu studio.",
    colors: {
      panel: "#F2EDE5", text: "#242C34", secondary: "#51565A", brand: "#694E36", "brand-text": "#FBF6EF",
      accent: "#BC9C71", ticker: "#202327", "ticker-text": "#F0F1ED", clock: "#424A51", "clock-text": "#FBF6EF",
      location: "#282C30", "location-text": "#FBF6EF", topic: "#604C3B", "topic-text": "#FBF6EF",
      breaking: "#813D40", "breaking-text": "#FBF6EF"
    }
  }
};

export function getBroadcastColorTheme(value?: string): BroadcastColorTheme {
  const parsed = broadcastColorThemeSchema.safeParse(value);
  return broadcastColorThemes[parsed.success ? parsed.data : "cnn"];
}

export const broadcastLogoMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const broadcastLogoMimeTypeSchema = z.enum(broadcastLogoMimeTypes);
export type BroadcastLogoMimeType = (typeof broadcastLogoMimeTypes)[number];
export type ValidatedLogoImage = { extension: "png" | "jpg" | "webp" | "svg"; width: number; height: number };
export const broadcastLogoUploadSpec = {
  width: 800, height: 500, padding: 40, maxBytes: 2 * 1024 * 1024,
  maxDimension: 4096, maxPixels: 4096 * 4096, decodeTimeoutSeconds: 5
} as const;

export type MasterOverlayState = {
  colorTheme?: BroadcastColorThemeId;
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
  colorTheme: "cnn",
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

// Selecting a studio treatment replaces only the untouched CNN sample identity.
// Custom station names and uploaded logos are preserved in the new draft.
export function selectBroadcastColorTheme(master: MasterOverlayState, colorTheme: BroadcastColorThemeId): MasterOverlayState {
  return {
    ...master, colorTheme,
    ...(colorTheme === "cnn" ? {} : {
      brandText: master.brandText === defaultMasterOverlayState.brandText ? "NEWS UPDATE" : master.brandText,
      logoText: master.logoText === defaultMasterOverlayState.logoText ? "NEWS" : master.logoText,
      logoSub: master.logoSub === defaultMasterOverlayState.logoSub ? "BERITA" : master.logoSub
    })
  };
}

export type OverlayEvent =
  | { type: "SYNC"; onAir: boolean; graphic: GraphicItem | null; fields: Record<string, string> | null; master: MasterOverlayState; revision?: number }
  | { type: "TAKE"; graphic: GraphicItem; fields: Record<string, string>; master: MasterOverlayState; revision?: number }
  | { type: "SWITCH_DETAIL"; graphic: GraphicItem; fields: Record<string, string>; master: MasterOverlayState; revision?: number }
  | { type: "UPDATE"; graphicId: string; fields: Record<string, string>; master: MasterOverlayState; revision?: number }
  | { type: "CLEAR"; master: MasterOverlayState; revision?: number }
  | { type: "MASTER_UPDATE"; master: MasterOverlayState; revision?: number }
  | { type: "CLEAR_ALL"; immediate?: boolean; revision?: number }
  | { type: "CLEAR_ALL_IMMEDIATE"; revision?: number }
  | { type: "CLEAR_ALL_ANIMATED"; revision?: number };

// With a topic: panel IN -> headline copy -> topic; OUT reverses that order.
// Retention covers the longest OUT sequence before the content is removed.
export const broadcastMotion = {
  panelInMs: 600, panelOutMs: 360, panelOutDelayMs: 260, panelOutWithTopicDelayMs: 420, retainMs: 780,
  textInMs: 360, textInDelayMs: 160, textOutMs: 180,
  topicInMs: 420, topicInDelayMs: 600, topicOutMs: 240,
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

export const masterOverlaySchema = z.object({
  colorTheme: broadcastColorThemeSchema.optional(),
  showLogo: z.boolean(), showLiveBadge: z.boolean(), showTicker: z.boolean(),
  brandText: z.string().max(120), tickerText: z.string().max(10000),
  tickerSpeed: z.number().min(30).max(250).optional(), tickerRevision: z.number().int().nonnegative().optional(),
  outputFps: z.union([z.literal(25), z.literal(30), z.literal(60)]),
  logoType: z.enum(["text", "image"]), logoImage: z.string().nullable(),
  logoText: z.string().max(120), logoSub: z.string().max(120),
  timezone: z.enum(timezoneModes), customTimezoneLabel: z.string().max(40)
});
export const masterOverlayPatchSchema = masterOverlaySchema.partial();

const headlineFieldLimits = { headline: 120, kicker: 60, subline: 160, location: 60, ticker: 160, brand: 40, socialHandle: 80 } as const;
export const graphicFieldLimits = {
  HEADLINE: headlineFieldLimits,
  BREAKING: headlineFieldLimits,
  REPORTER: { name: 60, role: 60, location: 50, ticker: 160, brand: 40, socialHandle: 80, headline: 120, subline: 160 },
  SOT: { headline: 120, name: 80, role: 100, location: 60, ticker: 160, brand: 40 },
  LOCATION: { location: 50 }
} as const;
export function getGraphicFieldLimit(templateType: TemplateType, field: string): number | undefined {
  return (graphicFieldLimits[templateType] as Readonly<Record<string, number>>)[field];
}

export const fieldSchemas: Record<TemplateType, z.ZodObject<any>> = {
  HEADLINE: z.object({
    headline: z.string().trim().min(1).max(graphicFieldLimits.HEADLINE.headline),
    kicker: z.string().trim().max(graphicFieldLimits.HEADLINE.kicker).optional().default(""),
    subline: z.string().trim().max(graphicFieldLimits.HEADLINE.subline).optional().default(""),
    location: z.string().trim().max(graphicFieldLimits.HEADLINE.location).optional().default(""),
    ticker: z.string().trim().max(graphicFieldLimits.HEADLINE.ticker).optional().default(""),
    brand: z.string().trim().max(graphicFieldLimits.HEADLINE.brand).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    layoutStyle: z.enum(layoutStyles).optional().default("sub"),
    contentMode: z.enum(contentModes).optional().default("headline"),
    socialHandle: z.string().trim().max(graphicFieldLimits.HEADLINE.socialHandle).optional().default(""),
    showKicker: z.string().optional().default("true"),
    showLocation: z.string().optional().default("true"),
    showDetail: z.string().optional().default("false")
  }).passthrough(),
  REPORTER: z.object({
    name: z.string().trim().min(1).max(graphicFieldLimits.REPORTER.name),
    role: z.string().trim().max(graphicFieldLimits.REPORTER.role).default("REPORTER"),
    location: z.string().trim().max(graphicFieldLimits.REPORTER.location).optional().default(""),
    ticker: z.string().trim().max(graphicFieldLimits.REPORTER.ticker).optional().default(""),
    brand: z.string().trim().max(graphicFieldLimits.REPORTER.brand).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    layoutStyle: z.enum(layoutStyles).optional().default("sub"),
    contentMode: z.enum(contentModes).optional().default("presenter"),
    socialHandle: z.string().trim().max(graphicFieldLimits.REPORTER.socialHandle).optional().default(""),
    showKicker: z.string().optional().default("true"),
    showLocation: z.string().optional().default("false"),
    showDetail: z.string().optional().default("false"),
    headline: z.string().trim().max(graphicFieldLimits.REPORTER.headline).optional().default(""),
    subline: z.string().trim().max(graphicFieldLimits.REPORTER.subline).optional().default("")
  }).passthrough(),
  SOT: z.object({
    headline: z.string().trim().min(1).max(graphicFieldLimits.SOT.headline),
    name: z.string().trim().min(1).max(graphicFieldLimits.SOT.name),
    role: z.string().trim().max(graphicFieldLimits.SOT.role).optional().default(""),
    location: z.string().trim().max(graphicFieldLimits.SOT.location).optional().default(""),
    ticker: z.string().trim().max(graphicFieldLimits.SOT.ticker).optional().default(""),
    brand: z.string().trim().max(graphicFieldLimits.SOT.brand).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    contentMode: z.literal("sot").default("sot"),
    showLocation: z.string().optional().default("false")
  }).passthrough(),
  LOCATION: z.object({ visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")), location: z.string().trim().min(1).max(graphicFieldLimits.LOCATION.location) }).passthrough(),
  BREAKING: z.object({
    headline: z.string().trim().min(1).max(graphicFieldLimits.BREAKING.headline),
    kicker: z.string().trim().max(graphicFieldLimits.BREAKING.kicker).optional().default("BREAKING NEWS"),
    subline: z.string().trim().max(graphicFieldLimits.BREAKING.subline).optional().default(""),
    location: z.string().trim().max(graphicFieldLimits.BREAKING.location).optional().default(""),
    ticker: z.string().trim().max(graphicFieldLimits.BREAKING.ticker).optional().default(""),
    brand: z.string().trim().max(graphicFieldLimits.BREAKING.brand).optional().default("CNNINDONESIA.COM"),
    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),
    layoutStyle: z.enum(layoutStyles).optional().default("sub"),
    contentMode: z.enum(contentModes).optional().default("headline"),
    socialHandle: z.string().trim().max(graphicFieldLimits.BREAKING.socialHandle).optional().default(""),
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

export const rundownPatchSchema = z.object({
  programName: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(100).optional()
}).refine((data) => Object.keys(data).length > 0, "Minimal satu field harus diisi");

export const rundownItemPatchSchema = z.object({
  slug: z.string().trim().min(1).max(30).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  format: z.enum(["PKG", "VO", "LIVE", "READER", "LAINNYA"]).optional(),
  cgRequired: z.boolean().optional(),
  estimatedDurationSeconds: z.number().int().min(0).max(21600).optional(),
  sortOrder: z.number().int().nonnegative().optional()
}).refine((data) => Object.keys(data).length > 0, "Minimal satu field harus diisi");

export const appSettingsSchema = z.strictObject({ outputMode: z.literal("web") });
export const defaultAppSettings = { outputMode: "web" } as const;
export const settingsPatchSchema = appSettingsSchema.partial()
  .refine((data) => data.outputMode !== undefined, "Minimal satu field pengaturan harus diisi");
export const liveStageInputSchema = z.object({ mode: z.enum(["empty", "logo", "full"]) });
export const actionLogLimitSchema = z.preprocess(
  (value) => typeof value === "string" || typeof value === "number" || value === undefined ? value : NaN,
  z.coerce.number().int().min(1).max(200).default(50)
);

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
export type AppSettings = z.infer<typeof appSettingsSchema>;
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

export const liveVariantActions = ["clean-headline", "toggle-location", "toggle-kicker", "toggle-detail"] as const;
export const liveVariantActionSchema = z.enum(liveVariantActions);
export type LiveVariantAction = (typeof liveVariantActions)[number];






export const headlineDefaultsSchema = z.object({
  headline: z.string().trim().max(120).default(""),
  location: z.string().trim().max(60).default(""),
  kicker: z.string().trim().max(60).default(""),
  subline: z.string().trim().max(160).default("")
});
export const headlineDefaultsPatchSchema = z.object({
  headline: headlineDefaultsSchema.shape.headline.removeDefault(),
  location: headlineDefaultsSchema.shape.location.removeDefault(),
  kicker: headlineDefaultsSchema.shape.kicker.removeDefault(),
  subline: headlineDefaultsSchema.shape.subline.removeDefault()
}).partial();
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
  | "sot"
  | "previous-sot"
  | "next-sot"
  | "topic"
  | "detail"
  | "previous"
  | "next";
