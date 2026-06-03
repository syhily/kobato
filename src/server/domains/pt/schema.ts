// PT domain schema — re-exports the shared PT types that server-side
// processing modules need, so callers can import from the domain root
// rather than reaching across into `@/shared/pt/schema`.

export type {
  Block,
  CodeBlock,
  ImageBlock,
  ImageBlockLayout,
  LinkMarkDef,
  MarkDef,
  MathBlock,
  MathInlineMarkDef,
  PortableTextBody,
  PortableTextHeading,
  PortableTextHeadingSlot,
  Span,
  TextBlock,
} from '@/shared/pt/schema'

export type { CommentBlock, CommentBody, CommentTextBlock } from '@/shared/pt/comment-schema'
