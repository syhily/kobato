import { runBrowserSuite } from '@kobato/browser/run'
import { fail } from '@kobato/pack/sea/exec'
import { repoRoot, seaBinaryPath } from '@kobato/pack/sea/paths'
import { resolve as resolvePath } from 'node:path'

const arg = process.argv[2]
if (arg?.startsWith('--')) {
  fail('Usage: node tools/browser/src/sea.ts [path-to-binary]')
}
// The package script runs with cwd at tools/browser; resolve a relative CLI
// path against the repository root, as the root scripts always have.
const binaryPath = arg === undefined ? seaBinaryPath() : resolvePath(repoRoot, arg)

try {
  const status = await runBrowserSuite({ binaryPath, forceBoot: true })
  console.log(status === 0 ? '==> SEA browser: passed' : `==> SEA browser: failed (Playwright exit ${status})`)
  process.exit(status)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
