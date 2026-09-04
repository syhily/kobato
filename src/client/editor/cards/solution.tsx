// The `solution` host card's editing-side assembly (plan
// docs/plans/inkling-editor-replacement.md, round R10): the base node class
// is built from the shared spec (`@/shared/lexical/cards/solution`) through
// the `.` entry's `generateDecoratorNode` — a DISTINCT class object from the
// server projection's (each dist entry ships its own Lexical copy, so the
// `defineCard` instanceof gate demands the entry-local factory); the spec
// module keeps both sides byte-identical in behavior.
//
// The decorate chrome (`SolutionCardView`) and the exportDOM markup share
// the class/copy constants in the spec module — the WYSIWYG gate
// (tests/unit/client/editor/cards/ pins the parity).

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
import { ListTreeIcon } from 'lucide-react'

import { inklingHostCardMatches } from '@/shared/lexical/cards/menu-matches'
import {
  renderSolutionCard,
  SOLUTION_CARD_BEGIN_TEXT,
  SOLUTION_CARD_CLASSES,
  SOLUTION_CARD_PROPERTIES,
  SOLUTION_NESTED_EDITOR,
} from '@/shared/lexical/cards/solution'
import { SOLUTION_NODE_TYPE } from '@/shared/lexical/node-whitelist'

export const BaseSolutionNode = class extends generateDecoratorNode({
  nodeType: SOLUTION_NODE_TYPE,
  properties: SOLUTION_CARD_PROPERTIES,
  defaultRenderFn: renderSolutionCard,
}) {
  // Assigned by the generated constructor on spec-adopting subclasses (the
  // assembled card class); a raw base instance leaves them unset — the
  // BaseToggleNode idiom.
  declare __contentEditor: LexicalEditor | null | undefined
  declare __contentEditorInitialState: EditorState | undefined
}

export type SolutionCardNode = InstanceType<typeof BaseSolutionNode>

/**
 * The card chrome shared structure: styled blockquote + 解： header + QED
 * square. The children slot holds the nested editor on the canvas and the
 * content HTML in the export — everything around it is what the parity test
 * compares.
 */
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
  // Null only when a base instance without the nested-editor spec renders —
  // the assembled class always has the editor (the toggle-card invariant).
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
          placeholderText="在此处填写解答步骤"
        />
      </InklingNestedComposer>
    </SolutionCardView>
  )
}

export const solutionCard = defineCard({
  nodeType: SOLUTION_NODE_TYPE,
  baseNode: BaseSolutionNode,
  nestedEditors: [{ ...SOLUTION_NESTED_EDITOR, nodes: EDITOR_BASE_NODES }],
  decorateTarget: { width: 'regular' },
  insert: { openInEditMode: true },
  menu: [
    {
      label: '解答块',
      labelKey: 'solution',
      desc: '题解 / 提示（内部可排版，与引用块相同）',
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
