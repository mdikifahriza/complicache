"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/media/index.ts
var media_exports = {};
__export(media_exports, {
  ATTACHMENT_EXTS: () => ATTACHMENT_EXTS,
  CACHE_POLICIES: () => CACHE_POLICIES,
  DEFAULT_MAX_UPLOAD_BYTES: () => DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_PRESETS: () => DEFAULT_PRESETS,
  DiskStorageEngine: () => DiskStorageEngine,
  EXT_BY_MIME: () => EXT_BY_MIME,
  INTERNAL_PREFIX: () => INTERNAL_PREFIX,
  MAGIC_BYTES_LENGTH: () => MAGIC_BYTES_LENGTH,
  MIME_BY_EXT: () => MIME_BY_EXT,
  MIME_TO_KIND: () => MIME_TO_KIND,
  MIN_SWEEP_GRACE_MS: () => MIN_SWEEP_GRACE_MS,
  MediaValidationError: () => MediaValidationError,
  PRIVATE_PREFIX: () => PRIVATE_PREFIX,
  RANGE_CAPABLE_EXTS: () => RANGE_CAPABLE_EXTS,
  S3StorageEngine: () => S3StorageEngine,
  createMediaStorage: () => createMediaStorage,
  detectMediaKind: () => detectMediaKind,
  extractRouteKey: () => extractRouteKey,
  generateStorageKey: () => generateStorageKey,
  isPrivateKey: () => isPrivateKey,
  matchesMagicBytes: () => matchesMagicBytes,
  parseDuration: () => parseDuration,
  processImageBuffer: () => processImageBuffer,
  safeRelativeKey: () => safeRelativeKey,
  sanitizeFolder: () => sanitizeFolder,
  serveMedia: () => serveMedia,
  stripSvgScripts: () => stripSvgScripts,
  sweepStorage: () => sweepStorage
});
module.exports = __toCommonJS(media_exports);

// src/media/constants.ts
var CACHE_POLICIES = {
  /**
   * Kunci unik / UUID / hash tidak pernah berubah isinya.
   * Aman di-cache 1 tahun (31536000 detik) di browser, Cloudflare, dan Vercel Image Optimization.
   */
  immutable: "public, max-age=31536000, immutable",
  /**
   * Berkas privat per-pengguna (surat, KTA, invoice, mutasi).
   * Browser menyimpan 5 menit untuk responsivitas, tetapi tidak disimpan di CDN publik.
   */
  private: "private, max-age=300, stale-while-revalidate=60",
  /**
   * Khusus berkas dengan nama/path statis yang mungkin diperbarui isinya di masa depan.
   */
  mutable: "public, max-age=60, must-revalidate"
};
var DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
var DEFAULT_PRESETS = {
  avatar: { width: 400, height: 400, fit: "cover", quality: 80 },
  cover: { width: 1920, height: 1080, fit: "inside", quality: 75 },
  thumb: { width: 480, height: 320, fit: "cover", quality: 70 },
  raw: { width: 2400, height: 2400, fit: "inside", quality: 80 }
};
var EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/plain": "txt",
  "text/csv": "csv"
};
var MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".csv": "text/csv"
};
var RANGE_CAPABLE_EXTS = /* @__PURE__ */ new Set([".mp4", ".webm", ".ogg", ".mp3"]);
var ATTACHMENT_EXTS = /* @__PURE__ */ new Set([".doc", ".docx", ".zip", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"]);
var MIME_TO_KIND = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "image/avif": "IMAGE",
  "image/gif": "IMAGE",
  "image/svg+xml": "IMAGE",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "application/pdf": "DOCUMENT",
  "application/msword": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCUMENT",
  "application/vnd.ms-excel": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "DOCUMENT",
  "application/vnd.ms-powerpoint": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "DOCUMENT",
  "application/zip": "DOCUMENT",
  "application/x-zip-compressed": "DOCUMENT",
  "text/plain": "DOCUMENT",
  "text/csv": "DOCUMENT"
};

// src/media/keys.ts
var import_node_crypto = require("crypto");
var import_node_path = __toESM(require("path"), 1);
var INTERNAL_PREFIX = "internal/";
var PRIVATE_PREFIX = "private/";
function sanitizeFolder(folder) {
  if (!folder) return "umum";
  return folder.toLowerCase().replace(/[^a-z0-9/-]/g, "-").replace(/-+/g, "-").replace(/\/+/g, "/").replace(/^[-/]+|[-/]+$/g, "").slice(0, 60) || "umum";
}
function generateStorageKey(options) {
  const now = options.date ?? /* @__PURE__ */ new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = options.ext.replace(/^\./, "").toLowerCase() || "bin";
  const randomHex = (0, import_node_crypto.randomBytes)(8).toString("hex");
  const filename = `${randomHex}.${ext}`;
  let folder = sanitizeFolder(options.folder);
  if (!options.isPrivate) {
    if (folder === "internal" || folder.startsWith("internal/")) {
      folder = `pub-${folder}`;
    } else if (folder === "private" || folder.startsWith("private/")) {
      folder = `pub-${folder}`;
    }
  }
  const relative = import_node_path.default.posix.join(folder, yyyy, mm, filename);
  const key = options.isPrivate ? `${INTERNAL_PREFIX}${relative}` : relative;
  return { key, filename };
}
function isPrivateKey(key) {
  const normalized = key.replace(/^[/\\]+/, "").toLowerCase();
  return normalized === "internal" || normalized.startsWith(INTERNAL_PREFIX) || normalized === "private" || normalized.startsWith(PRIVATE_PREFIX);
}
function safeRelativeKey(input) {
  if (!input) return "";
  const withoutQuery = input.split("?")[0] ?? "";
  let candidate = withoutQuery;
  if (candidate.includes("://")) {
    try {
      const url = new URL(candidate);
      candidate = url.pathname;
    } catch {
      return "";
    }
  }
  candidate = candidate.replace(/^[/\\]+/, "");
  if (candidate.startsWith("media/")) {
    candidate = candidate.slice("media/".length);
  }
  if (!candidate) return "";
  const normalized = import_node_path.default.posix.normalize(candidate);
  if (normalized.startsWith("..") || normalized.includes("/../")) {
    return "";
  }
  return normalized;
}

// src/media/validator.ts
var MediaValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MediaValidationError";
  }
};
var MAGIC_BYTES_LENGTH = 128;
function parseFtyp(b) {
  if (b.length < 12 || b.subarray(4, 8).toString("latin1") !== "ftyp") return null;
  const boxSize = b.readUInt32BE(0);
  const end = boxSize >= 16 ? Math.min(boxSize, b.length) : b.length;
  const major = b.subarray(8, 12).toString("latin1");
  const compatible = [];
  for (let i = 16; i + 4 <= end; i += 4) {
    compatible.push(b.subarray(i, i + 4).toString("latin1"));
  }
  return { major, compatible };
}
var AVIF_BRANDS = /* @__PURE__ */ new Set(["avif", "avis"]);
var HEIF_GENERIC_BRANDS = /* @__PURE__ */ new Set(["mif1", "msf1", "miaf"]);
function isAvif(b) {
  const ftyp = parseFtyp(b);
  if (!ftyp) return false;
  if (AVIF_BRANDS.has(ftyp.major)) return true;
  return HEIF_GENERIC_BRANDS.has(ftyp.major) && ftyp.compatible.some((c) => AVIF_BRANDS.has(c));
}
var MP4_MAJOR_BRANDS = /* @__PURE__ */ new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "iso7",
  "iso8",
  "iso9",
  "mp41",
  "mp42",
  "mp71",
  "avc1",
  "dash",
  "mmp4",
  "msnv",
  "xavc",
  "m4v ",
  "m4vh",
  "m4vp"
]);
var NON_MP4_MAJOR_BRANDS = /* @__PURE__ */ new Set([
  "m4a ",
  "m4b ",
  "m4p ",
  "f4a ",
  "qt  ",
  "crx ",
  "jp2 ",
  "jpx ",
  "jpm ",
  "avif",
  "avis",
  "mif1",
  "msf1",
  "miaf",
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs"
]);
function isMp4(b) {
  const ftyp = parseFtyp(b);
  if (!ftyp) return false;
  const major = ftyp.major.toLowerCase();
  if (NON_MP4_MAJOR_BRANDS.has(major) || major.startsWith("3gp") || major.startsWith("3g2")) {
    return false;
  }
  if (MP4_MAJOR_BRANDS.has(major)) return true;
  return ftyp.compatible.some((c) => MP4_MAJOR_BRANDS.has(c.toLowerCase()));
}
function matchesMagicBytes(buffer, mimeType) {
  if (buffer.length < 4) return false;
  const b = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  const ascii = (start, end) => b.subarray(start, end).toString("latin1");
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return b[0] === 255 && b[1] === 216 && b[2] === 255;
    case "image/png":
      return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
    case "image/gif":
      return ascii(0, 3) === "GIF";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/avif":
      return isAvif(b);
    case "image/svg+xml":
      return /\<svg[\s>]/i.test(b.subarray(0, 1024).toString("utf8"));
    case "video/mp4":
      return isMp4(b);
    case "video/webm":
      return b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163;
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "application/msword":
      return b[0] === 208 && b[1] === 207 && b[2] === 17 && b[3] === 224;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/zip":
    case "application/x-zip-compressed":
      return b[0] === 80 && b[1] === 75;
    // PK
    case "text/plain":
    case "text/csv":
      return !b.subarray(0, 512).includes(0);
    default:
      return true;
  }
}
function stripSvgScripts(svgText) {
  let cleaned = svgText;
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<script[^>]*\/?\s*>/gi, "");
  cleaned = cleaned.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  cleaned = cleaned.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const jsUriPattern = /\b(href|xlink:href|src|action|formaction)\s*=\s*(?:"[^"]*?(?:javascript\s*:|&#(?:x0*6a|0*106);|&#(?:x0*4a|0*74);)[^"]*"|'[^']*?(?:javascript\s*:|&#(?:x0*6a|0*106);|&#(?:x0*4a|0*74);)[^']*')/gi;
  cleaned = cleaned.replace(jsUriPattern, "");
  cleaned = cleaned.replace(/\b(href|xlink:href)\s*=\s*(?:"[^"]*data:[^"]*"|'[^']*data:[^']*')/gi, "");
  cleaned = cleaned.replace(/<set\b[^>]*attributeName\s*=\s*["'](?:href|xlink:href)["'][^>]*\/?>/gi, "");
  cleaned = cleaned.replace(/<animate\b[^>]*attributeName\s*=\s*["'](?:href|xlink:href)["'][^>]*\/?>/gi, "");
  cleaned = cleaned.replace(/<set\b[^>]*to\s*=\s*["'][^"']*javascript:[^"']*["'][^>]*\/?>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, (styleBlock) => {
    let sanitized = styleBlock.replace(/@import\b[^;]*;?/gi, "/* @import removed */");
    sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, "/* expression removed */");
    sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*(?:javascript|data)\s*:[^)]*\)/gi, "/* url removed */");
    return sanitized;
  });
  return cleaned;
}
function detectMediaKind(mimeType) {
  return MIME_TO_KIND[mimeType.toLowerCase()] ?? "DOCUMENT";
}

// src/media/processor.ts
var sharpModule = null;
async function loadSharp() {
  if (sharpModule) return sharpModule;
  try {
    const loaded = await import("sharp");
    sharpModule = loaded.default ?? loaded;
    return sharpModule;
  } catch {
    throw new Error(
      "Pemrosesan gambar membutuhkan library 'sharp'. Silakan install dengan: npm install sharp"
    );
  }
}
async function processImageBuffer(input, preset) {
  const sharp = await loadSharp();
  const buf = input instanceof Buffer ? input : Buffer.from(input);
  const width = preset?.width ?? 2e3;
  const height = preset?.height ?? 2e3;
  const quality = preset?.quality ?? 75;
  const fit = preset?.fit ?? "inside";
  try {
    const pipeline = sharp(buf, {
      animated: true,
      limitInputPixels: 268402689
    }).rotate().resize({
      width,
      height,
      fit,
      withoutEnlargement: true
    }).webp({
      quality,
      effort: 4
    });
    const processedBuffer = await pipeline.toBuffer();
    const meta = await sharp(processedBuffer).metadata();
    return {
      buffer: processedBuffer,
      mimeType: "image/webp",
      width: meta.width ?? null,
      height: meta.height ?? null
    };
  } catch (err) {
    throw new Error(`Gagal memproses gambar: ${err?.message || "File rusak atau tidak didukung"}`);
  }
}

// src/media/serve.ts
async function extractRouteKey(request, context) {
  if (typeof context === "string") {
    return safeRelativeKey(context);
  }
  if (context && "params" in context) {
    const resolvedParams = await Promise.resolve(context.params);
    const rawPath = resolvedParams.path;
    if (Array.isArray(rawPath)) {
      return safeRelativeKey(rawPath.join("/"));
    }
    if (typeof rawPath === "string") {
      return safeRelativeKey(rawPath);
    }
  }
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const mediaIdx = pathname.indexOf("/media/");
    if (mediaIdx >= 0) {
      return safeRelativeKey(pathname.slice(mediaIdx + "/media/".length));
    }
    return safeRelativeKey(pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}
async function serveMedia(request, keyOrContext, storage, options) {
  const relativeKey = await extractRouteKey(request, keyOrContext);
  if (!relativeKey) {
    return new Response("Media Not Found", { status: 404 });
  }
  const isPrivate = isPrivateKey(relativeKey);
  if (isPrivate) {
    if (!options?.authorize) {
      return new Response("Media Not Found", { status: 404 });
    }
    const authResult = await options.authorize(request, relativeKey);
    if (authResult instanceof Response) {
      return authResult;
    }
    if (!authResult) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  try {
    const range = request.headers.get("range") ?? void 0;
    const result = await storage.read(relativeKey, range);
    if (result.status === 416) {
      const headers416 = new Headers({
        "Content-Range": result.contentRange || `bytes */${result.contentLength}`,
        "Accept-Ranges": "bytes"
      });
      return new Response(null, { status: 416, headers: headers416 });
    }
    const cachePolicy = isPrivate ? CACHE_POLICIES.private : CACHE_POLICIES.immutable;
    const clientEtag = request.headers.get("if-none-match");
    if (result.etag && clientEtag && clientEtag === result.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "Cache-Control": cachePolicy,
          "ETag": result.etag
        }
      });
    }
    const filename = relativeKey.split("/").pop() || "media";
    const ext = ("." + (filename.split(".").pop() || "")).toLowerCase();
    const isAttachment = ATTACHMENT_EXTS.has(ext);
    const safeName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
    const headers = new Headers({
      "Content-Type": result.contentType,
      "Content-Length": String(result.contentLength),
      "Cache-Control": cachePolicy,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${isAttachment ? "attachment" : "inline"}; filename="${safeName}"`
    });
    if (result.contentType === "image/svg+xml") {
      headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    if (result.etag) headers.set("ETag", result.etag);
    if (result.contentRange) headers.set("Content-Range", result.contentRange);
    if (result.lastModified) headers.set("Last-Modified", result.lastModified.toUTCString());
    const responseBody = result.body instanceof Uint8Array ? result.body : new Uint8Array(result.body);
    return new Response(responseBody, {
      status: result.status,
      headers
    });
  } catch (err) {
    if (err?.message?.includes("tidak ditemukan")) {
      return new Response("Media Not Found", { status: 404 });
    }
    return new Response("Media Storage Error", { status: 500 });
  }
}

// src/media/storage.ts
var import_node_path4 = __toESM(require("path"), 1);

// src/media/drivers/disk.ts
var import_promises = __toESM(require("fs/promises"), 1);
var import_node_path2 = __toESM(require("path"), 1);
var DiskStorageEngine = class {
  constructor(config) {
    this.kind = "disk";
    const configuredDir = config?.baseDir || "storage/uploads";
    this.baseDir = import_node_path2.default.isAbsolute(configuredDir) ? configuredDir : import_node_path2.default.join(process.cwd(), configuredDir);
    this.publicUrlPrefix = (config?.publicUrlPrefix || "/media").replace(/\/$/, "");
  }
  resolvePath(key) {
    const safe = safeRelativeKey(key);
    if (!safe) return null;
    const target = import_node_path2.default.resolve(this.baseDir, safe);
    const baseResolved = import_node_path2.default.resolve(this.baseDir);
    if (target !== baseResolved && !target.startsWith(baseResolved + import_node_path2.default.sep)) {
      return null;
    }
    return target;
  }
  async put(key, body, _options) {
    const filePath = this.resolvePath(key);
    if (!filePath) throw new Error(`Invalid storage key: ${key}`);
    await import_promises.default.mkdir(import_node_path2.default.dirname(filePath), { recursive: true });
    const buf = body instanceof Buffer ? body : Buffer.from(body);
    const tmpPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      await import_promises.default.writeFile(tmpPath, buf, { mode: 420 });
      await import_promises.default.rename(tmpPath, filePath);
    } catch (err) {
      await import_promises.default.rm(tmpPath, { force: true }).catch(() => {
      });
      throw err;
    }
  }
  async delete(key) {
    const filePath = this.resolvePath(key);
    if (!filePath) return;
    try {
      await import_promises.default.rm(filePath, { force: true });
    } catch {
    }
  }
  async exists(key) {
    const filePath = this.resolvePath(key);
    if (!filePath) return false;
    try {
      await import_promises.default.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  async read(key, range) {
    const filePath = this.resolvePath(key);
    if (!filePath) throw new Error("File tidak ditemukan.");
    let stat;
    try {
      stat = await import_promises.default.stat(filePath, { bigint: true });
    } catch {
      throw new Error("File tidak ditemukan.");
    }
    if (!stat.isFile()) throw new Error("File tidak valid.");
    const ext = import_node_path2.default.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const size = Number(stat.size);
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeNs.toString(16)}-${stat.ctimeNs.toString(16)}-${stat.ino.toString(16)}"`;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const totalSize = size;
        let start;
        let end;
        if (match[1] === "" && match[2] !== "") {
          const suffix = Number.parseInt(match[2], 10);
          start = Math.max(0, totalSize - suffix);
          end = totalSize - 1;
        } else if (match[2] === "") {
          start = Number.parseInt(match[1], 10);
          end = totalSize - 1;
        } else {
          start = Number.parseInt(match[1], 10);
          end = Number.parseInt(match[2], 10);
        }
        end = Math.min(end, totalSize - 1);
        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= totalSize) {
          return {
            body: Buffer.alloc(0),
            status: 416,
            contentType,
            contentLength: 0,
            contentRange: `bytes */${totalSize}`,
            etag,
            lastModified: stat.mtime
          };
        }
        const fileHandle = await import_promises.default.open(filePath, "r");
        try {
          const chunkSize = end - start + 1;
          const chunkBuffer = Buffer.alloc(chunkSize);
          await fileHandle.read(chunkBuffer, 0, chunkSize, start);
          return {
            body: chunkBuffer,
            status: 206,
            contentType,
            contentLength: chunkSize,
            contentRange: `bytes ${start}-${end}/${totalSize}`,
            etag,
            lastModified: stat.mtime
          };
        } finally {
          await fileHandle.close();
        }
      }
    }
    const fullBuffer = await import_promises.default.readFile(filePath);
    return {
      body: fullBuffer,
      status: 200,
      contentType,
      contentLength: size,
      etag,
      lastModified: stat.mtime
    };
  }
  async getUrl(key, _options) {
    const safe = safeRelativeKey(key);
    return `${this.publicUrlPrefix}/${safe}`;
  }
  async listObjects(options) {
    const prefix = (options?.prefix ?? "").replace(/^[/\\]+/, "");
    const objects = [];
    const walk = async (dir, rel) => {
      let entries;
      try {
        entries = await import_promises.default.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(import_node_path2.default.join(dir, entry.name), childRel);
          continue;
        }
        if (prefix && !childRel.startsWith(prefix)) continue;
        try {
          const stat = await import_promises.default.stat(import_node_path2.default.join(dir, entry.name));
          objects.push({ key: childRel, size: stat.size, lastModified: stat.mtime.toISOString() });
        } catch {
        }
      }
    };
    await walk(this.baseDir, "");
    objects.sort((a, b) => a.key < b.key ? -1 : 1);
    return { objects, nextContinuationToken: null };
  }
};

// src/media/drivers/s3.ts
var import_node_path3 = __toESM(require("path"), 1);

// src/media/sigv4.ts
var import_node_crypto2 = require("crypto");
function awsEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
function sha256Hex(data) {
  return (0, import_node_crypto2.createHash)("sha256").update(data).digest("hex");
}
function hmacHex(secret, data, dateStamp, region, service = "s3") {
  const kDate = (0, import_node_crypto2.createHmac)("sha256", `AWS4${secret}`).update(dateStamp).digest();
  const kRegion = (0, import_node_crypto2.createHmac)("sha256", kDate).update(region).digest();
  const kService = (0, import_node_crypto2.createHmac)("sha256", kRegion).update(service).digest();
  const kSigning = (0, import_node_crypto2.createHmac)("sha256", kService).update("aws4_request").digest();
  return (0, import_node_crypto2.createHmac)("sha256", kSigning).update(data).digest("hex");
}
function buildObjectUrl(endpoint, bucket, key) {
  const cleanEndpoint = endpoint.replace(/\/$/, "");
  const encodedKey = key.split("/").map(awsEncode).join("/");
  return new URL(`${cleanEndpoint}/${bucket}/${encodedKey}`);
}
function signS3Headers(options) {
  const now = options.date ?? /* @__PURE__ */ new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = options.creds.region || "auto";
  const payloadHash = sha256Hex(options.payload);
  const reqHeaders = {
    host: options.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...options.headers ?? {}
  };
  const signedHeaderNames = Object.keys(reqHeaders).sort();
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${reqHeaders[name]}
`).join("");
  const canonicalQuery = [...options.url.searchParams.entries()].map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).sort().join("&");
  const canonicalRequest = [
    options.method,
    options.url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8"))
  ].join("\n");
  const signature = hmacHex(options.creds.secretAccessKey, stringToSign, dateStamp, region);
  reqHeaders.authorization = `AWS4-HMAC-SHA256 Credential=${options.creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return reqHeaders;
}
function createPresignedS3Url(options) {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = options.creds;
  const region = options.creds.region || "auto";
  const expiresIn = options.expiresInSeconds ?? 900;
  const realNow = /* @__PURE__ */ new Date();
  let now = realNow;
  let effectiveExpires = expiresIn;
  if (options.quantizeSeconds && options.quantizeSeconds > 0) {
    const epochSec = Math.floor(realNow.getTime() / 1e3);
    const quantizedEpoch = Math.floor(epochSec / options.quantizeSeconds) * options.quantizeSeconds;
    now = new Date(quantizedEpoch * 1e3);
    const timeLost = epochSec - quantizedEpoch;
    effectiveExpires = expiresIn + timeLost;
  }
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const url = buildObjectUrl(endpoint, bucket, options.key);
  const headerNames = ["host", ...options.signedHeaders ?? []].sort();
  const signedHeadersStr = headerNames.join(";");
  const params = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(effectiveExpires)],
    ["X-Amz-SignedHeaders", signedHeadersStr],
    ...Object.entries(options.extraQuery ?? {})
  ];
  params.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const canonicalQuery = params.map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).join("&");
  const canonicalHeaderLines = [];
  for (const h of headerNames) {
    if (h === "host") {
      canonicalHeaderLines.push(`host:${url.host}`);
    } else if (options.extraQuery && h in options.extraQuery) {
      canonicalHeaderLines.push(`${h}:${options.extraQuery[h]}`);
    } else {
      canonicalHeaderLines.push(`${h}:`);
    }
  }
  const canonicalHeaders = canonicalHeaderLines.join("\n") + "\n";
  const canonicalRequest = [
    options.method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeadersStr,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8"))
  ].join("\n");
  const signature = hmacHex(secretAccessKey, stringToSign, dateStamp, region);
  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// src/media/drivers/s3.ts
var S3StorageEngine = class {
  constructor(config) {
    this.kind = "s3";
    this.config = {
      endpoint: config?.endpoint || process.env.S3_ENDPOINT || "",
      bucket: config?.bucket || process.env.S3_BUCKET || "",
      region: config?.region || process.env.S3_REGION || "auto",
      accessKeyId: config?.accessKeyId || process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: config?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || "",
      publicUrl: (config?.publicUrl || process.env.S3_PUBLIC_URL || "").replace(/\/$/, "")
    };
  }
  getCreds() {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey } = this.config;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3StorageEngine memerlukan endpoint, bucket, accessKeyId, dan secretAccessKey."
      );
    }
    return { endpoint, bucket, region, accessKeyId, secretAccessKey };
  }
  cleanKey(key) {
    return safeRelativeKey(key);
  }
  async put(key, body, options) {
    const creds = this.getCreds();
    const cleanKey = this.cleanKey(key);
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey);
    const payload = body instanceof Buffer ? body : Buffer.from(body);
    const extraHeaders = {
      "content-type": options.contentType,
      "cache-control": options.cacheControl || (isPrivateKey(cleanKey) ? CACHE_POLICIES.private : CACHE_POLICIES.immutable)
    };
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        extraHeaders[`x-amz-meta-${k.toLowerCase()}`] = v;
      }
    }
    const headers = signS3Headers({
      method: "PUT",
      url,
      payload,
      creds,
      headers: extraHeaders
    });
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers,
      body: payload
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`S3 PUT gagal (${res.status}): ${errText.slice(0, 300)}`);
    }
  }
  async delete(key) {
    const creds = this.getCreds();
    const cleanKey = this.cleanKey(key);
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey);
    const headers = signS3Headers({
      method: "DELETE",
      url,
      payload: new Uint8Array(),
      creds
    });
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers
    });
    if (!res.ok && res.status !== 404) {
      const errText = await res.text().catch(() => "");
      throw new Error(`S3 DELETE gagal (${res.status}): ${errText.slice(0, 300)}`);
    }
  }
  async exists(key) {
    const creds = this.getCreds();
    const cleanKey = this.cleanKey(key);
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey);
    const headers = signS3Headers({
      method: "HEAD",
      url,
      payload: new Uint8Array(),
      creds
    });
    const res = await fetch(url.toString(), {
      method: "HEAD",
      headers
    });
    if (res.status === 404) return false;
    return res.ok;
  }
  async read(key, range) {
    const creds = this.getCreds();
    const cleanKey = this.cleanKey(key);
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey);
    const extraHeaders = {};
    if (range) extraHeaders["range"] = range;
    const headers = signS3Headers({
      method: "GET",
      url,
      payload: new Uint8Array(),
      creds,
      headers: extraHeaders
    });
    const res = await fetch(url.toString(), {
      method: "GET",
      headers
    });
    if (!res.ok && res.status !== 206) {
      if (res.status === 404) throw new Error("File tidak ditemukan di storage.");
      const errText = await res.text().catch(() => "");
      throw new Error(`S3 GET gagal (${res.status}): ${errText.slice(0, 300)}`);
    }
    const ext = import_node_path3.default.extname(cleanKey).toLowerCase();
    const contentType = res.headers.get("content-type") || MIME_BY_EXT[ext] || "application/octet-stream";
    const contentLength = Number(res.headers.get("content-length") || 0);
    const contentRange = res.headers.get("content-range") ?? void 0;
    const etag = res.headers.get("etag") ?? void 0;
    const arrayBuf = await res.arrayBuffer();
    const body = Buffer.from(arrayBuf);
    return {
      body,
      status: res.status,
      contentType,
      contentLength: contentLength || body.byteLength,
      ...contentRange ? { contentRange } : {},
      ...etag ? { etag } : {}
    };
  }
  async getUrl(key, options) {
    const cleanKey = this.cleanKey(key);
    const privateFile = options?.isPrivate || isPrivateKey(cleanKey);
    if (privateFile) {
      const creds = this.getCreds();
      const filename = options?.downloadName || cleanKey.split("/").pop() || "berkas";
      const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "") || "berkas";
      const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${awsEncode(filename)}`;
      return createPresignedS3Url({
        method: "GET",
        key: cleanKey,
        creds,
        expiresInSeconds: options?.expiresInSeconds ?? 900,
        quantizeSeconds: 300,
        extraQuery: {
          "response-content-disposition": disposition
        }
      });
    }
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${cleanKey}`;
    }
    return `/media/${cleanKey}`;
  }
  async getPresignedUploadUrl(key, contentType, expiresInSeconds = 900, options) {
    const creds = this.getCreds();
    const cleanKey = this.cleanKey(key);
    const extraQuery = {
      "Content-Type": contentType
    };
    return createPresignedS3Url({
      method: "PUT",
      key: cleanKey,
      creds,
      expiresInSeconds,
      signedHeaders: ["content-type"],
      extraQuery
    });
  }
  async listObjects(options) {
    const creds = this.getCreds();
    const params = new URLSearchParams();
    params.set("list-type", "2");
    if (options?.prefix) params.set("prefix", options.prefix);
    if (options?.continuationToken) params.set("continuation-token", options.continuationToken);
    params.set("max-keys", String(Math.min(1e3, Math.max(1, options?.maxKeys ?? 1e3))));
    const canonicalQuery = [...params.entries()].map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).sort().join("&");
    const cleanEndpoint = creds.endpoint.replace(/\/$/, "");
    const url = new URL(`${cleanEndpoint}/${creds.bucket}/?${canonicalQuery}`);
    const headers = signS3Headers({
      method: "GET",
      url,
      payload: new Uint8Array(),
      creds
    });
    const res = await fetch(url.toString(), { method: "GET", headers });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`S3 listObjects gagal (${res.status}): ${text.slice(0, 300)}`);
    }
    const decodeXml = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const objects = [];
    const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match;
    while (match = contentsRe.exec(text)) {
      const block = match[1];
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
      const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? "0");
      const lastModified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1] ?? null;
      if (key) {
        objects.push({
          key: decodeXml(key),
          size: Number.isFinite(size) ? size : 0,
          lastModified: lastModified ? decodeXml(lastModified) : null
        });
      }
    }
    const nextToken = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(text)?.[1] ?? null;
    return { objects, nextContinuationToken: nextToken ? decodeXml(nextToken) : null };
  }
};

// src/media/sweep.ts
var MIN_SWEEP_GRACE_MS = 9e5;
var UNIT_MS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
function parseDuration(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error(`Durasi tidak valid: ${input}`);
    return input;
  }
  const m = /^\s*(\d+(?:\.\d+)?)\s*([smhd])\s*$/i.exec(input);
  if (!m) throw new Error(`Durasi tidak valid: "${input}". Contoh: '30m', '24h', '7d'.`);
  return Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
}
async function sweepStorage(storage, options) {
  if (!storage.listObjects) {
    throw new Error(`Driver storage ${storage.kind} tidak mendukung listObjects().`);
  }
  if (typeof options.isReferenced !== "function") {
    throw new Error("sweep: isReferenced wajib diisi.");
  }
  const graceMs = parseDuration(options.olderThan);
  if (graceMs < MIN_SWEEP_GRACE_MS && !options.allowShortGrace) {
    throw new Error(
      `sweep: olderThan minimal 15 menit (masa berlaku presigned upload). Set allowShortGrace: true bila memang disengaja.`
    );
  }
  const dryRun = options.dryRun ?? true;
  const maxDelete = options.maxDelete ?? 1e3;
  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  const cutoff = now - graceMs;
  const result = {
    dryRun,
    scanned: 0,
    orphans: [],
    deleted: [],
    failed: [],
    bytes: 0,
    truncated: false,
    skipped: { recent: 0, referenced: 0, private: 0, temp: 0, unknownAge: 0 }
  };
  const sizeOf = /* @__PURE__ */ new Map();
  let token;
  do {
    const page = await storage.listObjects({ prefix: options.prefix, continuationToken: token });
    for (const obj of page.objects) {
      result.scanned++;
      if (obj.key.endsWith(".tmp")) {
        result.skipped.temp++;
        continue;
      }
      if (!options.includePrivate && isPrivateKey(obj.key)) {
        result.skipped.private++;
        continue;
      }
      const ts = obj.lastModified ? Date.parse(obj.lastModified) : NaN;
      if (!Number.isFinite(ts)) {
        result.skipped.unknownAge++;
        continue;
      }
      if (ts > cutoff) {
        result.skipped.recent++;
        continue;
      }
      if (await options.isReferenced(obj.key)) {
        result.skipped.referenced++;
        continue;
      }
      result.orphans.push(obj.key);
      sizeOf.set(obj.key, obj.size);
    }
    token = page.nextContinuationToken ?? void 0;
  } while (token);
  result.truncated = result.orphans.length > maxDelete;
  const target = result.orphans.slice(0, maxDelete);
  result.bytes = target.reduce((sum, k) => sum + (sizeOf.get(k) ?? 0), 0);
  if (!dryRun) {
    for (const key of target) {
      try {
        await storage.delete(key);
        result.deleted.push(key);
      } catch (err) {
        result.failed.push({ key, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return result;
}

// src/media/storage.ts
function createMediaStorage(config) {
  const configDriver = config?.driver;
  const driverKind = configDriver === "auto" || !configDriver ? process.env.STORAGE_DRIVER || (config?.s3?.bucket || process.env.S3_BUCKET ? "s3" : "disk") : configDriver;
  const storage = driverKind === "s3" ? new S3StorageEngine(config?.s3) : new DiskStorageEngine(config?.disk);
  const maxUploadBytes = config?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const presets = {
    ...DEFAULT_PRESETS,
    ...config?.presets ?? {}
  };
  async function save(file, options = {}) {
    let buffer;
    let mimeType = options.mimeType || "application/octet-stream";
    let originalName = options.originalName || "file";
    if (typeof File !== "undefined" && file instanceof File) {
      originalName = options.originalName || file.name || "file";
      mimeType = options.mimeType || file.type || "application/octet-stream";
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (typeof Blob !== "undefined" && file instanceof Blob) {
      mimeType = options.mimeType || file.type || "application/octet-stream";
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (file instanceof Buffer) {
      buffer = file;
    } else if (file instanceof Uint8Array) {
      buffer = Buffer.from(file);
    } else {
      buffer = Buffer.from(await file.arrayBuffer());
    }
    if (mimeType === "application/octet-stream" && originalName) {
      const ext2 = import_node_path4.default.extname(originalName).toLowerCase();
      if (MIME_BY_EXT[ext2]) {
        mimeType = MIME_BY_EXT[ext2];
      }
    }
    if (buffer.length === 0) {
      throw new MediaValidationError("File tidak boleh kosong.");
    }
    const limit = options.maxBytes ?? maxUploadBytes;
    if (buffer.length > limit) {
      throw new MediaValidationError(
        `Ukuran file (${(buffer.length / 1024 / 1024).toFixed(1)} MB) melebihi batas ${(limit / 1024 / 1024).toFixed(1)} MB.`
      );
    }
    const kind = detectMediaKind(mimeType);
    if (options.allowedKinds && !options.allowedKinds.includes(kind)) {
      throw new MediaValidationError(`Jenis file (${kind}) tidak diizinkan.`);
    }
    if (!matchesMagicBytes(buffer, mimeType)) {
      throw new MediaValidationError("Isi file tidak sesuai dengan tipe MIME yang diklaim.");
    }
    let payload = buffer;
    let outputMime = mimeType;
    let width = null;
    let height = null;
    if (kind === "IMAGE" && mimeType !== "image/svg+xml") {
      if (options.preset && !presets[options.preset]) {
        const available = Object.keys(presets).join(", ");
        throw new MediaValidationError(
          `Preset '${options.preset}' tidak ditemukan. Preset yang tersedia: ${available}`
        );
      }
      const preset = options.preset ? presets[options.preset] : presets.raw;
      try {
        const processed = await processImageBuffer(payload, preset);
        payload = processed.buffer;
        outputMime = processed.mimeType;
        width = processed.width;
        height = processed.height;
      } catch (err) {
        throw new MediaValidationError(err?.message || "Gagal memproses gambar.");
      }
    } else if (mimeType === "image/svg+xml") {
      payload = Buffer.from(stripSvgScripts(payload.toString("utf8")), "utf8");
    }
    const ext = EXT_BY_MIME[outputMime] ?? "bin";
    const { key, filename } = generateStorageKey({
      folder: options.folder ?? config?.defaultFolder ?? "umum",
      ext,
      isPrivate: options.isPrivate
    });
    const cacheControl = options.cacheControl || (options.isPrivate ? CACHE_POLICIES.private : CACHE_POLICIES.immutable);
    await storage.put(key, payload, {
      contentType: outputMime,
      cacheControl
    });
    const url = await storage.getUrl(key, { isPrivate: options.isPrivate });
    return {
      key,
      url,
      filename,
      mimeType: outputMime,
      size: payload.byteLength,
      width,
      height,
      originalName,
      kind
    };
  }
  async function deleteFile(keyOrUrl) {
    const key = safeRelativeKey(keyOrUrl);
    if (!key) return;
    await storage.delete(key);
  }
  async function exists(key) {
    const safeKey = safeRelativeKey(key);
    if (!safeKey) return false;
    return storage.exists(safeKey);
  }
  async function getUrl(key, options) {
    const safeKey = safeRelativeKey(key);
    if (!safeKey) return "";
    return storage.getUrl(safeKey, options);
  }
  async function createPresignedUpload(options) {
    if (!storage.getPresignedUploadUrl) {
      throw new Error(`Driver storage ${storage.kind} tidak mendukung presigned upload URL. Gunakan driver 's3'.`);
    }
    const mime = options.mimeType.toLowerCase();
    if (mime === "text/html" || mime === "application/xhtml+xml" || mime === "text/javascript" || mime === "application/javascript") {
      throw new MediaValidationError(`Tipe MIME '${options.mimeType}' tidak diizinkan untuk presigned upload.`);
    }
    const kind = detectMediaKind(mime);
    if (options.allowedKinds && !options.allowedKinds.includes(kind)) {
      throw new MediaValidationError(`Jenis file (${kind}) tidak diizinkan.`);
    }
    const ext = EXT_BY_MIME[mime] || "bin";
    const { key, filename } = generateStorageKey({
      folder: options.folder ?? config?.defaultFolder ?? "umum",
      ext,
      isPrivate: options.isPrivate
    });
    const uploadUrl = await storage.getPresignedUploadUrl(
      key,
      options.mimeType,
      options.expiresInSeconds ?? 900,
      { maxBytes: options.maxBytes }
    );
    const publicUrl = await storage.getUrl(key, { isPrivate: options.isPrivate });
    return {
      uploadUrl,
      publicUrl,
      key,
      filename,
      kind
    };
  }
  async function confirmUpload(keyOrUrl, options) {
    const safeKey = safeRelativeKey(keyOrUrl);
    if (!safeKey) {
      throw new MediaValidationError("Kunci file tidak valid.");
    }
    const existsInStorage = await storage.exists(safeKey);
    if (!existsInStorage) {
      throw new MediaValidationError("File tidak ditemukan di storage.");
    }
    const MAGIC_BYTES_RANGE = `bytes=0-${MAGIC_BYTES_LENGTH - 1}`;
    const headResult = await storage.read(safeKey, MAGIC_BYTES_RANGE);
    const headerBuffer = Buffer.from(headResult.body);
    if (headerBuffer.length === 0) {
      await storage.delete(safeKey);
      throw new MediaValidationError("File yang diunggah kosong.");
    }
    const limit = options?.maxBytes ?? maxUploadBytes;
    let totalFileSize = headerBuffer.length;
    if (headResult.contentRange) {
      const rangeMatch = /\/(\d+)$/.exec(headResult.contentRange);
      if (rangeMatch) {
        totalFileSize = Number(rangeMatch[1]);
      }
    } else if (headResult.status === 200) {
      totalFileSize = headResult.contentLength;
    }
    if (totalFileSize === 0) {
      await storage.delete(safeKey);
      throw new MediaValidationError("File yang diunggah kosong.");
    }
    if (totalFileSize > limit) {
      await storage.delete(safeKey);
      throw new MediaValidationError(
        `Ukuran file (${(totalFileSize / 1024 / 1024).toFixed(1)} MB) melebihi batas ${(limit / 1024 / 1024).toFixed(1)} MB.`
      );
    }
    const mimeType = headResult.contentType;
    const kind = detectMediaKind(mimeType);
    if (options?.allowedKinds && !options?.allowedKinds.includes(kind)) {
      await storage.delete(safeKey);
      throw new MediaValidationError(`Jenis file (${kind}) tidak diizinkan.`);
    }
    if (!matchesMagicBytes(headerBuffer, mimeType)) {
      await storage.delete(safeKey);
      throw new MediaValidationError("Isi file tidak sesuai dengan tipe MIME yang diklaim.");
    }
    if (mimeType === "image/svg+xml") {
      const fullResult = await storage.read(safeKey);
      const fullBuffer = Buffer.from(fullResult.body);
      const sanitized = Buffer.from(stripSvgScripts(fullBuffer.toString("utf8")), "utf8");
      await storage.put(safeKey, sanitized, {
        contentType: "image/svg+xml",
        cacheControl: headResult.etag ? void 0 : CACHE_POLICIES.immutable
      });
    }
    const filename = safeKey.split("/").pop() || "file";
    const url = await storage.getUrl(safeKey);
    return {
      key: safeKey,
      url,
      filename,
      mimeType,
      size: totalFileSize,
      width: null,
      height: null,
      originalName: filename,
      kind
    };
  }
  async function serve(request, context, options) {
    return serveMedia(request, context, storage, options);
  }
  return {
    storage,
    kind: storage.kind,
    save,
    delete: deleteFile,
    exists,
    getUrl,
    createPresignedUpload,
    confirmUpload,
    serve,
    sweep: (options) => sweepStorage(storage, options)
  };
}
