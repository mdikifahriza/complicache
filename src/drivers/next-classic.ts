import type { CacheDriver, CacheDescriptor } from './interface'
import { CacheDriverError } from '../core/errors'

type NextCacheModule = {
  unstable_cache: <TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    keyParts: string[],
    opts: { tags: string[]; revalidate?: number }
  ) => (...args: TArgs) => Promise<TResult>
  revalidateTag: (tag: string) => void
  revalidatePath: (path: string, type?: 'page' | 'layout') => void
}

function getNextCache(): NextCacheModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('next/cache') as NextCacheModule
  } catch {
    throw new CacheDriverError(
      '[complicache] next/cache tidak ditemukan. Pastikan Next.js terinstall atau gunakan MemoryDriver.'
    )
  }
}

export function createNextClassicDriver(): CacheDriver {
  return {
    name: 'next-classic',
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
      return getNextCache().unstable_cache(fn, descriptor.keyParts, {
        tags: descriptor.tags,
        ...(descriptor.ttl !== undefined ? { revalidate: descriptor.ttl } : {}),
      })
    },
    revalidateTag(tag: string): void {
      getNextCache().revalidateTag(tag)
    },
    revalidatePath(path: string, type?: 'page' | 'layout'): void {
      getNextCache().revalidatePath(path, type)
    },
  }
}
