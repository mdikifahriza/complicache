# complicache

> **Plesetan dari *"complicate"* (rumit)** — karena urusan caching di Next.js terlalu rumit, bikin pusing, dan sering gonta-ganti versi.

Schema-driven Next.js Data Cache. Definisikan entri cache, dependency graph, dan model effects sekali di satu tempat — pakai konsisten tanpa harus pusing cari sambungan tag ke sana kemari.

---

> [!CAUTION]
> ### ⚠️ PERINGATAN PENTING & DISCLAIMER PRIBADI
> Proyek ini dibuat semata-mata untuk mempermudah hidup **pribadi saya sendiri** dalam menangani caching Next.js yang ribet. Proyek ini **BUKAN** untuk penggunaan orang lain.
>
> **Penulis sama sekali TIDAK bertanggung jawab** atas segala bentuk bug, data stale/basi, kehilangan data, kerusakan sistem, atau kerugian apapun yang dialami oleh orang lain atau pihak ketiga manapun akibat pemakaian library ini. Segala risiko ditanggung sendiri sepenuhnya (*strictly at your own risk*).

---

## Masalah yang Diselesaikan

Di proyek Next.js yang tumbuh, urusan caching sering kali bikin frustrasi:

1. **Sambungan yang Tercecer**: Di file service ada `unstable_cache(..., ['news'], { tags: ['news'] })`, di file action ada `revalidateTag('news')`. Harus buka-buka banyak file untuk memastikan nama tagnya tidak typo.
2. **Invalidasi Cascading yang Terlupakan**: Saat model `News` dimutasi, apa yang harus diinvalidasi? Selain cache berita, apakah cache sitemap dan RSS feed sudah ikut mati? Sering kali developer lupa, dan data basi bertahan selamanya.
3. **Versi Next.js yang Berubah-ubah**: Next 14 pakai cara A, Next 15 ganti default, Next 16 merombak ke `'use cache'`. Library ini menjadi lapisan pelindung (*adapter shield*) agar kode aplikasi tidak perlu ikut diobrak-abrik tiap Next.js rilis versi baru.

`complicache` menyediakan satu titik definisi skema untuk seluruh cache proyek, dependency graph otomatis, dan API yang cukup ringkas.

---

## Quickstart

```bash
npm install complicache
```

### 1. Definisikan schema di proyek

```ts
// lib/cache/schema.ts
import { defineCacheSchema, defineModelEffects } from 'complicache'
import type { Prisma } from '@prisma/client'

export const CACHE_SCHEMA = defineCacheSchema({
  news:     { ttl: 300 },
  events:   { ttl: 300 },
  gallery:  { ttl: 600 },
  sitemap:  { ttl: 43200, dependsOn: ['news', 'events'] }, // ← otomatis ikut mati jika news/events diinvalidasi
  settings: {},  // permanen — hanya mati via invalidate() atau server restart
})

export const MODEL_EFFECTS = defineModelEffects<Prisma.ModelName, keyof typeof CACHE_SCHEMA>({
  News:         ['news'],
  NewsTag:      ['news'],
  NewsCategory: ['news'],
  Event:        ['events'],
  GalleryAlbum: ['gallery'],
  GalleryItem:  ['gallery'],
  Setting:      ['settings'], // saat Setting diubah di DB, cache settings diinvalidasi
  Member:       'none',       // model tanpa cache: opsional, bisa ditulis 'none'
})
```

### 2. Buat module

```ts
// lib/cache/index.ts
import 'server-only'
import { createCacheModule } from 'complicache'
import { CACHE_SCHEMA, MODEL_EFFECTS } from './schema'

export const { wrap, cached, invalidate, invalidateModel, invalidateAll, withDependents, revalidatePath } =
  createCacheModule(CACHE_SCHEMA, MODEL_EFFECTS)
```

### 3. Pakai di service (`wrap` atau `cached`)

```ts
// services/news.service.ts
import { wrap } from '@/lib/cache'
import prisma from '@/lib/prisma'

export const getPublishedNews = wrap(
  'news',
  [],
  () => prisma.news.findMany({ where: { published: true } })
)

export const getNewsBySlug = wrap(
  'news',
  ['by-slug'],
  (slug: string) => prisma.news.findUnique({ where: { slug } })
)
```

### 4. Invalidasi di action setelah mutasi DB

```ts
// app/admin/actions/news.ts
'use server'
import { invalidateModel, revalidatePath } from '@/lib/cache'
import prisma from '@/lib/prisma'

export async function createNews(data: NewsInput) {
  const news = await prisma.news.create({ data })
  
  // SATU BARIS INI: otomatis mematikan cache:news + cache:sitemap (via dependsOn)
  invalidateModel('News')
  
  revalidatePath('/admin/berita')
  revalidatePath('/berita')
}
```

---

## Fitur Utama

- **Version-Resilient (Anti Gonta-Ganti Versi)**: Menggunakan sistem Driver modular (`NextAutoDriver`, `NextModernDriver`, `NextClassicDriver`, `MemoryDriver`).
- **Zero-Dependency Core**: Logika graph, sanitasi tag, dan skema murni TypeScript tanpa dependensi runtime `next`.
- **In-Memory Testing Driver**: Bisa langsung dites di Vitest/Jest atau dijalankan di CLI script/Prisma seed tanpa perlu menjalankan server Next.js tiruan.
- **Cycle Detection**: Validasi otomatis saat schema dibuat agar tidak terjadi loop dependensi tak hingga.
- **Date & BigInt Safe Serializer**: Mencegah bug umum di mana objek `Date` berubah menjadi string ISO dan method-nya hilang.
- **Dry-Run & Pluggable Logger**: Mode debug untuk melihat tag apa saja yang akan terpengaruh tanpa benar-benar menghapus cache.

---

## Konsep TTL vs On-Demand

Keduanya bekerja **bersamaan**, bukan pilihan salah satu:

```
invalidate() dipanggil       → cache mati SEKARANG, TTL reset dari nol
invalidate() tidak dipanggil → cache mati setelah TTL habis (safety net)
```

TTL adalah jaring pengaman. Tanpa TTL, cache yang tidak terinvalidasi (karena mutasi langsung via DB console atau bug di action) akan hidup selamanya sampai server restart.

---

## Testing & Non-Next.js Environment

Jika Anda menjalankan unit test (Vitest/Jest) atau script Node biasa (Prisma seed):

```ts
import { createCacheModule, createMemoryDriver } from 'complicache'

// Gunakan MemoryDriver agar tidak membutuhkan runtime Next.js
export const cache = createCacheModule(SCHEMA, MODEL_EFFECTS, {
  driver: createMemoryDriver(),
})
```

---

## Otomasi, Audit & Observability

### Invalidasi otomatis lewat Prisma extension

Tanpa menambah dependensi (structural typing), cukup satu baris:

```ts
import { createPrismaInvalidator } from 'complicache'

export const prisma = new PrismaClient().$extends(createPrismaInvalidator(cache))
```

Setiap `create/update/delete/upsert/*Many` yang **berhasil** otomatis memanggil `invalidateModel(model)`.
Model yang belum terdaftar di `MODEL_EFFECTS` tidak membuat mutasi gagal (default `onError: 'warn'`).

Batasan yang perlu diketahui:
- `$executeRaw` / `$queryRaw` **tidak** terpantau, panggil `invalidateModel()` manual.
- Nested write hanya memicu model induknya.
- Di dalam interactive transaction, hook jalan **sebelum commit**, sehingga request lain bisa
  mengisi ulang cache dengan data lama. Opsi `reinvalidateAfterMs` menambah invalidasi kedua sebagai
  mitigasi; untuk alur kritis tetap panggil `invalidateModel()` setelah `await prisma.$transaction(...)`.

### Wajib mendaftarkan semua model (compile-time)

```ts
import { defineModelEffectsStrict } from 'complicache'

export const MODEL_EFFECTS = defineModelEffectsStrict<Prisma.ModelName, keyof typeof CACHE_SCHEMA>({
  News: ['news'],
  Member: 'none',
  // lupa mendaftarkan model baru -> error TypeScript, bukan error runtime di production
})
```

### Audit schema di test/CI

```ts
import { auditSchema, explain } from 'complicache'

test('schema cache bersih', () => {
  assert.deepEqual(auditSchema(CACHE_SCHEMA, MODEL_EFFECTS), [])
})

console.log(explain(CACHE_SCHEMA, 'news'))
// news
// └─ sitemap
//    └─ homepage
```

`auditSchema` melaporkan: cache permanen (tanpa `ttl`) yang tidak dipicu model mana pun, effect yang menunjuk
cache yang tidak ada, dan `dependsOn` ke cache yang tidak ada. Tersedia juga sebagai `cache.audit()` / `cache.explain(name)`.

### Statistik hit/miss

```ts
cache.stats()
// { news: { calls, hits, misses, errors, lastLoaderMs, lastLoadedAt, lastInvalidatedAt }, ... }
```

`logger.hit` / `logger.miss` kini benar-benar dipanggil (logger `'verbose'` ikut mencetaknya). Catatan:
- Counter bersifat **per instance** dan hilang saat restart; di serverless tiap instance punya angkanya sendiri.
- Revalidasi stale-while-revalidate di background menjalankan loader sehingga terhitung sebagai miss.
- `hits` dihitung `calls - misses` (akurat); log `hit` per panggilan bisa under-report bila ada miss bersamaan.

### Invalidasi per record

```ts
// schema: detail per record + list yang memuatnya
const SCHEMA = defineCacheSchema({
  newsDetail: { ttl: 300 },
  newsList: { ttl: 300, dependsOn: ['newsDetail'] },
})

const getNews = cache.wrapByKey('newsDetail', ['by-slug'], (slug: string) => db.news.findUnique({ where: { slug } }), (slug) => slug)

cache.invalidateKey('newsDetail', 'halo') // hanya "halo" yang dimuat ulang; newsList ikut mati
```

`invalidateKey` hanya mematikan satu record plus **dependan secara utuh**. Cache list dengan nama yang *sama*
tidak ikut mati, jadi pisahkan detail dan list di schema seperti di atas. Wrapper dibuat per panggilan karena tag
`unstable_cache` statis per wrapper; perilaku ini belum diuji di Next 15/16 sungguhan.

---

## Media & Asset Caching (`complicache/media`)

Selain caching query database, `complicache` menyertakan modul terpadu untuk **penanganan media, kompresi, dan immutable asset caching**:

```ts
import { createMediaStorage } from 'complicache/media'
```

### 1. Inisialisasi Storage (Satu Kode untuk Disk & S3/R2)

```ts
// lib/media.ts
import { createMediaStorage } from 'complicache/media'

export const media = createMediaStorage({
  // Otomatis memilih 's3' jika env S3_BUCKET terisi, atau 'disk' di lokal
  driver: 'auto',
  disk: {
    baseDir: 'storage/uploads',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    publicUrl: process.env.S3_PUBLIC_URL,
  },
})
```

### 2. Route Handler Pengantar Universal (3 Baris!)

Mendukung **ETag 304 Not Modified**, **HTTP Range 206** (video seek), proteksi path traversal, dan isolasi file privat secara otomatis:

```ts
// app/media/[...path]/route.ts
import { media } from '@/lib/media'

export const GET = (req: Request, ctx: any) =>
  media.serve(req, ctx, {
    // Hook otorisasi untuk berkas privat (internal/...)
    authorize: async (req, key) => {
      // Verifikasi session / auth pengguna di sini
      return true // atau false (403), atau Response kustom (redirect login)
    },
  })
```

### 3. Upload & Pemrosesan Gambar di Server

```ts
// Otomatis validasi magic bytes -> kompres WebP via Sharp -> simpan -> beri header immutable
const result = await media.save(file, {
  folder: 'avatar',
  preset: 'avatar', // 400x400 cover WebP (pilihan: avatar, cover, thumb, raw)
  originalName: 'foto-profil.jpg',
})

console.log(result.key) // "avatar/2026/03/4f8a...webp"
console.log(result.url) // "/media/avatar/2026/03/4f8a...webp" (atau URL CDN)
```

### Membersihkan file yatim (`media.sweep`)

Upload presigned yang tidak pernah di-`confirmUpload` dan avatar lama yang sudah diganti menumpuk di storage.

```ts
// 1) Tinjau dulu (dryRun aktif secara default, tidak ada yang dihapus)
const report = await media.sweep({
  olderThan: '24h',
  isReferenced: async (key) => !!(await db.file.findFirst({ where: { key } })),
})
console.log(report.orphans, report.bytes)

// 2) Hapus
await media.sweep({ olderThan: '24h', isReferenced, dryRun: false })
```

Pengaman: `olderThan` minimal 15 menit (sama dengan masa berlaku presigned upload), file `.tmp` dan key privat
(`internal/`) dilewati kecuali `includePrivate: true`, penghapusan dibatasi `maxDelete` (default 1000), dan bila
`isReferenced` melempar error seluruh sweep dibatalkan tanpa menghapus apa pun.

### 4. Client-Side Tools (`complicache/media/client`)

Kompres gambar di browser via HTML Canvas (menghemat kuota & menghindari batas payload server 4.5MB/10MB):

```ts
import { compressImageInBrowser, uploadDirectToStorage } from 'complicache/media/client'

// 1. Kompres di browser
const compressed = await compressImageInBrowser(file, { maxWidth: 2048, quality: 0.75 })

// 2. Upload langsung ke S3/R2 via Presigned PUT dengan progress bar byte-demi-byte
await uploadDirectToStorage({
  uploadUrl: presignedUrl,
  file: compressed.file,
  mimeType: compressed.mimeType,
  onProgress: (percent, loaded, total) => {
    console.log(`Upload: ${percent}% (${loaded}/${total} bytes)`)
  },
})
```

Bila kompresi gagal (gambar tak bisa didecode, canvas tidak tersedia, encode gagal), file asli tetap dikembalikan, tetapi kegagalannya **dilaporkan**:

```ts
const r = await compressImageInBrowser(file, {
  onError: (e) => console.warn(e.reason, e.message), // opsional
  // strict: true,  // tolak promise (BrowserCompressionError) alih-alih fallback ke file asli
})

if (r.error) showToast('Gambar diunggah tanpa kompresi.')   // gagal -> r.error.reason
// r.compressed === true  → hasil re-encode WebP
// r.skipReason           → 'not-image' | 'vector-or-animated' | 'larger-than-original' | ...
```

---

## License

MIT - Gunakan atas risiko sendiri.
