import path from 'node:path'
import { CACHE_POLICIES, DEFAULT_MAX_UPLOAD_BYTES, DEFAULT_PRESETS, EXT_BY_MIME, MIME_BY_EXT } from './constants'
import { DiskStorageEngine } from './drivers/disk'
import { S3StorageEngine } from './drivers/s3'
import { generateStorageKey, safeRelativeKey } from './keys'
import { processImageBuffer } from './processor'
import { sweepStorage, type SweepOptions, type SweepResult } from './sweep'
import { serveMedia, type RouteContext, type ServeMediaOptions } from './serve'
import type {
  ConfirmUploadOptions,
  ImagePreset,
  MediaKind,
  MediaStorageConfig,
  MediaUploadMeta,
  PresignedUploadOptions,
  PresignedUploadResult,
  SaveMediaOptions,
  StorageEngine,
} from './types'
import {
  detectMediaKind,
  matchesMagicBytes,
  MAGIC_BYTES_LENGTH,
  MediaValidationError,
  stripSvgScripts,
} from './validator'

export interface MediaStorageInstance {
  readonly storage: StorageEngine
  readonly kind: 'disk' | 's3'

  save(
    file: File | Blob | Buffer | Uint8Array,
    options?: SaveMediaOptions,
  ): Promise<MediaUploadMeta>

  delete(keyOrUrl: string): Promise<void>

  exists(key: string): Promise<boolean>

  getUrl(
    key: string,
    options?: { isPrivate?: boolean; expiresInSeconds?: number; downloadName?: string },
  ): Promise<string>

  createPresignedUpload(options: PresignedUploadOptions): Promise<PresignedUploadResult>

  confirmUpload(key: string, options?: ConfirmUploadOptions): Promise<MediaUploadMeta>

  serve(request: Request, context: RouteContext, options?: ServeMediaOptions): Promise<Response>

  /**
   * Cari (dan opsional hapus) file yatim: upload presigned yang tak pernah di-confirm,
   * avatar lama yang sudah diganti, dst. `dryRun` default AKTIF.
   *
   * @example
   * const r = await media.sweep({ olderThan: '24h', isReferenced: async (key) => !!(await db.file.findFirst({ where: { key } })) })
   * console.log(r.orphans, r.bytes)         // tinjau dulu
   * await media.sweep({ olderThan: '24h', isReferenced, dryRun: false })
   */
  sweep(options: SweepOptions): Promise<SweepResult>
}

/**
 * Buat instance Media Storage terpadu (Disk atau S3/R2).
 */
export function createMediaStorage(config?: MediaStorageConfig): MediaStorageInstance {
  const configDriver = config?.driver
  const driverKind: 'disk' | 's3' =
    configDriver === 'auto' || !configDriver
      ? (process.env.STORAGE_DRIVER as 'disk' | 's3') ||
        (config?.s3?.bucket || process.env.S3_BUCKET ? 's3' : 'disk')
      : configDriver

  const storage: StorageEngine =
    driverKind === 's3'
      ? new S3StorageEngine(config?.s3)
      : new DiskStorageEngine(config?.disk)

  const maxUploadBytes = config?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  const presets: Record<string, ImagePreset> = {
    ...DEFAULT_PRESETS,
    ...(config?.presets ?? {}),
  }

  async function save(
    file: File | Blob | Buffer | Uint8Array,
    options: SaveMediaOptions = {},
  ): Promise<MediaUploadMeta> {
    let buffer: Buffer
    let mimeType = options.mimeType || 'application/octet-stream'
    let originalName = options.originalName || 'file'

    if (typeof File !== 'undefined' && file instanceof File) {
      originalName = options.originalName || file.name || 'file'
      mimeType = options.mimeType || file.type || 'application/octet-stream'
      buffer = Buffer.from(await file.arrayBuffer())
    } else if (typeof Blob !== 'undefined' && file instanceof Blob) {
      mimeType = options.mimeType || file.type || 'application/octet-stream'
      buffer = Buffer.from(await file.arrayBuffer())
    } else if (file instanceof Buffer) {
      buffer = file
    } else if (file instanceof Uint8Array) {
      buffer = Buffer.from(file)
    } else {
      buffer = Buffer.from(await (file as any).arrayBuffer())
    }

    if (mimeType === 'application/octet-stream' && originalName) {
      const ext = path.extname(originalName).toLowerCase()
      if (MIME_BY_EXT[ext]) {
        mimeType = MIME_BY_EXT[ext]
      }
    }

    if (buffer.length === 0) {
      throw new MediaValidationError('File tidak boleh kosong.')
    }

    const limit = options.maxBytes ?? maxUploadBytes
    if (buffer.length > limit) {
      throw new MediaValidationError(
        `Ukuran file (${(buffer.length / 1024 / 1024).toFixed(1)} MB) melebihi batas ${(limit / 1024 / 1024).toFixed(1)} MB.`,
      )
    }

    const kind = detectMediaKind(mimeType)
    if (options.allowedKinds && !options.allowedKinds.includes(kind)) {
      throw new MediaValidationError(`Jenis file (${kind}) tidak diizinkan.`)
    }

    // Validasi tanda biner (magic bytes)
    if (!matchesMagicBytes(buffer, mimeType)) {
      throw new MediaValidationError('Isi file tidak sesuai dengan tipe MIME yang diklaim.')
    }

    let payload = buffer
    let outputMime = mimeType
    let width: number | null = null
    let height: number | null = null

    // Pemrosesan gambar via Sharp
    if (kind === 'IMAGE' && mimeType !== 'image/svg+xml') {
      if (options.preset && !presets[options.preset]) {
        const available = Object.keys(presets).join(', ')
        throw new MediaValidationError(
          `Preset '${options.preset}' tidak ditemukan. Preset yang tersedia: ${available}`
        )
      }
      const preset = options.preset ? presets[options.preset] : presets.raw
      try {
        const processed = await processImageBuffer(payload, preset)
        payload = processed.buffer
        outputMime = processed.mimeType
        width = processed.width
        height = processed.height
      } catch (err: any) {
        throw new MediaValidationError(err?.message || 'Gagal memproses gambar.')
      }
    } else if (mimeType === 'image/svg+xml') {
      payload = Buffer.from(stripSvgScripts(payload.toString('utf8')), 'utf8')
    }

    const ext = EXT_BY_MIME[outputMime] ?? 'bin'
    const { key, filename } = generateStorageKey({
      folder: options.folder ?? config?.defaultFolder ?? 'umum',
      ext,
      isPrivate: options.isPrivate,
    })

    const cacheControl =
      options.cacheControl ||
      (options.isPrivate ? CACHE_POLICIES.private : CACHE_POLICIES.immutable)

    await storage.put(key, payload, {
      contentType: outputMime,
      cacheControl,
    })

    const url = await storage.getUrl(key, { isPrivate: options.isPrivate })

    return {
      key,
      url,
      filename,
      mimeType: outputMime,
      size: payload.byteLength,
      width,
      height,
      originalName,
      kind,
    }
  }

  async function deleteFile(keyOrUrl: string): Promise<void> {
    const key = safeRelativeKey(keyOrUrl)
    if (!key) return
    await storage.delete(key)
  }

  async function exists(key: string): Promise<boolean> {
    const safeKey = safeRelativeKey(key)
    if (!safeKey) return false
    return storage.exists(safeKey)
  }

  async function getUrl(
    key: string,
    options?: { isPrivate?: boolean; expiresInSeconds?: number; downloadName?: string },
  ): Promise<string> {
    const safeKey = safeRelativeKey(key)
    if (!safeKey) return ''
    return storage.getUrl(safeKey, options)
  }

  async function createPresignedUpload(
    options: PresignedUploadOptions,
  ): Promise<PresignedUploadResult> {
    if (!storage.getPresignedUploadUrl) {
      throw new Error(`Driver storage ${storage.kind} tidak mendukung presigned upload URL. Gunakan driver 's3'.`)
    }

    const mime = options.mimeType.toLowerCase()

    // Tolak MIME types berbahaya (HTML, XML non-svg, script)
    if (mime === 'text/html' || mime === 'application/xhtml+xml' || mime === 'text/javascript' || mime === 'application/javascript') {
      throw new MediaValidationError(`Tipe MIME '${options.mimeType}' tidak diizinkan untuk presigned upload.`)
    }

    const kind = detectMediaKind(mime)
    if (options.allowedKinds && !options.allowedKinds.includes(kind)) {
      throw new MediaValidationError(`Jenis file (${kind}) tidak diizinkan.`)
    }

    const ext = EXT_BY_MIME[mime] || 'bin'
    const { key, filename } = generateStorageKey({
      folder: options.folder ?? config?.defaultFolder ?? 'umum',
      ext,
      isPrivate: options.isPrivate,
    })

    const uploadUrl = await storage.getPresignedUploadUrl(
      key,
      options.mimeType,
      options.expiresInSeconds ?? 900,
      { maxBytes: options.maxBytes },
    )
    const publicUrl = await storage.getUrl(key, { isPrivate: options.isPrivate })

    return {
      uploadUrl,
      publicUrl,
      key,
      filename,
      kind,
    }
  }

  async function confirmUpload(
    keyOrUrl: string,
    options?: ConfirmUploadOptions,
  ): Promise<MediaUploadMeta> {
    const safeKey = safeRelativeKey(keyOrUrl)
    if (!safeKey) {
      throw new MediaValidationError('Kunci file tidak valid.')
    }

    const existsInStorage = await storage.exists(safeKey)
    if (!existsInStorage) {
      throw new MediaValidationError('File tidak ditemukan di storage.')
    }

    // FIX Bug #3: Baca hanya 16 byte pertama via HTTP Range request untuk magic bytes check.
    // Sebelumnya storage.read() tanpa range mengunduh SELURUH file ke memori — untuk
    // file video/PDF besar ini bisa menghabiskan ratusan MB RAM di serverless function.
    // matchesMagicBytes() perlu box `ftyp` lengkap (major + compatible brands) untuk membedakan
    // AVIF/HEIC dan MP4/M4A, jadi baca MAGIC_BYTES_LENGTH byte pertama (128 byte, tetap kecil).
    const MAGIC_BYTES_RANGE = `bytes=0-${MAGIC_BYTES_LENGTH - 1}`
    const headResult = await storage.read(safeKey, MAGIC_BYTES_RANGE)
    const headerBuffer = Buffer.from(headResult.body)

    if (headerBuffer.length === 0) {
      await storage.delete(safeKey)
      throw new MediaValidationError('File yang diunggah kosong.')
    }

    // Ambil total size file dari header Content-Range ("bytes 0-15/TOTAL_SIZE").
    // Kedua driver (S3 & Disk) sudah menyertakan Content-Range saat range request berhasil.
    // Fallback ke contentLength dari chunk jika Content-Range tidak tersedia (misalnya
    // file sangat kecil yang dikembalikan server tanpa Content-Range).
    const limit = options?.maxBytes ?? maxUploadBytes
    let totalFileSize: number = headerBuffer.length
    if (headResult.contentRange) {
      const rangeMatch = /\/(\d+)$/.exec(headResult.contentRange)
      if (rangeMatch) {
        totalFileSize = Number(rangeMatch[1])
      }
    } else if (headResult.status === 200) {
      // Server tidak mendukung range → response adalah full file, ambil contentLength
      totalFileSize = headResult.contentLength
    }

    if (totalFileSize === 0) {
      await storage.delete(safeKey)
      throw new MediaValidationError('File yang diunggah kosong.')
    }

    if (totalFileSize > limit) {
      await storage.delete(safeKey)
      throw new MediaValidationError(
        `Ukuran file (${(totalFileSize / 1024 / 1024).toFixed(1)} MB) melebihi batas ${(limit / 1024 / 1024).toFixed(1)} MB.`,
      )
    }

    const mimeType = headResult.contentType
    const kind = detectMediaKind(mimeType)
    if (options?.allowedKinds && !options?.allowedKinds.includes(kind)) {
      await storage.delete(safeKey)
      throw new MediaValidationError(`Jenis file (${kind}) tidak diizinkan.`)
    }

    if (!matchesMagicBytes(headerBuffer, mimeType)) {
      await storage.delete(safeKey)
      throw new MediaValidationError('Isi file tidak sesuai dengan tipe MIME yang diklaim.')
    }

    // Jika SVG, perlu baca seluruh isi untuk sanitasi script — SVG biasanya kecil (< 1 MB)
    // sehingga aman dimuat penuh. Non-SVG tidak perlu dibaca lagi ke memori.
    if (mimeType === 'image/svg+xml') {
      const fullResult = await storage.read(safeKey)
      const fullBuffer = Buffer.from(fullResult.body)
      const sanitized = Buffer.from(stripSvgScripts(fullBuffer.toString('utf8')), 'utf8')
      await storage.put(safeKey, sanitized, {
        contentType: 'image/svg+xml',
        cacheControl: headResult.etag ? undefined : CACHE_POLICIES.immutable,
      })
    }

    const filename = safeKey.split('/').pop() || 'file'
    const url = await storage.getUrl(safeKey)

    return {
      key: safeKey,
      url,
      filename,
      mimeType,
      size: totalFileSize,
      width: null,
      height: null,
      originalName: filename,
      kind,
    }
  }

  async function serve(request: Request, context: RouteContext, options?: ServeMediaOptions): Promise<Response> {
    return serveMedia(request, context, storage, options)
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
    sweep: (options) => sweepStorage(storage, options),
  }
}
