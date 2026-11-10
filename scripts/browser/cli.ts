import { fail } from '../sea/exec.ts'
import { runBrowserSuite } from './run.ts'

const arg = process.argv[2]
if (arg?.startsWith('--')) {
  fail('Usage: node scripts/browser/cli.ts [path-to-binary]')
}

try {
  process.exit(await runBrowserSuite(arg === undefined ? {} : { binaryPath: arg }))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
