import type { InvalidateOptions } from './types'

/** Operasi mutasi Prisma yang memicu invalidasi secara default. */
export const DEFAULT_MUTATION_OPERATIONS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
] as const

/** Bagian dari CacheModule yang dibutuhkan (structural typing -> tanpa dependensi @prisma/client). */
export interface InvalidatorTarget {
  // `any` disengaja: TModel adalah union nama model milik proyek.
  invalidateModel(model: any, options?: InvalidateOptions): void
}

export interface PrismaInvalidatorOptions {
  /**
   * Operasi yang dianggap mutasi.
   * Default: create, createMany, createManyAndReturn, update, updateMany,
   * updateManyAndReturn, upsert, delete, deleteMany.
   */
  operations?: readonly string[]

  /**
   * Yang dilakukan bila invalidasi melempar error — paling umum karena model belum
   * terdaftar di MODEL_EFFECTS. Mutasi DB sudah sukses saat ini terjadi, sehingga
   * default-nya TIDAK boleh membuat mutasi terlihat gagal.
   * - 'warn'   (default): console.warn sekali per model, hasil mutasi tetap dikembalikan
   * - 'ignore': diam
   * - 'throw'  : lempar ulang (hasil mutasi hilang bagi pemanggil — hati-hati)
   */
  onError?: 'warn' | 'ignore' | 'throw'

  /** Diteruskan ke `invalidateModel` ('now' | 'swr'). */
  invalidate?: InvalidateOptions

  /**
   * Invalidasi LAGI setelah N ms (opsional, default mati).
   *
   * Di dalam interactive transaction (`$transaction(async tx => ...)`), hook ini jalan
   * SEBELUM commit: request lain bisa mengisi ulang cache dengan data lama di antara
   * invalidasi dan commit. Invalidasi kedua menutup celah itu bila commit selesai dalam
   * N ms. Ini mitigasi, bukan jaminan: di serverless timer bisa tidak sempat jalan, dan
   * untuk alur kritis tetap panggil `invalidateModel()` setelah `await $transaction(...)`.
   */
  reinvalidateAfterMs?: number
}

export interface PrismaInvalidatorExtension {
  name: string
  query: {
    $allModels: {
      $allOperations(params: {
        model: string
        operation: string
        args: any
        query: (args: any) => Promise<any>
      }): Promise<any>
    }
  }
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
export function createPrismaInvalidator(
  cache: InvalidatorTarget,
  options: PrismaInvalidatorOptions = {}
): PrismaInvalidatorExtension {
  const ops = new Set<string>(options.operations ?? DEFAULT_MUTATION_OPERATIONS)
  const onError = options.onError ?? 'warn'
  const warned = new Set<string>()

  const fire = (model: string): void => {
    try {
      if (options.invalidate) cache.invalidateModel(model, options.invalidate)
      else cache.invalidateModel(model)
    } catch (err) {
      if (onError === 'throw') throw err
      if (onError === 'warn' && !warned.has(model)) {
        warned.add(model)
        console.warn(
          `[complicache] invalidasi otomatis untuk model "${model}" gagal: ` +
            `${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  return {
    name: 'complicache-invalidator',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args)
          if (ops.has(operation)) {
            fire(model)
            const delay = options.reinvalidateAfterMs
            if (delay && delay > 0) {
              const t = setTimeout(() => {
                try {
                  fire(model)
                } catch {
                  // onError: 'throw' tidak bisa dilempar dari timer — abaikan
                }
              }, delay)
              ;(t as { unref?: () => void }).unref?.()
            }
          }
          return result
        },
      },
    },
  }
}
