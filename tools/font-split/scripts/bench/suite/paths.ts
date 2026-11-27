import { resolve } from 'node:path'

export const fontSplitDir = resolve(import.meta.dirname, '..', '..', '..')
export const repoRoot = resolve(fontSplitDir, '..', '..')
export const benchmarkDir = resolve(fontSplitDir, 'benchmark')
export const benchmarkDocument = resolve(fontSplitDir, 'BENCHMARK.md')
export const resultsFile = resolve(benchmarkDir, 'results.json')
export const deployedBaselineFile = resolve(benchmarkDir, 'deployed-package.json')
export const blogPagesFixture = resolve(fontSplitDir, 'tests', 'fixtures', 'pages', 'blog-zh-hans-234.txt')
export const sliceDriverFile = resolve(import.meta.dirname, 'slice-driver.ts')
