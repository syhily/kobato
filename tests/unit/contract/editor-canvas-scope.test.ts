import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Both editor canvas partials style their surface through `.inkling-lexical`
// / `.inkling-prose` — but nested card editors (image/gallery captions, code
// block captions, asides, toggles) render their OWN `.inkling-lexical`
// wrapper and `.inkling-prose` contentEditable inside the canvas. A bare
// descendant selector therefore hands each nested editor the canvas geometry:
//
// - `src/styles/inkling-editor.css`: `padding: 15vmin 1.5rem 60vh` renders as
//   a 60vh void under every image caption (pushing the Alt toggle a
//   screen-height away), `zoom: 0.625` double-shrinks nested text, and the
//   article max-width constrains card interiors.
// - `src/styles/inkling-comment-editor.css`: `min-height: 96px` + the canvas
//   padding inflate every code-block caption editor in a comment.
//
// The canvas geometry rules must stay pinned to the top-level canvas. The
// page editor pins structurally (the scroll container's direct child — the
// composer chain renders no intermediate DOM there); the comment editor pins
// by the typeset preset class, which only the top-level contentEditable
// carries (the RichTextPlugin mounts an unclassed wrapper between the
// `.inkling-lexical` wrapper and the contentEditable, so a child combinator
// cannot reach the comment canvas — verified against the live DOM).

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
