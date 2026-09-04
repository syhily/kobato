// The `two-column` host card's editing-side assembly (plan
// docs/plans/inkling-editor-replacement.md, round R10) — same dual-entry
// contract as `./solution`: the base class is built from the shared spec
// (`@/shared/lexical/cards/two-column`) through the `.` entry's factory, and
// the decorate chrome shares the spec's class constants with the exportDOM
// markup (the WYSIWYG gate).

import type { EditorState, LexicalEditor } from '@inkling/editor'
import type { ReactNode } from 'react'

import {
  BASIC_TRANSFORMERS,
  defineCard,
  EDITOR_BASE_NODES,
  generateDecoratorNode,
  InklingComposableEditor,
  InklingNestedComposer,
} from '@inkling/editor'
import { Columns2Icon } from 'lucide-react'

import { inklingHostCardMatches } from '@/shared/lexical/cards/menu-matches'
import {
  renderTwoColumnCard,
  TWO_COLUMN_CARD_CLASSES,
  TWO_COLUMN_CARD_PROPERTIES,
  TWO_COLUMN_NESTED_EDITORS,
} from '@/shared/lexical/cards/two-column'
import { TWO_COLUMN_NODE_TYPE } from '@/shared/lexical/node-whitelist'

export const BaseTwoColumnNode = class extends generateDecoratorNode({
  nodeType: TWO_COLUMN_NODE_TYPE,
  properties: TWO_COLUMN_CARD_PROPERTIES,
  defaultRenderFn: renderTwoColumnCard,
}) {
  declare __leftEditor: LexicalEditor | null | undefined
  declare __leftEditorInitialState: EditorState | undefined
  declare __rightEditor: LexicalEditor | null | undefined
  declare __rightEditorInitialState: EditorState | undefined
}

export type TwoColumnCardNode = InstanceType<typeof BaseTwoColumnNode>

/** The pane chrome: the `min-w-0` cell with the PT-parity data attributes.
 * The editor slot holds the nested composer on the canvas and the pane HTML
 * in the export (the parity test renders this shell directly). */
export function TwoColumnPaneView({ side, children }: { side: 'left' | 'right'; children?: ReactNode }) {
  return (
    <div className={TWO_COLUMN_CARD_CLASSES.pane} data-pt-two-column-pane="" data-side={side}>
      {children}
    </div>
  )
}

function TwoColumnPane({
  editor,
  initialState,
  side,
  placeholder,
}: {
  editor: LexicalEditor
  initialState?: EditorState
  side: 'left' | 'right'
  placeholder: string
}) {
  return (
    <TwoColumnPaneView side={side}>
      <InklingNestedComposer
        initialEditor={editor}
        initialEditorState={initialState}
        // oxlint-disable-next-line typescript/no-deprecated -- load-bearing upstream seam (see InklingNestedComposer)
        initialNodes={EDITOR_BASE_NODES}
      >
        <InklingComposableEditor
          inheritStyles={true}
          isDragEnabled={false}
          markdownTransformers={BASIC_TRANSFORMERS}
          placeholderText={placeholder}
        />
      </InklingNestedComposer>
    </TwoColumnPaneView>
  )
}

/**
 * The card chrome: the responsive grid section. The pane slot holds the
 * nested editors on the canvas and the pane HTML in the export.
 */
export function TwoColumnCardView({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <section className={TWO_COLUMN_CARD_CLASSES.root} data-pt-two-column="">
      {left}
      {right}
    </section>
  )
}

function TwoColumnCardComponent({ node }: { node: TwoColumnCardNode }) {
  if (!node.__leftEditor || !node.__rightEditor) {
    return null
  }
  return (
    <TwoColumnCardView
      left={
        <TwoColumnPane
          editor={node.__leftEditor}
          initialState={node.__leftEditorInitialState}
          placeholder="左栏内容"
          side="left"
        />
      }
      right={
        <TwoColumnPane
          editor={node.__rightEditor}
          initialState={node.__rightEditorInitialState}
          placeholder="右栏内容"
          side="right"
        />
      }
    />
  )
}

export const twoColumnCard = defineCard({
  nodeType: TWO_COLUMN_NODE_TYPE,
  baseNode: BaseTwoColumnNode,
  nestedEditors: [
    { ...TWO_COLUMN_NESTED_EDITORS[0]!, nodes: EDITOR_BASE_NODES },
    { ...TWO_COLUMN_NESTED_EDITORS[1]!, nodes: EDITOR_BASE_NODES },
  ],
  decorateTarget: { width: 'regular' },
  insert: { openInEditMode: true },
  menu: [
    {
      label: '左右分栏',
      labelKey: 'two-column',
      desc: '两栏并排，每栏内容独立编辑',
      icon: Columns2Icon,
      command: 'insert',
      insertParams: {},
      matches: [...inklingHostCardMatches.twoColumn],
      priority: 18,
    },
  ],
  toolbarLabel: TWO_COLUMN_NODE_TYPE,
  render(node) {
    return <TwoColumnCardComponent node={node} />
  },
})
