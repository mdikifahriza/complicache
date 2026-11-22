/**
 * Tipe dan antarmuka untuk modul media dan caching media complicache.
 */
type MediaKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type CachePolicyName = 'immutable' | 'private' | 'mutable';
interface StoragePutOptions {
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
}
interface StorageReadResult {
    body: Buffer | Uint8Array;
    status: number;
    contentType: string;
    contentLength: number;
    contentRange?: string;
    etag?: string;
    lastModified?: Date;
}
interface StorageListOptions {
    prefix?: string;
    continuationToken?: string;
    maxKeys?: number;
}
interface StoredObjectInfo {
    key: string;
    size: number;
    lastModified: string | null;
}
interface StoredObjectList {
    objects: StoredObjectInfo[];
    nextContinuationToken: string | null;
}
interface StorageEngine {
    readonly kind: 'disk' | 's3';
    put(key: string, body: Buffer | Uint8Array, options: StoragePutOptions): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    read(key: string, range?: string): Promise<StorageReadResult>;
    getUrl(key: string, options?: {
        isPrivate?: boolean;
        expiresInSeconds?: number;
        downloadName?: string;
    }): Promise<string>;
    getPresignedUploadUrl?(key: string, contentType: string, expiresInSeconds?: number, options?: {
        maxBytes?: number;
    }): Promise<string>;
    listObjects?(options?: StorageListOptions): Promise<StoredObjectList>;
}
interface ImagePreset {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'inside' | 'outside';
    quality?: number;
}
interface MediaUploadMeta {
    key: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    originalName: string;
    kind: MediaKind;
}
interface SaveMediaOptions {
    folder?: string;
    preset?: 'avatar' | 'cover' | 'thumb' | 'raw' | string;
    isPrivate?: boolean;
    maxBytes?: number;
    allowedKinds?: MediaKind[];
    originalName?: string;
    mimeType?: string;
    cacheControl?: string;
}
interface DiskDriverConfig {
    baseDir?: string;
    publicUrlPrefix?: string;
}
interface S3DriverConfig {
    endpoint?: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
}
interface MediaStorageConfig {
    driver?: 'disk' | 's3' | 'auto';
    disk?: DiskDriverConfig;
    s3?: S3DriverConfig;
    defaultFolder?: string;
    presets?: Record<string, ImagePreset>;
    maxUploadBytes?: number;
}
interface PresignedUploadOptions {
    folder?: string;
    filename?: string;
    mimeType: string;
    isPrivate?: boolean;
    expiresInSeconds?: number;
    maxBytes?: number;
    allowedKinds?: MediaKind[];
}
interface ConfirmUploadOptions {
    maxBytes?: number;
    allowedKinds?: MediaKind[];
    folder?: string;
}
interface PresignedUploadResult {
    uploadUrl: string;
    publicUrl: string;
    key: string;
    filename: string;
    kind: MediaKind;
}

/**
 * Kebijakan cache HTTP baku untuk media dan berkas statis.
 */
declare const CACHE_POLICIES: {
    /**
     * Kunci unik / UUID / hash tidak pernah berubah isinya.
     * Aman di-cache 1 tahun (31536000 detik) di browser, Cloudflare, dan Vercel Image Optimization.
     */
    readonly immutable: "public, max-age=31536000, immutable";
    /**
     * Berkas privat per-pengguna (surat, KTA, invoice, mutasi).
     * Browser menyimpan 5 menit untuk responsivitas, tetapi tidak disimpan di CDN publik.
     */
    readonly private: "private, max-age=300, stale-while-revalidate=60";
    /**
     * Khusus berkas dengan nama/path statis yang mungkin diperbarui isinya di masa depan.
     */
    readonly mutable: "public, max-age=60, must-revalidate";
};
declare const DEFAULT_MAX_UPLOAD_BYTES: number;
declare const DEFAULT_PRESETS: Record<string, ImagePreset>;
declare const EXT_BY_MIME: Record<string, string>;
declare const MIME_BY_EXT: Record<string, string>;
declare const RANGE_CAPABLE_EXTS: Set<string>;
declare const ATTACHMENT_EXTS: Set<string>;
declare const MIME_TO_KIND: Record<string, MediaKind>;

declare const INTERNAL_PREFIX = "internal/";
declare const PRIVATE_PREFIX = "private/";
/**
 * Sanitasi nama folder untuk mencegah injeksi path atau karakter aneh.
 */
declare function sanitizeFolder(folder?: string): string;
/**
 * Buat kunci objek deterministik dan anti-tabrakan:
 * Format publik:  `folder/yyyy/mm/<16-hex-random>.<ext>`
 * Format privat:  `internal/folder/yyyy/mm/<16-hex-random>.<ext>`
 */
declare function generateStorageKey(options: {
    folder?: string;
    ext: string;
    isPrivate?: boolean;
    date?: Date;
}): {
    key: string;
    filename: string;
};
/**
 * Deteksi apakah kunci adalah berkas privat/internal.
 */
declare function isPrivateKey(key: string): boolean;
/**
 * Bersihkan path dari traversal '../' dan query parameter.
 * Menghasilkan string kosong bila path tidak aman.
 *
 * Mendukung URL lengkap (https://...), relative path (/media/...), dan key langsung.
 * Hanya memotong prefix '/media/' atau 'media/' di AWAL path agar nama folder
 * seperti 'avatar/media/...' tidak terpotong di tengah.
 */
declare function safeRelativeKey(input: string): string;

declare class MediaValidationError extends Error {
    constructor(message: string);
}
/**
 * Jumlah byte awal yang cukup untuk memeriksa semua signature di bawah, termasuk daftar
 * compatible brands pada box `ftyp`. Pemanggil yang hanya membaca potongan awal file
 * (mis. lewat Range request) sebaiknya membaca sebanyak ini.
 */
declare const MAGIC_BYTES_LENGTH = 128;
/**
 * Cek tanda biner (magic bytes) di awal buffer untuk memastikan tipe file tidak dipalsukan.
 */
declare function matchesMagicBytes(buffer: Uint8Array | Buffer, mimeType: string): boolean;
/**
 * Buang data script atau injeksi XSS dari SVG sebelum disimpan.
 *
 * Sanitasi komprehensif meliputi:
 *  - <script> tags
 *  - <foreignObject> tags
 *  - Event handler attributes (on*)
 *  - javascript: URIs (termasuk entity-encoded dan mixed-case)
 *  - <set>/<animate> yang bisa mengubah href ke javascript:
 *  - <style> yang mengandung @import atau expression()
 *  - data: URIs di href/src (bisa mengandung HTML/JS)
 *  - <use> dengan external references
 */
declare function stripSvgScripts(svgText: string): string;
declare function detectMediaKind(mimeType: string): MediaKind;

interface ProcessedImageResult {
    buffer: Buffer;
    mimeType: string;
    width: number | null;
    height: number | null;
}
/**
 * Optimasi gambar menjadi WebP dengan resolusi terkendali dan pembersihan metadata EXIF.
 */
declare function processImageBuffer(input: Buffer | Uint8Array, preset?: ImagePreset): Promise<ProcessedImageResult>;

type RouteContext = {
    params: {
        path: string[];
    } | Promise<{
        path: string[];
    }>;
} | {
    params: Promise<{
        [key: string]: string | string[];
    }>;
} | {
    params: {
        [key: string]: string | string[];
    };
} | string;
interface ServeMediaOptions {
    /**
     * Hook otorisasi untuk berkas privat/internal.
     * Dipanggil saat permintaan menuju ke berkas privat (internal/...).
     * - Kembalikan `true` untuk mengizinkan akses.
     * - Kembalikan `false` untuk menolak (403 Forbidden).
     * - Kembalikan objek `Response` kustom (misal redirect ke login atau 401).
     */
    authorize?: (request: Request, key: string) => Promise<boolean | Response> | boolean | Response;
}
/**
 * Ekstrak key path relatif dari Request atau Next.js context params.
 */
declare function extractRouteKey(request: Request, context?: RouteContext): Promise<string>;
/**
 * Universal Route Handler untuk melayani media publik di Next.js App Router.
 * Mendukung ETag 304, HTTP Range 206, Immutable Caching, dan proteksi anti-traversal.
 */
declare function serveMedia(request: Request, keyOrContext: RouteContext, storage: StorageEngine, options?: ServeMediaOptions): Promise<Response>;

/** Masa tenggang minimum (ms) = masa berlaku default presigned upload (900 detik). */
declare const MIN_SWEEP_GRACE_MS = 900000;
interface SweepOptions {
    /**
     * Hanya objek yang LEBIH TUA dari ini yang jadi kandidat. Angka = milidetik,
     * atau string `'30m' | '24h' | '7d' | '90s'`. Tidak boleh kurang dari 15 menit
     * (masa berlaku default presigned upload) agar upload yang sedang berjalan atau
     * belum sempat dicatat ke DB tidak terhapus; ubah dengan `allowShortGrace`.
     */
    olderThan: string | number;
    /**
     * Apakah `key` masih dipakai (ada di DB)? true = aman, jangan dihapus.
     * Bila callback melempar error, sweep dibatalkan TANPA menghapus apa pun.
     */
    isReferenced: (key: string) => boolean | Promise<boolean>;
    /** Default `true`: hanya melaporkan kandidat, tidak menghapus. Set `false` untuk menghapus. */
    dryRun?: boolean;
    /** Batasi pemindaian ke prefix tertentu, misal `'avatar/'`. */
    prefix?: string;
    /** Ikutkan key privat (`internal/`, `private/`). Default `false`. */
    includePrivate?: boolean;
    /**
     * Batas jumlah penghapusan per panggilan (pengaman bila `isReferenced` keliru).
     * Default 1000. Sisanya dilaporkan lewat `truncated: true`.
     */
    maxDelete?: number;
    /** Izinkan `olderThan` di bawah 15 menit. Default `false`. */
    allowShortGrace?: boolean;
    /** Untuk pengujian. */
    now?: Date | number;
}
interface SweepResult {
    dryRun: boolean;
    /** Jumlah objek yang dipindai. */
    scanned: number;
    /** Objek yatim yang memenuhi syarat (tua + tidak direferensikan), sebelum dibatasi maxDelete. */
    orphans: string[];
    /** Key yang benar-benar dihapus (kosong saat dryRun). */
    deleted: string[];
    /** Key yang gagal dihapus beserta pesan error. */
    failed: {
        key: string;
        error: string;
    }[];
    /** Total byte yatim yang bisa/sudah dibebaskan (hanya objek yang masuk batas maxDelete). */
    bytes: number;
    /** true bila jumlah yatim melebihi maxDelete. */
    truncated: boolean;
    skipped: {
        recent: number;
        referenced: number;
        private: number;
        temp: number;
        unknownAge: number;
    };
}
declare function parseDuration(input: string | number): number;
declare function sweepStorage(storage: StorageEngine, options: SweepOptions): Promise<SweepResult>;

interface MediaStorageInstance {
    readonly storage: StorageEngine;
    readonly kind: 'disk' | 's3';
    save(file: File | Blob | Buffer | Uint8Array, options?: SaveMediaOptions): Promise<MediaUploadMeta>;
    delete(keyOrUrl: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    getUrl(key: string, options?: {
        isPrivate?: boolean;
        expiresInSeconds?: number;
        downloadName?: string;
    }): Promise<string>;
    createPresignedUpload(options: PresignedUploadOptions): Promise<PresignedUploadResult>;
    confirmUpload(key: string, options?: ConfirmUploadOptions): Promise<MediaUploadMeta>;
    serve(request: Request, context: RouteContext, options?: ServeMediaOptions): Promise<Response>;
    /**
     * Cari (dan opsional hapus) file yatim: upload presigned yang tak pernah di-confirm,
     * avatar lama yang sudah diganti, dst. `dryRun` default AKTIF.
     *
     * @example
     * const r = await media.sweep({ olderThan: '24h', isReferenced: async (key) => !!(await db.file.findFirst({ where: { key } })) })
     * console.log(r.orphans, r.bytes)         // tinjau dulu
     * await media.sweep({ olderThan: '24h', isReferenced, dryRun: false })
     */
    sweep(options: SweepOptions): Promise<SweepResult>;
}
/**
 * Buat instance Media Storage terpadu (Disk atau S3/R2).
 */
declare function createMediaStorage(config?: MediaStorageConfig): MediaStorageInstance;

declare class DiskStorageEngine implements StorageEngine {
    readonly kind: "disk";
    private baseDir;
    private publicUrlPrefix;
    constructor(config?: DiskDriverConfig);
    private resolvePath;
    put(key: string, body: Buffer | Uint8Array, _options: StoragePutOptions): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    read(key: string, range?: string): Promise<StorageReadResult>;
    getUrl(key: string, _options?: {
        isPrivate?: boolean;
        expiresInSeconds?: number;
        downloadName?: string;
    }): Promise<string>;
    listObjects(options?: StorageListOptions): Promise<StoredObjectList>;
}

declare class S3StorageEngine implements StorageEngine {
    readonly kind: "s3";
    private config;
    constructor(config?: S3DriverConfig);
    private getCreds;
    private cleanKey;
    put(key: string, body: Buffer | Uint8Array, options: StoragePutOptions): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    read(key: string, range?: string): Promise<StorageReadResult>;
    getUrl(key: string, options?: {
        isPrivate?: boolean;
        expiresInSeconds?: number;
        downloadName?: string;
    }): Promise<string>;
    getPresignedUploadUrl(key: string, contentType: string, expiresInSeconds?: number, options?: {
        maxBytes?: number;
    }): Promise<string>;
    listObjects(options?: StorageListOptions): Promise<StoredObjectList>;
}

export { ATTACHMENT_EXTS, CACHE_POLICIES, type CachePolicyName, type ConfirmUploadOptions, DEFAULT_MAX_UPLOAD_BYTES, DEFAULT_PRESETS, type DiskDriverConfig, DiskStorageEngine, EXT_BY_MIME, INTERNAL_PREFIX, type ImagePreset, MAGIC_BYTES_LENGTH, MIME_BY_EXT, MIME_TO_KIND, MIN_SWEEP_GRACE_MS, type MediaKind, type MediaStorageConfig, type MediaStorageInstance, type MediaUploadMeta, MediaValidationError, PRIVATE_PREFIX, type PresignedUploadOptions, type PresignedUploadResult, type ProcessedImageResult, RANGE_CAPABLE_EXTS, type RouteContext, type S3DriverConfig, S3StorageEngine, type SaveMediaOptions, type ServeMediaOptions, type StorageEngine, type StorageListOptions, type StoragePutOptions, type StorageReadResult, type StoredObjectInfo, type StoredObjectList, type SweepOptions, type SweepResult, createMediaStorage, detectMediaKind, extractRouteKey, generateStorageKey, isPrivateKey, matchesMagicBytes, parseDuration, processImageBuffer, safeRelativeKey, sanitizeFolder, serveMedia, stripSvgScripts, sweepStorage };
