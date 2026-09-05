// The footnote export byte contract:
// the ref anchors, the definition `<li>` with its backref, and the
// string-layer `<section class="footnotes">` wrap — pinned byte-exact so the
// kobato SSR anchor contract cannot drift. Live path only (`renderLive` like
// table-export.test.ts): an editor configured like InklingComposer
// (DEFAULT_NODES + defaultTheme), a parsed state, `$convertToHtmlString`.
import { describe, expect, it } from 'vitest'

import { renderLive } from '#/utils/render-live'

const ref = (text: string, targetKey: string) => ({
  type: 'footnote-ref',
  version: 1,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  targetKey,
})

const text = (content: string) => ({
  type: 'text',
  version: 1,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: content,
})

const paragraph = (children: unknown[]) => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

const definition = (targetKey: string, content: string) => ({
  type: 'footnotedefinition',
  version: 1,
  targetKey,
  content,
})

const footnoteDoc = (children: unknown[]) =>
  JSON.stringify({
    root: {
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  })

describe('footnote HTML export (live path)', () => {
  it('emits the ref anchor and the doc-end footnotes section byte-exactly', () => {
    const html = renderLive(
      footnoteDoc([paragraph([text('see'), ref('1', 'keyA')]), definition('keyA', '<p>First note</p>')]),
    )

    expect(html).toBe(
      '<p>see<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup></p>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">Footnotes</h3>' +
        '<ol><li id="user-content-fn-1"><p>First note</p>' +
        '<a data-footnote-backref="" href="#user-content-fnref-1">↩</a></li></ol></section>',
    )
  })

  it('anchors every row by its rank in the definition run, not the stored ref digit', () => {
    const html = renderLive(
      footnoteDoc([
        paragraph([ref('2', 'keyA'), text(' and '), ref('1', 'keyB')]),
        definition('keyA', '<p>Alpha</p>'),
        definition('keyB', '<p>Beta</p>'),
      ]),
    )

    // the run order is the anchor truth: keyA's row is fn-1 (its stored ref
    // digit is ignored — the renumber engine owns digits while editing, the
    // position owns them at export)
    expect(html).toBe(
      '<p><sup id="user-content-fnref-2"><a href="#user-content-fn-2">2</a></sup> and ' +
        '<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup></p>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">Footnotes</h3>' +
        '<ol><li id="user-content-fn-1"><p>Alpha</p><a data-footnote-backref="" href="#user-content-fnref-1">↩</a></li>' +
        '<li id="user-content-fn-2"><p>Beta</p><a data-footnote-backref="" href="#user-content-fnref-2">↩</a></li></ol></section>',
    )
  })

  it('uses the host-configured section title', () => {
    // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated flat key's compatibility forwarding
    const html = renderLive(footnoteDoc([definition('keyA', '<p>Note</p>')]), { footnotesSectionTitle: 'Notes' })

    expect(html).toContain('<h3 id="footnotes-section-heading">Notes</h3>')
  })

  it('resolves the section title through the keyed policy seam, winning over the deprecated key', () => {
    const resolved = renderLive(footnoteDoc([definition('keyA', '<p>Note</p>')]), {
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the resolver winning over the deprecated key
      footnotesSectionTitle: 'Legacy',
      resolveExportPolicy: (key) => (key === 'footnotes-section-title' ? 'Notes' : undefined),
    })
    expect(resolved).toContain('<h3 id="footnotes-section-heading">Notes</h3>')

    const fallback = renderLive(footnoteDoc([definition('keyA', '<p>Note</p>')]), {
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated key as the unanswered-resolver fallback
      footnotesSectionTitle: 'Legacy',
      resolveExportPolicy: () => undefined,
    })
    expect(fallback).toContain('<h3 id="footnotes-section-heading">Legacy</h3>')
  })

  it('falls back to the default title for blank input and escapes markup in the title', () => {
    // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated flat key's blank handling
    const blank = renderLive(footnoteDoc([definition('keyA', '<p>Note</p>')]), { footnotesSectionTitle: '   ' })
    expect(blank).toContain('<h3 id="footnotes-section-heading">Footnotes</h3>')

    const hostile = renderLive(footnoteDoc([definition('keyA', '<p>Note</p>')]), {
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated flat key's escaping
      footnotesSectionTitle: 'Footnotes & <References>',
    })
    expect(hostile).toContain('<h3 id="footnotes-section-heading">Footnotes &amp; &lt;References&gt;</h3>')
  })

  it('suppresses the trailing empty paragraph sitting before the definition run', () => {
    // Inkling's kept blank paragraph is no longer the last child once the
    // doc-end definition run exists — the suppression must look past the run
    const html = renderLive(
      footnoteDoc([paragraph([text('see'), ref('1', 'keyA')]), paragraph([]), definition('keyA', '<p>First note</p>')]),
    )

    expect(html).toBe(
      '<p>see<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup></p>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">Footnotes</h3>' +
        '<ol><li id="user-content-fn-1"><p>First note</p>' +
        '<a data-footnote-backref="" href="#user-content-fnref-1">↩</a></li></ol></section>',
    )
  })

  it('still suppresses the trailing empty paragraph without footnotes', () => {
    const html = renderLive(footnoteDoc([paragraph([text('plain')]), paragraph([])]))
    expect(html).toBe('<p>plain</p>')
  })

  it('skips anchor indexing for a non-numeric ref label instead of leaking NaN', () => {
    const html = renderLive(
      footnoteDoc([paragraph([text('see'), ref('a', 'keyA')]), definition('keyA', '<p>First note</p>')]),
    )

    expect(html).not.toContain('NaN')
    expect(html).toContain('<p>see<sup><a>a</a></sup></p>')
  })

  it('emits no section when the document has no definitions', () => {
    const html = renderLive(footnoteDoc([paragraph([text('plain')])]))
    expect(html).toBe('<p>plain</p>')
  })
})
