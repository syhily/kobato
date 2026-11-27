import type { BenchmarkResults } from '@kobato/font-split/scripts/bench/suite/types'

import { formatFile, replaceBlocks } from '@kobato/font-split/scripts/bench/markdown'
import { renderCharts } from '@kobato/font-split/scripts/bench/suite/charts'
import { renderBlocks } from '@kobato/font-split/scripts/bench/suite/document'
import { benchmarkDir, benchmarkDocument, repoRoot, resultsFile } from '@kobato/font-split/scripts/bench/suite/paths'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function renderBenchmark(results: BenchmarkResults): void {
  for (const [name, svg] of renderCharts(results)) {
    writeFileSync(join(benchmarkDir, name), svg)
  }
  writeFileSync(benchmarkDocument, replaceBlocks(readFileSync(benchmarkDocument, 'utf8'), renderBlocks(results)))
  formatFile(repoRoot, benchmarkDocument)
  formatFile(repoRoot, resultsFile)
}
