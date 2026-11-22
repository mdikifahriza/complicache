import { CacheSerializationError } from './errors'

export interface Serializer {
  serialize(data: unknown): string
  deserialize(raw: string): unknown
}

const isDate = (v: unknown): v is Date =>
  // instanceof saja tidak cukup: Date dari realm lain (vm context, iframe, edge runtime
  // sandbox) bukan instance dari Date global kita.
  v instanceof Date || Object.prototype.toString.call(v) === '[object Date]'

/**
 * Ubah Date & BigInt menjadi objek bertanda ({ __type, value }) SEBELUM JSON.stringify jalan.
 *
 * Kenapa tidak lewat replacer? Date.prototype.toJSON dipanggil lebih dulu, jadi replacer hanya
 * melihat string. Trik lama membaca objek asli lewat `this[key]` bergantung pada `this` di
 * replacer yang di-bind ke holder — rapuh di runtime/polyfill/wrapper yang tidak
 * mempertahankan semantik itu. Dengan walk eksplisit, tidak ada yang bergantung pada `this`.
 *
 * Perilaku selain Date/BigInt sengaja dibiarkan sama dengan JSON.stringify
 * (toJSON dihormati, undefined/function/symbol dibuang oleh stringify, circular ditolak).
 */
function encode(value: unknown, key: string, ancestors: Set<object>): unknown {
  if (typeof value === 'bigint') {
    return { __type: 'BigInt', value: value.toString() }
  }
  if (typeof value !== 'object' || value === null) return value

  if (isDate(value)) {
    // Date tidak valid -> toISOString melempar RangeError (ditangkap serialize()).
    return { __type: 'Date', value: value.toISOString() }
  }

  if (ancestors.has(value)) {
    throw new TypeError('Converting circular structure to JSON')
  }

  // Hormati toJSON milik tipe lain (URL, Buffer, dsb.) persis seperti JSON.stringify.
  const withToJSON = value as { toJSON?: unknown }
  if (typeof withToJSON.toJSON === 'function') {
    ancestors.add(value)
    try {
      return encode((withToJSON.toJSON as (k: string) => unknown).call(value, key), key, ancestors)
    } finally {
      ancestors.delete(value)
    }
  }

  // Number/String/Boolean hasil `new` -> biarkan stringify yang meng-unwrap.
  const tag = Object.prototype.toString.call(value)
  if (tag === '[object Number]' || tag === '[object String]' || tag === '[object Boolean]') {
    return value
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item, i) => encode(item, String(i), ancestors))
    }
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value)) {
      out[k] = encode((value as Record<string, unknown>)[k], k, ancestors)
    }
    return out
  } finally {
    ancestors.delete(value)
  }
}

function reviver(_key: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    'value' in value
  ) {
    const typed = value as { __type: string; value: string }
    if (typed.__type === 'Date') {
      return new Date(typed.value)
    }
    if (typed.__type === 'BigInt') {
      return BigInt(typed.value)
    }
  }
  return value
}

export const defaultSerializer: Serializer = {
  serialize(data: unknown): string {
    try {
      return JSON.stringify(encode(data, '', new Set()))
    } catch (err) {
      throw new CacheSerializationError(
        `[complicache] Gagal menyerialisasi data cache: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  },
  deserialize(raw: string): unknown {
    try {
      return JSON.parse(raw, reviver)
    } catch (err) {
      throw new CacheSerializationError(
        `[complicache] Gagal mendeserialisasi data cache: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  },
}
