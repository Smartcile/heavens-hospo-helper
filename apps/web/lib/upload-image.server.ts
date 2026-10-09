import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

// Server-side image intake: photos are downscaled and re-encoded before they
// hit the disk, so guide/inventory photos don't land as 8 MB camera JPEGs that
// every grid then has to decode. SVG and animated GIF pass through untouched;
// if sharp cannot do better than the original, the original is stored.

const MAX_DIMENSION = 2000
const JPEG_QUALITY = 82
const WEBP_QUALITY = 82

const COMPRESSIBLE = new Set(['jpeg', 'png', 'webp'])

/** Downscale + re-encode one image buffer. Never throws — worst case returns the input. */
export async function compressImage(original: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(original).metadata()
    const format = meta.format ?? ''
    if (!COMPRESSIBLE.has(format)) return original
    if ((meta.pages ?? 1) > 1) return original // animated

    let pipeline = sharp(original).rotate()
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
    if (longest > MAX_DIMENSION) {
      pipeline = pipeline.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    }
    if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 })
    else if (format === 'webp') pipeline = pipeline.webp({ quality: WEBP_QUALITY })
    else pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })

    const out = await pipeline.toBuffer()
    return out.length < original.length ? out : original
  } catch {
    return original
  }
}

/**
 * Store an uploaded image in the storage root (compressed) and return the
 * stored filename. Shared by the admin and worker upload routes so both apply
 * the same rules.
 */
export async function saveImageUpload(file: File): Promise<string> {
  const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
  await mkdir(uploadPath, { recursive: true })

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_')
  const filename = `${crypto.randomUUID()}-${safeName}`
  const stored = await compressImage(Buffer.from(await file.arrayBuffer()))
  await writeFile(join(uploadPath, filename), stored)
  return filename
}
