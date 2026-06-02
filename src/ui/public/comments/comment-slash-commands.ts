import { CodeIcon, ListIcon, ListOrderedIcon, QuoteIcon, SigmaIcon, Type as TypeIcon } from 'lucide-react'

import type { Block } from '@/shared/pt/schema'
import type { SlashCommand } from '@/ui/admin/editor/tiptap/SlashMenu'

import { generateBlockKey } from '@/shared/pt/utils'

// Slash command catalogue scoped to comment bodies. Mirrors the
// shape of the admin catalogue (so the same `SlashCommandsExtension`
// renderer can drive it) but stays narrow on purpose — no image /
// music / table / footnote / solution / twoColumn entries.
// Heading commands are also excluded because comment threads aren't
// sectioned content (`commentBodySchema` rejects h1-h4 anyway).

const DEFAULT_MATH_BLOCK_TEX = ['\\begin{align*}', '    a &= b\\\\', '    c &= d', '\\end{align*}'].join('\n')

export const COMMENT_SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: 'paragraph',
    title: '正文',
    description: '清除当前块格式',
    icon: TypeIcon,
    aliases: ['paragraph', 'text', '正文', 'p'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('paragraph').run()
    },
  },
  {
    id: 'bullet-list',
    title: '无序列表',
    description: '点状列表',
    icon: ListIcon,
    aliases: ['ul', 'bullet', 'list', '无序列表', 'li'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: 'ordered-list',
    title: '有序列表',
    description: '编号列表',
    icon: ListOrderedIcon,
    aliases: ['ol', 'ordered', 'number', '有序列表', '编号'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    id: 'blockquote',
    title: '引用',
    description: '块引用',
    icon: QuoteIcon,
    aliases: ['quote', 'blockquote', '引用'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    id: 'code-block',
    title: '代码块',
    description: 'Shiki 高亮',
    icon: CodeIcon,
    aliases: ['code', 'codeblock', 'pre', '代码', '代码块'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    id: 'math-block',
    title: '公式块',
    description: '独占行 TeX（align、gather 等多行环境）',
    icon: SigmaIcon,
    aliases: ['math', 'mathblock', 'tex', 'katex', '公式', '数学', 'align'],
    command: ({ editor, range }) => {
      const payload: Block = {
        _type: 'mathBlock',
        _key: generateBlockKey(),
        tex: DEFAULT_MATH_BLOCK_TEX,
      }
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'blockCard',
          attrs: { _key: payload._key, _ptType: payload._type, payload },
        })
        .run()
    },
  },
]
