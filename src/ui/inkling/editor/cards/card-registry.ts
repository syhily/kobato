import type { LexicalEditor, LexicalNode } from 'lexical'
import type { ComponentType, SVGProps } from 'react'

import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
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

import type { InklingFeatureMode } from '@/shared/inkling/schema'

import { createEmptyInklingParagraph } from '@/shared/inkling/empty'
import { $createSolutionCardNode, $createTwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  $createCodeCardNode,
  $createHorizontalRuleCardNode,
  $createImageCardNode,
  $createMathCardNode,
  $createMusicCardNode,
  $createTableCardNode,
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
  section: 'media' | 'rich' | 'layout' | 'structure'
  modes: InklingFeatureMode[]
  insert: (editor: LexicalEditor) => void
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
 * arrows past the card. The card itself is then selected via
 * `node.selectNext()` → `selectPrevious()` to enter `NodeSelection`.
 *
 * This helper wraps the work in its own `editor.update` so it can be called
 * from event handlers that are NOT already inside a Lexical update (e.g. a
 * toolbar button `onClick`). Callers that already hold an active update
 * (e.g. SlashMenu's insert path) should call `$insertBlockCard` instead to
 * avoid re-entrant `editor.update`.
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
 * active `editor.update(() => ...)`. Separated so SlashMenu (which already
 * wraps the call in its own update for `/` text removal) can reuse it
 * without triggering a re-entrant `editor.update`.
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
  // drag handle, and edit controls render.  `selectPrevious()` would pick
  // the preceding sibling, not the card itself.
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
    section: 'media',
    modes: ['article'],
    insert: (editor) => {
      insertBlockCard(editor, () => $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' }))
    },
  },
  {
    type: 'code-block',
    label: '代码块',
    description: '带语法高亮的代码',
    icon: Code2Icon,
    section: 'rich',
    modes: ['article', 'comment'],
    insert: (editor) => {
      insertBlockCard(editor, () => $createCodeCardNode({ code: '' }))
    },
  },
  {
    type: 'math-block',
    label: '公式块',
    description: 'LaTeX 数学公式',
    icon: SigmaIcon,
    section: 'rich',
    modes: ['article', 'comment'],
    insert: (editor) => {
      insertBlockCard(editor, () => $createMathCardNode({ tex: '' }))
    },
  },
  {
    type: 'music-card',
    label: '音乐',
    description: '嵌入一个音乐播放器',
    icon: MusicIcon,
    section: 'media',
    modes: ['article'],
    insert: (editor) => {
      // Empty `playerId` would fail `inklingMusicCardNodeSchema.playerId.min(1)`,
      // so seed with a placeholder the picker will overwrite.
      insertBlockCard(editor, () => $createMusicCardNode({ playerId: '__pending__' }))
    },
  },
  {
    type: 'horizontal-rule',
    label: '分隔线',
    description: '段落之间的视觉分割',
    icon: MinusIcon,
    section: 'structure',
    modes: ['article'],
    insert: (editor) => {
      insertBlockCard(editor, () => $createHorizontalRuleCardNode())
    },
  },
  {
    type: 'table',
    label: '表格',
    description: '可编辑的行列表格',
    icon: TableIcon,
    section: 'layout',
    modes: ['article'],
    insert: (editor) => {
      insertBlockCard(editor, () =>
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
      )
    },
  },
  {
    type: 'solution',
    label: '解答块',
    description: '可折叠的解答区域',
    icon: LightbulbIcon,
    section: 'structure',
    modes: ['article'],
    insert: (editor) => {
      insertBlockCard(editor, () =>
        $createSolutionCardNode({
          children: [createEmptyInklingParagraph()],
        }),
      )
    },
  },
  {
    type: 'two-column',
    label: '双栏',
    description: '并排的双栏布局',
    icon: Columns2Icon,
    section: 'layout',
    modes: ['article'],
    insert: (editor) => {
      insertBlockCard(editor, () =>
        $createTwoColumnCardNode({
          left: [createEmptyInklingParagraph()],
          right: [createEmptyInklingParagraph()],
        }),
      )
    },
  },
]

export interface InklingCardMenuSection {
  section: InklingCardMenuItem['section']
  label: string
  items: InklingCardMenuItem[]
}

export function buildInklingCardMenu(mode: InklingFeatureMode): InklingCardMenuSection[] {
  const filtered = INKLING_CARD_MENU_ITEMS.filter((item) => item.modes.includes(mode))
  const grouped = new Map<InklingCardMenuItem['section'], InklingCardMenuItem[]>()
  for (const item of filtered) {
    const existing = grouped.get(item.section) ?? []
    existing.push(item)
    grouped.set(item.section, existing)
  }

  const sectionLabels: Record<InklingCardMenuItem['section'], string> = {
    media: '媒体',
    rich: '富文本',
    layout: '布局',
    structure: '结构',
  }

  const sections: InklingCardMenuSection[] = []
  for (const [section, items] of grouped) {
    sections.push({ section, label: sectionLabels[section], items })
  }
  return sections
}
