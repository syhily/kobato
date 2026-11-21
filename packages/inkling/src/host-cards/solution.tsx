// The `solution` host card's editing-side assembly. The base node class is built
// from the headless spec (`@kobato/inkling/headless/cards/solution`) through the
// entry's `generateDecoratorNode` — a DISTINCT class object from the server
// projection's (each dist entry ships its own Lexical copy, so the `defineCard`
// instanceof gate demands the entry-local factory); the spec module keeps both
// sides byte-identical in behavior.
//
// The decorate chrome (`SolutionCardView`) and the exportDOM markup share the
// spec module's class/copy constants — the WYSIWYG gate
// (packages/inkling/tests/unit/host-cards/) pins the parity.

import type { CardSpecFieldMapFor, NestedEditorSpec } from '@kobato/inkling-internal/nodes/base/card-specs'
import type { ReactNode } from 'react'

import InklingComposableEditor from '@kobato/inkling-internal/components/InklingComposableEditor'
import InklingNestedComposer from '@kobato/inkling-internal/components/InklingNestedComposer'
import {
  renderSolutionCard,
  SOLUTION_CARD_BEGIN_TEXT,
  SOLUTION_CARD_CLASSES,
  SOLUTION_CARD_PROPERTIES,
  SOLUTION_NESTED_EDITOR,
} from '@kobato/inkling-internal/headless/cards/solution'
import { SOLUTION_NODE_TYPE } from '@kobato/inkling-internal/headless/node-whitelist'
import { inklingHostCardMatches } from '@kobato/inkling-internal/host-cards/menu-matches'
import { BASIC_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { defineCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
import EDITOR_BASE_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { ListTreeIcon } from 'lucide-react'

const solutionNestedEditors = [
  { ...SOLUTION_NESTED_EDITOR, nodes: EDITOR_BASE_NODES, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

// The merged interface self-types the spec-driven nested-editor fields (the inkling
// BaseToggleNode idiom); the declaration-merging exemption is inkling's oxlint scope.
// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseSolutionNode extends CardSpecFieldMapFor<readonly [], typeof solutionNestedEditors> {}
export class BaseSolutionNode extends generateDecoratorNode({
  nodeType: SOLUTION_NODE_TYPE,
  properties: SOLUTION_CARD_PROPERTIES,
  defaultRenderFn: renderSolutionCard,
}) {}

export type SolutionCardNode = InstanceType<typeof BaseSolutionNode>

export function SolutionCardView({ children }: { children?: ReactNode }) {
  return (
    <blockquote className={SOLUTION_CARD_CLASSES.root}>
      <div className={SOLUTION_CARD_CLASSES.begin}>{SOLUTION_CARD_BEGIN_TEXT}</div>
      {children}
      <span className={SOLUTION_CARD_CLASSES.qed} aria-hidden="true">
        <svg viewBox="0 0 14 14" className="block h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="1" y="1" width="12" height="12" />
        </svg>
      </span>
    </blockquote>
  )
}

function SolutionCardComponent({ node }: { node: SolutionCardNode }) {
  const { t } = useI18n()
  if (!node.__contentEditor) {
    return null
  }
  return (
    <SolutionCardView>
      <InklingNestedComposer
        initialEditor={node.__contentEditor}
        initialEditorState={node.__contentEditorInitialState}
        // oxlint-disable-next-line typescript/no-deprecated -- load-bearing upstream seam (see InklingNestedComposer)
        initialNodes={EDITOR_BASE_NODES}
      >
        <InklingComposableEditor
          inheritStyles={true}
          isDragEnabled={false}
          markdownTransformers={BASIC_TRANSFORMERS}
          placeholderText={t('admin.editor.cards.solution.placeholder')}
        />
      </InklingNestedComposer>
    </SolutionCardView>
  )
}

export const solutionCard = defineCard({
  nodeType: SOLUTION_NODE_TYPE,
  baseNode: BaseSolutionNode,
  nestedEditors: solutionNestedEditors,
  decorateTarget: { width: 'regular' },
  insert: { openInEditMode: true },
  menu: [
    {
      label: 'Solution block',
      labelKey: 'host.solution',
      desc: 'Q&A / hint (format-rich, same as a quote)',
      icon: ListTreeIcon,
      command: 'insert',
      insertParams: {},
      matches: [...inklingHostCardMatches.solution],
      priority: 17,
    },
  ],
  toolbarLabel: SOLUTION_NODE_TYPE,
  render(node) {
    return <SolutionCardComponent node={node} />
  },
})
