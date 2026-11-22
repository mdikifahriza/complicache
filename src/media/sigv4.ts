import { createHash, createHmac } from 'node:crypto'

export interface SigV4Credentials {
  endpoint: string
  bucket: string
  region?: string
  accessKeyId: string
  secretAccessKey: string
}

export function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hmacHex(
  secret: string,
  data: string,
  dateStamp: string,
  region: string,
  service = 's3',
): string {
  const kDate = createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest()
  const kRegion = createHmac('sha256', kDate).update(region).digest()
  const kService = createHmac('sha256', kRegion).update(service).digest()
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
  return createHmac('sha256', kSigning).update(data).digest('hex')
}

export function buildObjectUrl(endpoint: string, bucket: string, key: string): URL {
  const cleanEndpoint = endpoint.replace(/\/$/, '')
  const encodedKey = key.split('/').map(awsEncode).join('/')
  return new URL(`${cleanEndpoint}/${bucket}/${encodedKey}`)
}

/**
 * Buat header otentikasi AWS SigV4 untuk panggilan HTTP langsung (GET, PUT, HEAD, DELETE).
 */
export function signS3Headers(options: {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE'
  url: URL
  payload: Uint8Array | Buffer
  creds: SigV4Credentials
  headers?: Record<string, string>
  date?: Date
}): Record<string, string> {
  const now = options.date ?? new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = options.creds.region || 'auto'
  const payloadHash = sha256Hex(options.payload)

  const reqHeaders: Record<string, string> = {
    host: options.url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(options.headers ?? {}),
  }

  const signedHeaderNames = Object.keys(reqHeaders).sort()
  const signedHeaders = signedHeaderNames.join(';')
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${reqHeaders[name]}\n`).join('')

  const canonicalQuery = [...options.url.searchParams.entries()]
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .sort()
    .join('&')

  const canonicalRequest = [
    options.method,
    options.url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n')

  const signature = hmacHex(options.creds.secretAccessKey, stringToSign, dateStamp, region)
  reqHeaders.authorization =
    `AWS4-HMAC-SHA256 Credential=${options.creds.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return reqHeaders
}

/**
 * Buat presigned URL (PUT untuk upload atau GET untuk unduhan privat).
 * Mendukung pembulatan waktu (time-quantization) agar URL presigned GET stabil dalam jendela waktu tertentu,
 * memungkinkan browser memanfaatkan cache lokal (Cache-Control: private).
 *
 * Bug #9 fix: Ketika quantizeSeconds digunakan, X-Amz-Expires dikompensasi
 * untuk menjamin URL tidak kedaluwarsa sebelum masa aktifnya habis.
 */
export function createPresignedS3Url(options: {
  method: 'GET' | 'PUT'
  key: string
  creds: SigV4Credentials
  expiresInSeconds?: number
  quantizeSeconds?: number
  extraQuery?: Record<string, string>
  /** Additional headers to sign (e.g., ['content-type'] for upload). */
  signedHeaders?: string[]
}): string {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = options.creds
  const region = options.creds.region || 'auto'
  const expiresIn = options.expiresInSeconds ?? 900

  const realNow = new Date()
  let now = realNow

  // Hitung X-Amz-Expires yang dikompensasi untuk quantization
  let effectiveExpires = expiresIn

  if (options.quantizeSeconds && options.quantizeSeconds > 0) {
    const epochSec = Math.floor(realNow.getTime() / 1000)
    const quantizedEpoch = Math.floor(epochSec / options.quantizeSeconds) * options.quantizeSeconds
    now = new Date(quantizedEpoch * 1000)

    // Kompensasi: waktu mundur yang dibulatkan bisa mengambil hingga
    // `quantizeSeconds` detik dari masa aktif URL.
    // Tambahkan selisih agar URL masih valid selama `expiresIn` dari sekarang.
    const timeLost = epochSec - quantizedEpoch
    effectiveExpires = expiresIn + timeLost
  }

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${region}/s3/aws4_request`

  const url = buildObjectUrl(endpoint, bucket, options.key)

  // Build signed headers list: always include host, optionally more
  const headerNames = ['host', ...(options.signedHeaders ?? [])].sort()
  const signedHeadersStr = headerNames.join(';')

  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(effectiveExpires)],
    ['X-Amz-SignedHeaders', signedHeadersStr],
    ...Object.entries(options.extraQuery ?? {}),
  ]

  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const canonicalQuery = params.map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).join('&')

  // Build canonical headers
  const canonicalHeaderLines: string[] = []
  for (const h of headerNames) {
    if (h === 'host') {
      canonicalHeaderLines.push(`host:${url.host}`)
    } else if (options.extraQuery && h in options.extraQuery) {
      // For presigned URLs, header values come from the query params
      canonicalHeaderLines.push(`${h}:${options.extraQuery[h]}`)
    } else {
      canonicalHeaderLines.push(`${h}:`)
    }
  }
  const canonicalHeaders = canonicalHeaderLines.join('\n') + '\n'

  const canonicalRequest = [
    options.method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeadersStr,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n')

  const signature = hmacHex(secretAccessKey, stringToSign, dateStamp, region)
  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
