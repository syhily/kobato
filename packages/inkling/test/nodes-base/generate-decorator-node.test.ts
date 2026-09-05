import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, type EditorState, type LexicalEditor, type LexicalNodeConfig } from 'lexical'

import type { NestedEditorSpec, TransientPropSpec } from '@/nodes/base/card-specs'
import type { GeneratedDecoratorNodeClass } from '@/nodes/base/generate-decorator-node'

import { dom } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { ensureLexicalNodeOwnMethods, type ExportDOMOutput } from '@/nodes/base/index'
import MINIMAL_NODES from '@/nodes/MinimalNodes'
import { populateNestedEditor } from '@/nodes/nested-editors'

function createRenderResult(tagName: 'div' | 'span', content: string) {
  const element = dom.window.document.createElement(tagName)
  element.textContent = content
  return {
    element,
    type: 'inner' as const,
  }
}

function expectHtmlElement(output: ExportDOMOutput) {
  const { element } = output

  if (!element || !('outerHTML' in element)) {
    throw new Error('Expected exportDOM() to return an HTML element')
  }

  return element
}

describe('Utils: generateDecoratorNode', function () {
  let editor: LexicalEditor

  const editorTestWithNodes =
    <TNodes extends readonly LexicalNodeConfig[]>(
      getNodes: () => TNodes,
      testFn: (testEditor: LexicalEditor, nodes: TNodes) => void,
    ) =>
    () =>
      new Promise<void>((resolve, reject) => {
        const nodes = getNodes()
        const testEditor = createHeadlessEditor({ nodes })
        testEditor.update(() => {
          try {
            testFn(testEditor, nodes)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })

  describe('exportDOM', function () {
    let NodeWithRender: GeneratedDecoratorNodeClass<Record<string, never>, ReturnType<typeof createRenderResult>>
    let $createNodeWithRender: (dataset?: Record<string, unknown>) => InstanceType<typeof NodeWithRender>

    beforeAll(function () {
      NodeWithRender = generateDecoratorNode({
        nodeType: 'render-test',
        properties: [],
        defaultRenderFn: () => createRenderResult('div', 'default render'),
      })

      $createNodeWithRender = (dataset?: Record<string, unknown>) => {
        return new NodeWithRender(dataset)
      }

      editor = createHeadlessEditor({ nodes: [NodeWithRender] })
    })

    it(
      'uses default renderer when no custom renderer is provided',
      editorTest(
        () => editor,
        function () {
          const node = $createNodeWithRender()
          const result = node.exportDOM(editor)

          expect(result.type).toBe('inner')
          expect(expectHtmlElement(result).outerHTML).toBe('<div>default render</div>')
        },
      ),
    )

    it(
      'throws error when defaultRenderFn is not provided',
      editorTestWithNodes(
        () =>
          [
            generateDecoratorNode({
              nodeType: 'no-render-test',
              properties: [],
            }),
          ] as const,
        function (testEditor, [NodeWithoutRender]) {
          const node = new NodeWithoutRender()
          expect(() => node.exportDOM(testEditor)).toThrow(
            /^\[generateDecoratorNode\] no-render-test: "defaultRenderFn" is required$/,
          )
        },
      ),
    )
  })

  describe('constructor', function () {
    let FalsyAwareNode: GeneratedDecoratorNodeClass<{ count: number; label: string }>
    let $createFalsyAwareNode: (dataset?: Record<string, unknown>) => InstanceType<typeof FalsyAwareNode>

    beforeAll(function () {
      FalsyAwareNode = generateDecoratorNode({
        nodeType: 'falsy-aware-test',
        properties: [
          { name: 'count', default: 10 },
          { name: 'label', default: 'default' },
        ] as const,
      })

      $createFalsyAwareNode = (dataset?: Record<string, unknown>) => {
        return new FalsyAwareNode(dataset)
      }

      editor = createHeadlessEditor({ nodes: [FalsyAwareNode] })
    })

    it(
      'preserves falsy non-boolean values like 0 and empty string',
      editorTest(
        () => editor,
        function () {
          const node = $createFalsyAwareNode({ count: 0, label: '' })

          expect(node.getDataset().count!).toBe(0)
          expect(node.getDataset().label!).toBe('')
          expect(node.exportJSON().count!).toBe(0)
          expect(node.exportJSON().label!).toBe('')
        },
      ),
    )
  })

  describe('spec adoption (nested editors and transient props)', function () {
    // A synthetic card pinning the spec contract the per-card tests cover only
    // incidentally: the generated base class runs no spec behaviour on its
    // own; a subclass adopting the specs via statics gets the full
    // constructor/getDataset/exportJSON treatment — the same shape
    // `assembleCardNode` produces for the real cards.
    const specNestedEditors: readonly NestedEditorSpec[] = [
      { name: 'captionEditor', serializedKey: 'caption', nodes: MINIMAL_NODES },
      // Header's idiom: the dataset exposes the editor but not its initial state
      { name: 'bodyEditor', serializedKey: 'body', nodes: MINIMAL_NODES, exposeInitialStateInDataset: false },
    ]
    const specTransientProps: readonly TransientPropSpec[] = [
      {
        name: 'flag',
        initial: (dataset) => (!dataset.src && dataset.flag) || false,
        datasetKey: '__flag',
      },
      // no datasetKey: initialized on the node but never re-exposed
      { name: 'seed' },
    ]

    class SpeclessNode extends generateDecoratorNode({
      nodeType: 'spec-contract-test',
      properties: [
        { name: 'caption', default: '' },
        { name: 'body', default: '' },
        { name: 'src', default: '' },
      ] as const,
    }) {}

    class SpecAdoptingNode extends SpeclessNode {
      static nestedEditors = specNestedEditors
      static transientProps = specTransientProps

      declare __captionEditor: LexicalEditor
      declare __captionEditorInitialState: EditorState | undefined
      declare __bodyEditor: LexicalEditor
      declare __flag: boolean
      declare __seed: unknown
    }
    ensureLexicalNodeOwnMethods(SpecAdoptingNode)

    beforeAll(function () {
      editor = createHeadlessEditor({ nodes: [SpecAdoptingNode] })
    })

    it(
      'runs no spec behaviour on the spec-less generated class',
      // a separate editor: the shared one registers the subclass, and Lexical
      // rejects constructing an unregistered class with the same node type
      editorTestWithNodes(
        () => [SpeclessNode] as const,
        function (_testEditor, [RegisteredSpeclessNode]) {
          const node = new RegisteredSpeclessNode({ caption: '<p>hi</p>', flag: true, seed: 'abc' })
          const fields = node as unknown as Record<string, unknown>

          expect(fields.__captionEditor).toBeUndefined()
          expect(fields.__flag).toBeUndefined()
          expect(node.getDataset()).toEqual({ caption: '<p>hi</p>', body: '', src: '' })
        },
      ),
    )

    it(
      'sets up nested editors from their serialized HTML on construction',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({ caption: '<p>Hello caption</p>' })

          expect(node.__captionEditor).toBeDefined()
          expect(node.__captionEditorInitialState).toBeDefined()
          expect(node.__captionEditor.getEditorState().read(() => $getRoot().getTextContent())).toBe('Hello caption')
        },
      ),
    )

    it(
      'silently skips a corrupt (truthy non-string) serialized nested-editor payload',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({ caption: 123 })

          expect(node.__captionEditor).toBeDefined()
          expect(node.__captionEditorInitialState).toBeUndefined()
          expect(node.__captionEditor.getEditorState().read(() => $getRoot().getTextContent())).toBe('')
        },
      ),
    )

    it(
      'falls back to a fresh nested editor when the passed editor value is not a LexicalEditor instance',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({ captionEditor: { notAnEditor: true }, caption: '<p>Hello caption</p>' })

          expect(node.__captionEditor).toBeDefined()
          expect(node.__captionEditor.getEditorState().read(() => $getRoot().getTextContent())).toBe('Hello caption')
        },
      ),
    )

    it(
      'importJSON tolerates a corrupt (truthy non-string) nested-editor payload',
      editorTest(
        () => editor,
        function () {
          // importJSON's static return type is the generated base instance; the
          // spec-adopting subclass declares the nested-editor fields
          const node = SpecAdoptingNode.importJSON({
            type: 'spec-contract-test',
            version: 1,
            caption: 123,
            body: '',
          }) as SpecAdoptingNode

          expect(node.__captionEditorInitialState).toBeUndefined()
          expect(node.__captionEditor.getEditorState().read(() => $getRoot().getTextContent())).toBe('')
        },
      ),
    )

    it(
      'appends the nested-editor dataset keys, honouring exposeInitialStateInDataset',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({ caption: '<p>Hello caption</p>' })
          const dataset = node.getDataset()

          expect(dataset.captionEditor).toBe(node.__captionEditor)
          expect(dataset.captionEditorInitialState).toBe(node.__captionEditorInitialState)
          // exposeInitialStateInDataset: false — the editor is exposed, its initial state is not
          expect(dataset.bodyEditor).toBe(node.__bodyEditor)
          expect(dataset).not.toHaveProperty('bodyEditorInitialState')
        },
      ),
    )

    it(
      'initializes transient props from the dataset and re-exposes only datasetKey specs',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({ flag: true, seed: 'abc' })
          expect(node.__flag).toBe(true) // the spec's `initial` computes from the dataset
          expect(node.__seed).toBe('abc') // no `initial`: defaults to dataset[name]

          const dataset = node.getDataset()
          expect(dataset.__flag).toBe(true)
          expect(dataset).not.toHaveProperty('__seed')

          const withSrc = new SpecAdoptingNode({ src: 'filled', flag: true })
          expect(withSrc.__flag).toBe(false)
        },
      ),
    )

    it(
      're-serializes nested editor content back into its serializedKey on exportJSON',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({})
          // fill the editor the way the constructor does (discrete updates) —
          // manual root surgery inside an outer update never commits
          node.__captionEditor = createHeadlessEditor({ nodes: [SpecAdoptingNode] })
          populateNestedEditor(node.__captionEditor, '<p>Updated caption</p>')

          const json = node.exportJSON()
          expect(json.caption).toContain('Updated caption')
        },
      ),
    )

    it(
      'never serializes transient props or nested-editor keys to JSON',
      editorTest(
        () => editor,
        function () {
          const node = new SpecAdoptingNode({ flag: true, seed: 'abc' })

          expect(Object.keys(node.exportJSON()).sort()).toEqual(['body', 'caption', 'src', 'type', 'version'])
        },
      ),
    )
  })
})
