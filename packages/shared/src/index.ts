import { z } from "zod";



export const templateTypes = ["HEADLINE", "REPORTER", "SOT", "LOCATION", "BREAKING"] as const;

export type TemplateType = (typeof templateTypes)[number];

export type CommandStatus = "idle" | "queued" | "pending" | "confirmed" | "failed" | "unknown";

export type ConnectionStatus = "CONNECTED" | "STANDALONE";



export const broadcastTemplateIds = ["cnn", "liputan7", "bcc"] as const;

export type BroadcastTemplateId = (typeof broadcastTemplateIds)[number];

export const broadcastTemplateSchema = z.enum(broadcastTemplateIds);

export const broadcastTemplates = {

  cnn: { label: "CNN / Studio", description: "Susunan dan animasi CNN dengan pilihan warna studio." },

  liputan7: { label: "Liputan7 · HOC TV", description: "CG anchor, headline, lokasi, detail, dua logo, dan cuaca otomatis BMKG." },

  bcc: { label: "BCC News", description: "Susunan dan animasi CNN dengan warna marun, oranye, krem, dan logo BCC News." }

} as const;

export const bccPalette = {

  maroon: "#6B0908",

  maroonDark: "#4A0706",

  maroonDeep: "#360505",

  cream: "#F6D2A7",

  creamLogo: "#F6D4A7",

  orange: "#FF6115",

  textLight: "#FFFFFF",

  textDark: "#1A1A1A"

} as const;

export const liputan7Palette = { burgundy: "#790D16", sand: "#E5D3AF", ivory: "#F5EFE1", blue: "#AEC4D4" } as const;

export const weatherLocationSchema = z.object({

  adm4: z.string().regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/, "Kode wilayah BMKG harus seperti 31.71.03.1001"),

  label: z.string().trim().min(1).max(24)

});

export type WeatherLocation = z.infer<typeof weatherLocationSchema>;

// BMKG IDs verified against live responses; each city is represented by a named village.

export const defaultWeatherLocations: WeatherLocation[] = [

  { adm4: "31.71.03.1001", label: "JAKARTA" },

  { adm4: "32.73.01.1001", label: "BANDUNG" },

  { adm4: "35.78.01.1001", label: "SURABAYA" },

  { adm4: "12.71.01.1001", label: "MEDAN" },

  { adm4: "33.74.01.1001", label: "SEMARANG" },

  { adm4: "51.71.01.1001", label: "DENPASAR" },

  { adm4: "73.71.01.1001", label: "MAKASSAR" }

];

export function getLiputan7WeatherLocations(locations?: WeatherLocation[]): WeatherLocation[] {

  // Upgrade only the original sample seed; retain operator-defined locations.

  const originalSeed = locations?.length === 1 && locations[0]?.adm4 === "31.71.03.1001" && locations[0]?.label === "KEMAYORAN";

  return !locations || originalSeed ? defaultWeatherLocations : locations;

}

export const weatherConditions = ["sunny", "partly-cloudy", "cloudy", "rain", "storm", "fog"] as const;

export type WeatherCondition = (typeof weatherConditions)[number];

export const weatherForecastSchema = z.object({

  adm4: weatherLocationSchema.shape.adm4, village: z.string(), city: z.string(), timezone: z.string(),

  condition: z.enum(weatherConditions), description: z.string(), temperature: z.number().min(-30).max(60),

  minimum: z.number().min(-30).max(60), maximum: z.number().min(-30).max(60),

  validAt: z.iso.datetime(), expiresAt: z.iso.datetime(), forecastDate: z.iso.date(),

  fetchedAt: z.iso.datetime(), source: z.literal("BMKG"), sourceUrl: z.url(), isDaytime: z.boolean().optional().default(true)

});

export type WeatherForecast = z.infer<typeof weatherForecastSchema>;

export type WeatherDisplay = { forecast: WeatherForecast; label: string };

export const weatherIconAssets: Record<WeatherCondition, string> = {

  sunny: "clear-day", "partly-cloudy": "partly-cloudy-day", cloudy: "overcast", rain: "rain", storm: "thunderstorms-rain", fog: "fog"

};

// Only the fields consumed from the external service; all runtime validation lives here.

export const bmkgResponseSchema = z.object({

  lokasi: z.object({ adm4: weatherLocationSchema.shape.adm4, desa: z.string(), kotkab: z.string(), timezone: z.string() }),

  data: z.array(z.object({ cuaca: z.array(z.array(z.object({

    utc_datetime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),

    local_datetime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),

    t: z.number().min(-30).max(60), weather_desc: z.string().min(1)

  }))) })).min(1)

});

export const liputan7Motion = {

  // 60 fps reference: foundation 02:53.600, ivory 02:53.800,

  // copy/detail 02:54.000. Surfaces and copy have independent paths.

  panelInMs: 600, plateInMs: 500, plateDelayMs: 200, copyInMs: 350, copyDelayMs: 400,

  detailInMs: 400, detailDelayMs: 400, locationInMs: 360, locationDelayMs: 700,

  locationCopyInMs: 200, locationCopyDelayMs: 1000, locationOutMs: 300,

  copyOutMs: 350, copyOutDelayMs: 300, plateOutMs: 500, plateOutDelayMs: 400,

  detailOutMs: 400, detailOutDelayMs: 300, panelOutMs: 600, panelOutDelayMs: 450, retainMs: 1100,

  logoInMs: 480, logoOutMs: 360, weatherMorphMs: 700,

  weatherLogoHoldMs: 10000, weatherHoldMs: 3000, weatherCityOutMs: 300, weatherCityInMs: 300, tvLoopMs: 36000,

  weatherRefreshMs: 600000

} as const;



export type Liputan7WeatherPhase = "logo" | "opening" | "hold" | "out" | "in" | "closing";

export type Liputan7WeatherFrame = { phase: Liputan7WeatherPhase; index: number; cycle: number;

  motion: "rise" | "slide" | "fade"; nextChangeInMs: number };

/** Ten seconds of logo, a readable run of every city, then ten seconds of logo again. */

export function getLiputan7WeatherFrame(elapsedMs: number, count: number): Liputan7WeatherFrame {

  const total = Math.max(0, Math.trunc(count));

  const steps: { phase: Liputan7WeatherPhase; index: number; duration: number }[] = [

    { phase: "logo", index: 0, duration: liputan7Motion.weatherLogoHoldMs }

  ];

  if (total) {

    steps.push({ phase: "opening", index: 0, duration: liputan7Motion.weatherMorphMs });

    for (let index = 0; index < total; index++) {

      steps.push({ phase: "hold", index, duration: liputan7Motion.weatherHoldMs });

      if (index < total - 1) steps.push(

        { phase: "out", index, duration: liputan7Motion.weatherCityOutMs },

        { phase: "in", index: index + 1, duration: liputan7Motion.weatherCityInMs });

    }

    steps.push({ phase: "closing", index: total - 1, duration: liputan7Motion.weatherMorphMs });

  }

  const duration = steps.reduce((sum, step) => sum + step.duration, 0);

  const elapsed = Math.max(0, elapsedMs);

  const cycle = Math.floor(elapsed / duration);

  let position = elapsed % duration;

  for (const step of steps) {

    if (position < step.duration) return { phase: step.phase, index: step.index, cycle,

      motion: (["rise", "slide", "fade"] as const)[(step.index + cycle) % 3]!, nextChangeInMs: step.duration - position };

    position -= step.duration;

  }

  return { phase: "logo", index: 0, cycle, motion: "rise", nextChangeInMs: liputan7Motion.weatherLogoHoldMs };

}



// Keep long headlines tall while limiting how far their glyphs can be warped.

export const liputan7HeadlineFit = {

  minScale: .72,

  single: { fillHeight: .55, maxVerticalScale: 1.45 },

  detail: { fillHeight: .65, maxVerticalScale: 1.25 }

} as const;



export const timezoneModes = ["WIB", "WITA", "WIT", "CUSTOM"] as const;

export type TimezoneMode = (typeof timezoneModes)[number];

export const outputFrameRates = [25, 30, 60] as const;

export type OutputFrameRate = (typeof outputFrameRates)[number];



export const layoutStyles = ["single", "sub"] as const;

export type LayoutStyle = (typeof layoutStyles)[number];



export const contentModes = ["headline", "paragraph", "presenter", "sot", "location"] as const;

export type ContentMode = (typeof contentModes)[number];



export const headlinePresentations = ["story", "bulletin"] as const;

export type HeadlinePresentation = (typeof headlinePresentations)[number];

export const headlinePresentationSchema = z.enum(headlinePresentations);

// One headline per cue; operators advance explicitly through the opening rundown.

export const headlineBulletinPreset = {

  headlinePresentation: "bulletin", kicker: "HIGHLIGHT", contentMode: "headline",

  layoutStyle: "single", showLocation: "false", showKicker: "true", showDetail: "false",

  visualTemplate: "cnn"

} as const;



// Compatibility with the first side-label preset; all new editing uses kicker.

// changedFields differentiates explicit PATCH intent from legacy stored values.

export function normalizeHeadlineTopicFields(

  type: TemplateType | null | undefined,

  fields: Record<string, string>,

  changedFields?: Readonly<Record<string, string>>

): Record<string, string> {

  if (type !== "HEADLINE" || fields.headlinePresentation !== "bulletin" || !fields.headlineLabel) return fields;

  const { headlineLabel, ...topicFields } = fields;

  // The old side label was always visible, even with a separately hidden kicker.

  // An explicitly PATCHed kicker, including an empty/hidden one, takes precedence.

  if (changedFields && Object.hasOwn(changedFields, "kicker")) return topicFields;

  const explicitlyChangedLabel = Boolean(changedFields && Object.hasOwn(changedFields, "headlineLabel"));

  const hasVisibleTopic = !explicitlyChangedLabel && Boolean(fields.kicker?.trim()) && fields.showKicker !== "false";

  return { ...topicFields,

    kicker: hasVisibleTopic ? fields.kicker! : headlineLabel === "HEADLINE" ? "HIGHLIGHT" : headlineLabel,

    showKicker: "true"

  };

}



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

  broadcastTemplate?: BroadcastTemplateId;

  showProgramLogo?: boolean;

  showWeather?: boolean;

  programLogoImage?: string | null;

  weatherLocations?: WeatherLocation[];

  colorTheme?: BroadcastColorThemeId;

  showLogo: boolean;

  showLiveBadge: boolean;

  showTicker: boolean;

  brandText: string;

  tickerText: string;

  tickerSpeed?: number;

  outputFps: OutputFrameRate;

  tickerRevision?: number;

  tickerRundownId?: string | null;

  tickerForDate?: string | null;

  logoType: "text" | "image";

  logoImage: string | null;

  logoText: string;

  logoSub: string;

  timezone: TimezoneMode;

  customTimezoneLabel: string;

};



export type BroadcastGhostFields = { location?: string; kicker?: string; subline?: string };

export type BroadcastGraphicProps = {

  type?: TemplateType | null; fields?: Record<string, string> | null; master?: MasterOverlayState;

  isExiting?: boolean; isMini?: boolean; visualTemplate?: string; contentKey?: string | number;

  exitAll?: boolean; ghostPreview?: boolean; ghostFields?: BroadcastGhostFields | null;

};



export const defaultMasterOverlayState: MasterOverlayState = {

  broadcastTemplate: "cnn", showProgramLogo: false, showWeather: false,

  programLogoImage: null, weatherLocations: defaultWeatherLocations,

  colorTheme: "cnn",

  showLogo: false,

  showLiveBadge: false,

  showTicker: false,

  brandText: "CNNINDONESIA.COM",

  tickerText: "",

  tickerRundownId: null,

  tickerForDate: null,

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

  broadcastTemplate: broadcastTemplateSchema.optional(),

  showProgramLogo: z.boolean().optional(), showWeather: z.boolean().optional(),

  programLogoImage: z.string().nullable().optional(),

  weatherLocations: z.array(weatherLocationSchema).min(1).max(8)

    .refine(items => new Set(items.map(item => item.adm4)).size === items.length, "Wilayah cuaca tidak boleh berulang").optional(),

  colorTheme: broadcastColorThemeSchema.optional(),

  showLogo: z.boolean(), showLiveBadge: z.boolean(), showTicker: z.boolean(),

  brandText: z.string().max(120), tickerText: z.string().max(10000),

  tickerSpeed: z.number().min(30).max(250).optional(), tickerRevision: z.number().int().nonnegative().optional(),

  tickerRundownId: z.string().nullable().optional(), tickerForDate: z.iso.date().nullable().optional(),

  outputFps: z.union([z.literal(25), z.literal(30), z.literal(60)]),

  logoType: z.enum(["text", "image"]), logoImage: z.string().nullable(),

  logoText: z.string().max(120), logoSub: z.string().max(120),

  timezone: z.enum(timezoneModes), customTimezoneLabel: z.string().max(40)

});

export const masterOverlayPatchSchema = masterOverlaySchema.omit({ tickerText: true, tickerSpeed: true, tickerRevision: true, tickerRundownId: true, tickerForDate: true }).partial().strict()

  .refine(data => Object.keys(data).length > 0, "Minimal satu field master yang dikenal harus diisi")

  .meta({ minProperties: 1 });



export function masterControlPatch(master: MasterOverlayState) {

  return masterOverlayPatchSchema.parse(Object.fromEntries(Object.entries(master).filter(([key]) => key in masterOverlayPatchSchema.shape)));

}



export function hasVisibleMasterLayers(master: MasterOverlayState): boolean {

  if (master.broadcastTemplate === "liputan7") return Boolean(master.showProgramLogo || master.showLogo || master.showTicker);

  return master.showLogo || master.showTicker || master.showLiveBadge;

}



export function getGraphicRetainMs(master?: MasterOverlayState): number {

  return master?.broadcastTemplate === "liputan7" ? liputan7Motion.retainMs : broadcastMotion.retainMs;

}



export function selectBroadcastTemplate(master: MasterOverlayState, broadcastTemplate: BroadcastTemplateId): MasterOverlayState {

  return {

    ...master,

    broadcastTemplate,

    ...(broadcastTemplate === "liputan7" ? { showProgramLogo: true, showWeather: true } : {}),

    ...(broadcastTemplate === "bcc" ? {

      brandText: (master.brandText === "CNNINDONESIA.COM" || master.brandText === "NEWS UPDATE" || !master.brandText) ? "BCCNEWS.ID" : master.brandText,
      logoText: (master.logoText === "CNN" || master.logoText === "NEWS" || !master.logoText) ? "BCC" : master.logoText,
      logoSub: (master.logoSub === "Indonesia" || master.logoSub === "BERITA" || !master.logoSub) ? "NEWS" : master.logoSub,
      showTicker: true,
      tickerText: master.tickerText?.trim() ? master.tickerText : "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS"
    } : {})

  };

}



const headlineFieldLimits = { headline: 120, kicker: 60, subline: 160, location: 60, ticker: 160, brand: 40, socialHandle: 80 } as const;

const visibilityFlagSchema = z.enum(["true", "false"]);

export const graphicFieldLimits = {

  HEADLINE: { ...headlineFieldLimits, headlineLabel: 24 },

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

    headlinePresentation: headlinePresentationSchema.optional().default("story"),

    headlineLabel: z.string().trim().min(1).max(graphicFieldLimits.HEADLINE.headlineLabel).optional()

      .meta({ deprecated: true, description: "Label samping lama; gunakan kicker dan showKicker untuk tab topik." }),

    kicker: z.string().trim().max(graphicFieldLimits.HEADLINE.kicker).optional().default(""),

    subline: z.string().trim().max(graphicFieldLimits.HEADLINE.subline).optional().default(""),

    location: z.string().trim().max(graphicFieldLimits.HEADLINE.location).optional().default(""),

    ticker: z.string().trim().max(graphicFieldLimits.HEADLINE.ticker).optional().default(""),

    brand: z.string().trim().max(graphicFieldLimits.HEADLINE.brand).optional().default("CNNINDONESIA.COM"),

    visualTemplate: z.preprocess((value) => value === "classic" ? "cnn" : value, z.literal("cnn").default("cnn")),

    layoutStyle: z.enum(layoutStyles).optional().default("sub"),

    contentMode: z.enum(contentModes).optional().default("headline"),

    socialHandle: z.string().trim().max(graphicFieldLimits.HEADLINE.socialHandle).optional().default(""),

    showKicker: visibilityFlagSchema.optional().default("true"),

    showLocation: visibilityFlagSchema.optional().default("true"),

    showDetail: visibilityFlagSchema.optional().default("false")

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

    showKicker: visibilityFlagSchema.optional().default("true"),

    showLocation: visibilityFlagSchema.optional().default("false"),

    showDetail: visibilityFlagSchema.optional().default("false"),

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

    showLocation: visibilityFlagSchema.optional().default("false"),

    showSot: visibilityFlagSchema.optional()

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

    showKicker: visibilityFlagSchema.optional().default("true"),

    showLocation: visibilityFlagSchema.optional().default("false"),

    showDetail: visibilityFlagSchema.optional().default("false")

  }).passthrough()

};



export const graphicInputSchema = z.object({

  templateType: z.enum(templateTypes),

  sortOrder: z.number().int().nonnegative().default(0),

  draftFields: z.record(z.string(), z.string())

}).superRefine((value, ctx) => {

  const parsed = fieldSchemas[value.templateType].safeParse(value.draftFields);

  if (!parsed.success) parsed.error.issues.forEach(issue => ctx.addIssue({ ...issue, path: ["draftFields", ...issue.path] }));

}).overwrite((value) => {

  // Zod's field validation trims text and resolves legacy aliases. Keep only

  // fields supplied by the caller, so optional defaults are not added to drafts.

  const parsed = fieldSchemas[value.templateType].safeParse(value.draftFields);

  if (!parsed.success) return value; // superRefine reports the same field errors.

  const parsedFields = parsed.data as Record<string, string>;

  const draftFields = Object.fromEntries(Object.entries(value.draftFields).map(([key, original]) => [key, parsedFields[key] ?? original]));

  return { ...value, draftFields };

});



export const graphicPatchSchema = z.object({

  templateType: z.enum(templateTypes).optional(),

  sortOrder: z.number().int().nonnegative().optional(),

  draftFields: z.record(z.string(), z.string()).optional()

}).refine(data => Object.keys(data).length > 0, "Minimal satu field grafis yang dikenal harus diisi")

  .meta({ minProperties: 1 });



export function validateGraphicPatch(

  current: GraphicItem,

  patch: z.infer<typeof graphicPatchSchema>

): { success: true; data: Record<string, string> } | { success: false; error: z.ZodError } {

  const targetTemplateType = (patch.templateType || current.templateType) as TemplateType;

  const schema = fieldSchemas[targetTemplateType];

  const currentFields = normalizeHeadlineTopicFields(current.templateType, current.draftFields);

  const mergedFields = patch.draftFields

    ? { ...currentFields, ...patch.draftFields }

    : currentFields;

  const result = schema.safeParse(mergedFields);

  if (result.success) {

    return { success: true, data: normalizeHeadlineTopicFields(targetTemplateType, result.data as Record<string, string>, patch.draftFields) };

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



export const broadcastScheduleSchema = z.object({

  date: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam tayang harus HH:mm"),

  timezone: z.enum(["WIB", "WITA", "WIT"])

});

export type BroadcastSchedule = z.infer<typeof broadcastScheduleSchema>;

export const tickerSourceSchema = z.object({

  headline: z.string().trim().min(1).max(120), sourceName: z.string().trim().min(1).max(120),

  url: z.url().regex(/^https?:\/\//), publishedAt: z.iso.datetime({ offset: true }),

  eventDate: z.iso.date().nullable().default(null), accessedAt: z.iso.datetime({ offset: true })

});

// An editorial heuristic for the fixed 1920px ticker, not a reading-speed standard.

// Use the most demanding headline so a long list cannot dilute its complexity.

export const tickerSpeedPolicy = { version: 1, base: 85, min: 70, max: 85,

  numericPenalty: 15, longWordPenalty: 10, punctuationPenalty: 5, longWordLetters: 10 } as const;

export function calculateTickerSpeed(text: string) {

  const headlines = text.split(/[•■\n]+/u).map(headline => headline.trim()).filter(Boolean);

  const candidates = headlines.map(headline => {

    const words = headline.split(/\s+/u);

    const numericRatio = words.filter(word => /\d/u.test(word)).length / words.length;

    const longWordRatio = words.filter(word => word.replace(/[^\p{L}]/gu, "").length > tickerSpeedPolicy.longWordLetters).length / words.length;

    // Decimal/grouping punctuation inside numbers is already covered by numericRatio.

    const punctuation = headline.replace(/(\d)[,.](?=\d)/gu, "$1").match(/[,:;()/]/gu)?.length ?? 0;

    const punctuationRatio = Math.min(1, punctuation / words.length);

    const rawSpeed = tickerSpeedPolicy.base - tickerSpeedPolicy.numericPenalty * numericRatio

      - tickerSpeedPolicy.longWordPenalty * longWordRatio - tickerSpeedPolicy.punctuationPenalty * punctuationRatio;

    return Math.max(tickerSpeedPolicy.min, Math.min(tickerSpeedPolicy.max, rawSpeed));

  });

  return Math.round(candidates.length ? Math.min(...candidates) : tickerSpeedPolicy.base);

}

export const rundownTickerSchema = z.object({

  text: z.string().trim().max(10000).default(""), forDate: z.iso.date().nullable().default(null),

  sources: z.array(tickerSourceSchema).max(100).default([]),

  speedMode: z.enum(["auto", "manual"]).optional(), speed: z.number().min(30).max(250).optional()

}).superRefine((ticker, ctx) => {

  if (ticker.speedMode === "manual" && ticker.speed === undefined) ctx.addIssue({ code: "custom", path: ["speed"], message: "Isi kecepatan ticker saat memilih mode manual (30–250 px/detik)." });

}).overwrite(ticker => ({ ...ticker, speedMode: ticker.speedMode ?? "auto",

  speed: ticker.speedMode === "manual" ? ticker.speed : calculateTickerSpeed(ticker.text) }));

export type RundownTicker = z.infer<typeof rundownTickerSchema>;

export function getRundownTickerSpeed(ticker: RundownTicker) {

  return ticker.speedMode === "manual" ? ticker.speed ?? tickerSpeedPolicy.base : calculateTickerSpeed(ticker.text);

}

export const emptyRundownTicker: RundownTicker = { text: "", forDate: null, sources: [] };

export function getTickerResearchWindow(date: string) {

  const day = Date.parse(`${date}T12:00:00Z`);

  return { from: new Date(day - 2 * 86400000).toISOString().slice(0, 10), to: new Date(day - 86400000).toISOString().slice(0, 10) };

}

export const rundownBroadcastSchema = z.object({

  broadcastSchedule: broadcastScheduleSchema.nullable(), ticker: rundownTickerSchema

}).superRefine(({ broadcastSchedule, ticker }, ctx) => {

  if (!ticker.text && !ticker.sources.length) return;

  if (!broadcastSchedule || ticker.forDate !== broadcastSchedule.date) {

    ctx.addIssue({ code: "custom", path: ["ticker", "forDate"], message: "Ticker harus terikat tanggal jadwal tayang rundown ini." });

    return;

  }

  const window = getTickerResearchWindow(broadcastSchedule.date);

  const offset = { WIB: 7, WITA: 8, WIT: 9 }[broadcastSchedule.timezone];

  ticker.sources.forEach((source, index) => {

    const publicationDate = new Date(Date.parse(source.publishedAt) + offset * 3600000).toISOString().slice(0, 10);

    if (publicationDate < window.from || publicationDate > window.to) ctx.addIssue({ code: "custom", path: ["ticker", "sources", index, "publishedAt"], message: `Sumber ticker harus terbit ${window.from} sampai ${window.to} (${broadcastSchedule.timezone}, H−2/H−1).` });

  });

});

export const liveTickerInputSchema = z.strictObject({ rundownId: z.string().trim().min(1).max(200), immediate: z.boolean().default(false) });



const rundownBaseInputSchema = z.object({

  programName: z.string().trim().min(1).max(80),

  title: z.string().trim().min(1).max(100),

  broadcastSchedule: broadcastScheduleSchema.nullable().default(null),

  ticker: rundownTickerSchema.default(emptyRundownTicker),

  items: z.array(rundownItemInputSchema.extend({

    id: z.string().optional(),

    graphics: z.array(graphicInputSchema.extend({ id: z.string().optional() })).default([])

  })).default([])

});

export const rundownInputSchema = rundownBaseInputSchema.superRefine((value, ctx) => {

  const result = rundownBroadcastSchema.safeParse(value);

  if (!result.success) result.error.issues.forEach(issue => ctx.addIssue({ ...issue }));

});



export const storyInputSchema = rundownItemInputSchema.extend({

  graphics: z.array(graphicInputSchema.extend({ id: z.string().optional() })).default([])

});



export const rundownPatchSchema = z.object({

  programName: z.string().trim().min(1).max(80).optional(),

  title: z.string().trim().min(1).max(100).optional(),

  broadcastSchedule: broadcastScheduleSchema.nullable().optional(), ticker: rundownTickerSchema.optional()

}).refine((data) => Object.keys(data).length > 0, "Minimal satu field harus diisi").meta({ minProperties: 1 });



export const rundownItemPatchSchema = z.object({

  slug: z.string().trim().min(1).max(30).optional(),

  title: z.string().trim().min(1).max(120).optional(),

  format: z.enum(["PKG", "VO", "LIVE", "READER", "LAINNYA"]).optional(),

  cgRequired: z.boolean().optional(),

  estimatedDurationSeconds: z.number().int().min(0).max(21600).optional(),

  sortOrder: z.number().int().nonnegative().optional()

}).refine((data) => Object.keys(data).length > 0, "Minimal satu field harus diisi").meta({ minProperties: 1 });



export const appSettingsSchema = z.strictObject({ outputMode: z.literal("web") });

export const defaultAppSettings = { outputMode: "web" } as const;

export const settingsPatchSchema = appSettingsSchema.partial()

  .refine((data) => data.outputMode !== undefined, "Minimal satu field pengaturan harus diisi").meta({ minProperties: 1 });

export const liveStageInputSchema = z.object({ mode: z.enum(["empty", "logo", "full"]) });

export const actionLogLimitSchema = z.preprocess(

  (value) => typeof value === "string" || typeof value === "number" || value === undefined ? value : NaN,

  z.coerce.number().int().min(1).max(200).default(50)

);



export type GraphicItem = {

  id: string; itemId: string; templateType: TemplateType; sortOrder: number;

  draftFields: Record<string, string>; lastPushedFields: Record<string, string> | null;

};

export type EditableGraphic = Pick<GraphicItem, "templateType" | "draftFields" | "sortOrder"> & { id?: string };

export type RundownItem = {

  id: string; rundownId: string; slug: string; title: string; format: string;

  cgRequired: boolean; estimatedDurationSeconds: number; sortOrder: number; graphics: GraphicItem[];

};

export type Rundown = { id: string; programName: string; title: string; updatedAt: string; items: RundownItem[]; broadcastSchedule?: BroadcastSchedule | null; ticker?: RundownTicker };

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

}).partial().refine((data) => Object.keys(data).length > 0, "Minimal satu field default harus diisi").meta({ minProperties: 1 });

export type HeadlineDefaults = z.infer<typeof headlineDefaultsSchema>;



export const defaultHeadlineDefaults: HeadlineDefaults = {

  headline: "",

  location: "",

  kicker: "",

  subline: ""

};



export const newsAnchorDefaultsSchema = z.object({

  name: z.string().trim().max(graphicFieldLimits.REPORTER.name).default(""),

  role: z.string().trim().max(graphicFieldLimits.REPORTER.role).default("News Anchor")

});

export const newsAnchorDefaultsPatchSchema = z.object({ name: newsAnchorDefaultsSchema.shape.name.removeDefault(),

  role: newsAnchorDefaultsSchema.shape.role.removeDefault() }).partial().strict()

  .refine(data => Object.keys(data).length > 0, "Isi minimal satu field default news anchor").meta({ minProperties: 1 });

export type NewsAnchorDefaults = z.infer<typeof newsAnchorDefaultsSchema>;

export const defaultNewsAnchorDefaults: NewsAnchorDefaults = { name: "", role: "News Anchor" };

export const newsAnchorGraphicId = "newscg:default-news-anchor";

export function createNewsAnchorGraphic(defaults: NewsAnchorDefaults): GraphicItem {

  return { id: newsAnchorGraphicId, itemId: "newscg:defaults", templateType: "REPORTER", sortOrder: 0, lastPushedFields: null,

    draftFields: z.record(z.string(), z.string()).parse(fieldSchemas.REPORTER.parse({ ...defaults, contentMode: "presenter", location: "",

      showLocation: "false", showKicker: "false", showDetail: defaults.role ? "true" : "false",

      layoutStyle: defaults.role ? "sub" : "single" })) };

}



export const reporterDefaultsSchema = z.object({

  name: z.string().trim().max(graphicFieldLimits.REPORTER.name).default(""),

  role: z.string().trim().max(graphicFieldLimits.REPORTER.role).default("Reporter Lapangan"),

  location: z.string().trim().max(graphicFieldLimits.REPORTER.location).default("")

});

export const reporterDefaultsPatchSchema = z.object({

  name: reporterDefaultsSchema.shape.name.removeDefault(),

  role: reporterDefaultsSchema.shape.role.removeDefault(),

  location: reporterDefaultsSchema.shape.location.removeDefault()

}).partial().strict()

  .refine(data => Object.keys(data).length > 0, "Isi minimal satu field default reporter lapangan").meta({ minProperties: 1 });

export type ReporterDefaults = z.infer<typeof reporterDefaultsSchema>;

export const defaultReporterDefaults: ReporterDefaults = { name: "", role: "Reporter Lapangan", location: "" };

export const fieldReporterGraphicId = "newscg:default-field-reporter";

export function createFieldReporterGraphic(defaults: ReporterDefaults): GraphicItem {

  return { id: fieldReporterGraphicId, itemId: "newscg:defaults", templateType: "REPORTER", sortOrder: 0, lastPushedFields: null,

    draftFields: z.record(z.string(), z.string()).parse(fieldSchemas.REPORTER.parse({ name: defaults.name,

      role: defaults.role || "Reporter Lapangan", location: defaults.location, contentMode: "presenter",

      showLocation: defaults.location ? "true" : "false", showKicker: "false",

      showDetail: defaults.role ? "true" : "false", layoutStyle: defaults.role ? "sub" : "single" })) };

}



export type LiveShortcut =

  | "master"

  | "take"

  | "update"

  | "advance"

  | "back"

  | "clear"

  | "clear-all"

  | "logo"

  | "full"

  | "ticker"

  | "headline"

  | "news-anchor"

  | "reporter"

  | "location"

  | "sot"

  | "previous-sot"

  | "next-sot"

  | "topic"

  | "detail"

  | "previous"

  | "next";



// HTTP contracts shared by the routes and the agent API specification.

export const apiIdSchema = z.string().trim().min(1);

const idempotencyBodyShape = { idempotencyKey: z.string().trim().min(1).max(200).optional() };

export const liveNewsAnchorInputSchema = z.object({ ...idempotencyBodyShape,

  action: z.enum(["take", "update"]).default("take"), defaults: newsAnchorDefaultsSchema.optional()

});

export type LiveNewsAnchorInput = z.infer<typeof liveNewsAnchorInputSchema>;

export const liveReporterInputSchema = z.object({ ...idempotencyBodyShape,

  action: z.enum(["take", "update"]).default("take"), defaults: reporterDefaultsSchema.optional()

});

export type LiveReporterInput = z.infer<typeof liveReporterInputSchema>;

export const livePrepareInputSchema = z.object({ graphicId: apiIdSchema });

export const liveTakeInputSchema = livePrepareInputSchema.extend({

  ...idempotencyBodyShape, presentation: z.literal("clean").optional()

});

export const liveUpdateInputSchema = livePrepareInputSchema.extend({

  ...idempotencyBodyShape, syncComposition: z.boolean().optional()

});

export const liveVariantInputSchema = livePrepareInputSchema.extend({

  ...idempotencyBodyShape, action: liveVariantActionSchema

});

export const liveClearInputSchema = z.object(idempotencyBodyShape);

export const liveClearAllInputSchema = liveClearInputSchema.extend({ immediate: z.boolean().default(true) });

export const storySaveInputSchema = storyInputSchema.extend({ itemId: apiIdSchema.nullable().optional() });

export const rundownReorderInputSchema = z.object({ itemIds: z.array(apiIdSchema).min(1).meta({ uniqueItems: true }) })

  .refine(({ itemIds }) => new Set(itemIds).size === itemIds.length, "ID berita tidak boleh berulang");

export const rundownImportInputSchema = z.union([

  rundownInputSchema.safeExtend({ schemaVersion: z.literal(1).optional() }),

  z.object({ schemaVersion: z.literal(1).optional(), exportedAt: z.string().optional(), rundown: rundownInputSchema })

]);



export const graphicRecordSchema = z.object({

  id: apiIdSchema, itemId: apiIdSchema,

  templateType: graphicInputSchema.shape.templateType,

  sortOrder: graphicInputSchema.shape.sortOrder.removeDefault(),

  draftFields: graphicInputSchema.shape.draftFields,

  lastPushedFields: z.record(z.string(), z.string()).nullable()

});

export const rundownItemRecordSchema = rundownItemInputSchema.extend({

  id: apiIdSchema, rundownId: apiIdSchema, cgRequired: z.boolean(), graphics: z.array(graphicRecordSchema)

});

export const rundownRecordSchema = rundownBaseInputSchema.omit({ items: true }).extend({

  id: apiIdSchema, updatedAt: z.string(), items: z.array(rundownItemRecordSchema)

});

export const rundownExportSchema = z.object({ schemaVersion: z.literal(1), exportedAt: z.string(), rundown: rundownRecordSchema });

export const liveStateSchema = z.object({

  connection: z.enum(["CONNECTED", "STANDALONE"]),

  commandStatus: z.enum(["idle", "queued", "pending", "confirmed", "failed", "unknown"]),

  selectedGraphicId: apiIdSchema.nullable(), onAirGraphicId: apiIdSchema.nullable(),

  actualOverlayInputGuid: z.string().nullable(), onAirSnapshot: z.record(z.string(), z.string()).nullable(),

  lastActionAt: z.string().nullable(), error: z.string().nullable(), overlayClientsCount: z.number().int().nonnegative()

});

export const liveCommandResultSchema = z.object({

  commandStatus: liveStateSchema.shape.commandStatus, state: liveStateSchema,

  requestId: z.string().optional(), actualOverlayInputGuid: z.string().nullable().optional(),

  timestamp: z.string().optional(), error: z.string().nullable().optional(), master: masterOverlaySchema.optional()

});

export const apiErrorSchema = z.object({ error: z.string(), details: z.array(z.record(z.string(), z.unknown())).optional() });

export const apiHealthSchema = z.object({ ok: z.literal(true), service: z.literal("NewsCG"), time: z.string() });

export const logoUploadResultSchema = z.object({ url: z.string(), width: z.number().int().positive(), height: z.number().int().positive() });

export const actionLogsSchema = z.array(z.object({

  id: z.string(), action: z.string(), status: z.string(), message: z.string(),

  graphic_id: z.string().nullable(), request_id: z.string().nullable(), created_at: z.string()

}));



export const agentApiEffects = ["read", "edit", "delete", "prepare", "on-air"] as const;

export type AgentApiEffect = (typeof agentApiEffects)[number];

export type AgentApiOperation = {

  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

  path: string;

  operationId: string;

  summary: string;

  description?: string;

  effect: AgentApiEffect;

  requestSchema?: string;

  requestExample?: unknown;

  responseSchema?: string;

  responseContentType?: "text/markdown" | "text/event-stream";

  successStatus?: number;

  idempotency?: boolean;

  bodyRequired?: boolean;

};
