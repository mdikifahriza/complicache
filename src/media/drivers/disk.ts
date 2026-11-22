import fs from 'node:fs/promises'
import path from 'node:path'
import { MIME_BY_EXT } from '../constants'
import { safeRelativeKey } from '../keys'
import type {
  DiskDriverConfig,
  StorageEngine,
  StorageListOptions,
  StoragePutOptions,
  StorageReadResult,
  StoredObjectInfo,
  StoredObjectList,
} from '../types'

export class DiskStorageEngine implements StorageEngine {
  readonly kind = 'disk' as const
  private baseDir: string
  private publicUrlPrefix: string

  constructor(config?: DiskDriverConfig) {
    const configuredDir = config?.baseDir || 'storage/uploads'
    this.baseDir = path.isAbsolute(configuredDir)
      ? configuredDir
      : path.join(process.cwd(), configuredDir)
    this.publicUrlPrefix = (config?.publicUrlPrefix || '/media').replace(/\/$/, '')
  }

  private resolvePath(key: string): string | null {
    const safe = safeRelativeKey(key)
    if (!safe) return null
    const target = path.resolve(this.baseDir, safe)
    const baseResolved = path.resolve(this.baseDir)
    if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) {
      return null
    }
    return target
  }

  async put(key: string, body: Buffer | Uint8Array, _options: StoragePutOptions): Promise<void> {
    const filePath = this.resolvePath(key)
    if (!filePath) throw new Error(`Invalid storage key: ${key}`)

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const buf = body instanceof Buffer ? body : Buffer.from(body)

    // Tulis ke file sementara lalu rename (atomik). Selain mencegah pembaca melihat file yang
    // setengah tertulis, setiap versi mendapat inode baru sehingga ikut membedakan ETag.
    const tmpPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`
    try {
      await fs.writeFile(tmpPath, buf, { mode: 0o644 })
      await fs.rename(tmpPath, filePath)
    } catch (err) {
      await fs.rm(tmpPath, { force: true }).catch(() => {})
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key)
    if (!filePath) return
    try {
      await fs.rm(filePath, { force: true })
    } catch {
      // Abaikan bila file tidak ada
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key)
    if (!filePath) return false
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async read(key: string, range?: string): Promise<StorageReadResult> {
    const filePath = this.resolvePath(key)
    if (!filePath) throw new Error('File tidak ditemukan.')

    // bigint: true -> mtime/ctime presisi nanodetik + inode tanpa kehilangan presisi.
    let stat: import('node:fs').BigIntStats
    try {
      stat = await fs.stat(filePath, { bigint: true })
    } catch {
      throw new Error('File tidak ditemukan.')
    }

    if (!stat.isFile()) throw new Error('File tidak valid.')

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    const size = Number(stat.size)

    // ETag lemah dari size + mtime (ns) + ctime (ns) + inode. Kombinasi size+mtime(ms) saja bisa
    // bentrok bila dua versi file berukuran sama ditulis dalam milidetik yang sama; ctime dan
    // inode menutup celah itu tanpa harus membaca/hash seluruh isi file (mahal untuk video).
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeNs.toString(16)}-${stat.ctimeNs.toString(16)}-${stat.ino.toString(16)}"`

    // Penanganan HTTP Range untuk video/audio
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      if (match) {
        const totalSize = size
        let start: number
        let end: number

        if (match[1] === '' && match[2] !== '') {
          // bytes=-100 → terakhir 100 byte
          const suffix = Number.parseInt(match[2], 10)
          start = Math.max(0, totalSize - suffix)
          end = totalSize - 1
        } else if (match[2] === '') {
          // bytes=100- → dari byte 100 sampai akhir
          start = Number.parseInt(match[1], 10)
          end = totalSize - 1
        } else {
          // bytes=100-200 → range eksplisit
          start = Number.parseInt(match[1], 10)
          end = Number.parseInt(match[2], 10)
        }

        // Clamp end ke ukuran file
        end = Math.min(end, totalSize - 1)

        // Validasi range
        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= totalSize) {
          // 416 Range Not Satisfiable
          return {
            body: Buffer.alloc(0),
            status: 416,
            contentType,
            contentLength: 0,
            contentRange: `bytes */${totalSize}`,
            etag,
            lastModified: stat.mtime,
          }
        }

        const fileHandle = await fs.open(filePath, 'r')
        try {
          const chunkSize = end - start + 1
          const chunkBuffer = Buffer.alloc(chunkSize)
          await fileHandle.read(chunkBuffer, 0, chunkSize, start)

          return {
            body: chunkBuffer,
            status: 206,
            contentType,
            contentLength: chunkSize,
            contentRange: `bytes ${start}-${end}/${totalSize}`,
            etag,
            lastModified: stat.mtime,
          }
        } finally {
          await fileHandle.close()
        }
      }
    }

    const fullBuffer = await fs.readFile(filePath)
    return {
      body: fullBuffer,
      status: 200,
      contentType,
      contentLength: size,
      etag,
      lastModified: stat.mtime,
    }
  }

  async getUrl(key: string, _options?: { isPrivate?: boolean; expiresInSeconds?: number; downloadName?: string }): Promise<string> {
    const safe = safeRelativeKey(key)
    return `${this.publicUrlPrefix}/${safe}`
  }

  async listObjects(options?: StorageListOptions): Promise<StoredObjectList> {
    const prefix = (options?.prefix ?? '').replace(/^[/\\]+/, '')
    const objects: StoredObjectInfo[] = []

    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), childRel)
          continue
        }
        if (prefix && !childRel.startsWith(prefix)) continue
        try {
          const stat = await fs.stat(path.join(dir, entry.name))
          objects.push({ key: childRel, size: stat.size, lastModified: stat.mtime.toISOString() })
        } catch {
          // Lewati file yang gagal di-stat
        }
      }
    }

    await walk(this.baseDir, '')
    objects.sort((a, b) => (a.key < b.key ? -1 : 1))
    return { objects, nextContinuationToken: null }
  }
}
