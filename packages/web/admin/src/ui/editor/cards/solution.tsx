// The `solution` host card's editing-side assembly. The base node class is built
// from the shared spec (`@kobato/lexical/cards/solution`) through the `.` entry's
// `generateDecoratorNode` — a DISTINCT class object from the server projection's
// (each dist entry ships its own Lexical copy, so the `defineCard` instanceof gate
// demands the entry-local factory); the spec module keeps both sides byte-identical
// in behavior.
//
// The decorate chrome (`SolutionCardView`) and the exportDOM markup share the spec
// module's class/copy constants — the WYSIWYG gate
// (tests/unit/ui/admin/editor/cards/) pins the parity.

import type { ReactNode } from 'react'

import {
  BASIC_TRANSFORMERS,
  type CardSpecFieldMapFor,
  defineCard,
  EDITOR_BASE_NODES,
  generateDecoratorNode,
  InklingComposableEditor,
  InklingNestedComposer,
  type NestedEditorSpec,
} from '@kobato/inkling'
import {
  renderSolutionCard,
  SOLUTION_CARD_BEGIN_TEXT,
  SOLUTION_CARD_CLASSES,
  SOLUTION_CARD_PROPERTIES,
  SOLUTION_NESTED_EDITOR,
} from '@kobato/lexical/cards/solution.ts'
import { SOLUTION_NODE_TYPE } from '@kobato/lexical/node-whitelist.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { inklingHostCardMatches } from '@kobato/web-admin/ui/editor/cards/menu-matches.ts'
import { ListTreeIcon } from 'lucide-react'

const solutionNestedEditors = [
  { ...SOLUTION_NESTED_EDITOR, nodes: EDITOR_BASE_NODES, nullable: true },
] as const satisfies readonly NestedEditorSpec[]

// The merged interface self-types the spec-driven nested-editor fields (the inkling
// BaseToggleNode idiom); the pair needs the declaration-merging exemption inkling's
// oxlint scope grants, which src/client sits outside.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging, typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
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
