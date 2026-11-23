import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const LIB_BASE = 'kobato_font_split'
const CANDIDATES: Record<string, string> = {
  darwin: `lib${LIB_BASE}.dylib`,
  linux: `lib${LIB_BASE}.so`,
  win32: `${LIB_BASE}.dll`,
}

const fileName = CANDIDATES[process.platform] ?? `lib${LIB_BASE}.so`
const source = join(packageRoot, 'target', 'release', fileName)
if (!existsSync(source)) {
  console.error(`addon build output missing: ${source} — run cargo build first`)
  process.exit(1)
}
const target = join(packageRoot, 'font-split.node')
copyFileSync(source, target)
