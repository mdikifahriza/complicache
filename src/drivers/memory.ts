import type { CacheDriver, CacheDescriptor } from './interface'

interface MemoryEntry {
  value: unknown
  expiresAt: number | null
  tags: Set<string>
  generation: number
}

export function createMemoryDriver(): CacheDriver {
  const store = new Map<string, MemoryEntry>()
  const inflight = new Map<string, Promise<unknown>>()
  /** Monotonic counter per tag, incremented on revalidateTag. */
  const tagGeneration = new Map<string, number>()

  function buildKey(descriptor: CacheDescriptor, args: unknown[]): string {
    const parts = [descriptor.name, ...descriptor.keyParts]
    if (args.length > 0) {
      try {
        parts.push(JSON.stringify(args))
      } catch {
        parts.push(String(args))
      }
    }
    return parts.join(':')
  }

  function isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt
  }

  /** Get the current combined generation for a set of tags. */
  function currentGeneration(tags: Set<string> | string[]): number {
    let gen = 0
    for (const tag of tags) {
      gen += tagGeneration.get(tag) ?? 0
    }
    return gen
  }

  /**
   * Deep-clone a value to prevent callers from mutating the cache.
   * Uses structuredClone when available, falls back to JSON round-trip.
   */
  function cloneValue<T>(val: T): T {
    if (val === null || val === undefined) return val
    if (typeof val !== 'object') return val
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(val)
      }
    } catch {
      // structuredClone fails on some types, fall back
    }
    try {
      return JSON.parse(JSON.stringify(val))
    } catch {
      return val // un-cloneable, return as-is
    }
  }

  return {
    name: 'memory',
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
      return async (...args: TArgs): Promise<TResult> => {
        const key = buildKey(descriptor, args)
        const hit = store.get(key)
        const gen = currentGeneration(descriptor.tags)

        if (hit && !isExpired(hit) && hit.generation === gen) {
          return cloneValue(hit.value) as TResult
        }

        // Dedup in-flight requests: if another caller is already loading
        // the same key, await its result instead of calling the loader again.
        const existing = inflight.get(key) as Promise<TResult> | undefined
        if (existing) {
          const result = await existing
          return cloneValue(result)
        }

        const genAtStart = gen
        const promise = fn(...args)
        inflight.set(key, promise)

        try {
          const result = await promise

          // Only write to cache if the generation hasn't changed during loading.
          // If invalidate() was called while loading, the result is stale.
          const genNow = currentGeneration(descriptor.tags)
          if (genNow === genAtStart) {
            store.set(key, {
              value: cloneValue(result),
              // ttl === 0 means "expire immediately" (not permanent)
              // ttl === undefined means "permanent (no expiration)"
              expiresAt:
                descriptor.ttl !== undefined && descriptor.ttl !== null
                  ? Date.now() + descriptor.ttl * 1000
                  : null,
              tags: new Set(descriptor.tags),
              generation: genAtStart,
            })
          }

          return cloneValue(result)
        } finally {
          inflight.delete(key)
        }
      }
    },

    revalidateTag(tag: string): void {
      // Bump generation so in-flight loaders know their result is stale
      tagGeneration.set(tag, (tagGeneration.get(tag) ?? 0) + 1)

      for (const [key, entry] of store.entries()) {
        if (entry.tags.has(tag)) {
          store.delete(key)
        }
      }
    },

    revalidatePath(_path: string, _type?: 'page' | 'layout'): void {
      // In-memory driver tidak memiliki route cache terpisah
    },
  }
}
