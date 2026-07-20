import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const versionPath = join(__dirname, '..', 'apps', 'web', 'version.json')

const ver = JSON.parse(readFileSync(versionPath, 'utf-8'))
const bump = Math.floor(Math.random() * 20) + 1
ver.build += bump
writeFileSync(versionPath, JSON.stringify(ver) + '\n')
console.log(`Version bumped: ${ver.build} (${bump > 1 ? `+${bump}` : '+1'})`)
