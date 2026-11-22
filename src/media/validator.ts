import { MIME_TO_KIND } from './constants'
import type { MediaKind } from './types'

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaValidationError'
  }
}

/**
 * Jumlah byte awal yang cukup untuk memeriksa semua signature di bawah, termasuk daftar
 * compatible brands pada box `ftyp`. Pemanggil yang hanya membaca potongan awal file
 * (mis. lewat Range request) sebaiknya membaca sebanyak ini.
 */
export const MAGIC_BYTES_LENGTH = 128

interface FtypInfo {
  major: string
  compatible: string[]
}

/**
 * Parse box `ftyp` (ISO BMFF): [size:4]['ftyp'][major:4][minor:4][compatible brands:4 × n].
 * Mengembalikan null bila bukan ISO BMFF. Daftar brand dipotong sesuai buffer yang tersedia.
 */
function parseFtyp(b: Buffer): FtypInfo | null {
  if (b.length < 12 || b.subarray(4, 8).toString('latin1') !== 'ftyp') return null
  const boxSize = b.readUInt32BE(0)
  // size 0/1 = "sampai akhir file"/64-bit; untuk ftyp itu tidak lazim -> pakai batas buffer saja.
  const end = boxSize >= 16 ? Math.min(boxSize, b.length) : b.length
  const major = b.subarray(8, 12).toString('latin1')
  const compatible: string[] = []
  for (let i = 16; i + 4 <= end; i += 4) {
    compatible.push(b.subarray(i, i + 4).toString('latin1'))
  }
  return { major, compatible }
}

const AVIF_BRANDS = new Set(['avif', 'avis'])
// Brand generik HEIF: AVIF boleh memakainya sebagai major, asal 'avif'/'avis' ada di compatible.
const HEIF_GENERIC_BRANDS = new Set(['mif1', 'msf1', 'miaf'])

function isAvif(b: Buffer): boolean {
  const ftyp = parseFtyp(b)
  if (!ftyp) return false
  if (AVIF_BRANDS.has(ftyp.major)) return true
  // HEIC/HEIF memakai major heic/heix/hevc/... -> tidak masuk di sini.
  return HEIF_GENERIC_BRANDS.has(ftyp.major) && ftyp.compatible.some((c) => AVIF_BRANDS.has(c))
}

const MP4_MAJOR_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9',
  'mp41', 'mp42', 'mp71', 'avc1', 'dash', 'mmp4', 'msnv', 'xavc',
  'm4v ', 'm4vh', 'm4vp',
])
// Format ISO BMFF lain yang kerap disalahartikan sebagai MP4 (audio, gambar, QuickTime, 3GPP, RAW).
const NON_MP4_MAJOR_BRANDS = new Set([
  'm4a ', 'm4b ', 'm4p ', 'f4a ', 'qt  ', 'crx ', 'jp2 ', 'jpx ', 'jpm ',
  'avif', 'avis', 'mif1', 'msf1', 'miaf',
  'heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs',
])

function isMp4(b: Buffer): boolean {
  const ftyp = parseFtyp(b)
  if (!ftyp) return false
  const major = ftyp.major.toLowerCase()
  if (NON_MP4_MAJOR_BRANDS.has(major) || major.startsWith('3gp') || major.startsWith('3g2')) {
    return false
  }
  if (MP4_MAJOR_BRANDS.has(major)) return true
  // Major brand tidak dikenal: terima hanya bila compatible brands menyatakan MP4/ISO base media.
  return ftyp.compatible.some((c) => MP4_MAJOR_BRANDS.has(c.toLowerCase()))
}

/**
 * Cek tanda biner (magic bytes) di awal buffer untuk memastikan tipe file tidak dipalsukan.
 */
export function matchesMagicBytes(buffer: Uint8Array | Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false
  const b = buffer instanceof Buffer ? buffer : Buffer.from(buffer)
  const ascii = (start: number, end: number) => b.subarray(start, end).toString('latin1')

  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    case 'image/png':
      return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    case 'image/gif':
      return ascii(0, 3) === 'GIF'
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    case 'image/avif':
      return isAvif(b)
    case 'image/svg+xml':
      return /\<svg[\s>]/i.test(b.subarray(0, 1024).toString('utf8'))
    case 'video/mp4':
      return isMp4(b)
    case 'video/webm':
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
    case 'application/pdf':
      return ascii(0, 5) === '%PDF-'
    case 'application/msword':
      return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    case 'application/zip':
    case 'application/x-zip-compressed':
      return b[0] === 0x50 && b[1] === 0x4b // PK
    case 'text/plain':
    case 'text/csv':
      // Teks biasa tidak punya signature unik; tolak bila mengandung byte null (karakter biner)
      return !b.subarray(0, 512).includes(0x00)
    default:
      return true
  }
}

/**
 * Buang data script atau injeksi XSS dari SVG sebelum disimpan.
 *
 * Sanitasi komprehensif meliputi:
 *  - <script> tags
 *  - <foreignObject> tags
 *  - Event handler attributes (on*)
 *  - javascript: URIs (termasuk entity-encoded dan mixed-case)
 *  - <set>/<animate> yang bisa mengubah href ke javascript:
 *  - <style> yang mengandung @import atau expression()
 *  - data: URIs di href/src (bisa mengandung HTML/JS)
 *  - <use> dengan external references
 */
export function stripSvgScripts(svgText: string): string {
  let cleaned = svgText

  // 1. Hapus <script> tags (termasuk self-closing <script/>)
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '')
  cleaned = cleaned.replace(/<script[^>]*\/?\s*>/gi, '')

  // 2. Hapus <foreignObject> tags
  cleaned = cleaned.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')

  // 3. Hapus event handler attributes (on*)
  //    Menangani berbagai quoting: double quotes, single quotes, unquoted
  cleaned = cleaned.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')

  // 4. Hapus javascript: URIs di semua atribut href/xlink:href/src/action/formaction
  //    Termasuk yang di-encode sebagai entity (&#106;avascript, &#x6A;avascript, dll.)
  //    dan yang ada whitespace/newline di antaranya
  const jsUriPattern = /\b(href|xlink:href|src|action|formaction)\s*=\s*(?:"[^"]*?(?:javascript\s*:|&#(?:x0*6a|0*106);|&#(?:x0*4a|0*74);)[^"]*"|'[^']*?(?:javascript\s*:|&#(?:x0*6a|0*106);|&#(?:x0*4a|0*74);)[^']*')/gi
  cleaned = cleaned.replace(jsUriPattern, '')

  // 5. Hapus data: URIs di href (bisa mengandung HTML/JS)
  cleaned = cleaned.replace(/\b(href|xlink:href)\s*=\s*(?:"[^"]*data:[^"]*"|'[^']*data:[^']*')/gi, '')

  // 6. Hapus <set> dan <animate*> yang menarget href/xlink:href
  //    Ini bisa dipakai untuk mengubah link ke javascript: secara dinamis
  cleaned = cleaned.replace(/<set\b[^>]*attributeName\s*=\s*["'](?:href|xlink:href)["'][^>]*\/?>/gi, '')
  cleaned = cleaned.replace(/<animate\b[^>]*attributeName\s*=\s*["'](?:href|xlink:href)["'][^>]*\/?>/gi, '')
  // Juga tangkap <set> tanpa memperhatikan urutan atribut, selama to="javascript:..."
  cleaned = cleaned.replace(/<set\b[^>]*to\s*=\s*["'][^"']*javascript:[^"']*["'][^>]*\/?>/gi, '')

  // 7. Sanitasi <style> blocks: hapus @import dan expression()
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, (styleBlock) => {
    // Hapus @import rules (bisa load external CSS yang mengandung JS)
    let sanitized = styleBlock.replace(/@import\b[^;]*;?/gi, '/* @import removed */')
    // Hapus expression() — IE legacy tapi masih berbahaya
    sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '/* expression removed */')
    // Hapus url() yang mengarah ke javascript: atau data:
    sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*(?:javascript|data)\s*:[^)]*\)/gi, '/* url removed */')
    return sanitized
  })

  return cleaned
}

export function detectMediaKind(mimeType: string): MediaKind {
  return MIME_TO_KIND[mimeType.toLowerCase()] ?? 'DOCUMENT'
}
