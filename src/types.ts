import type { CacheDriver, CacheDescriptor } from './drivers/interface'
import type { AuditIssue } from './core/audit'

export type { CacheDriver, CacheDescriptor } from './drivers/interface'

/**
 * Satu entri cache. Mendefinisikan TTL dan dependensi.
 *
 * Dipakai di `defineCacheSchema()` — sumber kebenaran tunggal per proyek.
 */
export interface CacheEntry<TKey extends string = string> {
  /**
   * Umur maksimum cache dalam detik.
   *
   * - Jika diisi: cache mati otomatis setelah N detik (jaring pengaman).
   *   `invalidate()` tetap bisa mematikannya lebih awal.
   * - Jika tidak diisi: cache permanen — hanya mati via `invalidate()` atau server restart.
   */
  ttl?: number

  /**
   * Nama cache lain yang harus ikut diinvalidasi ketika cache ini diinvalidasi.
   *
   * Contoh: `sitemap` dependsOn `['news', 'events']` artinya setiap kali
   * `invalidate('news')` atau `invalidate('events')` dipanggil, `sitemap` ikut mati.
   */
  dependsOn?: readonly TKey[]
}

/**
 * @deprecated Gunakan `CacheDriver` sebagai gantinya.
 * Interface adapter lama dipertahankan untuk kompatibilitas ke belakang.
 */
export interface CacheAdapter {
  cache<TArgs extends unknown[], TResult>(
    loader: (...args: TArgs) => Promise<TResult>,
    keys: readonly string[],
    options: { tags: string[]; revalidate?: number }
  ): (...args: TArgs) => Promise<TResult>
  revalidateTag(tag: string): void
}

/**
 * Logger untuk memantau event caching dan debugging dependensi.
 */
export interface CacheLogger {
  hit?(name: string, keyParts: string[]): void
  miss?(name: string, keyParts: string[]): void
  invalidate?(names: string[]): void
  error?(err: unknown, context: string): void
  dryRun?(action: string, affected: string[]): void
}

/**
 * Opsi konfigurasi saat membuat module cache.
 */
export interface CacheModuleOptions {
  /**
   * Driver kustom atau preset driver untuk menangani caching di balik layar.
   * - 'auto': deteksi otomatis (Next.js modern -> classic -> pass-through)
   * - 'next': paksa gunakan Next.js driver; gagal keras (throw) jika Next.js tidak ada
   * - 'memory': in-memory driver (cocok untuk testing atau script seed)
   * - 'pass-through': nonaktifkan caching, selalu panggil loader langsung
   * - CacheDriver instance kustom
   * Default: deteksi otomatis ('auto').
   */
  driver?: CacheDriver | 'next' | 'memory' | 'pass-through' | 'auto'

  /**
   * @deprecated Gunakan opsi `driver` sebagai gantinya.
   * Dipertahankan agar adapter lama tetap berfungsi via shim.
   */
  adapter?: CacheAdapter

  /**
   * Jika true, operasi invalidasi hanya dicatat di log tanpa benar-benar
   * menghapus cache. Berguna untuk debugging graph dependensi.
   */
  dryRun?: boolean

  /**
   * Logger untuk memantau event caching.
   * - 'verbose': log ke console secara detail
   * - 'silent': matikan seluruh log
   * - object kustom CacheLogger
   */
  logger?: CacheLogger | 'verbose' | 'silent'
}

/**
 * Statistik per nama cache, dihitung per INSTANCE (di serverless tiap instance
 * punya angkanya sendiri) dan hilang saat proses restart.
 */
export interface CacheStats {
  /** Jumlah pemanggilan fungsi hasil `wrap()`/`cached()`. */
  calls: number
  /** Pemanggilan yang dilayani tanpa menjalankan loader (`calls - misses`). */
  hits: number
  /**
   * Berapa kali loader benar-benar dijalankan. Di Next, revalidasi stale-while-revalidate
   * di background juga menjalankan loader sehingga ikut terhitung sebagai miss.
   */
  misses: number
  /** Berapa kali loader melempar error. */
  errors: number
  /** Durasi eksekusi loader terakhir (ms), atau null bila belum pernah jalan. */
  lastLoaderMs: number | null
  /** Epoch ms saat loader terakhir selesai, atau null. */
  lastLoadedAt: number | null
  /** Epoch ms saat cache ini terakhir diinvalidasi (termasuk lewat dependsOn), atau null. */
  lastInvalidatedAt: number | null
}

export interface InvalidateOptions {
  /**
   * Mode invalidasi:
   * - 'now': Hapus/update seketika (read-your-writes)
   * - 'swr': Tandai basi, data segar diambil di request berikutnya (default SWR)
   */
  mode?: 'now' | 'swr'
}

/**
 * Output dari `createCacheModule()`.
 * Ini yang dipakai di action/service proyek.
 *
 * TSchema = tipe CACHE_SCHEMA proyek (keyof = nama-nama cache)
 * TModel  = union string nama model Prisma yang punya efek cache
 */
export interface CacheModule<
  TSchema extends Record<string, CacheEntry>,
  TModel extends string,
> {
  /**
   * Bungkus sebuah async loader dengan cache.
   *
   * @param name     - Nama cache (harus ada di schema)
   * @param keyParts - Bagian tambahan untuk cache key (misal: ID, slug)
   * @param loader   - Fungsi yang melakukan query ke DB
   */
  cached<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => Promise<TResult>

  /**
   * Ergonomic alias untuk `cached()`.
   */
  wrap<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => Promise<TResult>

  /**
   * Seperti `cached()`, tetapi tiap record punya tag sendiri sehingga bisa dimatikan
   * sendirian lewat `invalidateKey(name, key)`. `keyOf` menurunkan key record dari argumen.
   *
   * Pola yang disarankan: cache per-record (`newsDetail`) dan cache list yang memuatnya
   * (`newsList`, `dependsOn: ['newsDetail']`) dipisah di schema. Mengubah satu record lalu
   * cukup `invalidateKey('newsDetail', slug)` — detail lain tetap hangat, list ikut mati.
   * Cache list dengan NAMA YANG SAMA tidak ikut mati oleh invalidateKey().
   *
   * Catatan: sebuah wrapper (`unstable_cache` di Next) dibuat per panggilan karena tag-nya
   * statis per wrapper. Perilaku ini belum diverifikasi pada Next 15/16 sungguhan.
   */
  cachedByKey<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>,
    keyOf: (...args: TArgs) => string
  ): (...args: TArgs) => Promise<TResult>

  /** Alias untuk `cachedByKey()`. */
  wrapByKey<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>,
    keyOf: (...args: TArgs) => string
  ): (...args: TArgs) => Promise<TResult>

  /**
   * Matikan SATU record dari cache yang dibuat dengan `cachedByKey()`, plus semua cache
   * dependannya secara utuh (agregat seperti list/sitemap bisa memuat record itu).
   * Cache lain dengan nama yang sama tidak tersentuh; gunakan `invalidate(name)` untuk itu.
   */
  invalidateKey(name: keyof TSchema & string, key: string, options?: InvalidateOptions): void

  /**
   * Invalidasi satu atau lebih cache beserta semua dependannya.
   * Bisa menyertakan opsi { mode: 'now' | 'swr' } sebagai argumen terakhir.
   */
  invalidate(
    ...args:
      | [...(keyof TSchema & string)[], InvalidateOptions]
      | (keyof TSchema & string)[]
  ): void

  /**
   * Invalidasi cache berdasarkan nama model Prisma.
   */
  invalidateModel(model: TModel, options?: InvalidateOptions): void

  /**
   * Invalidasi semua cache yang ada di schema sekaligus.
   */
  invalidateAll(options?: InvalidateOptions): void

  /**
   * Hitung semua cache yang akan ikut mati jika cache-cache ini diinvalidasi.
   * Termasuk cache itu sendiri + semua dependannya (rekursif).
   * Murni tanpa efek samping — cocok untuk debug.
   */
  withDependents(names: readonly (keyof TSchema & string)[]): Set<keyof TSchema & string>

  /**
   * Invalidasi Full Route Cache untuk rute URL tertentu.
   * Diteruskan ke driver.revalidatePath() jika driver mendukungnya.
   */
  revalidatePath(path: string, type?: 'page' | 'layout'): void

  /**
   * Snapshot statistik hit/miss per nama cache (per instance, lihat `CacheStats`).
   * Berisi semua cache di schema, termasuk yang belum pernah dipanggil.
   */
  stats(): Record<keyof TSchema & string, CacheStats>

  /** Reset semua counter statistik ke nol. */
  resetStats(): void

  /**
   * Audit statis schema + modelEffects (lihat `auditSchema`). Array kosong = bersih.
   */
  audit(): AuditIssue[]

  /**
   * Pohon teks cascade invalidasi untuk satu cache (lihat `explain`).
   */
  explain(name: keyof TSchema & string): string

  /**
   * Inisialisasi driver cache secara async.
   * Wajib dipanggil di lingkungan ESM murni sebelum `cached()` atau `invalidate()`.
   * Di CJS atau jika driver eksplisit diberikan, ini no-op yang langsung resolve.
   */
  ensureDriver(): Promise<CacheDriver>
}
