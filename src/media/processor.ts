import type { ImagePreset } from './types'

export interface ProcessedImageResult {
  buffer: Buffer
  mimeType: string
  width: number | null
  height: number | null
}

let sharpModule: any = null

async function loadSharp(): Promise<any> {
  if (sharpModule) return sharpModule
  try {
    const loaded = await import('sharp')
    sharpModule = loaded.default ?? loaded
    return sharpModule
  } catch {
    throw new Error(
      "Pemrosesan gambar membutuhkan library 'sharp'. Silakan install dengan: npm install sharp",
    )
  }
}

/**
 * Optimasi gambar menjadi WebP dengan resolusi terkendali dan pembersihan metadata EXIF.
 */
export async function processImageBuffer(
  input: Buffer | Uint8Array,
  preset?: ImagePreset,
): Promise<ProcessedImageResult> {
  const sharp = await loadSharp()
  const buf = input instanceof Buffer ? input : Buffer.from(input)

  const width = preset?.width ?? 2000
  const height = preset?.height ?? 2000
  const quality = preset?.quality ?? 75
  const fit = preset?.fit ?? 'inside'

  try {
    // animated: true mempertahankan frame animasi (misalnya GIF / animated WebP)
    // limitInputPixels mencegah serangan decompression bomb (pixel flood)
    const pipeline = sharp(buf, {
      animated: true,
      limitInputPixels: 268402689,
    })
      .rotate() // Normalkan orientasi kamera otomatis dari metadata EXIF
      .resize({
        width,
        height,
        fit,
        withoutEnlargement: true,
      })
      .webp({
        quality,
        effort: 4,
      })

    const processedBuffer = await pipeline.toBuffer()
    const meta = await sharp(processedBuffer).metadata()

    return {
      buffer: processedBuffer,
      mimeType: 'image/webp',
      width: meta.width ?? null,
      height: meta.height ?? null,
    }
  } catch (err: any) {
    throw new Error(`Gagal memproses gambar: ${err?.message || 'File rusak atau tidak didukung'}`)
  }
}
