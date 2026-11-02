// Server-only video transcoding for guide steps. An uploaded phone clip is
// squeezed into a tiny, silent, autoplay/loop-friendly MP4 so a shop-floor
// wifi doesn't choke on it. ffmpeg is expected on PATH (installed in the
// Docker image); a missing binary surfaces as FfmpegMissingError so the route
// can return a clear message instead of a crash.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * ffmpeg args that produce a tiny, silent, phone-friendly MP4: downscale to at
 * most 720px wide, H.264 CRF 30, faststart, no audio track. Pure so it is
 * unit-testable without ffmpeg present.
 */
export function buildPhoneVideoArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-i', input,
    '-vf', "scale='min(720,iw)':-2",
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    output,
  ]
}

export class FfmpegMissingError extends Error {
  constructor() {
    super('ffmpeg is not installed')
    this.name = 'FfmpegMissingError'
  }
}

/** Transcode `input` to a small MP4 at `output`. Throws FfmpegMissingError if
 *  ffmpeg is unavailable, otherwise propagates the ffmpeg failure. */
export async function transcodeToPhoneMp4(input: string, output: string): Promise<void> {
  try {
    await execFileAsync('ffmpeg', buildPhoneVideoArgs(input, output), {
      timeout: 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new FfmpegMissingError()
    throw e
  }
}
