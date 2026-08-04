import type { BlockStyleValue } from '@kobato/editor/engine/lexical/block-commands'

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

// Block style values map 1:1 to the Lexical block commands
// (`@kobato/editor/engine/lexical/block-commands`) and, historically,
// to PortableText `style` values. h1 is owned by the page title
// (rendered in the public layout), so the editor surfaces h2–h5 only.
export const BLOCK_STYLE_OPTIONS: { value: BlockStyleValue; label: string }[] = [
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
export const BLOCK_STYLE_BUTTONS: { value: BlockStyleValue; title: string; Icon: typeof PilcrowIcon }[] = [
  { value: 'normal', title: '正文段落', Icon: PilcrowIcon },
  { value: 'h2', title: '二级标题', Icon: Heading2Icon },
  { value: 'h3', title: '三级标题', Icon: Heading3Icon },
  { value: 'h4', title: '四级标题', Icon: Heading4Icon },
  { value: 'h5', title: '五级标题', Icon: Heading5Icon },
  { value: 'blockquote', title: '引用', Icon: QuoteIcon },
  { value: 'codeBlock', title: '代码块', Icon: CodeIcon },
]

export const ALIGN_OPTIONS = [
  { value: 'left', label: '居左', Icon: AlignLeftIcon },
  { value: 'center', label: '居中', Icon: AlignCenterIcon },
  { value: 'right', label: '居右', Icon: AlignRightIcon },
] as const
