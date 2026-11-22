import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createPresignedS3Url,
  signS3Headers,
  type SigV4Credentials,
} from '../src/media/sigv4'

describe('Native S3 SigV4 Authentication', () => {
  const creds: SigV4Credentials = {
    endpoint: 'https://r2.cloudflarestorage.com',
    bucket: 'my-bucket',
    region: 'auto',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret-key-12345',
  }

  it('signS3Headers membuat header AWS4-HMAC-SHA256 yang sah', () => {
    const url = new URL('https://r2.cloudflarestorage.com/my-bucket/avatar/foto.webp')
    const payload = Buffer.from('test image payload')
    const fixedDate = new Date('2026-03-15T12:00:00Z')

    const headers = signS3Headers({
      method: 'PUT',
      url,
      payload,
      creds,
      date: fixedDate,
    })

    assert.equal(headers.host, 'r2.cloudflarestorage.com')
    assert.equal(headers['x-amz-date'], '20260315T120000Z')
    assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-key-id\/20260315\/auto\/s3\/aws4_request/)
    assert.match(headers.authorization, /Signature=[0-9a-f]{64}$/)
  })

  it('createPresignedS3Url menghasilkan presigned upload PUT URL', () => {
    const urlStr = createPresignedS3Url({
      method: 'PUT',
      key: 'avatar/user123.webp',
      creds,
      expiresInSeconds: 900,
    })

    const parsed = new URL(urlStr)
    assert.equal(parsed.pathname, '/my-bucket/avatar/user123.webp')
    assert.equal(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256')
    assert.equal(parsed.searchParams.get('X-Amz-Expires'), '900')
    assert.match(parsed.searchParams.get('X-Amz-Signature') || '', /^[0-9a-f]{64}$/)
  })

  it('createPresignedS3Url dengan quantizeSeconds menghasilkan URL deterministik dalam jendela waktu yang sama', () => {
    const url1 = createPresignedS3Url({
      method: 'GET',
      key: 'internal/surat.pdf',
      creds,
      quantizeSeconds: 300,
    })

    const url2 = createPresignedS3Url({
      method: 'GET',
      key: 'internal/surat.pdf',
      creds,
      quantizeSeconds: 300,
    })

    // Dalam milidetik yang sama atau dalam 5 menit yang sama, signature persis sama (cache-friendly)
    assert.equal(url1, url2)
  })
})
