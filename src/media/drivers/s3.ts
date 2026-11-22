import path from 'node:path'
import { CACHE_POLICIES, MIME_BY_EXT } from '../constants'
import { isPrivateKey, safeRelativeKey } from '../keys'
import {
  awsEncode,
  buildObjectUrl,
  createPresignedS3Url,
  signS3Headers,
  type SigV4Credentials,
} from '../sigv4'
import type {
  S3DriverConfig,
  StorageEngine,
  StorageListOptions,
  StoragePutOptions,
  StorageReadResult,
  StoredObjectInfo,
  StoredObjectList,
} from '../types'

export class S3StorageEngine implements StorageEngine {
  readonly kind = 's3' as const
  private config: S3DriverConfig

  constructor(config?: S3DriverConfig) {
    this.config = {
      endpoint: config?.endpoint || process.env.S3_ENDPOINT || '',
      bucket: config?.bucket || process.env.S3_BUCKET || '',
      region: config?.region || process.env.S3_REGION || 'auto',
      accessKeyId: config?.accessKeyId || process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: config?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '',
      publicUrl: (config?.publicUrl || process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
    }
  }

  private getCreds(): SigV4Credentials {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey } = this.config
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3StorageEngine memerlukan endpoint, bucket, accessKeyId, dan secretAccessKey.',
      )
    }
    return { endpoint, bucket, region, accessKeyId, secretAccessKey }
  }

  private cleanKey(key: string): string {
    return safeRelativeKey(key)
  }

  async put(key: string, body: Buffer | Uint8Array, options: StoragePutOptions): Promise<void> {
    const creds = this.getCreds()
    const cleanKey = this.cleanKey(key)
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey)
    const payload = body instanceof Buffer ? body : Buffer.from(body)

    const extraHeaders: Record<string, string> = {
      'content-type': options.contentType,
      'cache-control': options.cacheControl || (isPrivateKey(cleanKey) ? CACHE_POLICIES.private : CACHE_POLICIES.immutable),
    }

    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        extraHeaders[`x-amz-meta-${k.toLowerCase()}`] = v
      }
    }

    const headers = signS3Headers({
      method: 'PUT',
      url,
      payload,
      creds,
      headers: extraHeaders,
    })

    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers,
      body: payload as any,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`S3 PUT gagal (${res.status}): ${errText.slice(0, 300)}`)
    }
  }

  async delete(key: string): Promise<void> {
    const creds = this.getCreds()
    const cleanKey = this.cleanKey(key)
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey)

    const headers = signS3Headers({
      method: 'DELETE',
      url,
      payload: new Uint8Array(),
      creds,
    })

    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
    })

    if (!res.ok && res.status !== 404) {
      const errText = await res.text().catch(() => '')
      throw new Error(`S3 DELETE gagal (${res.status}): ${errText.slice(0, 300)}`)
    }
  }

  async exists(key: string): Promise<boolean> {
    const creds = this.getCreds()
    const cleanKey = this.cleanKey(key)
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey)

    const headers = signS3Headers({
      method: 'HEAD',
      url,
      payload: new Uint8Array(),
      creds,
    })

    const res = await fetch(url.toString(), {
      method: 'HEAD',
      headers,
    })

    if (res.status === 404) return false
    return res.ok
  }

  async read(key: string, range?: string): Promise<StorageReadResult> {
    const creds = this.getCreds()
    const cleanKey = this.cleanKey(key)
    const url = buildObjectUrl(creds.endpoint, creds.bucket, cleanKey)

    const extraHeaders: Record<string, string> = {}
    if (range) extraHeaders['range'] = range

    const headers = signS3Headers({
      method: 'GET',
      url,
      payload: new Uint8Array(),
      creds,
      headers: extraHeaders,
    })

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    if (!res.ok && res.status !== 206) {
      if (res.status === 404) throw new Error('File tidak ditemukan di storage.')
      const errText = await res.text().catch(() => '')
      throw new Error(`S3 GET gagal (${res.status}): ${errText.slice(0, 300)}`)
    }

    const ext = path.extname(cleanKey).toLowerCase()
    const contentType = res.headers.get('content-type') || MIME_BY_EXT[ext] || 'application/octet-stream'
    const contentLength = Number(res.headers.get('content-length') || 0)
    const contentRange = res.headers.get('content-range') ?? undefined
    const etag = res.headers.get('etag') ?? undefined

    const arrayBuf = await res.arrayBuffer()
    const body = Buffer.from(arrayBuf)

    return {
      body,
      status: res.status,
      contentType,
      contentLength: contentLength || body.byteLength,
      ...(contentRange ? { contentRange } : {}),
      ...(etag ? { etag } : {}),
    }
  }

  async getUrl(
    key: string,
    options?: { isPrivate?: boolean; expiresInSeconds?: number; downloadName?: string },
  ): Promise<string> {
    const cleanKey = this.cleanKey(key)
    const privateFile = options?.isPrivate || isPrivateKey(cleanKey)

    if (privateFile) {
      const creds = this.getCreds()
      const filename = options?.downloadName || cleanKey.split('/').pop() || 'berkas'
      const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '') || 'berkas'
      const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${awsEncode(filename)}`

      // Time-quantized presigned URL: dibulatkan ke jendela 5 menit (300s)
      // agar browser bisa meng-cache URL yang sama selama 5 menit
      return createPresignedS3Url({
        method: 'GET',
        key: cleanKey,
        creds,
        expiresInSeconds: options?.expiresInSeconds ?? 900,
        quantizeSeconds: 300,
        extraQuery: {
          'response-content-disposition': disposition,
        },
      })
    }

    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${cleanKey}`
    }

    return `/media/${cleanKey}`
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
    options?: { maxBytes?: number },
  ): Promise<string> {
    const creds = this.getCreds()
    const cleanKey = this.cleanKey(key)

    // Build extra query params: Content-Type is signed to prevent MIME spoofing
    const extraQuery: Record<string, string> = {
      'Content-Type': contentType,
    }

    // Optionally add Content-Length-Range header condition via policy
    // Note: S3-compatible presigned URLs don't natively support Content-Length-Range
    // in query params, but we sign the Content-Type to at least prevent MIME spoofing.

    return createPresignedS3Url({
      method: 'PUT',
      key: cleanKey,
      creds,
      expiresInSeconds,
      signedHeaders: ['content-type'],
      extraQuery,
    })
  }

  async listObjects(options?: StorageListOptions): Promise<StoredObjectList> {
    const creds = this.getCreds()
    const params = new URLSearchParams()
    params.set('list-type', '2')
    if (options?.prefix) params.set('prefix', options.prefix)
    if (options?.continuationToken) params.set('continuation-token', options.continuationToken)
    params.set('max-keys', String(Math.min(1000, Math.max(1, options?.maxKeys ?? 1000))))

    const canonicalQuery = [...params.entries()]
      .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
      .sort()
      .join('&')

    const cleanEndpoint = creds.endpoint.replace(/\/$/, '')
    const url = new URL(`${cleanEndpoint}/${creds.bucket}/?${canonicalQuery}`)

    const headers = signS3Headers({
      method: 'GET',
      url,
      payload: new Uint8Array(),
      creds,
    })

    const res = await fetch(url.toString(), { method: 'GET', headers })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`S3 listObjects gagal (${res.status}): ${text.slice(0, 300)}`)
    }

    const decodeXml = (s: string) =>
      s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

    const objects: StoredObjectInfo[] = []
    const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g
    let match: RegExpExecArray | null
    while ((match = contentsRe.exec(text))) {
      const block = match[1]
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1]
      const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? '0')
      const lastModified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1] ?? null
      if (key) {
        objects.push({
          key: decodeXml(key),
          size: Number.isFinite(size) ? size : 0,
          lastModified: lastModified ? decodeXml(lastModified) : null,
        })
      }
    }

    const nextToken = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(text)?.[1] ?? null
    return { objects, nextContinuationToken: nextToken ? decodeXml(nextToken) : null }
  }
}
