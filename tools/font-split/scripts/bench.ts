import { parseOptions, UsageError, USAGE } from '@kobato/font-split/scripts/bench/suite/options'
import { runFontSplitBenchmark } from '@kobato/font-split/scripts/bench/suite/run'

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

try {
  await runFontSplitBenchmark(parseOptions(argv))
} catch (error) {
  if (error instanceof UsageError) {
    console.error(error.message)
    process.exit(2)
  }
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
