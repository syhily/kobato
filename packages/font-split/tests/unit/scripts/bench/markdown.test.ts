import type { RunCommand } from '@kobato/font-split/scripts/bench/markdown'

import { escapeCell, formatFile, renderTable, replaceBlocks } from '@kobato/font-split/scripts/bench/markdown'
import { describe, expect, it } from 'vitest'

const DOCUMENT = [
  '# Title',
  '',
  '<!-- bench:start header -->',
  'stale',
  '<!-- bench:end header -->',
  '',
  'prose',
  '',
  '<!-- bench:start table -->',
  '<!-- bench:end table -->',
  '',
].join('\n')
const BLOCKS = { header: 'new header', table: '| a |\n| --- |' }

describe('bench markdown', () => {
  it('renders a table with right-aligned numeric columns', () => {
    expect(renderTable(['a', 'b'], [['x', '1']], ['left', 'right'])).toBe('| a | b |\n| --- | ---: |\n| x | 1 |')
    expect(escapeCell('a|b')).toBe('a\\|b')
    expect(() => renderTable(['a', 'b'], [['x']], ['left', 'right'])).toThrow(/1 cells/)
  })

  it('replaces every marked block in place and keeps the prose', () => {
    const replaced = replaceBlocks(DOCUMENT, BLOCKS)
    expect(replaced).toContain('<!-- bench:start header -->\n\nnew header\n\n<!-- bench:end header -->')
    expect(replaced).toContain('<!-- bench:start table -->\n\n| a |\n| --- |\n\n<!-- bench:end table -->')
    expect(replaced).not.toContain('stale')
    expect(replaced).toContain('\nprose\n')
    expect(replaced.endsWith('\n')).toBe(true)
    expect(replaceBlocks(replaced, BLOCKS)).toBe(replaced)
  })

  it('fails when the document and the generator disagree', () => {
    expect(() => replaceBlocks(DOCUMENT, { ...BLOCKS, extra: 'z' })).toThrow(/lacks the bench blocks: extra/)
    expect(() => replaceBlocks(DOCUMENT, { header: 'x' })).toThrow(/does not produce: table/)
    const stray = DOCUMENT.replace('prose', '<!-- bench:start stray -->\n<!-- bench:end stray -->')
    expect(() => replaceBlocks(stray, BLOCKS)).toThrow(/does not produce: stray/)
    expect(() => replaceBlocks(DOCUMENT.replace('<!-- bench:end header -->', ''), BLOCKS)).toThrow(/never closed/)
    const twice = `${DOCUMENT}\n<!-- bench:start header -->\n<!-- bench:end header -->`
    expect(() => replaceBlocks(twice, BLOCKS)).toThrow(/twice/)
  })

  it('runs the workspace formatter on the generated file', () => {
    const calls: Parameters<RunCommand>[] = []
    const run: RunCommand = (...args) => {
      calls.push(args)
      return { status: 0, stdout: '', stderr: '' }
    }
    formatFile('/repo', '/repo/packages/font-split/BENCHMARK.md', run)
    expect(calls).toEqual([
      [
        expect.stringMatching(/node_modules\/\.bin\/oxfmt$/),
        ['-c', 'oxfmt.config.ts', '--write', 'packages/font-split/BENCHMARK.md'],
        { cwd: '/repo' },
      ],
    ])
  })
})
