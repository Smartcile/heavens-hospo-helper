// Copies the pdf.js worker into apps/web/public so the gift-card preview
// viewer can load it as a same-origin static file (`/pdf.worker.min.mjs`).
// Runs on prebuild and predev; the file is generated, never committed.

import { copyFile, mkdir } from 'fs/promises'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(here, '..', 'apps', 'web', 'public', 'pdf.worker.min.mjs')

const source = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs')
await mkdir(path.dirname(target), { recursive: true })
await copyFile(source, target)
console.log(`[copy-pdf-worker] ${path.basename(source)} → apps/web/public/pdf.worker.min.mjs`)
