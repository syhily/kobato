import FloatingToolbar from '@kobato/inkling-internal/components/ui/FloatingToolbar'
import { LinkToolbar } from '@kobato/inkling-internal/components/ui/LinkToolbar'
import { $removeLink, $selectLinkText, type HoveredLink } from '@kobato/inkling-internal/plugins/behaviour/link-editing'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

interface FloatingLinkToolbarProps {
  anchorElem: HTMLElement
  hoveredLink: HoveredLink | null

  toolbarRef: React.RefObject<HTMLDivElement | null>
  onEditLink: (data: { href: string }) => void
  onRemoveLink: () => void
}

export function FloatingLinkToolbar({
  anchorElem,
  hoveredLink,
  toolbarRef,
  onEditLink,
  onRemoveLink,
}: FloatingLinkToolbarProps) {
  const [editor] = useLexicalComposerContext()

  const onEdit = () => {
    if (!hoveredLink) {
      return
    }
    editor.update(() => {
      if ($selectLinkText(hoveredLink.linkNode)) {
        onEditLink({ href: hoveredLink.href })
      }
    })
  }

  const onRemove = () => {
    if (!hoveredLink) {
      return
    }
    editor.update(() => {
      $removeLink(editor, hoveredLink.linkNode)
    })
    onRemoveLink()
  }

  if (!hoveredLink) {
    return null
  }
  return (
    <FloatingToolbar
      anchorElem={anchorElem}
      controlOpacity={true}
      editor={editor}
      isVisible={true}
      targetElem={hoveredLink.targetElem}
      toolbarRef={toolbarRef}
    >
      <LinkToolbar href={hoveredLink.href} onEdit={onEdit} onRemove={onRemove} />
    </FloatingToolbar>
  )
}
