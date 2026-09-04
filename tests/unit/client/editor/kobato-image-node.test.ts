// Unit tests for the R11 KobatoImageNode (plan
// docs/plans/inkling-editor-replacement.md): the subclass of inkling's
// assembled ImageNode that persists the four kobato-owned keys
// (thumbhash/storagePath/imageId/layout). Pins the serialization round-trip,
// clone survival, the exportDOM markup (both variants, through the delegate),
// the import-spec paste path, and the instanceof gates the stock behaviours
// rely on ($isImageNode covers upload intent / drop surgery).
//
// Lexical 0.46's constructor invariants require an active editor, and every
// read path (generated accessors, exportJSON, exportDOM) goes through
// getLatest(), which throws #195 without an active editor state — so each
// case runs its construction AND its reads inside a single `editor.update`.
// The node lives in the pending state's node map for the duration of that
// update; nothing needs to survive the commit. The editor comes from the
// inkling bundle's OWN createHeadlessEditor re-export: an external
// @lexical/headless would carry a second Lexical module state and could never
// host these classes.

import { $isImageNode, createHeadlessEditor, ImageNode, type LexicalEditor } from '@inkling/editor'
import { JSDOM } from 'jsdom'
import { beforeEach, describe, expect, it } from 'vitest'

import { KobatoImageNode } from '@/client/editor/kobato-image-node'
import { FEED_VARIANT_META_KIND } from '@/shared/lexical/cards/card-html'
import {
  IMAGE_RENDER_ENV_META_KIND,
  KOBATO_IMAGE_IMG_CLASS,
  KOBATO_IMAGE_PROPERTIES,
  normalizeKobatoImageLayout,
} from '@/shared/lexical/cards/kobato-image'
import { DARK_IMAGE_DIM_CLASS } from '@/ui/public/widgets/Image'

const dom = new JSDOM('')

// The unit project runs in the node environment; inkling's caption pipeline
// (populateNestedEditor, cleanBasicHtml, $generateHtmlFromNodes) binds the
// DOM globals, so the jsdom instances are installed here.
Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  document: dom.window.document,
  // $generateHtmlFromNodes (caption re-serialization) gates on a `window`
  // global as well as `document`.
  window: dom.window,
})

let editor: LexicalEditor

beforeEach(() => {
  editor = createHeadlessEditor({ nodes: [KobatoImageNode], onError: () => {} })
})

const FULL_DATASET = {
  src: '/storage/posts/cover.png',
  caption: '',
  title: '',
  alt: 'cover',
  cardWidth: 'regular',
  width: 800,
  height: 600,
  href: '',
  thumbhash: 'th-abcd',
  storagePath: 'objects/abcdef.png',
  imageId: 'img_1',
  layout: 'left',
}

/** Constructs the node and reads it inside ONE update (see the header). */
function withNode<T>(dataset: Record<string, unknown>, fn: (node: KobatoImageNode) => T): T {
  let result!: T
  editor.update(() => {
    result = fn(new KobatoImageNode(dataset))
  })
  return result
}

function exportHtmlFor(dataset: Record<string, unknown>, feed: boolean): string {
  return withNode(dataset, (node) => {
    const output = node.exportDOM(editor, {
      createDocument: () => dom.window.document,
      resolveRenderMeta: (kind) => {
        if (kind === FEED_VARIANT_META_KIND) {
          return feed ? true : undefined
        }
        if (kind === IMAGE_RENDER_ENV_META_KIND) {
          return { assetHost: 'assets.example.com', urlTemplate: '', siteOrigin: 'https://example.com' }
        }
        return undefined
      },
    })
    return (output.element as HTMLElement).outerHTML
  })
}

describe('KobatoImageNode — dataset persistence', () => {
  it('round-trips the four kobato keys through exportJSON/importJSON', () => {
    const json = withNode(FULL_DATASET, (node) => node.exportJSON())

    expect(json).toMatchObject({
      type: 'image',
      version: 1,
      src: '/storage/posts/cover.png',
      alt: 'cover',
      thumbhash: 'th-abcd',
      storagePath: 'objects/abcdef.png',
      imageId: 'img_1',
      layout: 'left',
    })

    let restored!: KobatoImageNode
    let snapshot!: Record<string, unknown>
    editor.update(() => {
      restored = KobatoImageNode.importJSON(json)
      snapshot = {
        thumbhash: restored.thumbhash,
        storagePath: restored.storagePath,
        imageId: restored.imageId,
        layout: restored.layout,
        src: restored.src,
      }
    })
    expect(restored).toBeInstanceOf(KobatoImageNode)
    expect(snapshot).toEqual({
      thumbhash: 'th-abcd',
      storagePath: 'objects/abcdef.png',
      imageId: 'img_1',
      layout: 'left',
      src: '/storage/posts/cover.png',
    })
  })

  it('omits the empty pass-through keys and defaults layout to center', () => {
    const json = withNode({ src: '/storage/a.png' }, (node) => node.exportJSON()) as Record<string, unknown>
    expect(json.layout).toBe('center')
    expect('thumbhash' in json).toBe(false)
    expect('storagePath' in json).toBe(false)
    expect('imageId' in json).toBe(false)
  })

  it('keeps the four keys across clone (getDataset) and normalizes garbage layout', () => {
    let copy!: KobatoImageNode
    editor.update(() => {
      // The inherited static clone is typed on the generated base class.
      copy = KobatoImageNode.clone(new KobatoImageNode(FULL_DATASET)) as KobatoImageNode
    })
    expect(copy).toBeInstanceOf(KobatoImageNode)
    // clone() reuses the original's key, so the getLatest()-backed getters
    // would resolve to the ORIGINAL in this update's node map — assert the
    // clone's own fields directly (they are what the constructor received
    // from getDataset()).
    expect(copy.__thumbhash).toBe('th-abcd')
    expect(copy.__storagePath).toBe('objects/abcdef.png')
    expect(copy.__imageId).toBe('img_1')
    expect(copy.__layout).toBe('left')

    withNode({ layout: 'sideways' }, (node) => expect(node.layout).toBe('center'))
    expect(normalizeKobatoImageLayout('right')).toBe('right')
  })

  it('stays inside the stock instanceof gates (upload intent, drop surgery)', () => {
    let node!: KobatoImageNode
    editor.update(() => {
      node = new KobatoImageNode(FULL_DATASET)
    })
    expect($isImageNode(node)).toBe(true)
    expect(node).toBeInstanceOf(ImageNode)
    expect(KobatoImageNode.getType()).toBe('image')
  })

  it('declares the stock eight properties verbatim plus the four kobato keys', () => {
    expect(KOBATO_IMAGE_PROPERTIES.map((property) => property.name)).toEqual([
      'src',
      'caption',
      'title',
      'alt',
      'cardWidth',
      'width',
      'height',
      'href',
      'thumbhash',
      'storagePath',
      'imageId',
      'layout',
    ])
  })
})

describe('KobatoImageNode — exportDOM markup', () => {
  it('exports the PT figure markup with the kobato extras (full variant)', () => {
    const html = exportHtmlFor(FULL_DATASET, false)
    expect(html).toContain('<figure class="block max-w-full mr-auto ml-0 w-fit" data-layout="left">')
    expect(html).toContain('data-thumbhash="th-abcd"')
    expect(html).toContain('width="800"')
    expect(html).toContain('height="600"')
    expect(html).toContain('sizes="100vw"')
    expect(html).not.toContain('objects/abcdef')
    expect(html).not.toContain('img_1')
  })

  it('wraps the image in a link for a safe href and drops it for an unsafe one', () => {
    const linked = exportHtmlFor({ ...FULL_DATASET, href: 'https://example.com/post' }, false)
    expect(linked).toContain('<a href="https://example.com/post">')
    const unsafe = exportHtmlFor({ ...FULL_DATASET, href: 'javascript:alert(1)' }, false)
    expect(unsafe).not.toContain('<a')
  })

  it('exports the bare PT rssMode figure for the feed variant', () => {
    const html = exportHtmlFor({ ...FULL_DATASET, caption: '题注 <strong>粗体</strong>' }, true)
    expect(html).toBe(
      '<figure><img src="https://example.com/storage/posts/cover.png" alt="cover" width="800" height="600"><figcaption>题注 粗体</figcaption></figure>',
    )
  })

  it('exports the empty container for a missing or unsafe src', () => {
    const output = withNode({ ...FULL_DATASET, src: '' }, (node) =>
      node.exportDOM(editor, {
        createDocument: () => dom.window.document,
      }),
    )
    expect(output.type).toBe('inner')
    expect((output.element as HTMLElement).outerHTML).toBe('<span></span>')
  })

  it('pins the exported img dim class to the public widget constant', () => {
    expect(KOBATO_IMAGE_IMG_CLASS).toBe(DARK_IMAGE_DIM_CLASS)
    expect(exportHtmlFor(FULL_DATASET, false)).toContain(`class="${DARK_IMAGE_DIM_CLASS}"`)
  })
})

describe('KobatoImageNode — importSpec (paste path)', () => {
  function importFigure(html: string): Record<string, unknown> | null {
    const container = dom.window.document.createElement('div')
    container.innerHTML = html
    const figure = container.querySelector('figure')!
    const convert = KobatoImageNode.importDOM?.()?.figure?.(figure)
    if (!convert) {
      return null
    }
    let snapshot: Record<string, unknown> | null = null
    editor.update(() => {
      const result = convert.conversion?.(figure) ?? null
      const node = (result === null ? null : result.node) as KobatoImageNode | null
      if (node) {
        snapshot = {
          isKobato: node instanceof KobatoImageNode,
          layout: node.layout,
          thumbhash: node.thumbhash,
          src: node.src,
          width: node.width,
          caption: node.caption,
          cardWidth: node.cardWidth,
        }
      }
    })
    return snapshot
  }

  it('re-imports the exported figure with layout and thumbhash intact', () => {
    const snapshot = importFigure(
      '<figure class="block max-w-full mr-0 ml-auto w-fit" data-layout="right">' +
        '<img src="/storage/x.png" alt="x" width="640" height="480" data-thumbhash="th-9" />' +
        '<figcaption>题注</figcaption></figure>',
    )
    expect(snapshot).toEqual({
      isKobato: true,
      layout: 'right',
      thumbhash: 'th-9',
      src: '/storage/x.png',
      width: 640,
      caption: '题注',
      cardWidth: 'regular',
    })
  })

  it('maps the legacy inkling width classes onto cardWidth', () => {
    const snapshot = importFigure('<figure class="inkling-card inkling-width-wide"><img src="/a.png" /></figure>')
    expect(snapshot).toMatchObject({ cardWidth: 'wide', layout: 'center' })
  })
})
