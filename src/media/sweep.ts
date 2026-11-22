import { isPrivateKey } from './keys'
import type { StorageEngine } from './types'

/** Masa tenggang minimum (ms) = masa berlaku default presigned upload (900 detik). */
export const MIN_SWEEP_GRACE_MS = 900_000

export interface SweepOptions {
  /**
   * Hanya objek yang LEBIH TUA dari ini yang jadi kandidat. Angka = milidetik,
   * atau string `'30m' | '24h' | '7d' | '90s'`. Tidak boleh kurang dari 15 menit
   * (masa berlaku default presigned upload) agar upload yang sedang berjalan atau
   * belum sempat dicatat ke DB tidak terhapus; ubah dengan `allowShortGrace`.
   */
  olderThan: string | number

  /**
   * Apakah `key` masih dipakai (ada di DB)? true = aman, jangan dihapus.
   * Bila callback melempar error, sweep dibatalkan TANPA menghapus apa pun.
   */
  isReferenced: (key: string) => boolean | Promise<boolean>

  /** Default `true`: hanya melaporkan kandidat, tidak menghapus. Set `false` untuk menghapus. */
  dryRun?: boolean

  /** Batasi pemindaian ke prefix tertentu, misal `'avatar/'`. */
  prefix?: string

  /** Ikutkan key privat (`internal/`, `private/`). Default `false`. */
  includePrivate?: boolean

  /**
   * Batas jumlah penghapusan per panggilan (pengaman bila `isReferenced` keliru).
   * Default 1000. Sisanya dilaporkan lewat `truncated: true`.
   */
  maxDelete?: number

  /** Izinkan `olderThan` di bawah 15 menit. Default `false`. */
  allowShortGrace?: boolean

  /** Untuk pengujian. */
  now?: Date | number
}

export interface SweepResult {
  dryRun: boolean
  /** Jumlah objek yang dipindai. */
  scanned: number
  /** Objek yatim yang memenuhi syarat (tua + tidak direferensikan), sebelum dibatasi maxDelete. */
  orphans: string[]
  /** Key yang benar-benar dihapus (kosong saat dryRun). */
  deleted: string[]
  /** Key yang gagal dihapus beserta pesan error. */
  failed: { key: string; error: string }[]
  /** Total byte yatim yang bisa/sudah dibebaskan (hanya objek yang masuk batas maxDelete). */
  bytes: number
  /** true bila jumlah yatim melebihi maxDelete. */
  truncated: boolean
  skipped: {
    recent: number
    referenced: number
    private: number
    temp: number
    unknownAge: number
  }
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

export function parseDuration(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error(`Durasi tidak valid: ${input}`)
    return input
  }
  const m = /^\s*(\d+(?:\.\d+)?)\s*([smhd])\s*$/i.exec(input)
  if (!m) throw new Error(`Durasi tidak valid: "${input}". Contoh: '30m', '24h', '7d'.`)
  return Number(m[1]) * UNIT_MS[m[2].toLowerCase()]
}

export async function sweepStorage(storage: StorageEngine, options: SweepOptions): Promise<SweepResult> {
  if (!storage.listObjects) {
    throw new Error(`Driver storage ${storage.kind} tidak mendukung listObjects().`)
  }
  if (typeof options.isReferenced !== 'function') {
    throw new Error('sweep: isReferenced wajib diisi.')
  }

  const graceMs = parseDuration(options.olderThan)
  if (graceMs < MIN_SWEEP_GRACE_MS && !options.allowShortGrace) {
    throw new Error(
      `sweep: olderThan minimal 15 menit (masa berlaku presigned upload). ` +
        `Set allowShortGrace: true bila memang disengaja.`
    )
  }

  const dryRun = options.dryRun ?? true
  const maxDelete = options.maxDelete ?? 1000
  const now = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now())
  const cutoff = now - graceMs

  const result: SweepResult = {
    dryRun,
    scanned: 0,
    orphans: [],
    deleted: [],
    failed: [],
    bytes: 0,
    truncated: false,
    skipped: { recent: 0, referenced: 0, private: 0, temp: 0, unknownAge: 0 },
  }
  const sizeOf = new Map<string, number>()

  // Fase 1: pindai semua halaman & kumpulkan kandidat. Belum ada yang dihapus,
  // jadi error di tengah jalan (mis. DB mati) tidak meninggalkan hasil setengah jadi.
  let token: string | undefined
  do {
    const page = await storage.listObjects({ prefix: options.prefix, continuationToken: token })
    for (const obj of page.objects) {
      result.scanned++
      if (obj.key.endsWith('.tmp')) {
        result.skipped.temp++
        continue
      }
      if (!options.includePrivate && isPrivateKey(obj.key)) {
        result.skipped.private++
        continue
      }
      const ts = obj.lastModified ? Date.parse(obj.lastModified) : NaN
      if (!Number.isFinite(ts)) {
        result.skipped.unknownAge++
        continue
      }
      if (ts > cutoff) {
        result.skipped.recent++
        continue
      }
      if (await options.isReferenced(obj.key)) {
        result.skipped.referenced++
        continue
      }
      result.orphans.push(obj.key)
      sizeOf.set(obj.key, obj.size)
    }
    token = page.nextContinuationToken ?? undefined
  } while (token)

  result.truncated = result.orphans.length > maxDelete
  const target = result.orphans.slice(0, maxDelete)
  result.bytes = target.reduce((sum, k) => sum + (sizeOf.get(k) ?? 0), 0)

  // Fase 2: hapus (kecuali dry-run).
  if (!dryRun) {
    for (const key of target) {
      try {
        await storage.delete(key)
        result.deleted.push(key)
      } catch (err) {
        result.failed.push({ key, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  return result
}
