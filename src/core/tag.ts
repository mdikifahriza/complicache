/**
 * Sanitasi tag agar aman untuk HTTP header dan Next.js Data Cache.
 * - Maksimal 256 karakter (batas Next.js / Edge)
 * - Menghapus null bytes, newlines, dan karakter non-ASCII
 */
export function sanitizeTag(tag: string): string {
  return tag
    .replace(/[\x00\r\n]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .slice(0, 256)
    .trim()
}

/**
 * Format tag standar untuk satu entri cache.
 *
 * @example
 * tagOf('news')    → 'cache:news'
 * tagOf('events')  → 'cache:events'
 * tagOf('sitemap') → 'cache:sitemap'
 */
export function tagOf(name: string): string {
  return sanitizeTag(`cache:${name}`)
}

/**
 * Format tag granular untuk record atau query spesifik.
 *
 * @example
 * tagWithKey('news', 'by-slug', 'halo') → 'cache:news:by-slug:halo'
 */
export function tagWithKey(name: string, ...keyParts: string[]): string {
  const parts = [`cache:${name}`, ...keyParts].filter(Boolean).join(':')
  return sanitizeTag(parts)
}
