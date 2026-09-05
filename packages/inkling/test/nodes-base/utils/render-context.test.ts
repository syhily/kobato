import { createHeadlessEditor } from '@lexical/headless'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { dom } from '#/nodes-base/test-utils/index'
import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { createRenderContext, type RenderContext } from '@/nodes/base/render-context'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRenderContext', () => {
  describe('createDocument resolution', () => {
    it('uses options.createDocument when provided', () => {
      const createDocument = () => dom.window.document
      const context = createRenderContext({ createDocument })

      expect(context.createDocument).toBe(createDocument)
    })

    it('derives createDocument from options.dom', () => {
      const context = createRenderContext({ dom })

      expect(context.createDocument()).toBe(dom.window.document)
    })

    it('prefers options.createDocument over options.dom', () => {
      const createDocument = () => dom.window.document
      const context = createRenderContext({ dom, createDocument })

      expect(context.createDocument).toBe(createDocument)
    })

    it('prefers options.dom over the browser global document', () => {
      const context = createRenderContext({ dom })

      expect(context.createDocument()).not.toBe(window.document)
    })

    it('falls back to the browser global document', () => {
      const context = createRenderContext({})

      expect(context.createDocument()).toBe(window.document)
    })

    it('throws the exact non-browser error without any document source', () => {
      vi.stubGlobal('window', undefined)

      expect(() => createRenderContext({})).toThrow(
        /^Must be passed a `createDocument` function as an option when used in a non-browser environment$/,
      )
    })
  })

  describe('read-only guarantee', () => {
    it('freezes the context', () => {
      const context = createRenderContext({ dom })

      expect(Object.isFrozen(context)).toBe(true)
      expect(() => {
        ;(context as unknown as Record<string, unknown>).inklingVersion = '4.0'
      }).toThrow(TypeError)
      expect(() => {
        ;(context as unknown as Record<string, unknown>).safeUrl = () => ''
      }).toThrow(TypeError)
    })

    it('passes pictureImageFormats through', () => {
      const context = createRenderContext({ dom, pictureImageFormats: true })

      expect(context.pictureImageFormats).toBe(true)
    })

    it('leaves pictureImageFormats undefined when not passed', () => {
      const context = createRenderContext({ dom })

      expect(context.pictureImageFormats).toBeUndefined()
    })

    it('closes over siteUrl/imageBaseUrl without exposing them as fields', () => {
      const context = createRenderContext({
        dom,
        imageBaseUrl: 'https://img.example.com',
        siteUrl: 'https://example.com',
      })

      expect('imageBaseUrl' in context).toBe(false)
      expect('siteUrl' in context).toBe(false)
      expect(context.isLocalContentImage('https://example.com/content/images/test.jpg')).toBe(true)
      expect(context.isLocalContentImage('https://img.example.com/content/images/test.jpg')).toBe(true)
    })
  })

  describe('image and markdown data options', () => {
    it('carries the transform functions by reference', () => {
      const canTransformImage = (src: string) => src.startsWith('/')
      const canTransformImageToFormat = (format: string) => format === 'webp'
      const context = createRenderContext({ dom, canTransformImage, canTransformImageToFormat })

      expect(context.canTransformImage).toBe(canTransformImage)
      expect(context.canTransformImageToFormat).toBe(canTransformImageToFormat)
    })

    it('exposes imageOptimization as a frozen snapshot', () => {
      const imageOptimization = { defaultMaxWidth: 1000, contentImageSizes: { m: { width: 1000 } }, srcsets: true }
      const context = createRenderContext({ dom, imageOptimization })

      expect(Object.isFrozen(context.imageOptimization)).toBe(true)
      expect(context.imageOptimization?.defaultMaxWidth).toBe(1000)
      expect(context.imageOptimization?.contentImageSizes).toEqual({ m: { width: 1000 } })
      expect(context.imageOptimization?.srcsets).toBe(true)

      imageOptimization.defaultMaxWidth = 600
      expect(context.imageOptimization?.defaultMaxWidth).toBe(1000)
    })

    it('carries inklingVersion for the markdown card', () => {
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated flat key's compatibility forwarding
      const context = createRenderContext({ dom, inklingVersion: '3.9' })

      // oxlint-disable-next-line typescript/no-deprecated -- the deprecated context field must keep resolving for external renderers
      expect(context.inklingVersion).toBe('3.9')
    })

    it('leaves the data options undefined when not passed', () => {
      const context = createRenderContext({ dom })

      expect(context.imageOptimization).toBeUndefined()
      expect(context.canTransformImage).toBeUndefined()
      expect(context.canTransformImageToFormat).toBeUndefined()
      // oxlint-disable-next-line typescript/no-deprecated -- pins the deprecated field's absent state
      expect(context.inklingVersion).toBeUndefined()
    })

    it('throws the pinned markdown TypeError for a truthy non-function createDocument', () => {
      expect(() => createRenderContext({ createDocument: true as unknown as () => Document })).toThrow(
        /^renderMarkdownNode requires options\.createDocument to be a function$/,
      )
    })
  })

  describe('resolveRenderMeta', () => {
    it('carries the resolver by reference, hitting and missing by (kind, id)', () => {
      const resolveRenderMeta = (kind: string, id: string) =>
        kind === 'musicPlayer' && id === 'player-1' ? { title: 'Song', artist: 'Artist' } : undefined
      const context = createRenderContext({ dom, resolveRenderMeta })

      expect(context.resolveRenderMeta).toBe(resolveRenderMeta)
      expect(context.resolveRenderMeta?.('musicPlayer', 'player-1')).toEqual({ title: 'Song', artist: 'Artist' })
      expect(context.resolveRenderMeta?.('musicPlayer', 'player-unknown')).toBeUndefined()
    })

    it('is undefined on the frozen context when not passed', () => {
      const context = createRenderContext({ dom })

      expect(Object.isFrozen(context)).toBe(true)
      expect(context.resolveRenderMeta).toBeUndefined()
    })
  })

  describe('resolveExportPolicy', () => {
    it('resolves a policy key through the host resolver', () => {
      const context = createRenderContext({
        dom,
        resolveExportPolicy: (key) => (key === 'footnotes-section-title' ? 'Notes' : undefined),
      })

      expect(context.resolveExportPolicy('footnotes-section-title')).toBe('Notes')
      expect(context.resolveExportPolicy('inkling-version')).toBeUndefined()
    })

    it('forwards the deprecated flat keys as the resolver fallback', () => {
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins both deprecated flat keys' forwarding
      const context = createRenderContext({ dom, inklingVersion: '3.9', footnotesSectionTitle: 'References' })

      expect(context.resolveExportPolicy('inkling-version')).toBe('3.9')
      expect(context.resolveExportPolicy('footnotes-section-title')).toBe('References')
      // the deprecated context field is the same resolved value
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated field
      expect(context.inklingVersion).toBe('3.9')
    })

    it('lets the resolver win over a deprecated flat key', () => {
      const context = createRenderContext({
        dom,
        // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated flat key losing to the resolver
        inklingVersion: '3.9',
        resolveExportPolicy: (key) => (key === 'inkling-version' ? '4.2' : undefined),
      })

      expect(context.resolveExportPolicy('inkling-version')).toBe('4.2')
      // oxlint-disable-next-line typescript/no-deprecated -- intentionally pins the deprecated field
      expect(context.inklingVersion).toBe('4.2')
    })
  })

  describe('safeUrl', () => {
    const context = createRenderContext({ dom })

    it('returns the value when safe, empty string otherwise', () => {
      expect(context.safeUrl('navigation', 'https://example.com')).toBe('https://example.com')
      expect(context.safeUrl('navigation', '/relative/path')).toBe('/relative/path')
      expect(context.safeUrl('navigation', 'javascript:alert(1)')).toBe('')
    })

    it('rejects data/blob URLs for navigation but allows them for media', () => {
      expect(context.safeUrl('navigation', 'data:image/png;base64,abc')).toBe('')
      expect(context.safeUrl('navigation', 'blob:https://example.com/1234')).toBe('')
      expect(context.safeUrl('media', 'data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
      expect(context.safeUrl('media', 'blob:https://example.com/1234')).toBe('blob:https://example.com/1234')
    })

    it('rejects non-allowlisted schemes for both kinds', () => {
      // `unsupported-scheme:payload` was the rejected media source pinned per
      // card by the retired test/nodes-base/nodes/media-url-policy.test.ts
      // drift guard; the seam makes the policy structural, so the adversarial
      // input is pinned here directly.
      expect(context.safeUrl('navigation', 'unsupported-scheme:payload')).toBe('')
      expect(context.safeUrl('media', 'unsupported-scheme:payload')).toBe('')
      expect(context.safeUrl('media', 'javascript:alert(1)')).toBe('')
    })
  })

  describe('isLocalContentImage', () => {
    it("forwards the context's own siteUrl and imageBaseUrl", () => {
      // The seam property (plan 040 Step 3b): renderers cannot forget to
      // forward the site config — the b87ecc1 bug class — because the context
      // carries it.
      const context = createRenderContext({
        dom,
        siteUrl: 'https://example.com',
        imageBaseUrl: 'https://cdn.example.com',
      })

      expect(context.isLocalContentImage('https://example.com/content/images/test.jpg')).toBe(true)
      expect(context.isLocalContentImage('https://cdn.example.com/content/images/test.jpg')).toBe(true)
    })

    it('treats the CDN URL as external when the context has no imageBaseUrl', () => {
      const context = createRenderContext({ dom, siteUrl: 'https://example.com' })

      expect(context.isLocalContentImage('https://cdn.example.com/content/images/test.jpg')).toBe(false)
    })

    it('matches local content paths without any site config', () => {
      const context = createRenderContext({ dom })

      expect(context.isLocalContentImage('/content/images/test.jpg')).toBe(true)
      expect(context.isLocalContentImage('__INKLING_URL__/content/images/test.jpg')).toBe(true)
    })

    it('rejects external and site-prefix-lookalike URLs', () => {
      const context = createRenderContext({ dom, siteUrl: 'https://example.com' })

      expect(context.isLocalContentImage('https://other.example.com/photos/test.jpg')).toBe(false)
      expect(context.isLocalContentImage('https://example.com.evil.com/content/images/test.jpg')).toBe(false)
    })
  })

  describe('trackIdAttribute', () => {
    it('returns the base id on first use and <id>-<n> on repeats', () => {
      const context = createRenderContext({ dom })

      expect(context.trackIdAttribute('heading-one')).toBe('heading-one')
      expect(context.trackIdAttribute('heading-one')).toBe('heading-one-1')
      expect(context.trackIdAttribute('heading-one')).toBe('heading-one-2')
    })

    it('deduplicates ids independently of each other', () => {
      const context = createRenderContext({ dom })

      expect(context.trackIdAttribute('heading-one')).toBe('heading-one')
      expect(context.trackIdAttribute('heading-two')).toBe('heading-two')
      expect(context.trackIdAttribute('heading-one')).toBe('heading-one-1')
      expect(context.trackIdAttribute('heading-two')).toBe('heading-two-1')
    })

    it('does not share the id map across contexts (one context per render pass)', () => {
      expect(createRenderContext({ dom }).trackIdAttribute('heading-one')).toBe('heading-one')
      expect(createRenderContext({ dom }).trackIdAttribute('heading-one')).toBe('heading-one')
    })
  })

  describe('sanitization', () => {
    const context = createRenderContext({ dom })

    it('sanitizeBasicHtml keeps allowed markup and neutralizes scripts', () => {
      const output = context.sanitizeBasicHtml('<b>bold</b><script>alert(1)</script>')

      expect(output).toContain('<b>bold</b>')
      expect(output).not.toContain('<script>')
      expect(output).toContain('js-embed-placeholder')
    })

    it('sanitizeCardHtml applies the given DOMPurify config', () => {
      const output = context.sanitizeCardHtml('<b>x</b><i>y</i><script>alert(1)</script>', { ALLOWED_TAGS: ['b'] })

      expect(output).toBe('<b>x</b>y')
    })
  })
})

describe('exportDOM dispatch threading', () => {
  it("passes a frozen render context as the render fn's only argument besides the node", () => {
    let received: RenderContext | undefined

    const TestNode = generateDecoratorNode({
      nodeType: 'render-context-dispatch-test',
      defaultRenderFn: (_node, context) => {
        received = context
        return { element: null, type: 'inner' as const }
      },
    })

    const editor = createHeadlessEditor({ nodes: [TestNode] })
    let output: unknown
    editor.update(() => {
      const node = new TestNode()
      output = node.exportDOM(editor, { dom })
    })

    expect(output).toEqual({ element: null, type: 'inner' })
    expect(received).toBeDefined()
    expect(Object.isFrozen(received)).toBe(true)
    expect(received!.createDocument()).toBe(dom.window.document)
  })
})
