import { runCommand } from '@kobato/font-split/scripts/bench/command'
import { renderCharts } from '@kobato/font-split/scripts/bench/suite/charts'
import { renderBlocks } from '@kobato/font-split/scripts/bench/suite/document'
import { gitCommit, parsePreviousResults } from '@kobato/font-split/scripts/bench/suite/run'
import { syntheticResults } from '@kobato/font-split/tests/unit/scripts/bench/results-fixture'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('the font-split benchmark results file', () => {
  it('reads back without losing a field of what was measured', () => {
    const results = syntheticResults()
    const persisted = parsePreviousResults(JSON.stringify(results))
    expect(persisted).toStrictEqual(results)
    expect(renderBlocks(persisted)).toEqual(renderBlocks(results))
    expect(renderCharts(persisted)).toEqual(renderCharts(results))
  })

  it('rejects a file that is not a benchmark result', () => {
    expect(() => parsePreviousResults('{"schemaVersion": 2}')).toThrow(/not a benchmark results file/)
    expect(() => parsePreviousResults('{"schemaVersion": 1, "fonts": [{"key": "a"}]}')).toThrow(
      /not a benchmark results file/,
    )
    expect(() => parsePreviousResults('not json')).toThrow()
  })
})

describe('the commit stamp of a run', () => {
  let scratch = ''
  let plain = ''

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'kobato-bench-stamp-'))
    plain = mkdtempSync(join(tmpdir(), 'kobato-bench-plain-'))
  })

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
    rmSync(plain, { recursive: true, force: true })
  })

  function git(...args: string[]): string {
    const outcome = runCommand(
      'git',
      ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', '-c', 'commit.gpgsign=false', ...args],
      { cwd: scratch },
    )
    expect(outcome.status, outcome.stderr).toBe(0)
    return outcome.stdout.trim()
  }

  function write(path: string, content = 'x'): void {
    const file = join(scratch, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  it('ignores the generated files and flags uncommitted code', () => {
    git('init', '-q')
    git('commit', '-q', '--allow-empty', '-m', 'init')
    const first = git('rev-parse', '--short', 'HEAD')
    expect(gitCommit(scratch)).toBe(first)

    write('tools/font-split/benchmark/results.json')
    write('tools/font-split/BENCHMARK.md')
    write('README.md')
    expect(gitCommit(scratch)).toBe(first)

    write('tools/font-split/src/lib.rs')
    expect(gitCommit(scratch)).toBe(`${first}-dirty`)

    git('add', '.')
    git('commit', '-q', '-m', 'generated')
    const second = git('rev-parse', '--short', 'HEAD')
    expect(gitCommit(scratch)).toBe(second)

    write('tools/font-split/BENCHMARK.md', 'redrawn')
    write('tools/font-split/benchmark/results.json', 'redrawn')
    expect(gitCommit(scratch)).toBe(second)

    write('tools/font-split/scripts/bench/suite/run.ts', 'edited')
    expect(gitCommit(scratch)).toBe(`${second}-dirty`)

    write('tools/font-split/src/lib.rs', 'edited')
    expect(gitCommit(scratch)).toBe(`${second}-dirty`)
  })

  it('says unknown outside a repository', () => {
    expect(gitCommit(plain)).toBe('unknown')
  })
})
