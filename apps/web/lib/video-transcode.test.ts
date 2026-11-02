import { describe, it, expect } from 'vitest'
import { buildPhoneVideoArgs } from './video-transcode'

describe('buildPhoneVideoArgs', () => {
  it('reads the input and writes the output', () => {
    const args = buildPhoneVideoArgs('/tmp/in.mov', '/uploads/out.mp4')
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/in.mov')
    expect(args[args.length - 1]).toBe('/uploads/out.mp4')
  })

  it('caps width, drops audio and faststarts for phone playback', () => {
    const args = buildPhoneVideoArgs('a', 'b')
    expect(args).toContain('-an')
    expect(args).toContain('+faststart')
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('720')
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264')
  })
})
