import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

interface OutputFile {
  name: string
  data: Uint8Array
}

interface Addon {
  fontSplit(input: Buffer, options?: unknown): Promise<{ files: OutputFile[] }>
  fontSplitAlgorithmVersion(): string
}

const [, , addonPath, fontPath, family] = process.argv
if (addonPath === undefined || fontPath === undefined || family === undefined) {
  console.error('usage: node slice-driver.ts <addon.node> <font> <css family>')
  process.exit(2)
}

const addon = unsafeCast<Addon>(createRequire(import.meta.url)(addonPath))
const input = readFileSync(fontPath)
const started = performance.now()
const { files } = await addon.fontSplit(input, { css: { fontFamily: family, commentBase: false } })
const ms = performance.now() - started

const chunks = files.filter((file) => file.name.endsWith('.woff2'))
const names = createHash('sha256')
for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
  names.update(file.name)
  names.update('\n')
}
const font = fontPath.slice(Math.max(fontPath.lastIndexOf('/'), fontPath.lastIndexOf('\\')) + 1)
const fields = {
  font,
  ms: ms.toFixed(1),
  chunks: String(chunks.length),
  chunkBytes: String(chunks.reduce((total, file) => total + file.data.length, 0)),
  cssBytes: String(files.find((file) => file.name === 'result.css')?.data.length ?? 0),
  largestFaceBytes: String(Math.max(0, ...chunks.map((file) => file.data.length))),
  namesHash: names.digest('hex').slice(0, 12),
  fingerprint: addon.fontSplitAlgorithmVersion(),
}
process.stdout.write(
  `${['slice-run', ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join('\t')}\n`,
)
