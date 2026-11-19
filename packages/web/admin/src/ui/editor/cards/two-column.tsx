import type { ReactNode } from 'react'

import {
  BASIC_TRANSFORMERS,
  type CardSpecFieldMapFor,
  defineCard,
  EDITOR_BASE_NODES,
  type EditorState,
  generateDecoratorNode,
  InklingComposableEditor,
  InklingNestedComposer,
  type LexicalEditor,
  type NestedEditorSpec,
} from '@kobato/inkling'
import {
  renderTwoColumnCard,
  TWO_COLUMN_CARD_CLASSES,
  TWO_COLUMN_CARD_PROPERTIES,
  TWO_COLUMN_NESTED_EDITORS,
} from '@kobato/lexical/cards/two-column.ts'
import { TWO_COLUMN_NODE_TYPE } from '@kobato/lexical/node-whitelist.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { inklingHostCardMatches } from '@kobato/web-admin/ui/editor/cards/menu-matches.ts'
import { Columns2Icon } from 'lucide-react'

const twoColumnNestedEditors = [
  { ...TWO_COLUMN_NESTED_EDITORS[0]!, nodes: EDITOR_BASE_NODES, nullable: true },
  { ...TWO_COLUMN_NESTED_EDITORS[1]!, nodes: EDITOR_BASE_NODES, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

// The merged interface self-types the spec-driven nested-editor fields (the inkling
// BaseToggleNode idiom); the pair needs the declaration-merging exemption inkling's
// oxlint scope grants, which src/client sits outside.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging, typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseTwoColumnNode extends CardSpecFieldMapFor<readonly [], typeof twoColumnNestedEditors> {}
export class BaseTwoColumnNode extends generateDecoratorNode({
  nodeType: TWO_COLUMN_NODE_TYPE,
  properties: TWO_COLUMN_CARD_PROPERTIES,
  defaultRenderFn: renderTwoColumnCard,
}) {}

export type TwoColumnCardNode = InstanceType<typeof BaseTwoColumnNode>

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

export function TwoColumnCardView({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <section className={TWO_COLUMN_CARD_CLASSES.root} data-pt-two-column="">
      {left}
      {right}
    </section>
  )
}

function TwoColumnCardComponent({ node }: { node: TwoColumnCardNode }) {
  const { t } = useI18n()
  if (!node.__leftEditor || !node.__rightEditor) {
    return null
  }
  return (
    <TwoColumnCardView
      left={
        <TwoColumnPane
          editor={node.__leftEditor}
          initialState={node.__leftEditorInitialState}
          placeholder={t('admin.editor.cards.twoColumn.left')}
          side="left"
        />
      }
      right={
        <TwoColumnPane
          editor={node.__rightEditor}
          initialState={node.__rightEditorInitialState}
          placeholder={t('admin.editor.cards.twoColumn.right')}
          side="right"
        />
      }
    />
  )
}

export const twoColumnCard = defineCard({
  nodeType: TWO_COLUMN_NODE_TYPE,
  baseNode: BaseTwoColumnNode,
  nestedEditors: twoColumnNestedEditors,
  decorateTarget: { width: 'regular' },
  insert: { openInEditMode: true },
  menu: [
    {
      label: 'Two columns',
      labelKey: 'host.two-column',
      desc: 'Two side-by-side columns, each edited independently',
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
