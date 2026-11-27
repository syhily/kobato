import { runCommandOrThrow } from '@kobato/font-split/scripts/bench/command'
import { join, relative } from 'node:path'

const START = /^<!-- bench:start ([a-z0-9-]+) -->$/

export type ColumnAlign = 'left' | 'right'

export function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|')
}

export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  align: readonly ColumnAlign[],
): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(align.map((column) => (column === 'right' ? '---:' : '---'))),
    ...rows.map((row) => {
      if (row.length !== headers.length) {
        throw new Error(`table row has ${row.length} cells, the header has ${headers.length}`)
      }
      return line(row)
    }),
  ].join('\n')
}

export function replaceBlocks(source: string, blocks: Readonly<Record<string, string>>): string {
  const lines = source.split('\n')
  const output: string[] = []
  const replaced = new Set<string>()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const start = START.exec(line)
    if (start === null) {
      output.push(line)
      continue
    }
    const name = start[1]!
    const content = blocks[name]
    if (content === undefined) {
      throw new Error(`the document carries a bench block the generator does not produce: ${name}`)
    }
    if (replaced.has(name)) {
      throw new Error(`the document carries bench block ${name} twice`)
    }
    replaced.add(name)
    const end = lines.indexOf(`<!-- bench:end ${name} -->`, index + 1)
    if (end === -1) {
      throw new Error(`bench block ${name} is never closed`)
    }
    output.push(line, '', ...content.trim().split('\n'), '', `<!-- bench:end ${name} -->`)
    index = end
  }
  const missing = Object.keys(blocks).filter((name) => !replaced.has(name))
  if (missing.length > 0) {
    throw new Error(`the document lacks the bench blocks: ${missing.join(', ')}`)
  }
  return output.join('\n')
}

export type RunCommand = typeof runCommandOrThrow

export function formatFile(repoRoot: string, file: string, run: RunCommand = runCommandOrThrow): void {
  const formatter = process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt'
  run(
    join(repoRoot, 'node_modules', '.bin', formatter),
    ['-c', 'oxfmt.config.ts', '--write', relative(repoRoot, file)],
    {
      cwd: repoRoot,
    },
  )
}
