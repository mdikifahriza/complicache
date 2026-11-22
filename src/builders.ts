import type { CacheEntry } from './types'

/**
 * Identity helper untuk mendefinisikan CACHE_SCHEMA di proyek.
 *
 * Fungsi ini tidak melakukan apa-apa di runtime — murni untuk type-safety
 * dan autocomplete editor.
 *
 * @example
 * // lib/cache/schema.ts
 * export const CACHE_SCHEMA = defineCacheSchema({
 *   news:    { ttl: 300 },
 *   events:  { ttl: 300 },
 *   gallery: { ttl: 600 },
 *   sitemap: { ttl: 43200, dependsOn: ['news', 'events'] },
 *   settings: {},  // permanen — hanya mati via invalidate()
 * })
 */
export function defineCacheSchema<
  T extends { [K in keyof T]: CacheEntry<keyof T & string> }
>(schema: T): T {
  return schema
}

/**
 * Identity helper untuk mendefinisikan MODEL_EFFECTS di proyek.
 *
 * Memetakan nama model Prisma ke cache-cache yang harus diinvalidasi
 * saat model tersebut dimutasi.
 *
 * Nilai 'none' artinya model ini tidak punya efek cache.
 * Model yang tidak memiliki efek cache tidak wajib didaftarkan (Partial).
 *
 * @example
 * // lib/cache/schema.ts
 * import type { ModelName } from '@prisma/client'
 *
 * export const MODEL_EFFECTS = defineModelEffects<ModelName, keyof typeof CACHE_SCHEMA>({
 *   News:          ['news'],
 *   NewsTag:       ['news'],
 *   NewsCategory:  ['news'],
 *   Event:         ['events'],
 *   GalleryAlbum:  ['gallery'],
 *   GalleryItem:   ['gallery'],
 *   Setting:       ['settings'],
 *   Committee:     ['structure'],
 *   // Model yang tidak punya cache — opsional, bisa ditulis 'none' untuk kejelasan:
 *   Member:        'none',
 * })
 */
export function defineModelEffects<
  TModel extends string,
  TCache extends string,
>(
  effects: Partial<Record<TModel, readonly TCache[] | 'none'>>
): Partial<Record<TModel, readonly TCache[] | 'none'>> {
  return effects
}

/**
 * Varian EXHAUSTIVE dari `defineModelEffects()`.
 *
 * Semua model di `TModel` WAJIB didaftarkan (isi `'none'` untuk model tanpa cache).
 * Saat model baru ditambahkan di Prisma dan lupa didaftarkan, TypeScript langsung
 * error saat compile — bukan error runtime pertama kali model itu dimutasi.
 *
 * @example
 * import type { Prisma } from '@prisma/client'
 * export const MODEL_EFFECTS = defineModelEffectsStrict<Prisma.ModelName, keyof typeof CACHE_SCHEMA>({
 *   News:   ['news'],
 *   Member: 'none',
 *   // lupa mendaftarkan `Event` -> error compile
 * })
 */
export function defineModelEffectsStrict<
  TModel extends string,
  TCache extends string,
>(
  effects: Record<TModel, readonly TCache[] | 'none'>
): Record<TModel, readonly TCache[] | 'none'> {
  return effects
}
