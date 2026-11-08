// `pnpm run sea:browser [binary]`: always boot the built SEA binary against
// per-run temp dirs (never an external server) and run the Playwright
// journeys against it. The browser-side counterpart of `sea:e2e`.

import { resolve as resolvePath } from 'node:path'

import { runBrowserSuite } from '../browser/run.ts'
import { fail } from './exec.ts'
import { seaBinaryPath } from './paths.ts'

const arg = process.argv[2]
if (arg?.startsWith('--')) {
  fail('Usage: node scripts/sea/browser.ts [path-to-binary]')
}
const binaryPath = arg === undefined ? seaBinaryPath() : resolvePath(arg)

try {
  const status = await runBrowserSuite({ binaryPath, forceBoot: true })
  console.log(status === 0 ? '==> SEA browser: passed' : `==> SEA browser: failed (Playwright exit ${status})`)
  process.exit(status)
} catch (error) {
  // The managed-boot finally already stopped the server and removed the temp root.
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
