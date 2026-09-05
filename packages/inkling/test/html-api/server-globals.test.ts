import { renderHeadless } from '#/utils/render-live'

// Server-globals suite: headless renders must not touch browser globals. The
// sanitize legs used to read the global window/DOMParser at call time, so a
// Node process would ReferenceError (or sanitize against the wrong window).
// Each case renders once with the jsdom-test globals present and once with
// `window`/`document`/`DOMParser` stubbed away, pinning byte-identical output
// from the injected dom alone.

function stateOf(...children: Record<string, unknown>[]): string {
  return JSON.stringify({
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  })
}

// sanitizeBasicHtml: the markdown card's rendered body
const MARKDOWN_STATE = stateOf({
  type: 'markdown',
  version: 1,
  markdown: '# Heading\n\nSome **bold** text with <script>alert(1)</script> raw',
})

// sanitizeCardHtml: callout nested HTML behind the unwrap-allowlist fallback
const CALLOUT_STATE = stateOf({
  type: 'callout',
  version: 1,
  calloutText: 'Hello <strong>world</strong><script>alert(1)</script>',
  calloutEmoji: '\u{1F4A1}',
  backgroundColor: 'blue',
})

// escapeText: the video card's caption
const VIDEO_STATE = stateOf({
  type: 'video',
  version: 1,
  src: 'https://example.com/content/media/inkling-lexical.mp4',
  caption: 'This is a <b>caption</b> & "quoted"',
  fileName: 'inkling-lexical.mp4',
  mimeType: 'video/mp4',
  width: 200,
  height: 100,
  duration: 60,
  thumbnailSrc: '',
  customThumbnailSrc: '',
  thumbnailWidth: null,
  thumbnailHeight: null,
  cardWidth: 'regular',
  loop: false,
})

function render(state: string): Promise<string> {
  return renderHeadless(state)
}

describe('headless render without browser globals', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['markdown card body (sanitizeBasicHtml)', MARKDOWN_STATE],
    ['callout nested HTML (sanitizeCardHtml)', CALLOUT_STATE],
    ['video caption (escapeText)', VIDEO_STATE],
  ])('renders byte-identical output for %s', async (_label, state) => {
    const withGlobals = await render(state)

    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('DOMParser', undefined)
    const withoutGlobals = await render(state)

    expect(withoutGlobals).toBe(withGlobals)
    expect(withoutGlobals.length).toBeGreaterThan(0)
  })
})
