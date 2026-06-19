import { useInklingFootnotes } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

interface FootnoteRefNodeLike {
  getTargetKey(): string
  getRefKey(): string
  getIndex(): number
}

interface FootnoteRefComponentProps {
  node: FootnoteRefNodeLike
}

export function FootnoteRefComponent({ node }: FootnoteRefComponentProps) {
  const { openEditDialog } = useInklingFootnotes()
  return (
    <button
      type="button"
      className="inkling-footnote-ref font-inherit cursor-pointer appearance-none border-0 bg-transparent p-0 text-inherit"
      aria-label={`编辑脚注 ${node.getIndex()}`}
      data-target-key={node.getTargetKey()}
      data-ref-key={node.getRefKey()}
      data-index={node.getIndex()}
      onClick={() => openEditDialog(node.getTargetKey())}
    >
      {node.getIndex()}
    </button>
  )
}
