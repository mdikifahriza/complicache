import type { ImagePreset, MediaKind } from './types'

/**
 * Kebijakan cache HTTP baku untuk media dan berkas statis.
 */
export const CACHE_POLICIES = {
  /**
   * Kunci unik / UUID / hash tidak pernah berubah isinya.
   * Aman di-cache 1 tahun (31536000 detik) di browser, Cloudflare, dan Vercel Image Optimization.
   */
  immutable: 'public, max-age=31536000, immutable',

  /**
   * Berkas privat per-pengguna (surat, KTA, invoice, mutasi).
   * Browser menyimpan 5 menit untuk responsivitas, tetapi tidak disimpan di CDN publik.
   */
  private: 'private, max-age=300, stale-while-revalidate=60',

  /**
   * Khusus berkas dengan nama/path statis yang mungkin diperbarui isinya di masa depan.
   */
  mutable: 'public, max-age=60, must-revalidate',
} as const

export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

export const DEFAULT_PRESETS: Record<string, ImagePreset> = {
  avatar: { width: 400, height: 400, fit: 'cover', quality: 80 },
  cover:  { width: 1920, height: 1080, fit: 'inside', quality: 75 },
  thumb:  { width: 480, height: 320, fit: 'cover', quality: 70 },
  raw:    { width: 2400, height: 2400, fit: 'inside', quality: 80 },
}

export const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
}

export const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
}

export const RANGE_CAPABLE_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mp3'])

export const ATTACHMENT_EXTS = new Set(['.doc', '.docx', '.zip', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'])

export const MIME_TO_KIND: Record<string, MediaKind> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/avif': 'IMAGE',
  'image/gif': 'IMAGE',
  'image/svg+xml': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'application/pdf': 'DOCUMENT',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
  'application/vnd.ms-excel': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'DOCUMENT',
  'application/vnd.ms-powerpoint': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'DOCUMENT',
  'application/zip': 'DOCUMENT',
  'application/x-zip-compressed': 'DOCUMENT',
  'text/plain': 'DOCUMENT',
  'text/csv': 'DOCUMENT',
}
