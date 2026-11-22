import type { CacheDriver } from './interface'

/**
 * Coba memuat modul secara dinamis, mendukung CJS dan ESM.
 * Di ESM, `require` mungkin tidak tersedia atau melempar ERR_REQUIRE_ESM.
 * Kita coba `require` dulu, lalu fallback ke `import()`.
 */
async function tryLoadNextCache(): Promise<Record<string, unknown> | null> {
  // Strategi 1: require (CJS atau bundler)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('next/cache') as Record<string, unknown>
  } catch {
    // require gagal — mungkin ESM murni, lanjut ke import()
  }

  // Strategi 2: dynamic import (ESM)
  try {
    const mod = await import('next/cache')
    return (mod.default ?? mod) as Record<string, unknown>
  } catch {
    // next/cache tidak tersedia sama sekali
  }

  return null
}

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
export async function detectDriver(): Promise<CacheDriver> {
  const nc = await tryLoadNextCache()

  if (nc) {
    // Next.js 16+ (cacheTag tersedia)
    if (typeof nc.cacheTag === 'function') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createNextModernDriver } = require('./next-modern') as { createNextModernDriver: () => CacheDriver }
        return createNextModernDriver()
      } catch {
        const mod = await import('./next-modern')
        return mod.createNextModernDriver()
      }
    }

    // Next.js 14/15 (unstable_cache tersedia)
    if (typeof nc.unstable_cache === 'function') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createNextClassicDriver } = require('./next-classic') as { createNextClassicDriver: () => CacheDriver }
        return createNextClassicDriver()
      } catch {
        const mod = await import('./next-classic')
        return mod.createNextClassicDriver()
      }
    }
  }

  // Tidak ada Next.js — perilaku berbeda tergantung environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[complicache] FATAL: next/cache tidak ditemukan di production. ' +
      'Cache dinonaktifkan secara diam-diam di production berbahaya. ' +
      'Pasang Next.js, atau sediakan driver eksplisit via options.driver (misalnya createMemoryDriver()).'
    )
  }

  console.warn(
    '[complicache] Cache dinonaktifkan: berjalan dalam mode pass-through. ' +
    'Pasang Next.js atau berikan driver custom.'
  )

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPassThroughDriver } = require('./pass-through') as { createPassThroughDriver: (opts?: { silent?: boolean }) => CacheDriver }
    return createPassThroughDriver({ silent: true })
  } catch {
    const mod = await import('./pass-through')
    return mod.createPassThroughDriver({ silent: true })
  }
}

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
export function createAutoDriver(): CacheDriver {
  // 1. Cek Next.js 16+ (memiliki ekspor cacheTag)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nc = require('next/cache') as Record<string, unknown>
    if (typeof nc.cacheTag === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createNextModernDriver } = require('./next-modern') as { createNextModernDriver: () => CacheDriver }
      return createNextModernDriver()
    }
  } catch {}

  // 2. Cek Next.js 14/15 (memiliki unstable_cache)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nc = require('next/cache') as Record<string, unknown>
    if (typeof nc.unstable_cache === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createNextClassicDriver } = require('./next-classic') as { createNextClassicDriver: () => CacheDriver }
      return createNextClassicDriver()
    }
  } catch {}

  // 3. Production guard
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[complicache] FATAL: next/cache tidak ditemukan di production. ' +
      'Sediakan driver eksplisit via options.driver.'
    )
  }

  // 4. Fallback: PassThrough (hanya di non-production)
  console.warn(
    '[complicache] Cache dinonaktifkan: berjalan dalam mode pass-through. Pasang Next.js atau berikan driver custom.'
  )
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPassThroughDriver } = require('./pass-through') as { createPassThroughDriver: (opts?: { silent?: boolean }) => CacheDriver }
  return createPassThroughDriver({ silent: true })
}

/**
 * @deprecated Singleton sudah dihapus di Bug #1 fix — fungsi ini kini no-op.
 * Tetap diekspor agar kode yang sudah memanggil resetAutoDriver() tidak error.
 */
export function resetAutoDriver(): void {
  // no-op: tidak ada lagi state global yang perlu direset.
}
