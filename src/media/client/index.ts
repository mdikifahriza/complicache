/**
 * Client-Side Media Utilities untuk Complicache.
 * Berjalan murni di browser tanpa dependensi Node.js.
 */

export interface BrowserCompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  /**
   * Bila true, kegagalan kompresi (gambar tak bisa didecode, canvas tak tersedia, encode gagal)
   * membuat promise ditolak dengan BrowserCompressionError, bukan diam-diam memakai file asli.
   * Default: false (fallback ke file asli, kegagalan tetap dilaporkan lewat `error`).
   */
  strict?: boolean
  /** Dipanggil saat kompresi gagal (sebelum fallback ke file asli / sebelum reject bila strict). */
  onError?: (error: BrowserCompressionError) => void
}

/** Alasan file dikembalikan apa adanya tanpa re-encode. */
export type BrowserCompressSkipReason =
  | 'not-image' // video/dokumen
  | 'vector-or-animated' // SVG / GIF
  | 'no-browser-env' // dipanggil di server / tanpa DOM
  | 'larger-than-original' // hasil kompresi tidak lebih kecil dari file asli
  | 'decode-failed' // browser gagal membaca gambar (mis. format tak didukung, file rusak)
  | 'canvas-unavailable' // getContext('2d') mengembalikan null
  | 'encode-failed' // canvas.toBlob() mengembalikan null
  | 'exception' // error tak terduga saat menggambar/encode

export class BrowserCompressionError extends Error {
  readonly reason: BrowserCompressSkipReason
  readonly cause?: unknown
  constructor(reason: BrowserCompressSkipReason, message: string, cause?: unknown) {
    super(message)
    this.name = 'BrowserCompressionError'
    this.reason = reason
    this.cause = cause
  }
}

export interface BrowserCompressedResult {
  file: Blob | File
  filename: string
  mimeType: string
  width?: number
  height?: number
  size: number
  originalSize: number
  /** true bila `file` adalah hasil re-encode; false bila yang dikembalikan adalah file asli. */
  compressed: boolean
  /** Alasan file asli dipakai (hanya ada bila `compressed` false). */
  skipReason?: BrowserCompressSkipReason
  /**
   * Terisi bila kompresi GAGAL (bukan sekadar dilewati). File asli tetap dikembalikan di `file`,
   * jadi pemanggil bisa memutuskan: lanjut upload apa adanya, atau beri tahu pengguna.
   */
  error?: BrowserCompressionError
}

function passthrough(
  file: File,
  skipReason: BrowserCompressSkipReason,
  extra: { width?: number; height?: number; error?: BrowserCompressionError } = {},
): BrowserCompressedResult {
  return {
    file,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    ...(extra.width !== undefined ? { width: extra.width } : {}),
    ...(extra.height !== undefined ? { height: extra.height } : {}),
    size: file.size,
    originalSize: file.size,
    compressed: false,
    skipReason,
    ...(extra.error ? { error: extra.error } : {}),
  }
}

/**
 * Kompresi gambar di browser menggunakan HTML Canvas menjadi format WebP beresolusi optimal.
 * Gambar SVG dan animasi GIF otomatis dilewatkan tanpa re-encode agar tidak rusak.
 *
 * Bila kompresi gagal, file asli tetap dikembalikan, tetapi kegagalannya dilaporkan lewat
 * `result.error` / `result.skipReason` (dan `options.onError`). Pakai `options.strict` untuk
 * menolak promise sebagai gantinya.
 */
export async function compressImageInBrowser(
  file: File,
  options: BrowserCompressOptions = {},
): Promise<BrowserCompressedResult> {
  // Jika bukan gambar biasa (video/dokumen), lewatkan apa adanya
  if (!file.type.startsWith('image/')) return passthrough(file, 'not-image')

  // Lewatkan SVG atau GIF agar vektor dan animasi tetap utuh
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return passthrough(file, 'vector-or-animated')
  }

  const maxWidth = options.maxWidth ?? 2048
  const maxHeight = options.maxHeight ?? 2048
  const quality = options.quality ?? 0.75

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return passthrough(file, 'no-browser-env')
  }

  return new Promise<BrowserCompressedResult>((resolve, reject) => {
    // Semua jalur kegagalan lewat sini: laporkan, lalu fallback (atau reject bila strict).
    const fail = (
      reason: BrowserCompressSkipReason,
      message: string,
      extra: { width?: number; height?: number } = {},
      cause?: unknown,
    ) => {
      const error = new BrowserCompressionError(reason, `${message} (${file.name})`, cause)
      try {
        options.onError?.(error)
      } catch {
        // callback pemanggil tidak boleh merusak alur kompresi
      }
      if (options.strict) reject(error)
      else resolve(passthrough(file, reason, { ...extra, error }))
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let width = img.naturalWidth || img.width
      let height = img.naturalHeight || img.height

      try {
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return fail('canvas-unavailable', 'Canvas 2D context tidak tersedia', { width, height })
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return fail('encode-failed', 'canvas.toBlob() gagal menghasilkan gambar', { width, height })
            }

            // Hasil kompresi lebih besar dari file asli: bukan error, cukup pakai file asli.
            if (blob.size >= file.size) {
              return resolve(passthrough(file, 'larger-than-original', { width, height }))
            }

            const cleanBase = file.name.replace(/\.[^/.]+$/, '')
            // Gunakan tipe MIME nyata dari blob (bisa fallback ke image/png jika browser tidak mendukung webp)
            const actualMime = blob.type || 'image/webp'
            const ext = actualMime === 'image/webp' ? 'webp' : actualMime === 'image/png' ? 'png' : 'jpg'
            const filename = `${cleanBase}.${ext}`

            resolve({
              file: blob,
              filename,
              mimeType: actualMime,
              width,
              height,
              size: blob.size,
              originalSize: file.size,
              compressed: true,
            })
          },
          'image/webp',
          quality,
        )
      } catch (err) {
        fail('exception', 'Kompresi gambar gagal', { width, height }, err)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      fail('decode-failed', 'Browser tidak bisa membaca gambar ini (format tidak didukung atau file rusak)')
    }

    img.src = objectUrl
  })
}

export interface DirectUploadOptions {
  uploadUrl: string
  file: Blob | File
  mimeType: string
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void
  headers?: Record<string, string>
}

/**
 * Unggah file langsung ke storage via Presigned PUT URL dengan pelacakan progres byte-demi-byte.
 */
export function uploadDirectToStorage(options: DirectUploadOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', options.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', options.mimeType)

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value)
      }
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && options.onProgress) {
        const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100))
        options.onProgress(percent, evt.loaded, evt.total)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100, options.file.size, options.file.size)
        resolve()
      } else {
        reject(new Error(`Upload storage gagal dengan status HTTP ${xhr.status}.`))
      }
    }

    xhr.onerror = () => {
      reject(new Error('Koneksi jaringan terputus saat mengunggah file ke storage.'))
    }

    xhr.onabort = () => {
      reject(new Error('Upload dibatalkan.'))
    }

    xhr.send(options.file)
  })
}
