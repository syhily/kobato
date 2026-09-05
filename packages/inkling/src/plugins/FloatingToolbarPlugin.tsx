import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, DELETE_CHARACTER_COMMAND, type LexicalEditor } from 'lexical'
import React from 'react'

import { FloatingFormatToolbar } from '@/components/ui/FloatingFormatToolbar'
import { FloatingLinkToolbar } from '@/components/ui/FloatingLinkToolbar'
import { type HiddenFormat } from '@/plugins/behaviour/format-toolbar'
import {
  createLinkHoverFeed,
  createToolbarRevealFeed,
  createToolbarSession,
  LINK_HOVER_DEBOUNCE_MS,
  registerToolbarCommands,
  registerToolbarSelectionSync,
  type ToolbarSession,
} from '@/plugins/behaviour/link-editing'
import { debounce } from '@/utils'

export default function FloatingToolbarPlugin({
  anchorElem = document.body,
  isSnippetsEnabled,
  hiddenFormats = [],
}: {
  anchorElem?: HTMLElement
  isSnippetsEnabled?: boolean
  hiddenFormats?: HiddenFormat[]
}) {
  const [editor] = useLexicalComposerContext()
  return useFloatingFormatToolbar(editor, anchorElem, isSnippetsEnabled, hiddenFormats)
}

function useFloatingFormatToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isSnippetsEnabled?: boolean,
  hiddenFormats: HiddenFormat[] = [],
) {
  // the toolbar session (hidden | text | link | snippet, plus the hovered-link
  // slot) lives in the headless link-editing module; this hook only feeds it
  // selection/DOM events and renders its state
  const [session] = React.useState<ToolbarSession>(() => createToolbarSession())
  const { type, href, hoveredLink } = React.useSyncExternalStore(session.handle.subscribe, session.handle.getState)

  // the hover toolbar's element, so the hover feed can ignore mousemoves over
  // the toolbar itself (they must not clear the hovered link)
  const linkToolbarRef = React.useRef<HTMLDivElement | null>(null)

  // the format toolbar's element; the reveal feed flips its opacity once the
  // selection gesture completes (mouseup inside the selection, or a threshold
  // mousemove) so the toolbar does not re-position while dragging
  const formatToolbarRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const reveal = () => {
      if (session.handle.getState().type !== 'hidden' && formatToolbarRef.current?.style.opacity === '0') {
        formatToolbarRef.current.style.opacity = '1'
      }
    }
    const revealFeed = createToolbarRevealFeed(editor, { reveal })
    const onRelease = (event: Event) => revealFeed.release(event.target)
    const onMouseMove = debounce(
      (event: MouseEvent) => revealFeed.move({ x: event.clientX, y: event.clientY }, event.buttons),
      10,
    )

    document.addEventListener('mouseup', onRelease) // desktop
    document.addEventListener('touchend', onRelease) // mobile
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      onMouseMove.cancel()
      document.removeEventListener('mouseup', onRelease) // desktop
      document.removeEventListener('touchend', onRelease) // mobile
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [editor, session])

  // the hover feed: debounced document mousemoves in, hovered-link truth out
  // into the session (suppressed by the session while any toolbar is open)
  React.useEffect(() => {
    const hoverFeed = createLinkHoverFeed(editor, session, { getToolbarElement: () => linkToolbarRef.current })
    const onMouseMove = debounce((event: MouseEvent) => hoverFeed.hover(event.target), LINK_HOVER_DEBOUNCE_MS)
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      onMouseMove.cancel()
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [editor, session])

  // the selection classifier (composing skip, outside-editor close, at-link
  // suppression, textSelected/href derivation) lives headlessly in the
  // link-editing module; this hook only registers it
  React.useEffect(() => {
    return registerToolbarSelectionSync(editor, session)
  }, [editor, session])

  React.useEffect(() => {
    // clear out the toolbar when the user removes selected content
    return editor.registerCommand(
      DELETE_CHARACTER_COMMAND,
      () => {
        session.close()
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, session])

  // the link-shortcut registration (press grammar + range check) lives in
  // the link-editing module beside the session
  React.useEffect(() => {
    return registerToolbarCommands(editor, session)
  }, [editor, session])

  // use native mousedown event so the toolbar can close when something is
  // clicked outside of the editor and the selection is lost
  React.useEffect(() => {
    const handleMousedown = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !anchorElem.contains(event.target)) {
        session.close()
      }
    }

    document.addEventListener('mousedown', handleMousedown)

    return () => {
      document.removeEventListener('mousedown', handleMousedown)
    }
  }, [anchorElem, session])

  return (
    <>
      <FloatingFormatToolbar
        anchorElem={anchorElem}
        editor={editor}
        hiddenFormats={hiddenFormats}
        href={href}
        isSnippetsEnabled={isSnippetsEnabled}
        toolbarItemType={type === 'hidden' ? null : type}
        toolbarRef={formatToolbarRef}
        onClose={() => session.close()}
        onOpenLink={() => session.openLink()}
        onOpenSnippet={() => session.openSnippet()}
      />

      <FloatingLinkToolbar
        anchorElem={anchorElem}
        hoveredLink={hoveredLink}
        toolbarRef={linkToolbarRef}
        onEditLink={({ href: editHref }) => session.openLink(editHref)}
        onRemoveLink={() => session.syncHover(null)}
      />
    </>
  )
}
