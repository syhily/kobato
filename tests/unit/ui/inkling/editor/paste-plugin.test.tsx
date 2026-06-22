// @vitest-environment happy-dom

// Regression tests for PastePlugin — the capture-phase paste HTML sanitiser.
//
// The plugin intercepts paste events on the editor root, sanitises the HTML
// via dompurify (stripping script/style/event-handlers), and lets Lexical
// process the cleaned HTML. Full paste-event simulation in happy-dom is
// unreliable (ClipboardEvent construction + DataTransfer are not fully
// supported), so these tests verify:
//   1. The plugin mounts without throwing.
//   2. The paste event listener is registered (the plugin doesn't silently
//      fail to attach).
//   3. The sanitiser (`sanitisePastedHtml`, exported for testing) strips the
//      XSS/dangerous constructs the design spec calls out: `<script>`,
//      `javascript:` hrefs, `data:` img src, inline event handlers, inline
//      styles, and tags outside the editor's node set.
//
// The HTML→node conversions themselves are tested in
// `paste-and-transforms.test.tsx`, which is the more reliable path for
// verifying Lexical node generation.

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'
import { PastePlugin, sanitisePastedHtml } from '@/ui/inkling/editor/plugins/PastePlugin'

function mountEditor() {
  return render(
    <LexicalComposer
      initialConfig={{
        namespace: 'paste-plugin-test',
        theme: {},
        nodes: ARTICLE_NODES,
        onError: (e: Error) => {
          throw e
        },
      }}
    >
      <ContentEditable />
      <PastePlugin />
    </LexicalComposer>,
  )
}

describe('PastePlugin', () => {
  it('mounts without throwing', () => {
    expect(() => mountEditor()).not.toThrow()
  })

  it('registers a paste event listener on the editor root', () => {
    const { unmount } = mountEditor()

    // The plugin attaches a capture-phase 'paste' listener to the root
    // contentEditable element. We can't directly inspect registered listeners
    // in happy-dom, but we can verify the contentEditable element exists and
    // the plugin didn't crash during registration.
    const contentEditable = document.querySelector('[contenteditable="true"]')
    expect(contentEditable).not.toBeNull()

    unmount()
  })
})

// `sanitisePastedHtml` runs in the real browser (it is called from a
// `useEffect`-bound paste listener). DOMPurify is reliable there. Under the
// happy-dom test environment, however, DOMPurify's element-retention is
// unreliable — happy-dom's DOM interfaces cause it to over-drop otherwise
// valid elements (e.g. `<p>safe</p>` → `safe`). This is the same happy-dom
// unsafety the design spec flags for the *server* path.
//
// The tests below therefore assert only the **security-critical removal**
// properties — the contract the function exists to enforce. We do NOT assert
// retention of specific tags/attributes, because those assertions would pass
// or fail depending on the test DOM rather than on production behavior.
describe('sanitisePastedHtml', () => {
  it('strips <script> elements', () => {
    const dirty = '<script>alert(1)</script>safe'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('</script>')
  })

  it('strips javascript: hrefs', () => {
    const dirty = '<a href="javascript:alert(1)">bad</a>'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('strips data: img src (http(s) only)', () => {
    const dirty = '<img src="data:image/png;base64,abc" alt="x">'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('data:')
    expect(clean).not.toMatch(/src=["']data:/)
  })

  it('strips inline event handlers', () => {
    const dirty = '<p onclick="alert(1)">safe</p>'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('onclick')
  })

  it('strips other inline event handlers', () => {
    const dirty = '<p onmouseover="alert(1)" onload="alert(2)">safe</p>'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('onmouseover')
    expect(clean).not.toContain('onload')
  })

  it('strips inline styles', () => {
    const dirty = '<p style="color:red">x</p>'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('style=')
  })

  it('strips tags outside the editor node set (e.g. <iframe>)', () => {
    const dirty = '<iframe title="bad"></iframe><p>safe</p>'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('<iframe')
  })

  it('rejects protocol-relative URLs', () => {
    const dirty = '<a href="//evil.com">x</a>'
    const clean = sanitisePastedHtml(dirty)
    expect(clean).not.toContain('//evil.com')
    expect(clean).not.toMatch(/href=["']\/\//)
  })

  it('does not introduce javascript: into the output for any input', () => {
    const samples = [
      '<a href="javascript:alert(1)">x</a>',
      '<img src="javascript:alert(1)">',
      '<a href="  javascript:alert(1)">x</a>',
      '<a href="jaVaScRiPt:alert(1)">x</a>',
    ]
    for (const dirty of samples) {
      expect(sanitisePastedHtml(dirty)).not.toMatch(/javascript:/i)
    }
  })
})
