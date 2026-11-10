import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Nested card editors (captions, asides, toggles) render their own
// `.inkling-lexical` wrapper and `.inkling-prose` contentEditable inside the
// canvas, so a bare descendant selector would hand each nested editor the
// canvas geometry (60vh padding, zoom, min-height). The page canvas pins by
// being the scroll container's direct child; the comment canvas pins by the
// typeset preset class, which only the top-level contentEditable carries (the
// RichTextPlugin mounts an unclassed wrapper in between, so a child combinator
// cannot reach it).

const css = readFileSync(resolve(process.cwd(), 'src/styles/inkling-editor.css'), 'utf8')
const commentCss = readFileSync(resolve(process.cwd(), 'src/styles/inkling-comment-editor.css'), 'utf8')

describe('page editor canvas scope contract', () => {
  it('pins the canvas geometry rule to the top-level .inkling-lexical', () => {
    expect(css).toContain('[data-kobato-editor-scroll] > .inkling-lexical')
  })

  it('no bare descendant .inkling-lexical rule carries canvas geometry', () => {
    for (const match of css.matchAll(/\.kobato-page-editor\s+\.inkling-lexical[^{]*\{([^}]*)\}/g)) {
      expect(match[1]).not.toMatch(/padding|zoom|max-width|margin-inline/)
    }
  })
})

describe('comment editor canvas scope contract', () => {
  it('pins the canvas box rule to the top-level contentEditable', () => {
    expect(commentCss).toContain('.kobato-comment-editor .inkling-prose.typeset-comment')
  })

  it('no descendant .inkling-prose rule without the preset anchor carries the canvas box', () => {
    for (const match of commentCss.matchAll(/\.kobato-comment-editor\s+\.inkling-prose([^{]*)\{([^}]*)\}/g)) {
      if (match[1].includes('typeset-comment')) {
        continue
      }
      expect(match[2]).not.toMatch(/min-height|padding/)
    }
  })
})
