import { z } from "zod";
import {
  actionLogsSchema, apiErrorSchema, apiHealthSchema, appSettingsSchema,
  broadcastColorThemeIds, broadcastColorThemes, broadcastLogoMimeTypes, broadcastLogoUploadSpec,
  fieldSchemas, graphicFieldLimits, graphicInputSchema, graphicPatchSchema, graphicRecordSchema,
  headlineBulletinPreset, headlineDefaultsPatchSchema, headlineDefaultsSchema, liveClearAllInputSchema, liveClearInputSchema,
  liveCommandResultSchema, livePrepareInputSchema, liveStageInputSchema, liveStateSchema,
  liveTakeInputSchema, liveUpdateInputSchema, liveVariantInputSchema, logoUploadResultSchema,
  masterOverlayPatchSchema, masterOverlaySchema, rundownExportSchema, rundownImportInputSchema,
  rundownInputSchema, rundownItemInputSchema, rundownItemPatchSchema, rundownItemRecordSchema,
  rundownPatchSchema, rundownRecordSchema, rundownReorderInputSchema, settingsPatchSchema,
  storySaveInputSchema, templateTypes,
  type AgentApiOperation
} from "@newscg/shared";

// A single catalog supplies both discovery metadata and OpenAPI operations.
export const agentApiOperations: readonly AgentApiOperation[] = [
  { method: "GET", path: "/api/agent", operationId: "discoverAgentApi", summary: "Temukan API dan panduan agent", effect: "read", responseSchema: "AgentDiscovery" },
  { method: "GET", path: "/api/agent/openapi.json", operationId: "getOpenApi", summary: "Baca spesifikasi OpenAPI", effect: "read", responseSchema: "OpenApiDocument" },
  { method: "GET", path: "/api/agent/guide.md", operationId: "getAgentGuide", summary: "Baca panduan seluruh API", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/agent/rundown-guide.md", operationId: "getRundownGuide", summary: "Baca panduan rundown kiriman user", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/agent/cg-guide.md", operationId: "getCgGuide", summary: "Baca jenis CG, riset CNN, dan headline pembuka", effect: "read", responseContentType: "text/markdown" },
  { method: "GET", path: "/api/health", operationId: "getHealth", summary: "Periksa layanan", effect: "read", responseSchema: "Health" },
  { method: "GET", path: "/api/rundowns", operationId: "listRundowns", summary: "Daftar rundown beserta berita dan CG", effect: "read", responseSchema: "RundownList" },
  { method: "POST", path: "/api/rundowns", operationId: "createRundown", summary: "Buat rundown", effect: "edit", requestSchema: "RundownInput", responseSchema: "Rundown", successStatus: 201, requestExample: { programName: "NEWS LIVE", title: "Edisi sore", items: [] } },
  { method: "GET", path: "/api/rundowns/{id}", operationId: "getRundown", summary: "Baca satu rundown", effect: "read", responseSchema: "Rundown" },
  { method: "PATCH", path: "/api/rundowns/{id}", operationId: "editRundown", summary: "Edit nama program atau judul rundown", effect: "edit", requestSchema: "RundownPatch", responseSchema: "Rundown", requestExample: { title: "Edisi sore revisi" } },
  { method: "DELETE", path: "/api/rundowns/{id}", operationId: "deleteRundown", summary: "Hapus rundown dan seluruh isinya", effect: "delete", successStatus: 204 },
  { method: "POST", path: "/api/rundowns/{id}/reorder", operationId: "reorderStories", summary: "Atur ulang urutan semua berita", effect: "edit", requestSchema: "RundownReorder", responseSchema: "Rundown", description: "Sertakan setiap ID berita dari rundown ini tepat sekali; ID asing, duplikat, dan daftar parsial ditolak." },
  { method: "PUT", path: "/api/rundowns/{id}/story", operationId: "saveStory", summary: "Tambah atau simpan berita beserta daftar CG", effect: "edit", requestSchema: "StorySave", responseSchema: "RundownItem", description: "Tanpa itemId: tambah berita. Dengan itemId: ganti data berita dan daftar CG; CG lama yang tidak disertakan akan dihapus. Pertahankan ID CG saat mengedit." },
  { method: "GET", path: "/api/rundowns/{id}/export", operationId: "exportRundown", summary: "Ekspor rundown ke JSON", effect: "read", responseSchema: "RundownExport" },
  { method: "POST", path: "/api/rundowns/import", operationId: "importRundown", summary: "Impor menjadi rundown baru dengan ID baru", effect: "edit", requestSchema: "RundownImport", responseSchema: "Rundown", successStatus: 201, description: "Menerima objek rundown atau envelope {schemaVersion:1,rundown}. Tidak memperbarui rundown lama dan belum idempotent." },
  { method: "POST", path: "/api/rundowns/{id}/items", operationId: "createStory", summary: "Tambah satu berita", effect: "edit", requestSchema: "RundownItemInput", responseSchema: "RundownItem", successStatus: 201, requestExample: { slug: "NEWS-01", title: "Judul sesuai sumber", format: "PKG", cgRequired: true, estimatedDurationSeconds: 120, sortOrder: 0 } },
  { method: "GET", path: "/api/items/{id}", operationId: "getStory", summary: "Baca berita dan seluruh CG-nya", effect: "read", responseSchema: "RundownItem" },
  { method: "PATCH", path: "/api/items/{id}", operationId: "editStory", summary: "Edit sebagian data berita", effect: "edit", requestSchema: "RundownItemPatch", responseSchema: "RundownItem", requestExample: { estimatedDurationSeconds: 150 } },
  { method: "DELETE", path: "/api/items/{id}", operationId: "deleteStory", summary: "Hapus berita dan CG-nya", effect: "delete", successStatus: 204 },
  { method: "POST", path: "/api/items/{id}/graphics", operationId: "createGraphic", summary: "Tambah CG ke berita", effect: "edit", requestSchema: "GraphicInput", responseSchema: "Graphic", successStatus: 201, requestExample: { templateType: "HEADLINE", sortOrder: 0, draftFields: { headline: "JUDUL SESUAI SUMBER", contentMode: "headline", layoutStyle: "single", showLocation: "false", showKicker: "false", showDetail: "false" } } },
  { method: "GET", path: "/api/graphics/{id}", operationId: "getGraphic", summary: "Baca CG tersimpan", effect: "read", responseSchema: "Graphic" },
  { method: "PATCH", path: "/api/graphics/{id}", operationId: "editGraphic", summary: "Edit field CG tanpa mengubah Program", effect: "edit", requestSchema: "GraphicPatch", responseSchema: "Graphic", requestExample: { draftFields: { headline: "JUDUL REVISI SESUAI SUMBER" } }, description: "draftFields digabung dengan data tersimpan. Validasi memakai template hasil gabungan; perubahan tidak otomatis UPDATE live. Mengganti templateType cue yang sedang Program ditolak 409." },
  { method: "DELETE", path: "/api/graphics/{id}", operationId: "deleteGraphic", summary: "Hapus satu CG", effect: "delete", successStatus: 204 },
  { method: "GET", path: "/api/settings", operationId: "getSettings", summary: "Baca pengaturan umum", effect: "read", responseSchema: "Settings" },
  { method: "PATCH", path: "/api/settings", operationId: "editSettings", summary: "Simpan outputMode web", effect: "edit", requestSchema: "SettingsPatch", responseSchema: "Settings", requestExample: { outputMode: "web" } },
  { method: "GET", path: "/api/settings/headline-defaults", operationId: "getHeadlineDefaults", summary: "Baca nilai awal headline", effect: "read", responseSchema: "HeadlineDefaults" },
  { method: "PATCH", path: "/api/settings/headline-defaults", operationId: "editHeadlineDefaults", summary: "Edit sebagian nilai awal headline", effect: "edit", requestSchema: "HeadlineDefaultsPatch", responseSchema: "HeadlineDefaults", requestExample: { location: "JAKARTA" } },
  { method: "POST", path: "/api/uploads/logo", operationId: "uploadLogo", summary: "Unggah gambar logo; belum diterapkan ke master", effect: "edit", requestSchema: "LogoBinary", responseSchema: "LogoUpload" },
  { method: "GET", path: "/api/live/state", operationId: "getLiveState", summary: "Baca status perintah dan snapshot Program", effect: "read", responseSchema: "LiveState" },
  { method: "GET", path: "/api/live/master", operationId: "getMaster", summary: "Baca master logo, ticker, jam, dan warna", effect: "read", responseSchema: "Master" },
  { method: "POST", path: "/api/live/prepare", operationId: "prepareGraphic", summary: "Pilih cue standby tanpa menayangkan", effect: "prepare", requestSchema: "LivePrepare", responseSchema: "LiveState" },
  { method: "POST", path: "/api/live/take", operationId: "takeGraphic", summary: "Tayangkan CG tersimpan", effect: "on-air", requestSchema: "LiveTake", responseSchema: "LiveCommandResult", idempotency: true },
  { method: "POST", path: "/api/live/update", operationId: "updateLiveGraphic", summary: "Terapkan edit tersimpan ke CG live", effect: "on-air", requestSchema: "LiveUpdate", responseSchema: "LiveCommandResult", idempotency: true },
  { method: "POST", path: "/api/live/variant", operationId: "changeLiveVariant", summary: "Ubah komposisi CG live", effect: "on-air", requestSchema: "LiveVariant", responseSchema: "LiveCommandResult", idempotency: true },
  { method: "POST", path: "/api/live/clear", operationId: "clearGraphic", summary: "Tarik lower third keluar", effect: "on-air", requestSchema: "LiveClear", responseSchema: "LiveCommandResult", idempotency: true, bodyRequired: false },
  { method: "POST", path: "/api/live/clear-all", operationId: "clearAllLayers", summary: "Tarik seluruh layer; default blackout instan", effect: "on-air", requestSchema: "LiveClearAll", responseSchema: "LiveCommandResult", idempotency: true, bodyRequired: false },
  { method: "POST", path: "/api/live/stage", operationId: "applyStage", summary: "Terapkan preset master dan hapus lower third live", effect: "on-air", requestSchema: "LiveStage", responseSchema: "LiveCommandResult", idempotency: true, description: "Operasi ini langsung mengubah output: mode empty/logo/full dan membersihkan lower third. Bukan staging Preview lokal." },
  { method: "PATCH", path: "/api/live/master", operationId: "editLiveMaster", summary: "Terapkan logo, ticker, jam, atau warna langsung ke output", effect: "on-air", requestSchema: "MasterPatch", responseSchema: "Master" },
  { method: "GET", path: "/api/live/stream", operationId: "observeLiveEvents", summary: "Amati event SSE dengan role monitor", effect: "read", responseContentType: "text/event-stream", description: "Gunakan ?role=monitor untuk agent. role=output dihitung sebagai koneksi output, tetapi bukan bukti frame telah dirender." },
  { method: "GET", path: "/api/actions", operationId: "listActions", summary: "Baca riwayat perintah live", effect: "read", responseSchema: "ActionLogs" }
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
    HeadlineDefaultsPatch: headlineDefaultsPatchSchema, MasterPatch: masterOverlayPatchSchema,
    LivePrepare: livePrepareInputSchema, LiveTake: liveTakeInputSchema, LiveUpdate: liveUpdateInputSchema,
    LiveVariant: liveVariantInputSchema, LiveClear: liveClearInputSchema,
    LiveClearAll: liveClearAllInputSchema, LiveStage: liveStageInputSchema
  };
  const outputs = {
    Health: apiHealthSchema, Error: apiErrorSchema, Rundown: rundownRecordSchema,
    RundownList: z.array(rundownRecordSchema), RundownItem: rundownItemRecordSchema,
    Graphic: graphicRecordSchema, RundownExport: rundownExportSchema,
    Settings: appSettingsSchema, HeadlineDefaults: headlineDefaultsSchema,
    Master: masterOverlaySchema, LiveState: liveStateSchema,
    LiveCommandResult: liveCommandResultSchema, LogoUpload: logoUploadResultSchema, ActionLogs: actionLogsSchema
  };
  const fields = Object.fromEntries(templateTypes.map(template => {
    const json = inputJson(fieldSchemas[template]);
    const canonicalVisualTemplate = outputJson(fieldSchemas[template]).properties?.visualTemplate;
    return [`${template}Fields`, {
      ...json, additionalProperties: { type: "string" },
      properties: { ...json.properties, visualTemplate: {
        anyOf: [canonicalVisualTemplate, { type: "string", const: "classic" }], default: "cnn",
        description: "classic adalah alias lama untuk cnn."
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
  const convertedInputs = Object.fromEntries(Object.entries(inputs).map(([name, schema]) => [name, withGraphicFields(inputJson(schema))]));
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
    name: match[1], in: "path", required: true, schema: { type: "string", minLength: 1 }, description: "ID hasil readback API."
  }));
  if (operation.idempotency) parameters.push({
    name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" },
    description: "Gunakan key unik per aksi; retry aksi yang sama memakai key yang sama. Cache 60 detik dalam proses server."
  });
  if (operation.operationId === "observeLiveEvents") parameters.push({
    name: "role", in: "query", schema: { type: "string", enum: ["monitor", "output"], default: "output" }, example: "monitor"
  });
  if (operation.operationId === "listActions") parameters.push({
    name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }
  });
  const successStatus = operation.successStatus ?? 200;
  const successResponse = successStatus === 204 ? { description: "Terhapus; tidak ada body." } : {
    description: operation.effect === "on-air" ? "Perintah diproses server; periksa commandStatus dan error jika tersedia." : "Berhasil.",
    content: { [operation.responseContentType ?? "application/json"]: {
      schema: operation.responseSchema ? ref(operation.responseSchema) : { type: "string" }
    } }
  };
  const errorResponse = { description: "Permintaan gagal; baca error dan details.", content: { "application/json": { schema: ref("Error") } } };
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
    responses: { [successStatus]: successResponse, "400": errorResponse, "404": errorResponse, "409": errorResponse, "413": errorResponse, "415": errorResponse, "500": errorResponse }
  };
}

export const agentOpenApi = {
  openapi: "3.1.0",
  info: { title: "NewsCG Agent API", version: "1.0.0", description: "REST API NewsCG untuk baca, tambah, edit, hapus, dan kontrol siaran. GET tidak mengubah materi. Perubahan materi tidak otomatis diterapkan ke Program; efek on-air membutuhkan instruksi live dari operator." },
  servers: [{ url: "/", description: "Server NewsCG tempat spesifikasi ini diambil; default lokal http://localhost:3001." }],
  security: [],
  paths: Object.fromEntries([...new Set(agentApiOperations.map(operation => operation.path))].map(path => [path,
    Object.fromEntries(agentApiOperations.filter(operation => operation.path === path).map(operation => [operation.method.toLowerCase(), buildOperation(operation)]))
  ])),
  components: { schemas: buildSchemas() }
};

export const agentApiDiscovery = {
  service: "NewsCG", apiVersion: "1",
  links: { openapi: "/api/agent/openapi.json", guide: "/api/agent/guide.md", rundownGuide: "/api/agent/rundown-guide.md", cgGuide: "/api/agent/cg-guide.md", health: "/api/health" },
  authentication: { type: "none", access: "local-or-controlled-lan" },
  conventions: { contentType: "application/json; charset=utf-8", idSource: "Gunakan ID dari respons API; encode setiap segmen ID di URL.", fieldValues: "draftFields berisi string, termasuk flag true/false sebagai string.", getIsReadOnly: true, deleteSuccessStatus: 204, jsonBodyMaxBytes: 2 * 1024 * 1024 },
  safety: { materialApprovalRequired: false, materialEditsChangeProgram: false, liveEffectsRequireExplicitInstruction: true, observationStream: "/api/live/stream?role=monitor", serverConfirmationProvesRenderedFrame: false, mutationRetry: "Pembuatan/impor belum idempotent. Setelah timeout, lakukan readback sebelum retry. Perintah live memakai Idempotency-Key; key unik per aksi, cache 60 detik sampai proses restart." },
  templates: templateTypes.map(templateType => ({ templateType, fieldsSchema: `#/components/schemas/${templateType}Fields`, fieldLimits: graphicFieldLimits[templateType] })),
  graphicPresets: [{ id: "headline-bulletin", label: "Headline Pembuka", templateType: "HEADLINE", draftFields: headlineBulletinPreset,
    requiredFields: ["headline"], createPath: "/api/items/{id}/graphics", editPath: "/api/graphics/{id}",
    description: "Satu judul per cue dengan label HEADLINE. Susun beberapa cue melalui sortOrder; pergantian dilakukan operator." }],
  colorThemes: broadcastColorThemeIds.map(id => ({ id, label: broadcastColorThemes[id].label })),
  logo: { ...broadcastLogoUploadSpec, mimeTypes: broadcastLogoMimeTypes, recommendedFormat: "PNG transparan", uploadPath: "/api/uploads/logo", appliesToLiveAutomatically: false },
  operations: agentApiOperations
};
