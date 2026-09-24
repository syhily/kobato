import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Plain-code-editor import guard (same idiom as the jsdom import guard): the
 * code block card's plain edit surface exists so minimal hosts (kobato's
 * comment composer) never fetch the codemirror chunk. That property breaks if
 * `CodeBlockPlainEditor` imports the CodeMirror family or the lazy boundary
 * that carries it, or if `CodeBlockCard`'s plain branch routes through
 * `LazyCardEditor` instead of the plain editor.
 */

/** Static, side-effect, and dynamic import specifiers of a source file. */
function importSpecifiers(source: string): string[] {
  const statics = source.matchAll(/(?:^|\s)from\s+['"]([^'"]+)['"]/g)
  const sideEffects = source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)
  const dynamics = source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)
  return [...statics, ...sideEffects, ...dynamics].map((match) => match[1])
}

describe('plain code editor import guard', () => {
  it('CodeBlockPlainEditor never imports the CodeMirror family or the lazy boundary', () => {
    const source = readFileSync('src/inkling/components/ui/cards/CodeBlockPlainEditor.tsx', 'utf8')
    const offenders = importSpecifiers(source).filter(
      (specifier) =>
        specifier.startsWith('@codemirror/') ||
        specifier.startsWith('@uiw/') ||
        specifier === '@lezer/highlight' ||
        /codemirror-config|LazyCardEditor/.test(specifier),
    )

    expect(offenders).toEqual([])
  })

  it("CodeBlockCard's plain branch renders CodeBlockPlainEditor, never LazyCardEditor", () => {
    const source = readFileSync('src/inkling/components/ui/cards/CodeBlockCard.tsx', 'utf8')

    expect(source).toMatch(/codeEditor === 'plain'\) \{\s*return <CodeBlockPlainEditor/)
  })
})
