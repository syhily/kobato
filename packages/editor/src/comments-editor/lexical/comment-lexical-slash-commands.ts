import type { LexicalSlashCommand } from '@kobato/editor/engine/lexical/slash-commands'
import type { LexicalEditor } from 'lexical'

import { applyBlockStyle, insertBulletList, insertOrderedList } from '@kobato/editor/engine/lexical/block-commands'
import { $createMathBlockNode } from '@kobato/shared/lexical/nodes/math-block-node'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { CodeIcon, ListIcon, ListOrderedIcon, QuoteIcon, SigmaIcon, Type as TypeIcon } from 'lucide-react'

const DEFAULT_MATH_BLOCK_TEX = ['\\begin{align*}', '    a &= b\\\\', '    c &= d', '\\end{align*}'].join('\n')

/**
 * Comment slash-command catalogue — the 6 commands of the tiptap
 * `COMMENT_SLASH_COMMANDS` (paragraph / bullet-list / ordered-list /
 * blockquote / code-block / math-block), ported to the Lexical engine's
 * `LexicalSlashCommand` shape with the same ids / titles / descriptions
 * / aliases. The `LexicalSlashMenuPlugin` receives this catalogue via
 * its `commands` prop — the comment editor never registers the body
 * commands (headings, image, music, table, hr, twoColumn, solution,
 * footnote are unreachable from the comment UI).
 */

/** Insert a decorator block after the current block (runs inside an editor update). */
function insertBlockAfterSelection(editor: LexicalEditor, createNode: () => import('lexical').LexicalNode): void {
  editor.update(() => {
    $insertNodeToNearestRoot(createNode())
  })
}

export const COMMENT_LEXICAL_SLASH_COMMANDS: readonly LexicalSlashCommand[] = [
  {
    id: 'paragraph',
    title: '正文',
    description: '清除当前块格式',
    icon: TypeIcon,
    aliases: ['paragraph', 'text', '正文', 'p'],
    insert: (editor) => applyBlockStyle(editor, 'normal'),
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
    id: 'math-block',
    title: '公式块',
    description: '独占行 TeX（align、gather 等多行环境）',
    icon: SigmaIcon,
    aliases: ['math', 'mathblock', 'tex', 'katex', '公式', '数学', 'align'],
    insert: (editor) => insertBlockAfterSelection(editor, () => $createMathBlockNode(DEFAULT_MATH_BLOCK_TEX)),
  },
]
