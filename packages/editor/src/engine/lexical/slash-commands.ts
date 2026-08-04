import type { LucideIcon } from '@kobato/editor/engine/lib/icons-types'
import type { LexicalEditor } from 'lexical'

import { applyBlockStyle, insertBulletList, insertOrderedList } from '@kobato/editor/engine/lexical/block-commands'
import {
  INSERT_HORIZONTAL_RULE_COMMAND,
  OPEN_FOOTNOTE_DIALOG_COMMAND,
  OPEN_IMAGE_PICKER_COMMAND,
  OPEN_MUSIC_PICKER_COMMAND,
} from '@kobato/editor/engine/lexical/commands'
import { generateBlockKey } from '@kobato/shared/legacy-pt/utils'
import { $createMathBlockNode } from '@kobato/shared/lexical/nodes/math-block-node'
import { $createSolutionNode } from '@kobato/shared/lexical/nodes/solution-node'
import { $createTwoColumnNode, $createTwoColumnPaneNode } from '@kobato/shared/lexical/nodes/two-column-node'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { INSERT_TABLE_COMMAND, type InsertTableCommandPayload } from '@lexical/table'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { $createParagraphNode, $createTextNode } from 'lexical'
import {
  CodeIcon,
  Columns2Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  ListTreeIcon,
  MinusIcon,
  Music2Icon,
  QuoteIcon,
  SigmaIcon,
  SuperscriptIcon,
  TableIcon,
  Type as TypeIcon,
} from 'lucide-react'

const DEFAULT_MATH_BLOCK_TEX = ['\\begin{align*}', '    a &= b\\\\', '    c &= d', '\\end{align*}'].join('\n')

export interface LexicalSlashCommand {
  /** Stable identifier (used for React keys + tests). */
  id: string
  /** Title shown as the primary line in the menu. */
  title: string
  /** Sub-line description shown beneath the title. */
  description: string
  /** Lucide icon component. */
  icon: LucideIcon
  /** Lower-case alternative search terms (English + Chinese). */
  aliases: readonly string[]
  /**
   * Handler invoked when the operator picks this command. Runs inside the
   * editor update that already removed the `/query` text node, with the
   * caret restored at the deletion point — block formatting applies to
   * the paragraph now under the caret, block inserts use
   * `$insertNodeToNearestRoot`.
   */
  insert: (editor: LexicalEditor) => void
}

/** Toggle the current block to a heading / paragraph via the shared block commands. */
function setBlock(editor: LexicalEditor, value: 'normal' | 'h2' | 'h3' | 'h4'): void {
  applyBlockStyle(editor, value)
}

/**
 * Insert a decorator block after the current block. The node factory runs
 * INSIDE the editor update — 0.45 requires an active editor context for
 * node creation.
 */
function insertBlockAfterSelection(editor: LexicalEditor, createNode: () => import('lexical').LexicalNode): void {
  editor.update(() => {
    $insertNodeToNearestRoot(createNode())
  })
}

export const LEXICAL_SLASH_COMMANDS: readonly LexicalSlashCommand[] = [
  {
    id: 'paragraph',
    title: '正文',
    description: '清除当前块格式',
    icon: TypeIcon,
    aliases: ['paragraph', 'text', '正文', 'p'],
    insert: (editor) => setBlock(editor, 'normal'),
  },
  {
    id: 'h2',
    title: '二级标题',
    description: 'H2',
    icon: Heading2Icon,
    aliases: ['h2', 'heading2', 'title', '二级标题', '标题2'],
    insert: (editor) => setBlock(editor, 'h2'),
  },
  {
    id: 'h3',
    title: '三级标题',
    description: 'H3',
    icon: Heading3Icon,
    aliases: ['h3', 'heading3', '三级标题', '标题3'],
    insert: (editor) => setBlock(editor, 'h3'),
  },
  {
    id: 'h4',
    title: '四级标题',
    description: 'H4',
    icon: Heading4Icon,
    aliases: ['h4', 'heading4', '四级标题', '标题4'],
    insert: (editor) => setBlock(editor, 'h4'),
  },
  {
    id: 'bullet-list',
    title: '无序列表',
    description: '点状列表',
    icon: ListIcon,
    aliases: ['ul', 'bullet', 'list', '无序列表', 'li'],
    insert: (editor) => insertBulletList(editor),
  },
  {
    id: 'ordered-list',
    title: '有序列表',
    description: '编号列表',
    icon: ListOrderedIcon,
    aliases: ['ol', 'ordered', 'number', '有序列表', '编号'],
    insert: (editor) => insertOrderedList(editor),
  },
  {
    id: 'blockquote',
    title: '引用',
    description: '块引用',
    icon: QuoteIcon,
    aliases: ['quote', 'blockquote', '引用'],
    insert: (editor) => applyBlockStyle(editor, 'blockquote'),
  },
  {
    id: 'code-block',
    title: '代码块',
    description: 'Shiki 高亮',
    icon: CodeIcon,
    aliases: ['code', 'codeblock', 'pre', '代码', '代码块'],
    insert: (editor) => applyBlockStyle(editor, 'codeBlock'),
  },
  {
    id: 'horizontal-rule',
    title: '分隔线',
    description: '水平分隔',
    icon: MinusIcon,
    aliases: ['hr', 'rule', 'divider', '分隔线'],
    insert: (editor) => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
  },
  {
    id: 'image',
    title: '图片',
    description: '从图库选择',
    icon: ImageIcon,
    aliases: ['image', 'img', 'picture', '图片', '图'],
    insert: (editor) => editor.dispatchCommand(OPEN_IMAGE_PICKER_COMMAND, undefined),
  },
  {
    id: 'music',
    title: '音乐',
    description: '插入网易云播放器',
    icon: Music2Icon,
    aliases: ['music', 'audio', 'song', '音乐', '播放器'],
    insert: (editor) => editor.dispatchCommand(OPEN_MUSIC_PICKER_COMMAND, undefined),
  },
  {
    id: 'table',
    title: '表格',
    description: '插入 3 × 3 含表头',
    icon: TableIcon,
    aliases: ['table', 'grid', '表格', '表'],
    insert: (editor) =>
      editor.dispatchCommand(
        INSERT_TABLE_COMMAND,
        // The 0.45 payload types rows/columns as string (runtime coerces
        // via Number()); the 3×3 with-header values are numeric literals.
        unsafeCast<InsertTableCommandPayload>({ rows: 3, columns: 3, includeHeaders: true }),
      ),
  },
  {
    id: 'math-block',
    title: '公式块',
    description: '独占行 TeX（align、gather 等多行环境）',
    icon: SigmaIcon,
    aliases: ['math', 'mathblock', 'tex', 'katex', '公式', '数学', 'align'],
    insert: (editor) => insertBlockAfterSelection(editor, () => $createMathBlockNode(DEFAULT_MATH_BLOCK_TEX)),
  },
  {
    id: 'two-columns',
    title: '左右分栏',
    description: '两栏并排，每栏内容独立编辑',
    icon: Columns2Icon,
    aliases: ['columns', 'split', 'two', '分栏', '双栏', '两栏', 'column'],
    insert: (editor) => {
      insertBlockAfterSelection(editor, () => {
        const key = generateBlockKey()
        const left = $createTwoColumnPaneNode('left')
        const right = $createTwoColumnPaneNode('right')
        const leftParagraph = $createParagraphNode()
        leftParagraph.append($createTextNode('左侧内容'))
        const rightParagraph = $createParagraphNode()
        rightParagraph.append($createTextNode('右侧内容'))
        left.append(leftParagraph)
        right.append(rightParagraph)
        const twoColumn = $createTwoColumnNode(key)
        twoColumn.append(left, right)
        return twoColumn
      })
    },
  },
  {
    id: 'solution',
    title: '解答块',
    description: '题解 / 提示（内部可排版，与引用块相同）',
    icon: ListTreeIcon,
    aliases: ['solution', 'hint', 'answer', '解答', '题解', '提示'],
    insert: (editor) => {
      insertBlockAfterSelection(editor, () => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('在此处填写解答步骤'))
        const solution = $createSolutionNode(generateBlockKey())
        solution.append(paragraph)
        return solution
      })
    },
  },
  {
    id: 'footnote',
    title: '脚注引用',
    description: '行内上标；可用 ^ 空格触发；弹窗填写正文（文末列表由渲染生成）',
    icon: SuperscriptIcon,
    aliases: ['footnote', 'fn', '脚注', '^', 'caret'],
    insert: (editor) => editor.dispatchCommand(OPEN_FOOTNOTE_DIALOG_COMMAND, undefined),
  },
]

/**
 * Filter a slash command catalogue against a query — the same matching
 * semantics as the tiptap `filterSlashCommands` (case-insensitive title +
 * aliases; empty query returns the whole catalogue).
 */
export function filterLexicalSlashCommands(
  query: string,
  catalogue: readonly LexicalSlashCommand[] = LEXICAL_SLASH_COMMANDS,
): readonly LexicalSlashCommand[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') {
    return catalogue
  }
  return catalogue.filter((cmd) => {
    if (cmd.title.toLowerCase().includes(trimmed)) {
      return true
    }
    return cmd.aliases.some((alias) => alias.toLowerCase().includes(trimmed))
  })
}
