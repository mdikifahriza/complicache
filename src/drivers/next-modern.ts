import type { CacheDriver, CacheDescriptor } from './interface'
import { CacheDriverError } from '../core/errors'

type NextCacheModule = {
  unstable_cache: <TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    keyParts: string[],
    opts: { tags: string[]; revalidate?: number }
  ) => (...args: TArgs) => Promise<TResult>
  revalidateTag: (tag: string, profileOrOpts?: string | { expire?: number }) => void
  revalidatePath: (path: string, type?: 'page' | 'layout') => void
  cacheTag?: (...tags: string[]) => void
  cacheLife?: (profile: string | object) => void
  updateTag?: (tag: string) => void
}

function getNextCache(): NextCacheModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('next/cache') as NextCacheModule
  } catch {
    throw new CacheDriverError(
      '[complicache] next/cache tidak ditemukan. Pastikan Next.js terinstall.'
    )
  }
}

/**
 * Konversi TTL (detik) ke nama preset profil cacheLife Next.js
 */
export function ttlToProfile(ttl?: number): string {
  if (ttl === undefined) return 'max'
  if (ttl <= 60) return 'seconds'
  if (ttl <= 3600) return 'minutes'
  if (ttl <= 86400) return 'hours'
  if (ttl <= 604800) return 'days'
  if (ttl <= 2592000) return 'weeks'
  return 'max'
}

/**
 * Deteksi apakah runtime adalah Next.js 16+ sejati (punya updateTag atau cacheLife),
 * bukan hanya Next.js 15 RC yang kebetulan sudah ekspor cacheTag.
 *
 * FIX Bug #2: Driver ini bisa aktif di Next.js 15 karena `cacheTag` sudah ada
 * sejak 15 RC, padahal `revalidateTag(tag, 'max')` hanya valid di Next 16+.
 * Kita periksa keberadaan `updateTag` atau `cacheLife` sebagai penanda Next 16+
 * yang lebih spesifik sebelum mengirim argumen kedua ke `revalidateTag`.
 */
function isNext16Plus(nc: NextCacheModule): boolean {
  return typeof nc.updateTag === 'function' || typeof nc.cacheLife === 'function'
}

export function createNextModernDriver(): CacheDriver {
  return {
    name: 'next-modern',
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: true,
      supportsPrivate: true,
    },
    wrap<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => Promise<TResult>,
      descriptor: CacheDescriptor
    ): (...args: TArgs) => Promise<TResult> {
      return getNextCache().unstable_cache(fn, descriptor.keyParts, {
        tags: descriptor.tags,
        ...(descriptor.ttl !== undefined ? { revalidate: descriptor.ttl } : {}),
      })
    },
    revalidateTag(tag: string, options?: { mode?: 'now' | 'swr' }): void {
      const nc = getNextCache()
      const next16 = isNext16Plus(nc)

      if (options?.mode === 'now') {
        // Next 16+: updateTag menyediakan semantik read-your-writes langsung
        if (next16 && typeof nc.updateTag === 'function') {
          nc.updateTag(tag)
          return
        }
        // Fallback untuk invalidasi langsung di Next 16+ via { expire: 0 }
        if (next16) {
          try {
            nc.revalidateTag(tag, { expire: 0 })
            return
          } catch {}
        }
        // Next 14/15: tidak ada mode 'now' yang sesungguhnya, fallback ke revalidate biasa
        nc.revalidateTag(tag)
        return
      }

      // FIX Bug #2: Hanya kirim argumen 'max' jika benar-benar Next 16+.
      // Di Next 14/15, revalidateTag hanya menerima satu argumen — argumen
      // kedua diabaikan secara diam-diam tanpa error, menyebabkan behavior
      // yang tidak terdefinisi. Gunakan single-arg call untuk Next 14/15.
      if (next16) {
        nc.revalidateTag(tag, 'max')
      } else {
        nc.revalidateTag(tag)
      }
    },
    revalidatePath(path: string, type?: 'page' | 'layout'): void {
      getNextCache().revalidatePath(path, type)
    },
  }
}
