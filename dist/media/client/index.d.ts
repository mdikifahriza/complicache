/**
 * Client-Side Media Utilities untuk Complicache.
 * Berjalan murni di browser tanpa dependensi Node.js.
 */
interface BrowserCompressOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    /**
     * Bila true, kegagalan kompresi (gambar tak bisa didecode, canvas tak tersedia, encode gagal)
     * membuat promise ditolak dengan BrowserCompressionError, bukan diam-diam memakai file asli.
     * Default: false (fallback ke file asli, kegagalan tetap dilaporkan lewat `error`).
     */
    strict?: boolean;
    /** Dipanggil saat kompresi gagal (sebelum fallback ke file asli / sebelum reject bila strict). */
    onError?: (error: BrowserCompressionError) => void;
}
/** Alasan file dikembalikan apa adanya tanpa re-encode. */
type BrowserCompressSkipReason = 'not-image' | 'vector-or-animated' | 'no-browser-env' | 'larger-than-original' | 'decode-failed' | 'canvas-unavailable' | 'encode-failed' | 'exception';
declare class BrowserCompressionError extends Error {
    readonly reason: BrowserCompressSkipReason;
    readonly cause?: unknown;
    constructor(reason: BrowserCompressSkipReason, message: string, cause?: unknown);
}
interface BrowserCompressedResult {
    file: Blob | File;
    filename: string;
    mimeType: string;
    width?: number;
    height?: number;
    size: number;
    originalSize: number;
    /** true bila `file` adalah hasil re-encode; false bila yang dikembalikan adalah file asli. */
    compressed: boolean;
    /** Alasan file asli dipakai (hanya ada bila `compressed` false). */
    skipReason?: BrowserCompressSkipReason;
    /**
     * Terisi bila kompresi GAGAL (bukan sekadar dilewati). File asli tetap dikembalikan di `file`,
     * jadi pemanggil bisa memutuskan: lanjut upload apa adanya, atau beri tahu pengguna.
     */
    error?: BrowserCompressionError;
}
/**
 * Kompresi gambar di browser menggunakan HTML Canvas menjadi format WebP beresolusi optimal.
 * Gambar SVG dan animasi GIF otomatis dilewatkan tanpa re-encode agar tidak rusak.
 *
 * Bila kompresi gagal, file asli tetap dikembalikan, tetapi kegagalannya dilaporkan lewat
 * `result.error` / `result.skipReason` (dan `options.onError`). Pakai `options.strict` untuk
 * menolak promise sebagai gantinya.
 */
declare function compressImageInBrowser(file: File, options?: BrowserCompressOptions): Promise<BrowserCompressedResult>;
interface DirectUploadOptions {
    uploadUrl: string;
    file: Blob | File;
    mimeType: string;
    onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
    headers?: Record<string, string>;
}
/**
 * Unggah file langsung ke storage via Presigned PUT URL dengan pelacakan progres byte-demi-byte.
 */
declare function uploadDirectToStorage(options: DirectUploadOptions): Promise<void>;

export { type BrowserCompressOptions, type BrowserCompressSkipReason, type BrowserCompressedResult, BrowserCompressionError, type DirectUploadOptions, compressImageInBrowser, uploadDirectToStorage };
