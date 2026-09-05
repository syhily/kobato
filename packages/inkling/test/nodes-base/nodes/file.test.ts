import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, type LexicalEditor } from 'lexical'

import { dom, createDocument } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseFileNode, $createBaseFileNode, $isFileNode } from '@/nodes/base/index'

const editorNodes = [BaseFileNode]

describe('BaseFileNode', function () {
  let editor: LexicalEditor
  let dataset: Record<string, unknown>
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({
      nodes: editorNodes,
    })
    dataset = {
      src: '/content/files/2023/03/IMG_0196.jpeg',
      fileTitle: 'Cool image to download',
      fileSize: 123456,
      fileCaption: 'This is a description',
      fileName: 'IMG_0196.jpeg',
    }
    exportOptions = {
      exportFormat: 'html',
      dom,
    }
  })

  it(
    'can match node with BaseFileNode',
    editorTest(
      () => editor,
      function () {
        const node = $createBaseFileNode(dataset)
        expect($isFileNode(node)).toBe(true)
      },
    ),
  )

  describe('data access', function () {
    it(
      'has getters from all properties',
      editorTest(
        () => editor,
        function () {
          const node = $createBaseFileNode(dataset)
          expect(node.src).toBe(dataset.src)
          expect(node.fileTitle).toBe(dataset.fileTitle)
          expect(node.fileSize).toBe(dataset.fileSize)
          expect(node.fileCaption).toBe(dataset.fileCaption)
          expect(node.fileName).toBe(dataset.fileName)
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        function () {
          const node = $createBaseFileNode(dataset)
          node.src = '/content/files/2023/03/IMG_0196.jpeg'
          expect(node.src).toBe('/content/files/2023/03/IMG_0196.jpeg')
          node.fileTitle = 'new title'
          expect(node.fileTitle).toBe('new title')
          node.fileSize = 123456
          expect(node.fileSize).toBe(123456)
          expect(node.formattedFileSize).toBe('121 KB')
          node.fileCaption = 'new description'
          expect(node.fileCaption).toBe('new description')
          node.fileName = 'IMG_0196.jpeg'
          expect(node.fileName).toBe('IMG_0196.jpeg')
        },
      ),
    )

    it(
      'has getDataset() convenience method',
      editorTest(
        () => editor,
        function () {
          const node = $createBaseFileNode(dataset)
          const fileNodeDataset = node.getDataset()
          expect(fileNodeDataset).toEqual(dataset)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'creates a file card',
      editorTest(
        () => editor,
        function () {
          const fileNode = $createBaseFileNode(dataset)
          const { element } = fileNode.exportDOM(editor, exportOptions)
          expect((element as HTMLElement).outerHTML).toBe(
            `<div class="inkling-card inkling-file-card"><a class="inkling-file-card-container" href="/content/files/2023/03/IMG_0196.jpeg" title="Download" download=""><div class="inkling-file-card-contents"><div class="inkling-file-card-title">Cool image to download</div><div class="inkling-file-card-caption">This is a description</div><div class="inkling-file-card-metadata"><div class="inkling-file-card-filename">IMG_0196.jpeg</div><div class="inkling-file-card-filesize">121 KB</div></div></div><div class="inkling-file-card-icon"><svg viewBox="0 0 24 24"><defs><style>.a{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5px;}</style></defs><title>download-circle</title><polyline class="a" points="8.25 14.25 12 18 15.75 14.25"></polyline><line class="a" x1="12" y1="6.75" x2="12" y2="18"></line><circle class="a" cx="12" cy="12" r="11.25"></circle></svg></div></a></div>`,
          )
        },
      ),
    )

    it(
      'does not create an anchor for unsafe src URLs',
      editorTest(
        () => editor,
        function () {
          const fileNode = $createBaseFileNode({ ...dataset, src: 'javascript:alert(1)' })
          const { element } = fileNode.exportDOM(editor, exportOptions)
          const html = (element as HTMLElement).outerHTML

          expect(html).not.toContain('href="javascript:')
          expect(html).toContain('inkling-file-card-container')
          expect(html).toContain('Cool image to download')
        },
      ),
    )
  })

  describe('getType', function () {
    it(
      'returns the correct node type',
      editorTest(
        () => editor,
        function () {
          expect(BaseFileNode.getType()).toBe('file')
        },
      ),
    )
  })

  describe('clone', function () {
    it(
      'returns a copy of the current node',
      editorTest(
        () => editor,
        function () {
          const fileNode = $createBaseFileNode(dataset)
          const fileNodeDataset = fileNode.getDataset()
          const clone = BaseFileNode.clone(fileNode)
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...fileNodeDataset })
        },
      ),
    )
  })

  describe('urlTransformMap', function () {
    it(
      'contains the expected URL mapping',
      editorTest(
        () => editor,
        function () {
          expect(BaseFileNode.urlTransformMap).toEqual({
            src: 'url',
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
        function () {
          const fileNode = $createBaseFileNode(dataset)
          expect(fileNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('importDOM', function () {
    it(
      'parses a file card',
      editorTest(
        () => editor,
        function () {
          const document = createDocument(`
                <div class="inkling-card inkling-file-card">
                    <a class="inkling-file-card-container" href="/content/files/2023/03/IMG_0196.jpeg" title="Download" download="">
                        <div class="inkling-file-card-contents">
                            <div class="inkling-file-card-title">Cool image to download</div>
                            <div class="inkling-file-card-caption">This is a description</div>
                            <div class="inkling-file-card-metadata">
                                <div class="inkling-file-card-filename">IMG_0196.jpeg</div>
                                <div class="inkling-file-card-filesize">121 KB</div>
                            </div>
                        </div>
                        <div class="inkling-file-card-icon">
                            <svg viewBox="0 0 24 24">
                                <defs>
                                    <style>
                                        .a {
                                            fill: none;
                                            stroke: currentColor;
                                            stroke-linecap: round;
                                            stroke-linejoin: round;
                                            stroke-width: 1.5px;
                                        }
                                    </style>
                                </defs>
                                <title>download-circle</title>
                                <polyline class="a" points="8.25 14.25 12 18 15.75 14.25"></polyline>
                                <line class="a" x1="12" y1="6.75" x2="12" y2="18"></line>
                                <circle class="a" cx="12" cy="12" r="11.25"></circle>
                            </svg>
                        </div>
                    </a>
                </div>
            `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseFileNode[]
          expect(nodes.length).toBe(1)
          expect(nodes[0].src).toBe('/content/files/2023/03/IMG_0196.jpeg')
          expect(nodes[0].fileTitle).toBe('Cool image to download')
          expect(nodes[0].fileCaption).toBe('This is a description')
          expect(nodes[0].fileName).toBe('IMG_0196.jpeg')
          expect(nodes[0].fileSize).toBe(123904) // ~121 KB
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
                type: 'file',
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
            const [fileNode] = $getRoot().getChildren() as BaseFileNode[]
            expect(fileNode.src).toBe('/content/files/2023/03/IMG_0196.jpeg')
            expect(fileNode.fileTitle).toBe('Cool image to download')
            expect(fileNode.fileCaption).toBe('This is a description')
            expect(fileNode.fileName).toBe('IMG_0196.jpeg')
            expect(fileNode.fileSize).toBe(123456)
            expect(fileNode.formattedFileSize).toBe('121 KB') // ~121 KB
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('exportJSON', function () {
    it(
      'exports all data',
      editorTest(
        () => editor,
        function () {
          const fileNode = $createBaseFileNode(dataset)
          const json = fileNode.exportJSON()
          expect(json).toEqual({
            type: 'file',
            version: 1,
            ...dataset,
          })
        },
      ),
    )
  })

  describe('getTextContent', function () {
    it(
      'returns contents',
      editorTest(
        () => editor,
        function () {
          const node = $createBaseFileNode()
          expect(node.getTextContent()).toBe('')

          node.fileTitle = 'Testing'
          expect(node.getTextContent()).toBe('Testing\n\n')

          node.fileCaption = 'Test caption'
          expect(node.getTextContent()).toBe('Testing\nTest caption\n\n')
        },
      ),
    )
  })
})
