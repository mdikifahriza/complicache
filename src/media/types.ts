/**
 * Tipe dan antarmuka untuk modul media dan caching media complicache.
 */

export type MediaKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT'

export type CachePolicyName = 'immutable' | 'private' | 'mutable'

export interface StoragePutOptions {
  contentType: string
  cacheControl?: string
  metadata?: Record<string, string>
}

export interface StorageReadResult {
  body: Buffer | Uint8Array
  status: number
  contentType: string
  contentLength: number
  contentRange?: string
  etag?: string
  lastModified?: Date
}

export interface StorageListOptions {
  prefix?: string
  continuationToken?: string
  maxKeys?: number
}

export interface StoredObjectInfo {
  key: string
  size: number
  lastModified: string | null
}

export interface StoredObjectList {
  objects: StoredObjectInfo[]
  nextContinuationToken: string | null
}

export interface StorageEngine {
  readonly kind: 'disk' | 's3'

  put(key: string, body: Buffer | Uint8Array, options: StoragePutOptions): Promise<void>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  read(key: string, range?: string): Promise<StorageReadResult>
  getUrl(key: string, options?: { isPrivate?: boolean; expiresInSeconds?: number; downloadName?: string }): Promise<string>
  getPresignedUploadUrl?(key: string, contentType: string, expiresInSeconds?: number, options?: { maxBytes?: number }): Promise<string>
  listObjects?(options?: StorageListOptions): Promise<StoredObjectList>
}

export interface ImagePreset {
  width?: number
  height?: number
  fit?: 'cover' | 'contain' | 'inside' | 'outside'
  quality?: number
}

export interface MediaUploadMeta {
  key: string
  url: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  originalName: string
  kind: MediaKind
}

export interface SaveMediaOptions {
  folder?: string
  preset?: 'avatar' | 'cover' | 'thumb' | 'raw' | string
  isPrivate?: boolean
  maxBytes?: number
  allowedKinds?: MediaKind[]
  originalName?: string
  mimeType?: string
  cacheControl?: string
}

export interface DiskDriverConfig {
  baseDir?: string
  publicUrlPrefix?: string
}

export interface S3DriverConfig {
  endpoint?: string
  bucket?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  publicUrl?: string
}

export interface MediaStorageConfig {
  driver?: 'disk' | 's3' | 'auto'
  disk?: DiskDriverConfig
  s3?: S3DriverConfig
  defaultFolder?: string
  presets?: Record<string, ImagePreset>
  maxUploadBytes?: number
}

export interface PresignedUploadOptions {
  folder?: string
  filename?: string
  mimeType: string
  isPrivate?: boolean
  expiresInSeconds?: number
  maxBytes?: number
  allowedKinds?: MediaKind[]
}

export interface ConfirmUploadOptions {
  maxBytes?: number
  allowedKinds?: MediaKind[]
  folder?: string
}

export interface PresignedUploadResult {
  uploadUrl: string
  publicUrl: string
  key: string
  filename: string
  kind: MediaKind
}
