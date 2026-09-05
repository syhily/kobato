import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import Prettier from '@prettier/sync'
import { $getRoot } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { createDocument, dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseBookmarkNode, $createBaseBookmarkNode, $isBookmarkNode, type BookmarkData } from '@/nodes/base/index'

const editorNodes = [BaseBookmarkNode]

describe('BaseBookmarkNode', function () {
  let editor: LexicalEditor
  let dataset: BookmarkData
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })

    dataset = {
      url: 'https://inkling.local/',
      metadata: {
        icon: 'https://inkling.local/favicon.ico',
        title: 'Inkling: The Creator Economy Platform',
        description: 'doing kewl stuff',
        author: 'inkling',
        publisher: 'Inkling - The Professional Publishing Platform',
        thumbnail: 'https://inkling.local/images/meta/inkling.png',
      },
      caption: 'caption here',
    }

    exportOptions = {
      dom,
    }
  })

  it(
    'matches node with $isBookmarkNode',
    editorTest(
      () => editor,
      async function () {
        const bookmarkNode = $createBaseBookmarkNode(dataset)
        expect($isBookmarkNode(bookmarkNode)).toBe(true)
      },
    ),
  )

  describe('data access', function () {
    it(
      'has getters for all properties',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)

          const metadata = dataset.metadata as Record<string, unknown>
          expect(bookmarkNode.url).toBe(dataset.url)
          expect(bookmarkNode.icon).toBe(metadata.icon)
          expect(bookmarkNode.title).toBe(metadata.title)
          expect(bookmarkNode.description).toBe(metadata.description)
          expect(bookmarkNode.author).toBe(metadata.author)
          expect(bookmarkNode.publisher).toBe(metadata.publisher)
          expect(bookmarkNode.thumbnail).toBe(metadata.thumbnail)
          expect(bookmarkNode.caption).toBe(dataset.caption)
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode()

          expect(bookmarkNode.url).toBe('')
          bookmarkNode.url = 'https://inkling.local/'
          expect(bookmarkNode.url).toBe('https://inkling.local/')

          expect(bookmarkNode.icon).toBe('')
          bookmarkNode.icon = 'https://inkling.local/favicon.ico'
          expect(bookmarkNode.icon).toBe('https://inkling.local/favicon.ico')

          expect(bookmarkNode.title).toBe('')
          bookmarkNode.title = 'Inkling: The Creator Economy Platform'
          expect(bookmarkNode.title).toBe('Inkling: The Creator Economy Platform')

          expect(bookmarkNode.description).toBe('')
          bookmarkNode.description = 'doing kewl stuff'
          expect(bookmarkNode.description).toBe('doing kewl stuff')

          expect(bookmarkNode.author).toBe('')
          bookmarkNode.author = 'inkling'
          expect(bookmarkNode.author).toBe('inkling')

          expect(bookmarkNode.publisher).toBe('')
          bookmarkNode.publisher = 'Inkling - The Professional Publishing Platform'
          expect(bookmarkNode.publisher).toBe('Inkling - The Professional Publishing Platform')

          expect(bookmarkNode.thumbnail).toBe('')
          bookmarkNode.thumbnail = 'https://inkling.local/images/meta/inkling.png'
          expect(bookmarkNode.thumbnail).toBe('https://inkling.local/images/meta/inkling.png')

          expect(bookmarkNode.caption).toBe('')
          bookmarkNode.caption = 'caption here'
          expect(bookmarkNode.caption).toBe('caption here')
        },
      ),
    )

    it(
      'has getDataset() convenience method',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)
          const bookmarkNodeDataset = bookmarkNode.getDataset()

          expect(bookmarkNodeDataset).toEqual({
            ...dataset,
          })
        },
      ),
    )
  })

  describe('getType', function () {
    it(
      'returns the correct node type',
      editorTest(
        () => editor,
        async function () {
          expect(BaseBookmarkNode.getType()).toBe('bookmark')
        },
      ),
    )
  })

  describe('clone', function () {
    it(
      'returns a copy of the current node',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)
          const bookmarkNodeDataset = bookmarkNode.getDataset()
          const clone = BaseBookmarkNode.clone(bookmarkNode)
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...bookmarkNodeDataset })
        },
      ),
    )
  })

  describe('urlTransformMap', function () {
    it(
      'contains the expected URL mapping',
      editorTest(
        () => editor,
        async function () {
          expect(BaseBookmarkNode.urlTransformMap).toEqual({
            url: 'url',
            'metadata.icon': 'url',
            'metadata.thumbnail': 'url',
          })
        },
      ),
    )
  })

  describe('hasEditMode', function () {
    it(
      'returns true',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)
          expect(bookmarkNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('isEmpty', function () {
    it(
      'returns true if url is empty',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)

          expect(bookmarkNode.isEmpty()).toBe(false)
          bookmarkNode.url = ''
          expect(bookmarkNode.isEmpty()).toBe(true)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'creates an bookmark card',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)
          const result = bookmarkNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement
          const metadata = dataset.metadata as Record<string, unknown>

          const expectedHtml = `
                <figure class="inkling-card inkling-bookmark-card inkling-card-hascaption">
                    <a class="inkling-bookmark-container" href="${dataset.url}">
                        <div class="inkling-bookmark-content">
                            <div class="inkling-bookmark-title">${String(metadata.title)}</div>
                            <div class="inkling-bookmark-description">${String(metadata.description)}</div>
                            <div class="inkling-bookmark-metadata">
                                <img class="inkling-bookmark-icon" src="${String(metadata.icon)}" alt="">
                                <span class="inkling-bookmark-author">${String(metadata.publisher)}</span>
                                <span class="inkling-bookmark-publisher">${String(metadata.author)}</span>
                            </div>
                        </div>
                        <div class="inkling-bookmark-thumbnail">
                            <img src="${String(metadata.thumbnail)}" alt="" onerror="this.style.display = 'none'">
                        </div>
                    </a>
                    <figcaption>${String(dataset.caption)}</figcaption>
                </figure>
            `

          const prettyExpectedHtml = Prettier.format(expectedHtml, { parser: 'html' })

          await expectPrettifiedHtml(element.outerHTML, prettyExpectedHtml)
        },
      ),
    )

    it(
      'renders an empty span with a missing src',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode()
          const result = bookmarkNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.outerHTML).toBe('<span></span>')
        },
      ),
    )

    it(
      'escapes HTML for text fields in web',
      editorTest(
        () => editor,
        async function () {
          dataset = {
            url: 'https://www.fake.org/',
            metadata: {
              icon: 'https://www.fake.org/favicon.ico',
              title: 'Inkling: Independent technology <script>alert("XSS")</script> for modern publishing.',
              description: 'doing "kewl" stuff',
              author: "fa'ker",
              publisher: 'Fake <script>alert("XSS")</script>',
              thumbnail: 'https://fake.org/image.png',
            },
            caption:
              '<p dir="ltr"><span style="white-space: pre-wrap;">This is a </span><b><strong style="white-space: pre-wrap;">caption</strong></b></p>',
          }
          const bookmarkNode = $createBaseBookmarkNode(dataset)
          const result = bookmarkNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          // Check that text fields are escaped
          expect(element.innerHTML).toContain(
            'Inkling: Independent technology &lt;script&gt;alert("XSS")&lt;/script&gt; for modern publishing.',
          )
          expect(element.innerHTML).toContain('doing "kewl" stuff')
          expect(element.innerHTML).toContain("fa'ker")
          expect(element.innerHTML).toContain('Fake &lt;script&gt;alert("XSS")&lt;/script&gt;')

          // Check that caption is sanitized before insertion
          expect(element.innerHTML).toContain(
            '<p><span style="white-space: pre-wrap;">This is a </span><b><strong style="white-space: pre-wrap;">caption</strong></b></p>',
          )
        },
      ),
    )

    it(
      'drops a bookmark with an unsafe URL',
      editorTest(
        () => editor,
        function () {
          const bookmarkNode = $createBaseBookmarkNode({
            url: 'javascript:alert(1)',
            metadata: {
              icon: '',
              title: '',
              description: '',
              author: '',
              publisher: '',
              thumbnail: '',
            },
            caption: '',
          })
          const result = bookmarkNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.outerHTML).toBe('<span></span>')
        },
      ),
    )

    describe('media URL policy', function () {
      const allowedMediaSources = [
        'https://example.com/icon.png',
        '/relative/path/icon.png',
        'data:image/png;base64,AAAA',
        'blob:https://example.com/9b1d4f2a',
      ]

      allowedMediaSources.forEach((src) => {
        it(
          `renders optional media for allowed media source ${src}`,
          editorTest(
            () => editor,
            async function () {
              const bookmarkNode = $createBaseBookmarkNode({
                ...dataset,
                metadata: { ...(dataset.metadata as Record<string, unknown>), icon: src, thumbnail: src },
              })
              const { element } = bookmarkNode.exportDOM(editor, exportOptions)
              const el = element as HTMLElement

              expect(el.querySelector('img.inkling-bookmark-icon')!.getAttribute('src')).toBe(src)
              expect(el.querySelector('.inkling-bookmark-thumbnail img')!.getAttribute('src')).toBe(src)
            },
          ),
        )
      })

      it(
        'omits unsupported optional media in web output',
        editorTest(
          () => editor,
          async function () {
            const bookmarkNode = $createBaseBookmarkNode({
              ...dataset,
              metadata: {
                ...(dataset.metadata as Record<string, unknown>),
                icon: 'unsupported-scheme:payload',
                thumbnail: 'unsupported-scheme:payload',
              },
            })
            const { element } = bookmarkNode.exportDOM(editor, exportOptions)
            const el = element as HTMLElement
            const output = el.outerHTML

            expect(output).not.toContain('unsupported-scheme:payload')
            expect(el.querySelector('img.inkling-bookmark-icon')).toBeNull()
            expect(el.querySelector('.inkling-bookmark-thumbnail')).toBeNull()
            expect(el.querySelector('.inkling-bookmark-title')!.textContent).toBe(
              'Inkling: The Creator Economy Platform',
            )
            expect(el.querySelector('a.inkling-bookmark-container')!.getAttribute('href')).toBe(
              'https://inkling.local/',
            )
          },
        ),
      )
    })

    it(
      'sanitizes a malicious caption',
      editorTest(
        () => editor,
        function () {
          const maliciousCaption = '<img src=x onerror=alert(1)>'
          const bookmarkNode = $createBaseBookmarkNode({
            url: 'https://www.fake.org/',
            metadata: {
              icon: '',
              title: '',
              description: '',
              author: '',
              publisher: '',
              thumbnail: '',
            },
            caption: maliciousCaption,
          })

          const webResult = bookmarkNode.exportDOM(editor, exportOptions)
          const webHtml = (webResult.element as HTMLElement).outerHTML
          expect(webHtml).not.toContain('<img src=x onerror=alert(1)>')
          expect(webHtml).not.toContain('onerror=alert(1)')
        },
      ),
    )
  })

  describe('exportJSON', function () {
    it(
      'contains all data',
      editorTest(
        () => editor,
        async function () {
          const bookmarkNode = $createBaseBookmarkNode(dataset)
          const json = bookmarkNode.exportJSON()
          const metadata = dataset.metadata as Record<string, unknown>

          expect(json).toEqual({
            type: 'bookmark',
            version: 1,
            url: dataset.url,
            metadata: {
              icon: metadata.icon,
              title: metadata.title,
              description: metadata.description,
              author: metadata.author,
              publisher: metadata.publisher,
              thumbnail: metadata.thumbnail,
            },
            caption: dataset.caption,
          })
        },
      ),
    )
  })

  describe('importJSON', function () {
    it('imports all data', () =>
      new Promise<void>((resolve, reject) => {
        const serializedState = JSON.stringify({
          root: {
            children: [
              {
                type: 'bookmark',
                ...dataset,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        })

        const editorState = editor.parseEditorState(serializedState)
        editor.setEditorState(editorState)

        editor.getEditorState().read(() => {
          try {
            const [bookmarkNode] = $getRoot().getChildren() as BaseBookmarkNode[]

            expect(bookmarkNode.url).toBe(dataset.url)
            expect(bookmarkNode.icon).toBe((dataset.metadata as Record<string, unknown>).icon)
            expect(bookmarkNode.title).toBe((dataset.metadata as Record<string, unknown>).title)
            expect(bookmarkNode.description).toBe((dataset.metadata as Record<string, unknown>).description)
            expect(bookmarkNode.author).toBe((dataset.metadata as Record<string, unknown>).author)
            expect(bookmarkNode.publisher).toBe((dataset.metadata as Record<string, unknown>).publisher)
            expect(bookmarkNode.thumbnail).toBe((dataset.metadata as Record<string, unknown>).thumbnail)
            expect(bookmarkNode.caption).toBe(dataset.caption)

            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))

    it('coerces junk fields at the importJSON boundary', () =>
      new Promise<void>((resolve, reject) => {
        const serializedState = JSON.stringify({
          root: {
            children: [
              {
                type: 'bookmark',
                url: 42,
                metadata: { icon: 7, title: 'Kept', bogus: 'dropped' },
                caption: null,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        })

        const editorState = editor.parseEditorState(serializedState)
        editor.setEditorState(editorState)

        editor.getEditorState().read(() => {
          try {
            const [bookmarkNode] = $getRoot().getChildren() as BaseBookmarkNode[]

            // non-string url/caption coerce to ''; metadata keeps only the
            // declared string fields
            expect(bookmarkNode.url).toBe('')
            expect(bookmarkNode.title).toBe('Kept')
            expect(bookmarkNode.icon).toBe('')
            expect(bookmarkNode.caption).toBe('')

            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('static properties', function () {
    it(
      'getType',
      editorTest(
        () => editor,
        async function () {
          expect(BaseBookmarkNode.getType()).toBe('bookmark')
        },
      ),
    )

    it(
      'urlTransformMap',
      editorTest(
        () => editor,
        async function () {
          expect(BaseBookmarkNode.urlTransformMap).toEqual({
            url: 'url',
            'metadata.icon': 'url',
            'metadata.thumbnail': 'url',
          })
        },
      ),
    )
  })

  describe('importDOM', function () {
    it(
      'parses bookmark card',
      editorTest(
        () => editor,
        async function () {
          const metadata = dataset.metadata as Record<string, unknown>
          const document = createDocument(html`
            <figure class="inkling-card inkling-bookmark-card inkling-card-hascaption">
              <a class="inkling-bookmark-container" href="${dataset.url}">
                <div class="inkling-bookmark-content">
                  <div class="inkling-bookmark-title">${metadata.title}</div>
                  <div class="inkling-bookmark-description">${metadata.description}</div>
                  <div class="inkling-bookmark-metadata">
                    <img class="inkling-bookmark-icon" src="${metadata.icon}" alt="" />
                    <span class="inkling-bookmark-author">${metadata.publisher}</span>
                    <span class="inkling-bookmark-publisher">${metadata.author}</span>
                  </div>
                </div>
                <div class="inkling-bookmark-thumbnail">
                  <img src="${metadata.thumbnail}" alt="" onerror="this.style.display = 'none'" />
                </div>
              </a>
              <figcaption>${dataset.caption}</figcaption>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          const node = nodes[0] as BaseBookmarkNode
          expect(node.url).toBe(dataset.url)
          expect(node.icon).toBe((dataset.metadata as Record<string, unknown>).icon)
          expect(node.title).toBe((dataset.metadata as Record<string, unknown>).title)
          expect(node.description).toBe((dataset.metadata as Record<string, unknown>).description)
          expect(node.author).toBe((dataset.metadata as Record<string, unknown>).author)
          expect(node.publisher).toBe((dataset.metadata as Record<string, unknown>).publisher)
          expect(node.thumbnail).toBe((dataset.metadata as Record<string, unknown>).thumbnail)
          expect(node.caption).toBe(dataset.caption)
        },
      ),
    )

    // mixtape embeds parse into bookmark cards
    describe('mixtapes', function () {
      // Mobiledoc {\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"bookmark\",{\"url\":\"https://slack.engineering/typescript-at-slack-a81307fa288d\",\"metadata\":{\"url\":\"https://slack.engineering/typescript-at-slack-a81307fa288d\",\"title\":\"TypeScript at Slack\",\"description\":\"When Brendan Eich created the very first version of JavaScript for Netscape Navigator 2.0 in merely ten days, it’s likely that he did not expect how far the Slack Desktop App would take his…\",\"author\":\"Felix Rieseberg\",\"publisher\":\"Several People Are Coding\",\"thumbnail\":\"https://miro.medium.com/max/1200/1*-h1bH8gB3I7gPh5AG1HmsQ.png\",\"icon\":\"https://cdn-images-1.medium.com/fit/c/152/152/1*8I-HPL0bfoIzGied-dzOvA.png\"},\"type\":\"bookmark\"}]],\"markups\":[],\"sections\":[[10,0],[1,\"p\",[]]]}
      // Inkling HTML <figure class="inkling-card inkling-bookmark-card"><a class="inkling-bookmark-container" href="https://slack.engineering/typescript-at-slack-a81307fa288d"><div class="inkling-bookmark-content"><div class="inkling-bookmark-title">TypeScript at Slack</div><div class="inkling-bookmark-description">When Brendan Eich created the very first version of JavaScript for Netscape Navigator 2.0 in merely ten days, it’s likely that he did not expect how far the Slack Desktop App would take his…</div><div class="inkling-bookmark-metadata"><img class="inkling-bookmark-icon" src="https://cdn-images-1.medium.com/fit/c/152/152/1*8I-HPL0bfoIzGied-dzOvA.png"><span class="inkling-bookmark-author">Felix Rieseberg</span><span class="inkling-bookmark-publisher">Several People Are Coding</span></div></div><div class="inkling-bookmark-thumbnail"><img src="https://miro.medium.com/max/1200/1*-h1bH8gB3I7gPh5AG1HmsQ.png"></div></a></figure>
      // Medium Export HTML <div class="graf graf--mixtapeEmbed graf-after--p"><a href="https://slack.engineering/typescript-at-slack-a81307fa288d" data-href="https://slack.engineering/typescript-at-slack-a81307fa288d" class="markup--anchor markup--mixtapeEmbed-anchor" title="https://slack.engineering/typescript-at-slack-a81307fa288d"><strong class="markup--strong markup--mixtapeEmbed-strong">TypeScript at Slack</strong><br><em class="markup--em markup--mixtapeEmbed-em">Or, How I Learned to Stop Worrying &amp; Trust the Compiler</em>slack.engineering</a><a href="https://slack.engineering/typescript-at-slack-a81307fa288d" class="js-mixtapeImage mixtapeImage u-ignoreBlock" data-media-id="abc123" data-thumbnail-img-id="1*-h1bH8gB3I7gPh5AG1HmsQ.png" style="background-image: url(https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png);"></a></div>

      it(
        'parses mixtape block with all data',
        editorTest(
          () => editor,
          async function () {
            const document = createDocument(
              html`<div class="graf graf--mixtapeEmbed graf-after--p">
                <a
                  href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  data-href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  class="markup--anchor markup--mixtapeEmbed-anchor"
                  title="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  ><strong class="markup--strong markup--mixtapeEmbed-strong">TypeScript at Slack</strong><br /><em
                    class="markup--em markup--mixtapeEmbed-em"
                    >Or, How I Learned to Stop Worrying &amp; Trust the Compiler</em
                  >slack.engineering</a
                ><a
                  href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  class="js-mixtapeImage mixtapeImage u-ignoreBlock"
                  data-media-id="abc123"
                  data-thumbnail-img-id="1*-h1bH8gB3I7gPh5AG1HmsQ.png"
                  style="background-image: url(https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png);"
                ></a>
              </div>`,
            )
            const nodes = $generateNodesFromDOM(editor, document)

            expect(nodes.length).toBe(1)
            const bookmarkNode = nodes[0] as BaseBookmarkNode

            expect(bookmarkNode.url).toBe('https://slack.engineering/typescript-at-slack-a81307fa288d')
            expect(bookmarkNode.title).toBe('TypeScript at Slack')
            expect(bookmarkNode.description).toBe('Or, How I Learned to Stop Worrying &amp; Trust the Compiler')
            expect(bookmarkNode.publisher).toBe('slack.engineering')
            expect(bookmarkNode.thumbnail).toBe(
              'https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png',
            )
          },
        ),
      )

      it(
        'parses mixtape with missing title',
        editorTest(
          () => editor,
          async function () {
            const document = createDocument(
              html`<div class="graf graf--mixtapeEmbed graf-after--mixtapeEmbed">
                <a
                  href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  data-href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  class="markup--anchor markup--mixtapeEmbed-anchor"
                  title="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  ><br /><em class="markup--em markup--mixtapeEmbed-em"
                    >Or, How I Learned to Stop Worrying &amp; Trust the Compiler</em
                  >slack.engineering</a
                ><a
                  href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  class="js-mixtapeImage mixtapeImage u-ignoreBlock"
                  data-media-id="abc123"
                  data-thumbnail-img-id="1*-h1bH8gB3I7gPh5AG1HmsQ.png"
                  style="background-image: url(https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png);"
                ></a>
              </div>`,
            )
            const nodes = $generateNodesFromDOM(editor, document)

            expect(nodes.length).toBe(1)
            const bookmarkNode = nodes[0] as BaseBookmarkNode

            expect(bookmarkNode.url).toBe('https://slack.engineering/typescript-at-slack-a81307fa288d')
            expect(bookmarkNode.title).toBe('')
            expect(bookmarkNode.description).toBe('Or, How I Learned to Stop Worrying &amp; Trust the Compiler')
            expect(bookmarkNode.publisher).toBe('slack.engineering')
            expect(bookmarkNode.thumbnail).toBe(
              'https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png',
            )
          },
        ),
      )

      it(
        'parses mixtape when title and description are nested descendants',
        editorTest(
          () => editor,
          async function () {
            const document = createDocument(
              html`<div class="graf graf--mixtapeEmbed graf-after--p">
                <a
                  href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  data-href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  class="markup--anchor markup--mixtapeEmbed-anchor"
                  title="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  ><span><strong class="markup--strong markup--mixtapeEmbed-strong">TypeScript at Slack</strong></span
                  ><br /><span
                    ><em class="markup--em markup--mixtapeEmbed-em"
                      >Or, How I Learned to Stop Worrying &amp; Trust the Compiler</em
                    ></span
                  >slack.engineering</a
                ><a
                  href="https://slack.engineering/typescript-at-slack-a81307fa288d"
                  class="js-mixtapeImage mixtapeImage u-ignoreBlock"
                  data-media-id="abc123"
                  data-thumbnail-img-id="1*-h1bH8gB3I7gPh5AG1HmsQ.png"
                  style="background-image: url(https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png);"
                ></a>
              </div>`,
            )
            const nodes = $generateNodesFromDOM(editor, document)

            expect(nodes.length).toBe(1)
            const bookmarkNode = nodes[0] as BaseBookmarkNode

            expect(bookmarkNode.url).toBe('https://slack.engineering/typescript-at-slack-a81307fa288d')
            expect(bookmarkNode.title).toBe('TypeScript at Slack')
            expect(bookmarkNode.description).toBe('Or, How I Learned to Stop Worrying &amp; Trust the Compiler')
            expect(bookmarkNode.publisher).toContain('slack.engineering')
            expect(bookmarkNode.thumbnail).toBe(
              'https://cdn-images-1.medium.com/fit/c/160/160/1*-h1bH8gB3I7gPh5AG1HmsQ.png',
            )
          },
        ),
      )
    })
  })

  describe('getTextContent', function () {
    it(
      'returns contents',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseBookmarkNode()
          expect(node.getTextContent()).toBe('')

          node.title = 'Test'
          node.description = 'Test description'
          node.url = 'https://example.com'
          node.caption = 'Test <strong>caption</strong>'

          expect(node.getTextContent()).toBe(
            'Test\nTest description\nhttps://example.com\nTest <strong>caption</strong>\n\n',
          )
        },
      ),
    )
  })
})
