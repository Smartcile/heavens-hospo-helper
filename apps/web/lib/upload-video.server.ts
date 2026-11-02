// Server-only video upload: receive a clip, transcode it to a tiny phone-sized
// MP4, store it under the UPLOAD_PATH root and return its /api/upload URL.
// Shared by the admin and worker upload routes.

import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { storageRoot } from '@/lib/storage'
import { transcodeToPhoneMp4, FfmpegMissingError } from '@/lib/video-transcode'

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024

export type VideoUploadResult = { url: string } | { error: string; status: number }

export async function handleVideoUpload(file: File | null): Promise<VideoUploadResult> {
  if (!file || file.size === 0) return { error: 'No file provided', status: 400 }
  if (!file.type.startsWith('video/')) return { error: 'Only video files are allowed', status: 400 }
  if (file.size > MAX_VIDEO_BYTES) return { error: 'Video too large (max 200MB)', status: 413 }

  const root = storageRoot()
  await mkdir(root, { recursive: true })

  const id = crypto.randomUUID()
  const tmp = join(root, `${id}-input`)
  const outName = `${id}.mp4`
  const out = join(root, outName)

  try {
    await writeFile(tmp, Buffer.from(await file.arrayBuffer()))
    await transcodeToPhoneMp4(tmp, out)
    return { url: `/api/upload/${outName}` }
  } catch (e) {
    await rm(out, { force: true }).catch(() => {})
    if (e instanceof FfmpegMissingError) {
      return { error: 'Video compression is unavailable on the server (ffmpeg missing)', status: 500 }
    }
    return { error: 'Could not process video', status: 500 }
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
  }
}
