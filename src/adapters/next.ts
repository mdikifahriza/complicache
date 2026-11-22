import type { CacheAdapter } from '../types'

/**
 * Adapter default untuk Next.js 15+.
 * Memakai `unstable_cache` dan `revalidateTag` dari `next/cache`.
 *
 * Tidak perlu dipanggil manual — `createCacheModule()` memakai ini secara default
 * jika tidak ada adapter custom yang diberikan.
 */
export function createNextAdapter(): CacheAdapter {
  // Dynamic require agar tidak crash saat diimport di luar konteks Next.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextCache = require('next/cache') as {
    unstable_cache: <TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => Promise<TResult>,
      keyParts: string[],
      opts: { tags: string[]; revalidate?: number }
    ) => (...args: TArgs) => Promise<TResult>
    revalidateTag: (tag: string) => void
  }

  return {
    cache<TArgs extends unknown[], TResult>(
      loader: (...args: TArgs) => Promise<TResult>,
      keys: readonly string[],
      options: { tags: string[]; revalidate?: number }
    ): (...args: TArgs) => Promise<TResult> {
      return nextCache.unstable_cache(loader, [...keys], {
        tags: options.tags,
        ...(options.revalidate !== undefined
          ? { revalidate: options.revalidate }
          : {}),
      })
    },

    revalidateTag(tag: string): void {
      nextCache.revalidateTag(tag)
    },
  }
}
