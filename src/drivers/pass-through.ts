import type { CacheDriver } from './interface'

export function createPassThroughDriver(options?: { silent?: boolean }): CacheDriver {
  if (!options?.silent) {
    console.warn(
      '[complicache] Cache dinonaktifkan: berjalan dalam mode pass-through. Pasang Next.js atau berikan driver custom.'
    )
  }

  return {
    name: 'pass-through',
    capabilities: {
      supportsTags: false,
      supportsTTL: false,
      supportsRemote: false,
      supportsPrivate: false,
    },
    wrap<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => Promise<TResult>
    ): (...args: TArgs) => Promise<TResult> {
      return fn
    },
    revalidateTag(_tag: string): void {
      // no-op
    },
    revalidatePath(_path: string, _type?: 'page' | 'layout'): void {
      // no-op
    },
  }
}
