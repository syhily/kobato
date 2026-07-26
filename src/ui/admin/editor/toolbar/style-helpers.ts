import type { Editor } from '@tiptap/core'

import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  PilcrowIcon,
  QuoteIcon,
} from 'lucide-react'

// Block style values map 1:1 to PortableText `style` values produced
// by pmDocToBody / consumed by bodyToPmDoc — keep in sync if a new
// style is ever added to `portableTextBodySchema`. h1 is owned by
// the page title (rendered in the public layout), so the editor
// surfaces h2–h5 only; h1 + h6 still round-trip through the bridge
// if external content provides them.
export const BLOCK_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'normal', label: '正文段落' },
  { value: 'h2', label: '二级标题' },
  { value: 'h3', label: '三级标题' },
  { value: 'h4', label: '四级标题' },
  { value: 'h5', label: '五级标题' },
  { value: 'blockquote', label: '引用' },
  { value: 'codeBlock', label: '代码块' },
]

// Inline button row mirror of `BlockStyleSelect`. The icons follow
// the same conventions used by the slash menu so the operator gets
// the same visual cue regardless of entry point.
export const BLOCK_STYLE_BUTTONS: { value: string; title: string; Icon: typeof PilcrowIcon }[] = [
  { value: 'normal', title: '正文段落', Icon: PilcrowIcon },
  { value: 'h2', title: '二级标题', Icon: Heading2Icon },
  { value: 'h3', title: '三级标题', Icon: Heading3Icon },
  { value: 'h4', title: '四级标题', Icon: Heading4Icon },
  { value: 'h5', title: '五级标题', Icon: Heading5Icon },
  { value: 'blockquote', title: '引用', Icon: QuoteIcon },
  { value: 'codeBlock', title: '代码块', Icon: CodeIcon },
]

export function getActiveBlockStyle(editor: Editor): string {
  if (editor.isActive('codeBlock')) {
    return 'codeBlock'
  }
  if (editor.isActive('blockquote')) {
    return 'blockquote'
  }
  for (const level of [2, 3, 4, 5] as const) {
    if (editor.isActive('heading', { level })) {
      return `h${level}`
    }
  }
  return 'normal'
}

export function applyBlockStyle(editor: Editor, value: string): void {
  const chain = editor.chain().focus()
  switch (value) {
    case 'normal':
      chain.setParagraph().run()
      return
    case 'blockquote':
      // Only toggle when not already active — toggling an active
      // blockquote would unwrap it. Same goes for codeBlock below.
      if (!editor.isActive('blockquote')) {
        chain.toggleBlockquote().run()
      }
      return
    case 'codeBlock':
      if (!editor.isActive('codeBlock')) {
        chain.toggleCodeBlock().run()
      }
      return
    default: {
      const match = /^h([2-5])$/.exec(value)
      if (match) {
        const level = Number(match[1])
        if (level === 2 || level === 3 || level === 4 || level === 5) {
          chain.setHeading({ level }).run()
        }
      }
    }
  }
}

export const ALIGN_OPTIONS = [
  { value: 'left', label: '居左', Icon: AlignLeftIcon },
  { value: 'center', label: '居中', Icon: AlignCenterIcon },
  { value: 'right', label: '居右', Icon: AlignRightIcon },
] as const

export function getActiveAlign(editor: Editor): string {
  for (const opt of ALIGN_OPTIONS) {
    if (editor.isActive({ textAlign: opt.value })) {
      return opt.value
    }
  }
  return 'left'
}
