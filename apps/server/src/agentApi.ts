import { z } from "zod";
import {
  actionLogsSchema, apiErrorSchema, apiHealthSchema, appSettingsSchema,
  broadcastColorThemeIds, broadcastColorThemes, broadcastLogoMimeTypes, broadcastLogoUploadSpec, broadcastTemplateIds, broadcastTemplates, weatherForecastSchema,
  fieldSchemas, graphicFieldLimits, graphicInputSchema, graphicPatchSchema, graphicRecordSchema,
  headlineBulletinPreset, headlineDefaultsPatchSchema, headlineDefaultsSchema, liveClearAllInputSchema, liveClearInputSchema,
  liveNewsAnchorInputSchema, liveReporterInputSchema, newsAnchorDefaultsPatchSchema, newsAnchorDefaultsSchema,
  reporterDefaultsPatchSchema, reporterDefaultsSchema,
  liveCommandResultSchema, livePrepareInputSchema, liveStageInputSchema, liveStateSchema,
  liveTakeInputSchema, liveUpdateInputSchema, liveVariantInputSchema, logoUploadResultSchema,
  bccMasterOverlayPatchSchema, masterOverlayPatchSchema, masterOverlaySchema, liveTickerInputSchema, rundownExportSchema, rundownImportInputSchema,
  rundownInputSchema, rundownItemInputSchema, rundownItemPatchSchema, rundownItemRecordSchema,
  rundownPatchSchema, rundownRecordSchema, rundownReorderInputSchema, settingsPatchSchema,
  storySaveInputSchema, templateTypes, tickerSpeedPolicy, weatherLocationSchema,
  type AgentApiOperation
} from "@newscg/shared";

// A single catalog supplies both discovery metadata and OpenAPI operations.
export const agentApiOperations: readonly AgentApiOperation[] = [
  { method: "GET", path: "/api/weather", operationId: "getWeather", summary: "Automated BMKG forecast for a specific adm4 region code", effect: "read", responseSchema: "WeatherForecast" },
  { method: "GET", path: "/api/agent", operationId: "discoverAgentApi", summary: "Discover agent API and documentation", effect: "read", responseSchema: "AgentDiscovery" },
  { method: "GET", path: "/api/agent/openapi.json", operationId: "getOpenApi", summary: "Read OpenAPI specification", effect: "read", responseSchema: "OpenApiDocument" },
  { method: "GET", path: "/api/agent/AGENTS.md", operationId: "getAgentsMd", summary: "Main AGENTS.md guidelines for AI agents", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/agent/guide.md", operationId: "getAgentGuide", summary: "Read complete API guide", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/agent/rundown-guide.md", operationId: "getRundownGuide", summary: "Read user-submitted rundown guide", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/agent/cg-guide.md", operationId: "getCgGuide", summary: "Read CG types, CNN references, and opening headlines guide", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/health", operationId: "getHealth", summary: "Check service health", effect: "read", responseSchema: "Health" },
  { method: "GET", path: "/api/rundowns", operationId: "listRundowns", summary: "List rundowns with stories and CG cues", effect: "read", responseSchema: "RundownList" },
  { method: "POST", path: "/api/rundowns", operationId: "createRundown", summary: "Create a rundown", effect: "edit", requestSchema: "RundownInput", responseSchema: "Rundown", successStatus: 201, description: "New rundowns, stories, and CG cues always receive fresh IDs. IDs from copied data are not reused.", requestExample: { programName: "NEWS LIVE", title: "Evening edition", items: [] } },
  { method: "GET", path: "/api/rundowns/{id}", operationId: "getRundown", summary: "Read a single rundown", effect: "read", responseSchema: "Rundown" },
  { method: "PATCH", path: "/api/rundowns/{id}", operationId: "editRundown", summary: "Edit rundown identity, schedule, or ticker without altering Program", effect: "edit", requestSchema: "RundownPatch", responseSchema: "Rundown", description: "broadcastSchedule contains date/time/timezone; ticker contains text/forDate/sources. Combined validation requires forDate to match broadcast date and each publishedAt to fall within D-2/D-1 based on the schedule timezone. TAKE selects the cue rundown ticker snapshot; POST /api/live/ticker explicitly applies edits.", requestExample: { title: "Revised evening edition" } },
  { method: "DELETE", path: "/api/rundowns/{id}", operationId: "deleteRundown", summary: "Delete a rundown and all its contents", effect: "delete", successStatus: 204 },
  { method: "POST", path: "/api/rundowns/{id}/reorder", operationId: "reorderStories", summary: "Reorder all stories in a rundown", effect: "edit", requestSchema: "RundownReorder", responseSchema: "Rundown", description: "Include each story ID from this rundown exactly once; unrecognized IDs, duplicates, and partial lists are rejected." },
  { method: "PUT", path: "/api/rundowns/{id}/story", operationId: "saveStory", summary: "Add or save a story with its list of CGs", effect: "edit", requestSchema: "StorySave", responseSchema: "RundownItem", description: "Without itemId: add story. With itemId: replace story and CG list; existing CGs omitted from list are deleted. Preserve CG IDs when editing." },
  { method: "GET", path: "/api/rundowns/{id}/export", operationId: "exportRundown", summary: "Export rundown to JSON", effect: "read", responseSchema: "RundownExport" },
  { method: "POST", path: "/api/rundowns/import", operationId: "importRundown", summary: "Import as new rundown with new IDs", effect: "edit", requestSchema: "RundownImport", responseSchema: "Rundown", successStatus: 201, description: "Accepts rundown object or envelope {schemaVersion:1,rundown}. Does not update existing rundowns and is not yet idempotent." },
  { method: "POST", path: "/api/rundowns/{id}/items", operationId: "createStory", summary: "Add a single story", effect: "edit", requestSchema: "RundownItemInput", responseSchema: "RundownItem", successStatus: 201, requestExample: { slug: "NEWS-01", title: "Story title from source", format: "PKG", cgRequired: true, estimatedDurationSeconds: 120, sortOrder: 0 } },
  { method: "GET", path: "/api/items/{id}", operationId: "getStory", summary: "Read a story and all its CG cues", effect: "read", responseSchema: "RundownItem" },
  { method: "PATCH", path: "/api/items/{id}", operationId: "editStory", summary: "Edit partial story data", effect: "edit", requestSchema: "RundownItemPatch", responseSchema: "RundownItem", requestExample: { estimatedDurationSeconds: 150 } },
  { method: "DELETE", path: "/api/items/{id}", operationId: "deleteStory", summary: "Delete a story and its CG cues", effect: "delete", successStatus: 204 },
  { method: "POST", path: "/api/items/{id}/graphics", operationId: "createGraphic", summary: "Add a CG cue to a story", effect: "edit", requestSchema: "GraphicInput", responseSchema: "Graphic", successStatus: 201, requestExample: { templateType: "HEADLINE", sortOrder: 0, draftFields: { headline: "HEADLINE FROM SOURCE", contentMode: "headline", layoutStyle: "single", showLocation: "false", showKicker: "false", showDetail: "false" } } },
  { method: "GET", path: "/api/graphics/{id}", operationId: "getGraphic", summary: "Read stored CG cue", effect: "read", responseSchema: "Graphic" },
  { method: "PATCH", path: "/api/graphics/{id}", operationId: "editGraphic", summary: "Edit CG fields without altering Program", effect: "edit", requestSchema: "GraphicPatch", responseSchema: "Graphic", requestExample: { draftFields: { headline: "REVISED HEADLINE FROM SOURCE" } }, description: "draftFields merged with stored data. Validated against merged template; does not automatically UPDATE live. Modifying templateType of currently on-air cue rejected with 409." },
  { method: "DELETE", path: "/api/graphics/{id}", operationId: "deleteGraphic", summary: "Delete a single CG cue", effect: "delete", successStatus: 204 },
  { method: "GET", path: "/api/settings", operationId: "getSettings", summary: "Read general application settings", effect: "read", responseSchema: "Settings" },
  { method: "PATCH", path: "/api/settings", operationId: "editSettings", summary: "Save web output mode", effect: "edit", requestSchema: "SettingsPatch", responseSchema: "Settings", requestExample: { outputMode: "web" } },
  { method: "GET", path: "/api/settings/headline-defaults", operationId: "getHeadlineDefaults", summary: "Read headline defaults", effect: "read", responseSchema: "HeadlineDefaults" },
  { method: "GET", path: "/api/settings/news-anchor-defaults", operationId: "getNewsAnchorDefaults", summary: "Read default news anchor for all templates", effect: "read", responseSchema: "NewsAnchorDefaults" },
  { method: "PATCH", path: "/api/settings/news-anchor-defaults", operationId: "editNewsAnchorDefaults", summary: "Save default anchor name/role without altering Program", effect: "edit", requestSchema: "NewsAnchorDefaultsPatch", responseSchema: "NewsAnchorDefaults" },
  { method: "GET", path: "/api/settings/reporter-defaults", operationId: "getReporterDefaults", summary: "Read default field reporter (name/role/location) for all templates", effect: "read", responseSchema: "ReporterDefaults" },
  { method: "PATCH", path: "/api/settings/reporter-defaults", operationId: "editReporterDefaults", summary: "Save default field reporter without altering Program", effect: "edit", requestSchema: "ReporterDefaultsPatch", responseSchema: "ReporterDefaults" },
  { method: "PATCH", path: "/api/settings/headline-defaults", operationId: "editHeadlineDefaults", summary: "Edit partial headline defaults", effect: "edit", requestSchema: "HeadlineDefaultsPatch", responseSchema: "HeadlineDefaults", requestExample: { location: "JAKARTA" } },
  { method: "POST", path: "/api/uploads/logo", operationId: "uploadLogo", summary: "Upload logo image; not yet applied to master", effect: "edit", requestSchema: "LogoBinary", responseSchema: "LogoUpload" },
  { method: "GET", path: "/api/live/state", operationId: "getLiveState", summary: "Read live command status and Program snapshot", effect: "read", responseSchema: "LiveState" },
  { method: "GET", path: "/api/live/master", operationId: "getMaster", summary: "Read master logo, ticker, clock, and color theme", effect: "read", responseSchema: "Master" },
  { method: "POST", path: "/api/live/ticker", operationId: "applyRundownTicker", summary: "Apply ticker snapshot from a rundown", effect: "on-air", requestSchema: "LiveTicker", responseSchema: "LiveCommandResult", idempotency: true, description: "Ticker text is stored per rundown, not in global master. Rejects 409 if Program CG originates from another rundown. immediate true resets scroll; identical retries reuse same key." },
  { method: "POST", path: "/api/live/prepare", operationId: "prepareGraphic", summary: "Stage standby cue without taking on-air", effect: "prepare", requestSchema: "LivePrepare", responseSchema: "LiveState" },
  { method: "POST", path: "/api/live/take", operationId: "takeGraphic", summary: "Take stored CG cue on-air", effect: "on-air", requestSchema: "LiveTake", responseSchema: "LiveCommandResult", idempotency: true },
  { method: "POST", path: "/api/live/news-anchor", operationId: "takeNewsAnchor", summary: "TAKE/UPDATE default news anchor without rundown cue", effect: "on-air", requestSchema: "LiveNewsAnchor", responseSchema: "LiveCommandResult", idempotency: true,
    description: "Default action take. Optional defaults payload brings staged Preview snapshot; omitting defaults reads server settings. Preserves active master and ticker. UPDATE only valid while anchor is currently Program." },
  { method: "POST", path: "/api/live/reporter", operationId: "takeFieldReporter", summary: "TAKE/UPDATE default field reporter without rundown cue", effect: "on-air", requestSchema: "LiveReporter", responseSchema: "LiveCommandResult", idempotency: true,
    description: "Default action take. Optional defaults payload brings staged Preview snapshot (name/role/location); omitting defaults reads server settings. Preserves active master and ticker. UPDATE only valid while field reporter is currently Program." },
  { method: "POST", path: "/api/live/update", operationId: "updateLiveGraphic", summary: "Apply stored edits to active on-air CG", effect: "on-air", requestSchema: "LiveUpdate", responseSchema: "LiveCommandResult", idempotency: true },
  { method: "POST", path: "/api/live/variant", operationId: "changeLiveVariant", summary: "Modify active on-air CG composition", effect: "on-air", requestSchema: "LiveVariant", responseSchema: "LiveCommandResult", idempotency: true },
  { method: "POST", path: "/api/live/clear", operationId: "clearGraphic", summary: "Animate lower third off-air", effect: "on-air", requestSchema: "LiveClear", responseSchema: "LiveCommandResult", idempotency: true, bodyRequired: false },
  { method: "POST", path: "/api/live/clear-all", operationId: "clearAllLayers", summary: "Clear all layers; default instant blackout", effect: "on-air", requestSchema: "LiveClearAll", responseSchema: "LiveCommandResult", idempotency: true, bodyRequired: false },
  { method: "POST", path: "/api/live/stage", operationId: "applyStage", summary: "Apply master preset and clear live lower third", effect: "on-air", requestSchema: "LiveStage", responseSchema: "LiveCommandResult", idempotency: true, description: "Directly modifies output: empty/logo/full modes and clears lower thirds. Distinct from local Preview staging." },
  { method: "PATCH", path: "/api/live/master", operationId: "editLiveMaster", summary: "Apply logo, ticker, clock, or color theme directly to output", effect: "on-air", requestSchema: "MasterPatch", responseSchema: "Master" },
  { method: "GET", path: "/api/live/stream", operationId: "observeLiveEvents", summary: "Observe SSE events with monitor role", effect: "read", responseContentType: "text/event-stream", description: "Use ?role=monitor for agents. role=output counts as an output connection, but is not proof of rendered frame." },
  { method: "GET", path: "/api/actions", operationId: "listActions", summary: "Read live command history log", effect: "read", responseSchema: "ActionLogs" }
];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const inputJson = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" });
const outputJson = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-2020-12" });

function buildSchemas() {
  const inputs = {
    RundownInput: rundownInputSchema, RundownPatch: rundownPatchSchema, RundownReorder: rundownReorderInputSchema,
    RundownImport: rundownImportInputSchema, StorySave: storySaveInputSchema,
    RundownItemInput: rundownItemInputSchema, RundownItemPatch: rundownItemPatchSchema,
    GraphicPatch: graphicPatchSchema, SettingsPatch: settingsPatchSchema,
    HeadlineDefaultsPatch: headlineDefaultsPatchSchema, MasterPatch: masterOverlayPatchSchema, BccMasterPatch: bccMasterOverlayPatchSchema,
    NewsAnchorDefaultsPatch: newsAnchorDefaultsPatchSchema, LiveNewsAnchor: liveNewsAnchorInputSchema,
    ReporterDefaultsPatch: reporterDefaultsPatchSchema, LiveReporter: liveReporterInputSchema,
    LivePrepare: livePrepareInputSchema, LiveTake: liveTakeInputSchema, LiveUpdate: liveUpdateInputSchema,
    LiveVariant: liveVariantInputSchema, LiveClear: liveClearInputSchema,
    LiveClearAll: liveClearAllInputSchema, LiveStage: liveStageInputSchema, LiveTicker: liveTickerInputSchema
  };
  const outputs = {
    Health: apiHealthSchema, Error: apiErrorSchema, Rundown: rundownRecordSchema,
    RundownList: z.array(rundownRecordSchema), RundownItem: rundownItemRecordSchema,
    Graphic: graphicRecordSchema, RundownExport: rundownExportSchema,
    Settings: appSettingsSchema, HeadlineDefaults: headlineDefaultsSchema,
    NewsAnchorDefaults: newsAnchorDefaultsSchema, ReporterDefaults: reporterDefaultsSchema,
    Master: masterOverlaySchema, WeatherForecast: weatherForecastSchema, LiveState: liveStateSchema,
    LiveCommandResult: liveCommandResultSchema, LogoUpload: logoUploadResultSchema, ActionLogs: actionLogsSchema
  };
  const fields = Object.fromEntries(templateTypes.map(template => {
    const json = inputJson(fieldSchemas[template]);
    const canonicalVisualTemplate = outputJson(fieldSchemas[template]).properties?.visualTemplate;
    return [`${template}Fields`, {
      ...json, additionalProperties: { type: "string" },
      properties: { ...json.properties, visualTemplate: {
        anyOf: [canonicalVisualTemplate, { type: "string", const: "classic" }], default: "cnn",
        description: "classic is legacy alias for cnn."
      } }
    }];
  }));
  const graphicBase = inputJson(graphicInputSchema);
  const graphicInput = {
    oneOf: templateTypes.map(template => ({
      ...graphicBase,
      properties: { ...graphicBase.properties, templateType: { type: "string", const: template }, draftFields: ref(`${template}Fields`) }
    }))
  };
  // Zod superRefine is runtime-only; expose the template-specific field constraints
  // in JSON Schema as well, including graphics nested inside story/import payloads.
  const withGraphicFields = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withGraphicFields);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    const properties = object.properties as Record<string, unknown> | undefined;
    const required = object.required;
    if (properties?.templateType && properties.draftFields && Array.isArray(required) && required.includes("templateType") && required.includes("draftFields")) {
      return { ...graphicInput, oneOf: graphicInput.oneOf.map(branch => ({ ...branch, properties: { ...branch.properties, ...(properties.id ? { id: properties.id } : {}) } })) };
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, withGraphicFields(item)]));
  };
  const convertedInputs = Object.fromEntries(Object.entries(inputs).map(([name, schema]) => {
    const converted = withGraphicFields(inputJson(schema));
    if (name !== "GraphicPatch") return [name, converted];
    // A PATCH containing only draftFields:{} does not edit anything.
    return [name, { ...(converted as object), anyOf: [
      { required: ["templateType"] }, { required: ["sortOrder"] },
      { required: ["draftFields"], properties: { draftFields: { minProperties: 1 } } }
    ] }];
  }));
  return {
    ...convertedInputs, ...Object.fromEntries(Object.entries(outputs).map(([name, schema]) => [name, outputJson(schema)])),
    ...fields, GraphicInput: graphicInput,
    AgentDiscovery: { type: "object", required: ["service", "apiVersion", "links", "operations"], properties: { service: { const: "NewsCG" }, apiVersion: { const: "1" }, links: { type: "object" }, operations: { type: "array", items: { type: "object" } } }, additionalProperties: true },
    OpenApiDocument: { type: "object", required: ["openapi", "info", "paths"], additionalProperties: true },
    LogoBinary: { type: "string", format: "binary", "x-max-bytes": broadcastLogoUploadSpec.maxBytes }
  };
}

function buildOperation(operation: AgentApiOperation) {
  const parameters: Record<string, unknown>[] = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(match => ({
    name: match[1], in: "path", required: true, schema: { type: "string", minLength: 1 }, description: "ID from API response readback."
  }));
  if (operation.idempotency) parameters.push({
    name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 1, maxLength: 200 },
    description: "Unique idempotency key per action (1-200 characters after trim); identical retries reuse the same key. Reusing key for different action/payload returns 409. Cached for 60 seconds."
  });
  if (operation.operationId === "observeLiveEvents") parameters.push({
    name: "role", in: "query", schema: { type: "string", enum: ["monitor", "output"], default: "output" }, example: "monitor"
  });
  if (operation.operationId === "listActions") parameters.push({
    name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }
  });
  if (operation.operationId === "getWeather") parameters.push({
    name: "adm4", in: "query", required: true, schema: inputJson(weatherLocationSchema.shape.adm4), example: "31.71.03.1001"
  });
  const successStatus = operation.successStatus ?? 200;
  const successResponse = successStatus === 204 ? { description: "Deleted; no body." } : {
    description: operation.effect === "on-air" ? "Command processed by server; inspect commandStatus and error if present." : "Success.",
    content: { [operation.responseContentType ?? "application/json"]: {
      schema: operation.responseSchema ? ref(operation.responseSchema) : { type: "string" }
    } }
  };
  const errorResponse = { description: "Request failed; inspect error and details.", content: { "application/json": { schema: ref("Error") } } };
  return {
    operationId: operation.operationId, summary: operation.summary,
    ...(operation.description ? { description: operation.description } : {}),
    tags: [operation.effect], parameters,
    "x-newscg-effect": operation.effect,
    "x-newscg-requires-live-instruction": operation.effect === "on-air",
    ...(operation.requestSchema ? { requestBody: {
      required: operation.bodyRequired !== false,
      content: operation.requestSchema === "LogoBinary"
        ? Object.fromEntries(broadcastLogoMimeTypes.map(mime => [mime, { schema: ref("LogoBinary") }]))
        : { "application/json": { schema: ref(operation.requestSchema), ...(operation.requestExample ? { example: operation.requestExample } : {}) } }
    } } : {}),
    responses: { [successStatus]: successResponse, "400": errorResponse, "404": errorResponse, "409": errorResponse, "413": errorResponse, "415": errorResponse, "500": errorResponse, ...(operation.operationId === "getWeather" ? { "503": errorResponse } : {}) }
  };
}

export const agentOpenApi = {
  openapi: "3.1.0",
  info: { title: "NewsCG Agent API", version: "1.0.0", description: "NewsCG REST API for reading, adding, editing, deleting, and controlling broadcast graphics. GET does not modify material. Material edits do not automatically affect Program; on-air effects require explicit live operator instructions." },
  servers: [{ url: "/", description: "NewsCG server hosting this specification; default local http://localhost:3001." }],
  security: [],
  paths: Object.fromEntries([...new Set(agentApiOperations.map(operation => operation.path))].map(path => [path,
    Object.fromEntries(agentApiOperations.filter(operation => operation.path === path).map(operation => [operation.method.toLowerCase(), buildOperation(operation)]))
  ])),
  components: { schemas: buildSchemas() }
};

export const agentApiDiscovery = {
  service: "NewsCG", apiVersion: "1",
  links: { openapi: "/api/agent/openapi.json", guide: "/api/agent/guide.md", agentsGuide: "/api/agent/AGENTS.md", rundownGuide: "/api/agent/rundown-guide.md", cgGuide: "/api/agent/cg-guide.md", health: "/api/health" },
  authentication: { type: "none", access: "local-or-controlled-lan" },
  conventions: { contentType: "application/json; charset=utf-8", idSource: "Use IDs returned from API responses; URL-encode every path segment.", fieldValues: "draftFields contain string values, including boolean flags as strings ('true'/'false').", getIsReadOnly: true, deleteSuccessStatus: 204, jsonBodyMaxBytes: 2 * 1024 * 1024 },
  rundownTicker: { scope: "rundown", editPath: "/api/rundowns/{id}", applyPath: "/api/live/ticker", askUserWhenReceivingRundown: true,
    speedPolicy: { ...tickerSpeedPolicy, formula: "round(min_per_headline(clamp(85 - 15D - 10L - 5P, 70, 85)))", defaultMode: "auto",
      description: "D: proportion of words containing digits; L: proportion of words with >10 characters; P: complex punctuation count divided by word count (max 1). Decimal numbers are not counted as punctuation. Manual mode only upon operator request. Persists speedMode and speed on rundown ticker; application propagates speed alongside text." },
    research: "Internet research required for D-2/D-1 based on broadcastSchedule, not rundown content or import date. Save ticker.forDate and sources. No global ticker except for BCC template.",
    materialEditsChangeOutput: false },
  safety: { materialApprovalRequired: false, materialEditsChangeProgram: false, liveEffectsRequireExplicitInstruction: true, observationStream: "/api/live/stream?role=monitor", serverConfirmationProvesRenderedFrame: false, mutationRetry: "Creation/import is not yet idempotent. On timeout, perform readback before retrying. Live commands require a unique Idempotency-Key per action and payload; identical retries reuse the same key, while changing action/payload with the same key returns 409 Conflict. Cached for 60 seconds after completion or until process restart." },
  templates: templateTypes.map(templateType => ({ templateType, fieldsSchema: `#/components/schemas/${templateType}Fields`, fieldLimits: graphicFieldLimits[templateType] })),
  graphicPresets: [{ id: "headline-bulletin", label: "News Highlight", templateType: "HEADLINE", draftFields: headlineBulletinPreset,
    requiredFields: ["headline"], createPath: "/api/items/{id}/graphics", editPath: "/api/graphics/{id}",
    galleryPaths: ["/templates/liputan7", "/templates/cnn", "/templates/bcc"],
    description: "One headline per cue with HIGHLIGHT in the topic tab above the headline (kicker). Arrange multiple cues via sortOrder; advancement is operator-controlled. In Liputan7, the topic tab uses template visuals (burgundy–ivory, sand line) on the top-left of the panel; right/left arrows in Production switch highlight headlines during HIGHLIGHT preview, whereas on regular cues right arrow triggers TAKE/UPDATE and left arrow triggers OUT." }],
  colorThemes: broadcastColorThemeIds.map(id => ({ id, label: broadcastColorThemes[id].label })),
  broadcastTemplates: broadcastTemplateIds.map(id => ({ id, ...broadcastTemplates[id] })),
  weather: { source: "BMKG", path: "/api/weather?adm4={kode_wilayah}", documentation: "https://data.bmkg.go.id/prakiraan-cuaca/", automaticallyAppliesToProgram: false },
  logo: { ...broadcastLogoUploadSpec, mimeTypes: broadcastLogoMimeTypes, recommendedFormat: "Transparent PNG", uploadPath: "/api/uploads/logo", appliesToLiveAutomatically: false },
  operations: agentApiOperations
};
