// Generates the PWA / iOS home-screen icons into apps/web/public/icons.
//
// No image library is available in this repo, so the PNGs are encoded by hand:
// raw RGBA scanlines -> zlib deflate -> IHDR/IDAT/IEND chunks with CRC32. The
// mark is drawn with plain pixel maths (no font rendering), which keeps the
// script dependency-free and the output deterministic.
//
// Run: node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../apps/web/public/icons')

const BLACK = [10, 10, 10]
const WHITE = [245, 245, 245]
const MID = [46, 46, 46]

// ── Minimal PNG encoder ──────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── The mark: a checklist (3 rows of checkbox + bar) on black ────────────
// Designed on a 512 grid and scaled, so every size stays proportional. The
// mark sits well inside the maskable safe zone (centre 80%).

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const s = size / 512

  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = 255
  }
  const rect = (x, y, w, h, colour) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, colour)
  }

  // Background + a subtle inset border so the icon reads on light wallpapers.
  rect(0, 0, size, size, BLACK)
  const border = Math.max(1, Math.round(10 * s))
  rect(0, 0, size, border, MID)
  rect(0, size - border, size, border, MID)
  rect(0, 0, border, size, MID)
  rect(size - border, 0, border, size, MID)

  const rows = [
    { y: 176, barW: 184 },
    { y: 240, barW: 152 },
    { y: 304, barW: 120 },
  ]

  for (const row of rows) {
    const x = Math.round(140 * s)
    const y = Math.round(row.y * s)
    const box = Math.round(34 * s)
    rect(x, y, box, box, WHITE)

    const barX = Math.round(190 * s)
    const barY = y + Math.round(9 * s)
    const barH = Math.round(16 * s)
    rect(barX, barY, Math.round(row.barW * s), barH, WHITE)
  }

  return encodePng(size, size, px)
}

// ── Write the set ────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-512-maskable.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of targets) {
  const file = resolve(OUT, name)
  writeFileSync(file, drawIcon(size))
  console.log(`wrote ${name} (${size}x${size})`)
}

console.log(`\nIcons written to ${OUT}`)
