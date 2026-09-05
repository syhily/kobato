import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import FloatingToolbar from '@/components/ui/FloatingToolbar'
import { LinkToolbar } from '@/components/ui/LinkToolbar'
import { $removeLink, $selectLinkText, type HoveredLink } from '@/plugins/behaviour/link-editing'

// Render adapter over the toolbar session's hovered-link slot: session state
// in, JSX out. The hover feed (wired by FloatingToolbarPlugin) owns the
// mousemove tracking and link resolution; suppression while another toolbar is
// open is the session's own guard, so there is no disabled prop here.
interface FloatingLinkToolbarProps {
  anchorElem: HTMLElement
  /** The session's hovered link — the toolbar renders only while it is non-null. */
  hoveredLink: HoveredLink | null
  /** Owned by the plugin, which feeds it to the hover feed's toolbar-element port. */
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
