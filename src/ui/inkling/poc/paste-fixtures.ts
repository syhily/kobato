// Synthetic HTML paste fixtures for the Inkling paste pipeline POC.
// These model real-world sources without copying any production content.

export interface PasteFixture {
  name: string
  html: string
  /** Human-readable structural expectation; tests assert concrete shapes. */
  expected: string
}

/** F1 Word: class-laden paragraphs with nested spans and Office tags. */
export const wordFixture: PasteFixture = {
  name: 'F1 Word',
  expected: 'paragraphs with text; Office tags stripped',
  html: `
    <p class="MsoNormal" style="margin: 0in 0in 8pt;">
      <span lang="EN-US" style="font-size: 11pt; line-height: 107%; font-family: Calibri, sans-serif;">
        This is a <strong>bold</strong> sentence from Word with
        <span style="color: red;">colored text</span> and an <o:p></o:p>tag.
      </span>
    </p>
    <p class="MsoNormal">
      <span lang="EN-US">“Smart quotes” and a line with <em>emphasis</em>.</span>
    </p>
  `,
}

/** F2 Google Docs: dir-ltr paragraphs with internal-guid wrapper. */
export const googleDocsFixture: PasteFixture = {
  name: 'F2 Google Docs',
  expected: 'paragraphs with text; internal ids ignored',
  html: `
    <b id="docs-internal-guid-abc123" style="font-weight: normal;">
      <p dir="ltr" style="line-height: 1.38; margin-top: 0pt; margin-bottom: 0pt;">
        <span style="font-size: 11pt; font-family: Arial; color: #000000; background-color: transparent;">
          Google Docs paragraph one.
        </span>
      </p>
      <p dir="ltr">
        <span style="font-weight: 700;">Bold in Docs</span> and
        <span style="font-style: italic;">italic in Docs</span>.
      </p>
    </b>
  `,
}

/** F3 Notion: nested divs with strong and emoji. */
export const notionFixture: PasteFixture = {
  name: 'F3 Notion',
  expected: 'paragraphs with bold text and emoji',
  html: `
    <div>
      <div>Notion block one with <strong>bold</strong> text. 🎉</div>
      <div><div>Nested Notion block two.</div></div>
    </div>
  `,
}

/** F4 Web page: mixed blocks plus XSS vectors. */
export const webPageFixture: PasteFixture = {
  name: 'F4 Web page',
  expected: 'heading + paragraph + link + list + quote + image-card; script/iframe stripped',
  html: `
    <h2>A web heading</h2>
    <p>This is a paragraph with <a href="https://example.com">a safe link</a>.</p>
    <ul>
      <li>First item</li>
      <li>Second item</li>
    </ul>
    <blockquote>
      <p>A quoted paragraph</p>
    </blockquote>
    <img src="data:image/png;base64,iVBORw0KGgo=" alt="Example image">
    <script>alert('xss')</script>
    <iframe src="about:blank"></iframe>
    <p onmouseover="alert('event')">hover me</p>
  `,
}

/** F5 Old Tiptap copy: HTML shapes produced by the current Tiptap editor. */
export const oldTiptapFixture: PasteFixture = {
  name: 'F5 Old Tiptap copy',
  expected: 'paragraph + list + code-block + quote + footnote-ref',
  html: `
    <p>Paragraph from Tiptap.</p>
    <ul>
      <li>Bullet one</li>
      <li>Bullet two</li>
    </ul>
    <pre><code class="language-typescript">const x: number = 1;</code></pre>
    <blockquote data-pt-solution>A Tiptap solution quote</blockquote>
    <p>Text with a footnote<sup data-footnote-ref data-target-key="tip-1" data-ref-key="tip-ref-1" data-index="1">1</sup>.</p>
  `,
}

/** F6 Markdown-as-text: literal markdown characters pasted as plain text. */
export const markdownAsTextFixture: PasteFixture = {
  name: 'F6 Markdown-as-text',
  expected: 'single paragraph with literal markdown characters',
  html: '# Heading\n\n- item one\n- item two',
}

/** F7 Mixed inline: bold, italic, and link in one paragraph. */
export const mixedInlineFixture: PasteFixture = {
  name: 'F7 Mixed inline',
  expected: 'single paragraph with text, bold, italic, and link',
  html: '<p>a <b>b</b> <i>c</i> <a href="https://example.com">d</a> e</p>',
}

/** F8 Deeply nested garbage: div soup that should collapse to paragraphs. */
export const deeplyNestedFixture: PasteFixture = {
  name: 'F8 Deeply nested garbage',
  expected: 'paragraphs after denesting',
  html: `
    <div>
      <div>
        <div>
          <p>First deeply nested paragraph.</p>
        </div>
      </div>
    </div>
    <div><div><p>Second paragraph.</p></div></div>
  `,
}

/** F9 Table: standard table with header and inline cell content. */
export const tableFixture: PasteFixture = {
  name: 'F9 Table',
  expected: 'table node with header row and inline-only cells',
  html: `
    <table>
      <thead>
        <tr><th>Header A</th><th>Header B</th></tr>
      </thead>
      <tbody>
        <tr><td>Cell 1A</td><td>Cell 1B</td></tr>
        <tr><td>Cell 2A</td><td>Cell 2B</td></tr>
      </tbody>
    </table>
  `,
}

/** F10 Fragment with no top-level block: bare inline content. */
export const bareFragmentFixture: PasteFixture = {
  name: 'F10 Bare fragment',
  expected: 'wrapped in a paragraph',
  html: 'text <b>bold</b> more',
}

export const ALL_PASTE_FIXTURES: PasteFixture[] = [
  wordFixture,
  googleDocsFixture,
  notionFixture,
  webPageFixture,
  oldTiptapFixture,
  markdownAsTextFixture,
  mixedInlineFixture,
  deeplyNestedFixture,
  tableFixture,
  bareFragmentFixture,
]
