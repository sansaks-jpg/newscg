import sharp from "sharp";
import { SaxesParser } from "saxes";
import { broadcastLogoUploadSpec } from "@newscg/shared";
import type { BroadcastLogoMimeType, ValidatedLogoImage } from "@newscg/shared";

export class LogoUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "LogoUploadError";
  }
}

function validateSvgCss(value: string) {
  const css = value.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\\|@import\b|@font-face\b/i.test(css)) {
    throw new LogoUploadError("SVG memakai referensi luar atau gaya yang tidak didukung. Ekspor logo SVG mandiri atau PNG transparan.");
  }
  for (const match of css.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const reference = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!reference.startsWith("#")) {
      throw new LogoUploadError("SVG tidak boleh mengambil gambar, font, atau berkas dari luar. Gunakan logo SVG mandiri atau PNG transparan.");
    }
  }
}

function validateStandaloneSvg(input: Buffer) {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new LogoUploadError("Berkas SVG tidak valid. Ekspor ulang logo dengan encoding UTF-8.");
  }
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  const styleText: string[] = [];
  let rootSeen = false;
  parser.on("error", () => {
    throw new LogoUploadError("Struktur berkas SVG tidak valid. Ekspor ulang logo sebagai SVG atau PNG transparan.");
  });
  parser.on("doctype", () => {
    throw new LogoUploadError("SVG dengan deklarasi DOCTYPE tidak didukung. Ekspor logo SVG mandiri atau PNG transparan.");
  });
  parser.on("processinginstruction", () => {
    throw new LogoUploadError("SVG tidak boleh memakai instruksi pemrosesan atau stylesheet luar.");
  });
  parser.on("opentag", (tag) => {
    const name = tag.local.toLowerCase();
    if (!rootSeen) {
      if (name !== "svg" || (tag.uri && tag.uri !== "http://www.w3.org/2000/svg")) {
        throw new LogoUploadError("Isi berkas bukan gambar SVG yang valid.");
      }
      rootSeen = true;
    }
    if (["script", "foreignobject", "animate", "animatemotion", "animatetransform", "set"].includes(name)) {
      throw new LogoUploadError("Logo SVG harus statis tanpa script, animasi, atau konten HTML. Ekspor logo SVG mandiri atau PNG transparan.");
    }
    for (const attribute of Object.values(tag.attributes)) {
      const localName = attribute.local.toLowerCase();
      if (localName.startsWith("on") || (localName === "base" && attribute.uri === "http://www.w3.org/XML/1998/namespace")) {
        throw new LogoUploadError("Logo SVG tidak boleh memuat aksi otomatis atau alamat dasar berkas luar.");
      }
      if ((localName === "href" || localName === "src") && attribute.value && !attribute.value.startsWith("#")) {
        throw new LogoUploadError("SVG tidak boleh mengambil gambar atau berkas dari luar. Gunakan logo SVG mandiri atau PNG transparan.");
      }
      validateSvgCss(attribute.value);
    }
    stack.push(name);
  });
  parser.on("closetag", () => { stack.pop(); });
  parser.on("text", (text) => { if (stack.at(-1) === "style") styleText.push(text); });
  parser.on("cdata", (text) => { if (stack.at(-1) === "style") styleText.push(text); });
  parser.write(source).close();
  if (!rootSeen) throw new LogoUploadError("Berkas SVG kosong atau tidak valid.");
  validateSvgCss(styleText.join(""));
}

export async function validateLogoImage(input: Buffer, mimeType: BroadcastLogoMimeType): Promise<ValidatedLogoImage> {
  if (input.length === 0) throw new LogoUploadError("File gambar logo kosong. Pilih gambar PNG, JPEG, WebP, atau SVG.");
  if (input.length > broadcastLogoUploadSpec.maxBytes) throw new LogoUploadError("Ukuran logo melebihi batas 2 MB.", 413);
  if (mimeType === "image/svg+xml") validateStandaloneSvg(input);

  const formats = {
    "image/png": { format: "png", extension: "png" },
    "image/jpeg": { format: "jpeg", extension: "jpg" },
    "image/webp": { format: "webp", extension: "webp" },
    "image/svg+xml": { format: "svg", extension: "svg" }
  } as const;
  try {
    const image = sharp(input, { failOn: "warning", limitInputPixels: broadcastLogoUploadSpec.maxPixels })
      .timeout({ seconds: broadcastLogoUploadSpec.decodeTimeoutSeconds });
    const metadata = await image.metadata();
    if (metadata.format !== formats[mimeType].format) throw new LogoUploadError("Isi gambar tidak sesuai dengan format file. Pilih ulang logo PNG, JPEG, WebP, atau SVG yang valid.");
    if (!metadata.width || !metadata.height || metadata.width > broadcastLogoUploadSpec.maxDimension || metadata.height > broadcastLogoUploadSpec.maxDimension) {
      throw new LogoUploadError(`Dimensi logo tidak valid atau terlalu besar. Batas ${broadcastLogoUploadSpec.maxDimension} × ${broadcastLogoUploadSpec.maxDimension} px; disarankan ${broadcastLogoUploadSpec.width} × ${broadcastLogoUploadSpec.height} px.`);
    }
    if ((metadata.pages ?? 1) > 1) throw new LogoUploadError("Logo animasi tidak didukung. Gunakan gambar logo statis.");
    // Metadata alone accepts some truncated files; decode pixels before saving.
    await image.raw().toBuffer();
    return { extension: formats[mimeType].extension, width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof LogoUploadError) throw error;
    throw new LogoUploadError("Gambar logo rusak, terpotong, atau melebihi batas pemrosesan. Ekspor ulang sebagai PNG, JPEG, WebP, atau SVG yang valid.");
  }
}
