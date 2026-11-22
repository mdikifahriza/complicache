export interface CacheDescriptor {
  name: string
  tags: string[]
  ttl?: number
  keyParts: string[]
  scope: 'default' | 'remote' | 'private'
}

export interface RevalidateTagOptions {
  /**
   * Mode invalidasi:
   * - 'now': Hapus/update seketika (read-your-writes, misalnya setelah mutasi admin)
   * - 'swr': Tandai basi, data segar diambil di request berikutnya (default Next 16 SWR)
   */
  mode?: 'now' | 'swr'
}

export interface CacheDriver {
  readonly name: string
  readonly capabilities: {
    supportsTags: boolean
    supportsTTL: boolean
    supportsRemote: boolean
    supportsPrivate: boolean
  }
  wrap<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    descriptor: CacheDescriptor
  ): (...args: TArgs) => Promise<TResult>
  revalidateTag(tag: string, options?: RevalidateTagOptions): void | Promise<void>
  revalidatePath?(path: string, type?: 'page' | 'layout'): void | Promise<void>
}
