import { ATTACHMENT_EXTS, CACHE_POLICIES } from './constants'
import { isPrivateKey, safeRelativeKey } from './keys'
import type { StorageEngine } from './types'

export type RouteContext =
  | { params: { path: string[] } | Promise<{ path: string[] }> }
  | { params: Promise<{ [key: string]: string | string[] }> }
  | { params: { [key: string]: string | string[] } }
  | string

export interface ServeMediaOptions {
  /**
   * Hook otorisasi untuk berkas privat/internal.
   * Dipanggil saat permintaan menuju ke berkas privat (internal/...).
   * - Kembalikan `true` untuk mengizinkan akses.
   * - Kembalikan `false` untuk menolak (403 Forbidden).
   * - Kembalikan objek `Response` kustom (misal redirect ke login atau 401).
   */
  authorize?: (request: Request, key: string) => Promise<boolean | Response> | boolean | Response
}

/**
 * Ekstrak key path relatif dari Request atau Next.js context params.
 */
export async function extractRouteKey(
  request: Request,
  context?: RouteContext,
): Promise<string> {
  if (typeof context === 'string') {
    return safeRelativeKey(context)
  }

  if (context && 'params' in context) {
    const resolvedParams = await Promise.resolve(context.params)
    const rawPath = (resolvedParams as any).path
    if (Array.isArray(rawPath)) {
      return safeRelativeKey(rawPath.join('/'))
    }
    if (typeof rawPath === 'string') {
      return safeRelativeKey(rawPath)
    }
  }

  // Fallback: ekstrak dari URL pathname
  try {
    const url = new URL(request.url)
    const pathname = url.pathname
    const mediaIdx = pathname.indexOf('/media/')
    if (mediaIdx >= 0) {
      return safeRelativeKey(pathname.slice(mediaIdx + '/media/'.length))
    }
    return safeRelativeKey(pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
}

/**
 * Universal Route Handler untuk melayani media publik di Next.js App Router.
 * Mendukung ETag 304, HTTP Range 206, Immutable Caching, dan proteksi anti-traversal.
 */
export async function serveMedia(
  request: Request,
  keyOrContext: RouteContext,
  storage: StorageEngine,
  options?: ServeMediaOptions,
): Promise<Response> {
  const relativeKey = await extractRouteKey(request, keyOrContext)

  if (!relativeKey) {
    return new Response('Media Not Found', { status: 404 })
  }

  const isPrivate = isPrivateKey(relativeKey)

  // Penanganan berkas privat: wajib melewati authorize hook bila ada
  if (isPrivate) {
    if (!options?.authorize) {
      return new Response('Media Not Found', { status: 404 })
    }

    const authResult = await options.authorize(request, relativeKey)
    if (authResult instanceof Response) {
      return authResult
    }
    if (!authResult) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  try {
    const range = request.headers.get('range') ?? undefined
    const result = await storage.read(relativeKey, range)

    // 416 Range Not Satisfiable
    if (result.status === 416) {
      const headers416 = new Headers({
        'Content-Range': result.contentRange || `bytes */${result.contentLength}`,
        'Accept-Ranges': 'bytes',
      })
      return new Response(null, { status: 416, headers: headers416 })
    }

    const cachePolicy = isPrivate ? CACHE_POLICIES.private : CACHE_POLICIES.immutable

    // Cek ETag untuk 304 Not Modified
    const clientEtag = request.headers.get('if-none-match')
    if (result.etag && clientEtag && clientEtag === result.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': cachePolicy,
          'ETag': result.etag,
        },
      })
    }

    const filename = relativeKey.split('/').pop() || 'media'
    const ext = ('.' + (filename.split('.').pop() || '')).toLowerCase()
    const isAttachment = ATTACHMENT_EXTS.has(ext)
    const safeName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '')

    const headers = new Headers({
      'Content-Type': result.contentType,
      'Content-Length': String(result.contentLength),
      'Cache-Control': cachePolicy,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${isAttachment ? 'attachment' : 'inline'}; filename="${safeName}"`,
    })

    // Proteksi SVG dari Stored XSS: sandbox CSP agar tidak mengeksekusi script
    if (result.contentType === 'image/svg+xml') {
      headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    }

    if (result.etag) headers.set('ETag', result.etag)
    if (result.contentRange) headers.set('Content-Range', result.contentRange)
    if (result.lastModified) headers.set('Last-Modified', result.lastModified.toUTCString())

    const responseBody = result.body instanceof Uint8Array
      ? result.body
      : new Uint8Array(result.body)

    return new Response(responseBody as any, {
      status: result.status,
      headers,
    })
  } catch (err: any) {
    if (err?.message?.includes('tidak ditemukan')) {
      return new Response('Media Not Found', { status: 404 })
    }
    return new Response('Media Storage Error', { status: 500 })
  }
}
