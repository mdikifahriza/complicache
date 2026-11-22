import type {
  CacheAdapter,
  CacheEntry,
  CacheModule,
  CacheModuleOptions,
  CacheLogger,
  CacheStats,
  InvalidateOptions,
} from '../types'
import type { CacheDriver, CacheDescriptor } from '../drivers/interface'
import { buildReverseGraph, resolveDependents } from './graph'
import { tagOf, tagWithKey } from './tag'
import { auditSchema, explain as explainSchema } from './audit'

/**
 * Buat shim CacheDriver dari CacheAdapter lama untuk backward compatibility.
 */
function adapterToDriver(adapter: CacheAdapter): CacheDriver {
  return {
    name: 'adapter-shim',
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: false,
      supportsPrivate: false,
    },
    wrap<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => Promise<TResult>,
      descriptor: CacheDescriptor
    ): (...args: TArgs) => Promise<TResult> {
      return adapter.cache(fn, descriptor.keyParts, {
        tags: descriptor.tags,
        ...(descriptor.ttl !== undefined ? { revalidate: descriptor.ttl } : {}),
      })
    },
    revalidateTag(tag: string): void {
      adapter.revalidateTag(tag)
    },
  }
}

/**
 * Normalisasi opsi logger.
 */
function resolveLogger(opt?: CacheModuleOptions['logger']): CacheLogger | null {
  if (!opt || opt === 'silent') return null
  if (opt === 'verbose') {
    return {
      hit: (name: string, keyParts: string[]) => {
        console.log(`[complicache] hit: ${name} (${keyParts.join(':')})`)
      },
      miss: (name: string, keyParts: string[]) => {
        console.log(`[complicache] miss: ${name} (${keyParts.join(':')})`)
      },
      invalidate: (names: string[]) => {
        console.log(`[complicache] invalidate: ${names.join(', ')}`)
      },
      dryRun: (action: string, affected: string[]) => {
        console.log(
          `[complicache DRY RUN] ${action}: akan menginvalidasi [${affected.join(', ')}]`
        )
      },
      error: (err: unknown, ctx: string) => {
        console.error(`[complicache] error pada ${ctx}:`, err)
      },
    }
  }
  return opt
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
export function createCacheModule<
  TSchema extends Record<string, CacheEntry>,
  TModel extends string,
>(
  schema: TSchema,
  modelEffects: Partial<Record<TModel, readonly (keyof TSchema & string)[] | 'none'>>,
  options?: CacheModuleOptions
): CacheModule<TSchema, TModel> {
  // ── Lazy-load driver ───────────────────────────────────────────────────────
  let _driver: CacheDriver | null = null
  let _driverPromise: Promise<CacheDriver> | null = null

  function getDriver(): CacheDriver {
    if (_driver) return _driver

    // 1. Explicit driver baru (object instance atau string preset)
    if (options?.driver) {
      if (typeof options.driver === 'object') {
        _driver = options.driver
        return _driver
      }
      if (options.driver === 'memory') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createMemoryDriver } = require('../drivers/memory') as { createMemoryDriver: () => CacheDriver }
        _driver = createMemoryDriver()
        return _driver
      }
      if (options.driver === 'pass-through') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createPassThroughDriver } = require('../drivers/pass-through') as { createPassThroughDriver: () => CacheDriver }
        _driver = createPassThroughDriver()
        return _driver
      }
      if (options.driver === 'next') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const nc = require('next/cache') as Record<string, unknown>
          if (typeof nc.cacheTag === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { createNextModernDriver } = require('../drivers/next-modern') as { createNextModernDriver: () => CacheDriver }
            _driver = createNextModernDriver()
            return _driver
          }
          if (typeof nc.unstable_cache === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { createNextClassicDriver } = require('../drivers/next-classic') as { createNextClassicDriver: () => CacheDriver }
            _driver = createNextClassicDriver()
            return _driver
          }
        } catch {
          // continue to throw
        }
        throw new Error(
          '[complicache] driver: "next" ditentukan, tetapi next/cache tidak ditemukan. ' +
          'Pastikan Next.js terinstall.'
        )
      }
    }

    // 2. Legacy adapter shim (kompatibilitas lama)
    if (options?.adapter) {
      _driver = adapterToDriver(options.adapter)
      return _driver
    }

    // 3. Auto-detection driver (sinkron, bisa gagal di ESM)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAutoDriver } = require('../drivers/auto') as {
        createAutoDriver: () => CacheDriver
      }
      _driver = createAutoDriver()
      return _driver
    } catch (err: any) {
      if (err?.message?.includes('FATAL:')) {
        throw err
      }
      throw new Error(
        '[complicache] Tidak bisa memuat CacheDriver secara sinkron. ' +
        'Jika menggunakan ESM, panggil await ensureDriver() terlebih dahulu, ' +
        'atau sediakan driver eksplisit via options.driver.'
      )
    }
  }

  /**
   * Inisialisasi driver secara async — wajib dipanggil di ESM
   * sebelum `cached()` atau `invalidate()` dipakai jika tidak ada driver eksplisit.
   */
  async function ensureDriver(): Promise<CacheDriver> {
    if (_driver) return _driver

    if (options?.driver) {
      if (typeof options.driver === 'object') {
        _driver = options.driver
        return _driver
      }
      if (options.driver === 'memory') {
        const mod = await import('../drivers/memory')
        _driver = mod.createMemoryDriver()
        return _driver
      }
      if (options.driver === 'pass-through') {
        const mod = await import('../drivers/pass-through')
        _driver = mod.createPassThroughDriver()
        return _driver
      }
      if (options.driver === 'next') {
        try {
          const mod = await import('../drivers/auto')
          const detected = await mod.detectDriver()
          if (detected.name === 'pass-through') {
            throw new Error('next/cache tidak ditemukan')
          }
          _driver = detected
          return _driver
        } catch {
          throw new Error(
            '[complicache] driver: "next" ditentukan, tetapi next/cache tidak ditemukan.'
          )
        }
      }
    }

    if (options?.adapter) {
      _driver = adapterToDriver(options.adapter)
      return _driver
    }

    if (!_driverPromise) {
      _driverPromise = (async () => {
        try {
          const { detectDriver } = await import('../drivers/auto')
          const driver = await detectDriver()
          _driver = driver
          return driver
        } catch (err) {
          throw new Error(
            '[complicache] Tidak bisa memuat CacheDriver. ' +
            'Pastikan Next.js terinstall, atau sediakan driver custom via options.driver. ' +
            `Detail: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })()
    }

    return _driverPromise
  }

  const dryRun = options?.dryRun ?? false
  const logger = resolveLogger(options?.logger)

  // Bangun reverse graph satu kali saat module dibuat (sekaligus deteksi siklus)
  const reverseGraph = buildReverseGraph(schema as Record<string, CacheEntry>)

  // ── Statistik (per instance) ───────────────────────────────────────────────
  const counters = new Map<string, Omit<CacheStats, 'hits'>>()
  function counterOf(name: string): Omit<CacheStats, 'hits'> {
    let c = counters.get(name)
    if (!c) {
      c = {
        calls: 0,
        misses: 0,
        errors: 0,
        lastLoaderMs: null,
        lastLoadedAt: null,
        lastInvalidatedAt: null,
      }
      counters.set(name, c)
    }
    return c
  }
  function markInvalidated(names: Iterable<string>): void {
    const now = Date.now()
    for (const n of names) counterOf(n).lastInvalidatedAt = now
  }

  /** Panggil revalidateTag; tangkap error sinkron MAUPUN promise yang ditolak. */
  function safeRevalidate(
    driver: CacheDriver,
    tag: string,
    opts: InvalidateOptions | undefined,
    context: string
  ): void {
    try {
      const r = driver.revalidateTag(tag, opts)
      if (r && typeof (r as Promise<void>).then === 'function') {
        ;(r as Promise<void>).catch((err) => logger?.error?.(err, context))
      }
    } catch (err) {
      logger?.error?.(err, context)
    }
  }

  // ── cached() / wrap() ──────────────────────────────────────────────────────
  function cached<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => Promise<TResult> {
    return build(name, keyParts, loader)
  }

  /**
   * Inti cached(). Bila `recordKey` diberikan, entri juga diberi tag per-record
   * (`cache:<name>:<recordKey>`) di samping tag per-nama, sehingga bisa dimatikan
   * sendirian lewat invalidateKey() maupun bersama lewat invalidate(name).
   */
  function build<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>,
    recordKey?: string
  ): (...args: TArgs) => Promise<TResult> {
    const entry = schema[name]
    if (!entry) {
      const available = Object.keys(schema).join(', ')
      throw new Error(
        `[complicache] Cache "${name}" tidak ada di schema.\n` +
        `Cache yang terdaftar: ${available}`
      )
    }

    const tag = tagOf(name)
    const descriptor: CacheDescriptor = {
      name,
      tags: recordKey === undefined ? [tag] : [tag, tagWithKey(name, recordKey)],
      keyParts:
        recordKey === undefined
          ? [tag, ...keyParts]
          : [tag, ...keyParts, 'key', recordKey],
      scope: 'default',
      ...(entry.ttl !== undefined ? { ttl: entry.ttl } : {}),
    }

    const stat = counterOf(name)

    // Loader dibungkus SEBELUM diserahkan ke driver: loader hanya jalan saat miss,
    // jadi miss terdeteksi persis dan berlaku sama untuk semua driver.
    const instrumented = async (...args: TArgs): Promise<TResult> => {
      stat.misses++
      logger?.miss?.(name, descriptor.keyParts)
      const t0 = Date.now()
      try {
        return await loader(...args)
      } catch (err) {
        stat.errors++
        throw err
      } finally {
        stat.lastLoadedAt = Date.now()
        stat.lastLoaderMs = stat.lastLoadedAt - t0
      }
    }

    const driverFn = getDriver().wrap(instrumented, descriptor)

    return async (...args: TArgs): Promise<TResult> => {
      stat.calls++
      const missesBefore = stat.misses
      const result = await driverFn(...args)
      // Tidak ada loader yang mulai selama panggilan ini -> pasti hit. Bila ada
      // panggilan lain yang kebetulan miss pada saat yang sama, hit per-panggilan
      // tidak dilog (under-report), tetapi stats().hits tetap akurat (calls - misses).
      if (stat.misses === missesBefore) logger?.hit?.(name, descriptor.keyParts)
      return result
    }
  }

  // ── cachedByKey() / invalidateKey() ────────────────────────────────────────
  function cachedByKey<TArgs extends unknown[], TResult>(
    name: keyof TSchema & string,
    keyParts: readonly string[],
    loader: (...args: TArgs) => Promise<TResult>,
    keyOf: (...args: TArgs) => string
  ): (...args: TArgs) => Promise<TResult> {
    if (!schema[name]) {
      // build() melempar error yang sama; panggil lebih awal agar gagal saat definisi, bukan saat dipakai.
      build(name, keyParts, loader)
    }
    // Tag unstable_cache statis per wrapper -> satu wrapper per record, dibuat per panggilan.
    return (...args: TArgs) => build(name, keyParts, loader, keyOf(...args))(...args)
  }

  function invalidateKey(
    name: keyof TSchema & string,
    key: string,
    options?: InvalidateOptions
  ): void {
    if (!schema[name]) {
      const available = Object.keys(schema).join(', ')
      throw new Error(
        `[complicache] Cache "${String(name)}" tidak ada di schema.\n` +
        `Cache yang terdaftar: ${available}`
      )
    }
    // Dependan dimatikan UTUH (nama), karena agregat seperti list/sitemap bisa memuat record ini.
    const dependents = [...resolveDependents(reverseGraph, [name])].filter((n) => n !== name)

    if (dryRun) {
      logger?.dryRun?.('invalidateKey', [`${name}:${key}`, ...dependents])
      return
    }

    logger?.invalidate?.([`${name}:${key}`, ...dependents])
    markInvalidated([name, ...dependents])

    const driver = getDriver()
    safeRevalidate(driver, tagWithKey(name, key), options, `revalidateTag(${name}:${key})`)
    for (const dep of dependents) {
      safeRevalidate(driver, tagOf(dep), options, `revalidateTag(${dep})`)
    }
  }

  // ── invalidate() ───────────────────────────────────────────────────────────
  function invalidate(
    ...args:
      | [...(keyof TSchema & string)[], InvalidateOptions]
      | (keyof TSchema & string)[]
  ): void {
    let invalidateOpts: InvalidateOptions | undefined
    let rawNames: (keyof TSchema & string)[] = []

    if (
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      args[args.length - 1] !== null &&
      !Array.isArray(args[args.length - 1])
    ) {
      invalidateOpts = args[args.length - 1] as InvalidateOptions
      rawNames = (args.slice(0, -1) as any[]).flat()
    } else {
      rawNames = (args as any[]).flat()
    }

    // Validasi nama cache terdaftar di schema
    for (const name of rawNames) {
      if (!schema[name]) {
        const available = Object.keys(schema).join(', ')
        throw new Error(
          `[complicache] Cache "${String(name)}" tidak ada di schema.\n` +
          `Cache yang terdaftar: ${available}`
        )
      }
    }

    const toInvalidate = resolveDependents(reverseGraph, rawNames)
    const affected = [...toInvalidate]

    if (dryRun) {
      logger?.dryRun?.('invalidate', affected)
      return
    }

    logger?.invalidate?.(affected)
    markInvalidated(affected)

    const driver = getDriver()
    for (const name of toInvalidate) {
      safeRevalidate(driver, tagOf(name), invalidateOpts, `revalidateTag(${name})`)
    }
  }

  // ── invalidateModel() ──────────────────────────────────────────────────────
  function invalidateModel(model: TModel, options?: InvalidateOptions): void {
    if (!(model in modelEffects)) {
      const available = Object.keys(modelEffects).join(', ')
      throw new Error(
        `[complicache] Model "${String(model)}" tidak terdaftar di modelEffects.\n` +
        `Model yang terdaftar: ${available}`
      )
    }

    const effects = modelEffects[model]
    if (!effects || effects === 'none') return

    if (options) {
      invalidate(...(effects as (keyof TSchema & string)[]), options)
    } else {
      invalidate(...(effects as (keyof TSchema & string)[]))
    }
  }

  // ── invalidateAll() ────────────────────────────────────────────────────────
  function invalidateAll(options?: InvalidateOptions): void {
    const names = Object.keys(schema) as (keyof TSchema & string)[]

    if (dryRun) {
      logger?.dryRun?.('invalidateAll', names)
      return
    }

    logger?.invalidate?.(names)
    markInvalidated(names)

    const driver = getDriver()
    for (const name of names) {
      safeRevalidate(driver, tagOf(name), options, `invalidateAll(${name})`)
    }
  }

  // ── withDependents() ───────────────────────────────────────────────────────
  function withDependents(
    names: readonly (keyof TSchema & string)[]
  ): Set<keyof TSchema & string> {
    return resolveDependents(reverseGraph, names) as Set<keyof TSchema & string>
  }

  // ── revalidatePath() ───────────────────────────────────────────────────────
  function revalidatePath(path: string, type?: 'page' | 'layout'): void {
    if (dryRun) {
      logger?.dryRun?.(`revalidatePath(${path})`, [])
      return
    }

    const driver = getDriver()
    if (driver.revalidatePath) {
      try {
        driver.revalidatePath(path, type)
      } catch (err) {
        logger?.error?.(err, `revalidatePath(${path})`)
      }
    }
  }

  // ── stats() / resetStats() / audit() / explain() ───────────────────────────
  function stats(): Record<keyof TSchema & string, CacheStats> {
    const out: Record<string, CacheStats> = {}
    for (const name of Object.keys(schema)) {
      const c = counterOf(name)
      out[name] = { ...c, hits: Math.max(0, c.calls - c.misses) }
    }
    return out as Record<keyof TSchema & string, CacheStats>
  }

  function resetStats(): void {
    counters.clear()
  }

  function audit() {
    return auditSchema(
      schema as Record<string, CacheEntry>,
      modelEffects as Partial<Record<string, readonly string[] | 'none'>>
    )
  }

  function explain(name: keyof TSchema & string): string {
    return explainSchema(schema as Record<string, CacheEntry>, name)
  }

  // Jika driver 'next' ditentukan eksplisit, validasi keberadaannya langsung (fail-fast)
  if (options?.driver === 'next') {
    getDriver()
  }

  return {
    cached,
    wrap: cached, // ergonomic alias
    cachedByKey,
    wrapByKey: cachedByKey,
    invalidateKey,
    invalidate,
    invalidateModel,
    invalidateAll,
    withDependents,
    revalidatePath,
    stats,
    resetStats,
    audit,
    explain,
    ensureDriver,
  }
}
