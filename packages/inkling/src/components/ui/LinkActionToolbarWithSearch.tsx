import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { LinkInput } from '@/components/ui/LinkInput'
import Portal from '@/components/ui/Portal'
import { useInklingLinkingSettings } from '@/context/InklingHostIntegrationContext'
import { useSelectionAnchoredPopup } from '@/hooks/useSelectionAnchoredPopup'
import { $applyLinkToSelection } from '@/plugins/behaviour/link-editing'
import trackEvent from '@/utils/analytics'
import { isInternalUrl } from '@/utils/isInternalUrl'
import { createSelectionAnchor } from '@/utils/selection-anchored-popup'

interface LinkActionToolbarWithSearchProps {
  anchorElem: HTMLElement
  href?: string
  onClose: () => void
}

export function LinkActionToolbarWithSearch({ anchorElem, href, onClose }: LinkActionToolbarWithSearchProps) {
  const [editor] = useLexicalComposerContext()
  const { siteUrl } = useInklingLinkingSettings()

  const linkToolbarRef = React.useRef<HTMLDivElement | null>(null)

  // Position the link input and search results below the selected text,
  // flipping above it at the bottom of the document; the deep module owns
  // rect resolution and the flip.
  const anchor = React.useMemo(() => createSelectionAnchor(editor), [editor])
  const containerRect = React.useCallback(() => anchorElem.parentElement?.getBoundingClientRect() ?? null, [anchorElem])
  useSelectionAnchoredPopup({ editor, popupRef: linkToolbarRef, anchor, containerRect, aboveGap: 55 })

  const onLinkUpdate = (updatedHref: string, type?: string) => {
    editor.update(() => {
      $applyLinkToSelection(editor, updatedHref)

      onClose()

      if (type === 'internal' || type === 'default') {
        trackEvent('Link dropdown: Internal link chosen', { context: 'text', fromLatest: type === 'default' })
      } else {
        try {
          const target = isInternalUrl(updatedHref, siteUrl) ? 'internal' : 'external'
          trackEvent('Link dropdown: URL entered', { context: 'text', target })
        } catch {
          // noop
        }
      }
    })
  }

  return (
    <Portal>
      <div ref={linkToolbarRef} className="not-inkling-prose fixed z-[10000]">
        <LinkInput cancel={onClose} href={href} update={onLinkUpdate} />
      </div>
    </Portal>
  )
}
