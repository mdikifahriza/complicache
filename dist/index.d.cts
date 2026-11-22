interface CacheDescriptor {
    name: string;
    tags: string[];
    ttl?: number;
    keyParts: string[];
    scope: 'default' | 'remote' | 'private';
}
interface RevalidateTagOptions {
    /**
     * Mode invalidasi:
     * - 'now': Hapus/update seketika (read-your-writes, misalnya setelah mutasi admin)
     * - 'swr': Tandai basi, data segar diambil di request berikutnya (default Next 16 SWR)
     */
    mode?: 'now' | 'swr';
}
interface CacheDriver {
    readonly name: string;
    readonly capabilities: {
        supportsTags: boolean;
        supportsTTL: boolean;
        supportsRemote: boolean;
        supportsPrivate: boolean;
    };
    wrap<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Promise<TResult>, descriptor: CacheDescriptor): (...args: TArgs) => Promise<TResult>;
    revalidateTag(tag: string, options?: RevalidateTagOptions): void | Promise<void>;
    revalidatePath?(path: string, type?: 'page' | 'layout'): void | Promise<void>;
}

type AuditIssueCode = 'orphan-permanent-cache' | 'effect-unknown-cache' | 'depends-on-unknown-cache';
interface AuditIssue {
    code: AuditIssueCode;
    /** Nama cache atau model yang bermasalah. */
    subject: string;
    message: string;
}
/**
 * Audit statis schema + model effects. Murni (tanpa efek samping, tanpa Next) —
 * cocok dipanggil di test/CI: `assert.deepEqual(auditSchema(S, E), [])`.
 *
 * Memeriksa:
 *  - cache permanen (tanpa `ttl`) yang tidak bisa dimatikan oleh model mana pun,
 *    baik langsung maupun lewat `dependsOn` (hanya mati via invalidate() manual);
 *  - effect yang menunjuk nama cache yang tidak ada di schema;
 *  - `dependsOn` ke cache yang tidak ada di schema.
 */
declare function auditSchema(schema: Record<string, CacheEntry>, modelEffects?: Partial<Record<string, readonly string[] | 'none'>>): AuditIssue[];
/**
 * Cetak pohon cascade: apa saja yang ikut mati jika `name` diinvalidasi.
 *
 * @example
 * explain(SCHEMA, 'news')
 * // news
 * // └─ sitemap
 * //    └─ homepage
 */
declare function explain(schema: Record<string, CacheEntry>, name: string): string;

/**
 * Satu entri cache. Mendefinisikan TTL dan dependensi.
 *
 * Dipakai di `defineCacheSchema()` — sumber kebenaran tunggal per proyek.
 */
interface CacheEntry<TKey extends string = string> {
    /**
     * Umur maksimum cache dalam detik.
     *
     * - Jika diisi: cache mati otomatis setelah N detik (jaring pengaman).
     *   `invalidate()` tetap bisa mematikannya lebih awal.
     * - Jika tidak diisi: cache permanen — hanya mati via `invalidate()` atau server restart.
     */
    ttl?: number;
    /**
     * Nama cache lain yang harus ikut diinvalidasi ketika cache ini diinvalidasi.
     *
     * Contoh: `sitemap` dependsOn `['news', 'events']` artinya setiap kali
     * `invalidate('news')` atau `invalidate('events')` dipanggil, `sitemap` ikut mati.
     */
    dependsOn?: readonly TKey[];
}
/**
 * @deprecated Gunakan `CacheDriver` sebagai gantinya.
 * Interface adapter lama dipertahankan untuk kompatibilitas ke belakang.
 */
interface CacheAdapter {
    cache<TArgs extends unknown[], TResult>(loader: (...args: TArgs) => Promise<TResult>, keys: readonly string[], options: {
        tags: string[];
        revalidate?: number;
    }): (...args: TArgs) => Promise<TResult>;
    revalidateTag(tag: string): void;
}
/**
 * Logger untuk memantau event caching dan debugging dependensi.
 */
interface CacheLogger {
    hit?(name: string, keyParts: string[]): void;
    miss?(name: string, keyParts: string[]): void;
    invalidate?(names: string[]): void;
    error?(err: unknown, context: string): void;
    dryRun?(action: string, affected: string[]): void;
}
/**
 * Opsi konfigurasi saat membuat module cache.
 */
interface CacheModuleOptions {
    /**
     * Driver kustom atau preset driver untuk menangani caching di balik layar.
     * - 'auto': deteksi otomatis (Next.js modern -> classic -> pass-through)
     * - 'next': paksa gunakan Next.js driver; gagal keras (throw) jika Next.js tidak ada
     * - 'memory': in-memory driver (cocok untuk testing atau script seed)
     * - 'pass-through': nonaktifkan caching, selalu panggil loader langsung
     * - CacheDriver instance kustom
     * Default: deteksi otomatis ('auto').
     */
    driver?: CacheDriver | 'next' | 'memory' | 'pass-through' | 'auto';
    /**
     * @deprecated Gunakan opsi `driver` sebagai gantinya.
     * Dipertahankan agar adapter lama tetap berfungsi via shim.
     */
    adapter?: CacheAdapter;
    /**
     * Jika true, operasi invalidasi hanya dicatat di log tanpa benar-benar
     * menghapus cache. Berguna untuk debugging graph dependensi.
     */
    dryRun?: boolean;
    /**
     * Logger untuk memantau event caching.
     * - 'verbose': log ke console secara detail
     * - 'silent': matikan seluruh log
     * - object kustom CacheLogger
     */
    logger?: CacheLogger | 'verbose' | 'silent';
}
/**
 * Statistik per nama cache, dihitung per INSTANCE (di serverless tiap instance
 * punya angkanya sendiri) dan hilang saat proses restart.
 */
interface CacheStats {
    /** Jumlah pemanggilan fungsi hasil `wrap()`/`cached()`. */
    calls: number;
    /** Pemanggilan yang dilayani tanpa menjalankan loader (`calls - misses`). */
    hits: number;
    /**
     * Berapa kali loader benar-benar dijalankan. Di Next, revalidasi stale-while-revalidate
     * di background juga menjalankan loader sehingga ikut terhitung sebagai miss.
     */
    misses: number;
    /** Berapa kali loader melempar error. */
    errors: number;
    /** Durasi eksekusi loader terakhir (ms), atau null bila belum pernah jalan. */
    lastLoaderMs: number | null;
    /** Epoch ms saat loader terakhir selesai, atau null. */
    lastLoadedAt: number | null;
    /** Epoch ms saat cache ini terakhir diinvalidasi (termasuk lewat dependsOn), atau null. */
    lastInvalidatedAt: number | null;
}
interface InvalidateOptions {
    /**
     * Mode invalidasi:
     * - 'now': Hapus/update seketika (read-your-writes)
     * - 'swr': Tandai basi, data segar diambil di request berikutnya (default SWR)
     */
    mode?: 'now' | 'swr';
}
/**
 * Output dari `createCacheModule()`.
 * Ini yang dipakai di action/service proyek.
 *
 * TSchema = tipe CACHE_SCHEMA proyek (keyof = nama-nama cache)
 * TModel  = union string nama model Prisma yang punya efek cache
 */
interface CacheModule<TSchema extends Record<string, CacheEntry>, TModel extends string> {
    /**
     * Bungkus sebuah async loader dengan cache.
     *
     * @param name     - Nama cache (harus ada di schema)
     * @param keyParts - Bagian tambahan untuk cache key (misal: ID, slug)
     * @param loader   - Fungsi yang melakukan query ke DB
     */
    cached<TArgs extends unknown[], TResult>(name: keyof TSchema & string, keyParts: readonly string[], loader: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult>;
    /**
     * Ergonomic alias untuk `cached()`.
     */
    wrap<TArgs extends unknown[], TResult>(name: keyof TSchema & string, keyParts: readonly string[], loader: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult>;
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
    cachedByKey<TArgs extends unknown[], TResult>(name: keyof TSchema & string, keyParts: readonly string[], loader: (...args: TArgs) => Promise<TResult>, keyOf: (...args: TArgs) => string): (...args: TArgs) => Promise<TResult>;
    /** Alias untuk `cachedByKey()`. */
    wrapByKey<TArgs extends unknown[], TResult>(name: keyof TSchema & string, keyParts: readonly string[], loader: (...args: TArgs) => Promise<TResult>, keyOf: (...args: TArgs) => string): (...args: TArgs) => Promise<TResult>;
    /**
     * Matikan SATU record dari cache yang dibuat dengan `cachedByKey()`, plus semua cache
     * dependannya secara utuh (agregat seperti list/sitemap bisa memuat record itu).
     * Cache lain dengan nama yang sama tidak tersentuh; gunakan `invalidate(name)` untuk itu.
     */
    invalidateKey(name: keyof TSchema & string, key: string, options?: InvalidateOptions): void;
    /**
     * Invalidasi satu atau lebih cache beserta semua dependannya.
     * Bisa menyertakan opsi { mode: 'now' | 'swr' } sebagai argumen terakhir.
     */
    invalidate(...args: [...(keyof TSchema & string)[], InvalidateOptions] | (keyof TSchema & string)[]): void;
    /**
     * Invalidasi cache berdasarkan nama model Prisma.
     */
    invalidateModel(model: TModel, options?: InvalidateOptions): void;
    /**
     * Invalidasi semua cache yang ada di schema sekaligus.
     */
    invalidateAll(options?: InvalidateOptions): void;
    /**
     * Hitung semua cache yang akan ikut mati jika cache-cache ini diinvalidasi.
     * Termasuk cache itu sendiri + semua dependannya (rekursif).
     * Murni tanpa efek samping — cocok untuk debug.
     */
    withDependents(names: readonly (keyof TSchema & string)[]): Set<keyof TSchema & string>;
    /**
     * Invalidasi Full Route Cache untuk rute URL tertentu.
     * Diteruskan ke driver.revalidatePath() jika driver mendukungnya.
     */
    revalidatePath(path: string, type?: 'page' | 'layout'): void;
    /**
     * Snapshot statistik hit/miss per nama cache (per instance, lihat `CacheStats`).
     * Berisi semua cache di schema, termasuk yang belum pernah dipanggil.
     */
    stats(): Record<keyof TSchema & string, CacheStats>;
    /** Reset semua counter statistik ke nol. */
    resetStats(): void;
    /**
     * Audit statis schema + modelEffects (lihat `auditSchema`). Array kosong = bersih.
     */
    audit(): AuditIssue[];
    /**
     * Pohon teks cascade invalidasi untuk satu cache (lihat `explain`).
     */
    explain(name: keyof TSchema & string): string;
    /**
     * Inisialisasi driver cache secara async.
     * Wajib dipanggil di lingkungan ESM murni sebelum `cached()` atau `invalidate()`.
     * Di CJS atau jika driver eksplisit diberikan, ini no-op yang langsung resolve.
     */
    ensureDriver(): Promise<CacheDriver>;
}

/**
 * Factory utama library complicache.
 *
 * Menerima schema dan model effects dari proyek, lalu menghasilkan modul cache
 * yang sudah terikat erat dengan skema tersebut.
 *
 * @param schema       - CACHE_SCHEMA dari proyek (dari defineCacheSchema())
 * @param modelEffects - MODEL_EFFECTS dari proyek (dari defineModelEffects())
 * @param options      - Opsi driver, dryRun, dan logger
 */
declare function createCacheModule<TSchema extends Record<string, CacheEntry>, TModel extends string>(schema: TSchema, modelEffects: Partial<Record<TModel, readonly (keyof TSchema & string)[] | 'none'>>, options?: CacheModuleOptions): CacheModule<TSchema, TModel>;

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
declare function defineCacheSchema<T extends {
    [K in keyof T]: CacheEntry<keyof T & string>;
}>(schema: T): T;
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
declare function defineModelEffects<TModel extends string, TCache extends string>(effects: Partial<Record<TModel, readonly TCache[] | 'none'>>): Partial<Record<TModel, readonly TCache[] | 'none'>>;
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
declare function defineModelEffectsStrict<TModel extends string, TCache extends string>(effects: Record<TModel, readonly TCache[] | 'none'>): Record<TModel, readonly TCache[] | 'none'>;

declare function createMemoryDriver(): CacheDriver;

/**
 * Deteksi driver cache yang tepat berdasarkan lingkungan.
 *
 * Urutan prioritas:
 *   1. Next.js 16+ (`cacheTag` tersedia) → next-modern
 *   2. Next.js 14/15 (`unstable_cache` tersedia) → next-classic
 *   3. Jika NODE_ENV=production → error keras (jangan pernah silently disable cache di production)
 *   4. Development/test → pass-through dengan warning
 *
 * Fungsi ini async karena perlu mendukung `import()` di ESM.
 * Untuk kompatibilitas mundur, `createAutoDriver()` tetap sync
 * dan memanggil versi async secara lazy pada invoke pertama.
 */
declare function detectDriver(): Promise<CacheDriver>;
/**
 * Versi sinkron dari auto-detect (kompatibilitas lama).
 *
 * ⚠️ DEPRECATED: Gunakan `detectDriver()` sebagai gantinya.
 * Fungsi ini tetap memakai `require()` dan akan gagal di ESM murni.
 * Disimpan agar kode lama yang sudah menggunakannya tidak langsung rusak.
 *
 * FIX Bug #1: Singleton global `_detected` dihapus. Fungsi ini sekarang
 * mendeteksi ulang setiap kali dipanggil sehingga aman digunakan di test
 * suite yang berganti environment atau mock antar test case.
 * Caching driver menjadi tanggung jawab pemanggil (misalnya `createCacheModule`
 * sudah menyimpan driver di variabel `_driver` miliknya sendiri).
 */
declare function createAutoDriver(): CacheDriver;
/**
 * @deprecated Singleton sudah dihapus di Bug #1 fix — fungsi ini kini no-op.
 * Tetap diekspor agar kode yang sudah memanggil resetAutoDriver() tidak error.
 */
declare function resetAutoDriver(): void;

declare function createNextClassicDriver(): CacheDriver;

/**
 * Konversi TTL (detik) ke nama preset profil cacheLife Next.js
 */
declare function ttlToProfile(ttl?: number): string;
declare function createNextModernDriver(): CacheDriver;

declare function createPassThroughDriver(options?: {
    silent?: boolean;
}): CacheDriver;

/**
 * Adapter default untuk Next.js 15+.
 * Memakai `unstable_cache` dan `revalidateTag` dari `next/cache`.
 *
 * Tidak perlu dipanggil manual — `createCacheModule()` memakai ini secara default
 * jika tidak ada adapter custom yang diberikan.
 */
declare function createNextAdapter(): CacheAdapter;

declare class CacheSchemaError extends Error {
    constructor(message: string);
}
declare class CacheDriverError extends Error {
    constructor(message: string);
}
declare class CacheSerializationError extends Error {
    constructor(message: string);
}

/**
 * Sanitasi tag agar aman untuk HTTP header dan Next.js Data Cache.
 * - Maksimal 256 karakter (batas Next.js / Edge)
 * - Menghapus null bytes, newlines, dan karakter non-ASCII
 */
declare function sanitizeTag(tag: string): string;
/**
 * Format tag standar untuk satu entri cache.
 *
 * @example
 * tagOf('news')    → 'cache:news'
 * tagOf('events')  → 'cache:events'
 * tagOf('sitemap') → 'cache:sitemap'
 */
declare function tagOf(name: string): string;
/**
 * Format tag granular untuk record atau query spesifik.
 *
 * @example
 * tagWithKey('news', 'by-slug', 'halo') → 'cache:news:by-slug:halo'
 */
declare function tagWithKey(name: string, ...keyParts: string[]): string;

interface Serializer {
    serialize(data: unknown): string;
    deserialize(raw: string): unknown;
}
declare const defaultSerializer: Serializer;

/**
 * Deteksi siklus pada schema dependency graph menggunakan DFS.
 *
 * "A dependsOn B" artinya A bergantung pada B (ada edge A → B).
 * Jika ada path B → ... → A, maka terjadi circular dependency.
 *
 * @returns String deskripsi siklus (misal "a → b → a") atau null jika aman.
 */
declare function detectCycles(schema: Record<string, CacheEntry>): string | null;
/**
 * Bangun reverse-dependency map dari schema.
 *
 * "dependsOn" di schema artinya: "kalau X diinvalidasi, saya (Y) ikut mati".
 * Map yang dibangun di sini adalah kebalikannya: "kalau X diinvalidasi, siapa saja yang ikut?"
 *
 * Throws CacheSchemaError jika ditemukan circular dependency.
 */
declare function buildReverseGraph(schema: Record<string, CacheEntry>): Map<string, Set<string>>;
/**
 * Dari satu set nama cache yang akan diinvalidasi, hitung semua cache
 * yang ikut mati — termasuk dependan rekursif (BFS).
 *
 * @example
 * // schema: sitemap dependsOn ['news'], homepage dependsOn ['sitemap']
 * resolveDependents(graph, ['news'])
 * // → Set { 'news', 'sitemap', 'homepage' }
 */
declare function resolveDependents(graph: Map<string, Set<string>>, names: readonly string[]): Set<string>;

/** Operasi mutasi Prisma yang memicu invalidasi secara default. */
declare const DEFAULT_MUTATION_OPERATIONS: readonly ["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"];
/** Bagian dari CacheModule yang dibutuhkan (structural typing -> tanpa dependensi @prisma/client). */
interface InvalidatorTarget {
    invalidateModel(model: any, options?: InvalidateOptions): void;
}
interface PrismaInvalidatorOptions {
    /**
     * Operasi yang dianggap mutasi.
     * Default: create, createMany, createManyAndReturn, update, updateMany,
     * updateManyAndReturn, upsert, delete, deleteMany.
     */
    operations?: readonly string[];
    /**
     * Yang dilakukan bila invalidasi melempar error — paling umum karena model belum
     * terdaftar di MODEL_EFFECTS. Mutasi DB sudah sukses saat ini terjadi, sehingga
     * default-nya TIDAK boleh membuat mutasi terlihat gagal.
     * - 'warn'   (default): console.warn sekali per model, hasil mutasi tetap dikembalikan
     * - 'ignore': diam
     * - 'throw'  : lempar ulang (hasil mutasi hilang bagi pemanggil — hati-hati)
     */
    onError?: 'warn' | 'ignore' | 'throw';
    /** Diteruskan ke `invalidateModel` ('now' | 'swr'). */
    invalidate?: InvalidateOptions;
    /**
     * Invalidasi LAGI setelah N ms (opsional, default mati).
     *
     * Di dalam interactive transaction (`$transaction(async tx => ...)`), hook ini jalan
     * SEBELUM commit: request lain bisa mengisi ulang cache dengan data lama di antara
     * invalidasi dan commit. Invalidasi kedua menutup celah itu bila commit selesai dalam
     * N ms. Ini mitigasi, bukan jaminan: di serverless timer bisa tidak sempat jalan, dan
     * untuk alur kritis tetap panggil `invalidateModel()` setelah `await $transaction(...)`.
     */
    reinvalidateAfterMs?: number;
}
interface PrismaInvalidatorExtension {
    name: string;
    query: {
        $allModels: {
            $allOperations(params: {
                model: string;
                operation: string;
                args: any;
                query: (args: any) => Promise<any>;
            }): Promise<any>;
        };
    };
}
/**
 * Prisma Client Extension: otomatis memanggil `invalidateModel(model)` setelah mutasi
 * berhasil, sehingga invalidasi tidak lagi bergantung pada ingatan di tiap action.
 *
 * @example
 * const prisma = new PrismaClient().$extends(createPrismaInvalidator(cache))
 *
 * Batasan:
 *  - `$executeRaw` / `$queryRaw` TIDAK terpantau — invalidasi manual.
 *  - Mutasi bersarang (nested write) hanya memicu model induknya; model anak yang
 *    perlu cache berbeda harus terdaftar di effects model induk, atau diinvalidasi manual.
 *  - Lihat `reinvalidateAfterMs` untuk perilaku di dalam interactive transaction.
 */
declare function createPrismaInvalidator(cache: InvalidatorTarget, options?: PrismaInvalidatorOptions): PrismaInvalidatorExtension;

export { type AuditIssue, type AuditIssueCode, type CacheAdapter, type CacheDescriptor, type CacheDriver, CacheDriverError, type CacheEntry, type CacheLogger, type CacheModule, type CacheModuleOptions, CacheSchemaError, CacheSerializationError, type CacheStats, DEFAULT_MUTATION_OPERATIONS, type InvalidateOptions, type InvalidatorTarget, type PrismaInvalidatorExtension, type PrismaInvalidatorOptions, type Serializer, auditSchema, buildReverseGraph, createAutoDriver, createCacheModule, createMemoryDriver, createNextAdapter, createNextClassicDriver, createNextModernDriver, createPassThroughDriver, createPrismaInvalidator, defaultSerializer, defineCacheSchema, defineModelEffects, defineModelEffectsStrict, detectCycles, detectDriver, explain, resetAutoDriver, resolveDependents, sanitizeTag, tagOf, tagWithKey, ttlToProfile };
