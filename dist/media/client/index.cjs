"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/media/client/index.ts
var client_exports = {};
__export(client_exports, {
  BrowserCompressionError: () => BrowserCompressionError,
  compressImageInBrowser: () => compressImageInBrowser,
  uploadDirectToStorage: () => uploadDirectToStorage
});
module.exports = __toCommonJS(client_exports);
var BrowserCompressionError = class extends Error {
  constructor(reason, message, cause) {
    super(message);
    this.name = "BrowserCompressionError";
    this.reason = reason;
    this.cause = cause;
  }
};
function passthrough(file, skipReason, extra = {}) {
  return {
    file,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    ...extra.width !== void 0 ? { width: extra.width } : {},
    ...extra.height !== void 0 ? { height: extra.height } : {},
    size: file.size,
    originalSize: file.size,
    compressed: false,
    skipReason,
    ...extra.error ? { error: extra.error } : {}
  };
}
async function compressImageInBrowser(file, options = {}) {
  if (!file.type.startsWith("image/")) return passthrough(file, "not-image");
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return passthrough(file, "vector-or-animated");
  }
  const maxWidth = options.maxWidth ?? 2048;
  const maxHeight = options.maxHeight ?? 2048;
  const quality = options.quality ?? 0.75;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return passthrough(file, "no-browser-env");
  }
  return new Promise((resolve, reject) => {
    const fail = (reason, message, extra = {}, cause) => {
      const error = new BrowserCompressionError(reason, `${message} (${file.name})`, cause);
      try {
        options.onError?.(error);
      } catch {
      }
      if (options.strict) reject(error);
      else resolve(passthrough(file, reason, { ...extra, error }));
    };
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      try {
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return fail("canvas-unavailable", "Canvas 2D context tidak tersedia", { width, height });
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return fail("encode-failed", "canvas.toBlob() gagal menghasilkan gambar", { width, height });
            }
            if (blob.size >= file.size) {
              return resolve(passthrough(file, "larger-than-original", { width, height }));
            }
            const cleanBase = file.name.replace(/\.[^/.]+$/, "");
            const actualMime = blob.type || "image/webp";
            const ext = actualMime === "image/webp" ? "webp" : actualMime === "image/png" ? "png" : "jpg";
            const filename = `${cleanBase}.${ext}`;
            resolve({
              file: blob,
              filename,
              mimeType: actualMime,
              width,
              height,
              size: blob.size,
              originalSize: file.size,
              compressed: true
            });
          },
          "image/webp",
          quality
        );
      } catch (err) {
        fail("exception", "Kompresi gambar gagal", { width, height }, err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      fail("decode-failed", "Browser tidak bisa membaca gambar ini (format tidak didukung atau file rusak)");
    };
    img.src = objectUrl;
  });
}
function uploadDirectToStorage(options) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", options.uploadUrl, true);
    xhr.setRequestHeader("Content-Type", options.mimeType);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && options.onProgress) {
        const percent = Math.min(100, Math.round(evt.loaded / evt.total * 100));
        options.onProgress(percent, evt.loaded, evt.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100, options.file.size, options.file.size);
        resolve();
      } else {
        reject(new Error(`Upload storage gagal dengan status HTTP ${xhr.status}.`));
      }
    };
    xhr.onerror = () => {
      reject(new Error("Koneksi jaringan terputus saat mengunggah file ke storage."));
    };
    xhr.onabort = () => {
      reject(new Error("Upload dibatalkan."));
    };
    xhr.send(options.file);
  });
}
