import { randomBytes } from 'node:crypto'
import path from 'node:path'

export const INTERNAL_PREFIX = 'internal/'
export const PRIVATE_PREFIX = 'private/'

/**
 * Sanitasi nama folder untuk mencegah injeksi path atau karakter aneh.
 */
export function sanitizeFolder(folder?: string): string {
  if (!folder) return 'umum'
  return (
    folder
      .toLowerCase()
      .replace(/[^a-z0-9/-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/^[-/]+|[-/]+$/g, '')
      .slice(0, 60) || 'umum'
  )
}

/**
 * Buat kunci objek deterministik dan anti-tabrakan:
 * Format publik:  `folder/yyyy/mm/<16-hex-random>.<ext>`
 * Format privat:  `internal/folder/yyyy/mm/<16-hex-random>.<ext>`
 */
export function generateStorageKey(options: {
  folder?: string
  ext: string
  isPrivate?: boolean
  date?: Date
}): { key: string; filename: string } {
  const now = options.date ?? new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const ext = options.ext.replace(/^\./, '').toLowerCase() || 'bin'
  const randomHex = randomBytes(8).toString('hex') // 16 karakter hex acak
  const filename = `${randomHex}.${ext}`

  let folder = sanitizeFolder(options.folder)
  // Cegah folder publik bentrok dengan namespace privat
  if (!options.isPrivate) {
    if (folder === 'internal' || folder.startsWith('internal/')) {
      folder = `pub-${folder}`
    } else if (folder === 'private' || folder.startsWith('private/')) {
      folder = `pub-${folder}`
    }
  }

  const relative = path.posix.join(folder, yyyy, mm, filename)
  const key = options.isPrivate ? `${INTERNAL_PREFIX}${relative}` : relative

  return { key, filename }
}

/**
 * Deteksi apakah kunci adalah berkas privat/internal.
 */
export function isPrivateKey(key: string): boolean {
  const normalized = key.replace(/^[/\\]+/, '').toLowerCase()
  return (
    normalized === 'internal' ||
    normalized.startsWith(INTERNAL_PREFIX) ||
    normalized === 'private' ||
    normalized.startsWith(PRIVATE_PREFIX)
  )
}

/**
 * Bersihkan path dari traversal '../' dan query parameter.
 * Menghasilkan string kosong bila path tidak aman.
 *
 * Mendukung URL lengkap (https://...), relative path (/media/...), dan key langsung.
 * Hanya memotong prefix '/media/' atau 'media/' di AWAL path agar nama folder
 * seperti 'avatar/media/...' tidak terpotong di tengah.
 */
export function safeRelativeKey(input: string): string {
  if (!input) return ''
  const withoutQuery = input.split('?')[0] ?? ''

  let candidate = withoutQuery

  // Jika berupa URL lengkap (mengandung scheme), ekstrak pathname-nya
  if (candidate.includes('://')) {
    try {
      const url = new URL(candidate)
      candidate = url.pathname
    } catch {
      return ''
    }
  }

  // Bersihkan leading slashes
  candidate = candidate.replace(/^[/\\]+/, '')

  // Hanya potong marker media jika berada di AWAL path
  if (candidate.startsWith('media/')) {
    candidate = candidate.slice('media/'.length)
  }

  if (!candidate) return ''

  const normalized = path.posix.normalize(candidate)
  if (normalized.startsWith('..') || normalized.includes('/../')) {
    return ''
  }
  return normalized
}
