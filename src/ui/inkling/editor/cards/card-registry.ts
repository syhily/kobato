import type { Klass, LexicalCommand, LexicalEditor, LexicalNode } from 'lexical'
import type { ComponentType, SVGProps } from 'react'

import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  createCommand,
} from 'lexical'
import {
  Code2Icon,
  Columns2Icon,
  ImageIcon,
  LightbulbIcon,
  MinusIcon,
  MusicIcon,
  SigmaIcon,
  TableIcon,
} from 'lucide-react'

import { createEmptyInklingParagraph } from '@/shared/inkling/empty'
import {
  $createSolutionCardNode,
  $createTwoColumnCardNode,
  SolutionCardNode,
  TwoColumnCardNode,
} from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  $createCodeCardNode,
  $createHorizontalRuleCardNode,
  $createImageCardNode,
  $createMathCardNode,
  $createMusicCardNode,
  $createTableCardNode,
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'

/** A lucide icon component. Kept as a field type so card menus can render a
 *  uniform icon box (Koenig's cardmenu renders an icon + title + description
 *  per card) without each menu re-importing the icon set. */
export type InklingCardIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface InklingCardMenuItem {
  type: string
  label: string
  /** Short one-line description shown under the label in the card menus. */
  description: string
  /** Lucide icon rendered in the menu's icon box. */
  icon: InklingCardIcon
  /** Section header the vendored card menu groups this item under. */
  section: string
  /** The node class the vendored menu derives its entries from. */
  klass: Klass<LexicalNode>
  /** Extra search aliases for the vendored menu's query matching. */
  matches: string[]
  /** Build a fresh, schema-valid node for insertion. */
  createNode: () => LexicalNode
}

/**
 * Insert a block-level card node at the current selection, then enter a
 * `NodeSelection` on the freshly-inserted card so the editor's card UI
 * (selection outline, drag handle, edit controls) appears immediately.
 *
 * The node MUST be attached to the document tree before any selection method
 * (e.g. `selectPrevious()`) is called — Lexical's selection helpers call
 * `getParentOrThrow()`, which throws on detached nodes. We use
 * `selection.insertNodes([node])`, which handles both the in-paragraph case
 * (splits the paragraph) and the empty-root case.
 *
 * After inserting, an empty trailing paragraph is appended when the card is
 * the last child of root, so the caret has somewhere to land when the user
 * arrows past the card. The card itself is then selected via a fresh
 * `NodeSelection`.
 *
 * This helper wraps the work in its own `editor.update` so it can be called
 * from event handlers that are NOT already inside a Lexical update (e.g. a
 * toolbar button `onClick`). Callers that already hold an active update
 * (e.g. a command handler) should call `$insertBlockCard` instead to avoid a
 * re-entrant `editor.update`.
 */
export function insertBlockCard(editor: LexicalEditor, createNode: () => LexicalNode): void {
  editor.update(
    () => {
      $insertBlockCard(createNode)
    },
    // `discrete: true` forces a synchronous commit so the new node is in the
    // tree before any subsequent read (e.g. a picker resolving the selection).
    // `history-merge` collapses this update into the preceding undo entry so
    // a single Ctrl+Z removes both the `/query` text and the inserted card.
    { tag: 'history-merge', discrete: true },
  )
}

/**
 * The update-context body of `insertBlockCard`. Must be called inside an
 * active `editor.update(() => ...)` — e.g. from a Lexical command handler,
 * which already runs in an update context.
 */
export function $insertBlockCard(createNode: () => LexicalNode): void {
  const node = createNode()
  const root = $getRoot()
  const selection = $getSelection()

  if ($isRangeSelection(selection)) {
    selection.insertNodes([node])
  } else {
    // No usable range selection (collapsed root, NodeSelection, etc.) —
    // append to the end of the document.
    root.append(node)
  }

  // Ensure the user can place the caret after the card.
  if (node.getNextSibling() === null) {
    node.insertAfter($createParagraphNode())
  }

  // Move into a NodeSelection on the new card so the selection outline,
  // drag handle, and edit controls render.
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(node.getKey())
  $setSelection(nodeSelection)
}

export const INKLING_CARD_MENU_ITEMS: InklingCardMenuItem[] = [
  {
    type: 'image-card',
    label: '图片',
    description: '上传或插入一张图片',
    icon: ImageIcon,
    section: '媒体',
    klass: ImageCardNode,
    matches: ['图片', 'image', 'img', 'tupian'],
    createNode: () => $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' }),
  },
  {
    type: 'code-block',
    label: '代码块',
    description: '带语法高亮的代码',
    icon: Code2Icon,
    section: '富文本',
    klass: CodeCardNode,
    matches: ['代码块', 'code', 'codeblock', 'daima'],
    createNode: () => $createCodeCardNode({ code: '' }),
  },
  {
    type: 'math-block',
    label: '公式块',
    description: 'LaTeX 数学公式',
    icon: SigmaIcon,
    section: '富文本',
    klass: MathCardNode,
    matches: ['公式块', 'math', 'latex', 'gongshi'],
    createNode: () => $createMathCardNode({ tex: '' }),
  },
  {
    type: 'music-card',
    label: '音乐',
    description: '嵌入一个音乐播放器',
    icon: MusicIcon,
    section: '媒体',
    klass: MusicCardNode,
    matches: ['音乐', 'music', 'audio', 'yinyue'],
    // Empty `playerId` would fail `inklingMusicCardNodeSchema.playerId.min(1)`,
    // so seed with a placeholder the picker will overwrite.
    createNode: () => $createMusicCardNode({ playerId: '__pending__' }),
  },
  {
    type: 'horizontal-rule',
    label: '分隔线',
    description: '段落之间的视觉分割',
    icon: MinusIcon,
    section: '结构',
    klass: HorizontalRuleCardNode,
    matches: ['分隔线', 'divider', 'hr', 'fengexian'],
    createNode: () => $createHorizontalRuleCardNode(),
  },
  {
    type: 'table',
    label: '表格',
    description: '可编辑的行列表格',
    icon: TableIcon,
    section: '布局',
    klass: TableCardNode,
    matches: ['表格', 'table', 'biaoge'],
    createNode: () =>
      $createTableCardNode({
        rows: [
          {
            type: 'tablerow',
            version: 1,
            cells: [
              { type: 'tablecell', version: 1, children: [] },
              { type: 'tablecell', version: 1, children: [] },
            ],
          },
          {
            type: 'tablerow',
            version: 1,
            cells: [
              { type: 'tablecell', version: 1, children: [] },
              { type: 'tablecell', version: 1, children: [] },
            ],
          },
        ],
      }),
  },
  {
    type: 'solution',
    label: '解答块',
    description: '可折叠的解答区域',
    icon: LightbulbIcon,
    section: '结构',
    klass: SolutionCardNode,
    matches: ['解答块', 'solution', 'jieda'],
    createNode: () =>
      $createSolutionCardNode({
        children: [createEmptyInklingParagraph()],
      }),
  },
  {
    type: 'two-column',
    label: '双栏',
    description: '并排的双栏布局',
    icon: Columns2Icon,
    section: '布局',
    klass: TwoColumnCardNode,
    matches: ['双栏', 'columns', 'two-column', 'shuanglan'],
    createNode: () =>
      $createTwoColumnCardNode({
        left: [createEmptyInklingParagraph()],
        right: [createEmptyInklingParagraph()],
      }),
  },
]

/**
 * Single insert command shared by every yufan.me card. The vendored slash /
 * plus card menus dispatch each item's `insertCommand` with its
 * `insertParams` as payload; `CardInsertPlugin` handles this command and
 * inserts the matching card. One parameterised command keeps the registry
 * flat instead of eight near-identical command/handler pairs.
 */
export const INSERT_INKLING_CARD_COMMAND: LexicalCommand<{ cardType: string }> =
  createCommand('INSERT_INKLING_CARD_COMMAND')

/** Shape of the vendored card-menu entries (`buildCardMenu`'s `MenuItem`). */
interface VendoredKgMenuItem {
  label: string
  desc: string
  Icon: InklingCardIcon
  insertCommand: LexicalCommand<{ cardType: string }>
  insertParams: { cardType: string }
  matches: string[]
  section: string
}

/**
 * Attach a `static kgMenu` to every yufan.me card node class. The vendored
 * slash (`/`) and plus (`+`) card menus build their entries from the
 * registered node classes' `kgMenu` statics (`getEditorCardNodes` +
 * `buildCardMenu`), so this single assignment is what makes our cards —
 * and ONLY our cards — appear in those menus. Idempotent; called at module
 * scope by the article editor.
 */
export function attachVendoredCardMenus(): void {
  for (const item of INKLING_CARD_MENU_ITEMS) {
    const klass = item.klass as Klass<LexicalNode> & { kgMenu?: VendoredKgMenuItem[] }
    klass.kgMenu = [
      {
        label: item.label,
        desc: item.description,
        Icon: item.icon,
        insertCommand: INSERT_INKLING_CARD_COMMAND,
        insertParams: { cardType: item.type },
        matches: [item.label, ...item.matches],
        section: item.section,
      },
    ]
  }
}
