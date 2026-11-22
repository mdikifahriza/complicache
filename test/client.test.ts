import test from 'node:test'
import assert from 'node:assert/strict'
import { compressImageInBrowser, BrowserCompressionError } from '../src/media/client'

type Hooks = { ctx?: boolean; blob?: Blob | null | 'throw'; decode?: boolean }

function installDom({ ctx = true, blob = new Blob(['x']), decode = true }: Hooks) {
  const g = globalThis as any
  g.window = {}
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => (ctx ? { drawImage() {} } : null),
      toBlob: (cb: (b: Blob | null) => void) => {
        if (blob === 'throw') throw new Error('boom')
        cb(blob)
      },
    }),
  }
  g.URL.createObjectURL = () => 'blob:x'
  g.URL.revokeObjectURL = () => {}
  g.Image = class {
    naturalWidth = 100
    naturalHeight = 100
    onload?: () => void
    onerror?: () => void
    set src(_v: string) {
      queueMicrotask(() => (decode ? this.onload?.() : this.onerror?.()))
    }
  }
}
const cleanup = () => {
  const g = globalThis as any
  delete g.window
  delete g.document
  delete g.Image
}
const file = (name = 'a.jpg', type = 'image/jpeg', size = 1000) =>
  new File([new Uint8Array(size)], name, { type })

test('sukses: compressed=true tanpa error', async () => {
  installDom({ blob: new Blob([new Uint8Array(10)], { type: 'image/webp' }) })
  try {
    const r = await compressImageInBrowser(file())
    assert.equal(r.compressed, true)
    assert.equal(r.filename, 'a.webp')
    assert.equal(r.error, undefined)
  } finally { cleanup() }
})

test('gagal decode / canvas / toBlob / exception dilaporkan lewat result.error', async () => {
  const cases: [Hooks, string][] = [
    [{ decode: false }, 'decode-failed'],
    [{ ctx: false }, 'canvas-unavailable'],
    [{ blob: null }, 'encode-failed'],
    [{ blob: 'throw' }, 'exception'],
  ]
  for (const [hooks, reason] of cases) {
    installDom(hooks)
    try {
      const seen: BrowserCompressionError[] = []
      const f = file()
      const r = await compressImageInBrowser(f, { onError: (e) => seen.push(e) })
      assert.equal(r.compressed, false, reason)
      assert.equal(r.file, f, 'fallback ke file asli')
      assert.equal(r.skipReason, reason)
      assert.ok(r.error instanceof BrowserCompressionError)
      assert.equal(r.error!.reason, reason)
      assert.equal(seen.length, 1)
    } finally { cleanup() }
  }
})

test('strict: kegagalan menolak promise', async () => {
  installDom({ decode: false })
  try {
    await assert.rejects(compressImageInBrowser(file(), { strict: true }), BrowserCompressionError)
  } finally { cleanup() }
})

test('bukan kegagalan: dilewati tanpa error', async () => {
  installDom({ blob: new Blob([new Uint8Array(5000)], { type: 'image/webp' }) })
  try {
    const big = await compressImageInBrowser(file())
    assert.equal(big.skipReason, 'larger-than-original')
    assert.equal(big.error, undefined)
    const svg = await compressImageInBrowser(file('a.svg', 'image/svg+xml'))
    assert.equal(svg.skipReason, 'vector-or-animated')
    const vid = await compressImageInBrowser(file('a.mp4', 'video/mp4'))
    assert.equal(vid.skipReason, 'not-image')
    assert.equal(vid.error, undefined)
  } finally { cleanup() }
})
