import { fail } from '@kobato/pack/sea/exec.ts'

import { runBrowserSuite } from './run.ts'

const arg = process.argv[2]
if (arg?.startsWith('--')) {
  fail('Usage: node packages/helpers/browser/src/cli.ts [path-to-binary]')
}

try {
  process.exit(await runBrowserSuite(arg === undefined ? {} : { binaryPath: arg }))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
