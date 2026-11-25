import { FloatingFormatToolbar } from '@kobato/inkling-internal/components/ui/FloatingFormatToolbar'
import { FloatingLinkToolbar } from '@kobato/inkling-internal/components/ui/FloatingLinkToolbar'
import { type HiddenFormat } from '@kobato/inkling-internal/plugins/behaviour/format-toolbar'
import {
  createLinkHoverFeed,
  createToolbarRevealFeed,
  createToolbarSession,
  LINK_HOVER_DEBOUNCE_MS,
  registerToolbarCommands,
  registerToolbarSelectionSync,
  type ToolbarSession,
} from '@kobato/inkling-internal/plugins/behaviour/link-editing'
import { debounce } from '@kobato/inkling-internal/utils'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, DELETE_CHARACTER_COMMAND, type LexicalEditor } from 'lexical'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
export default function FloatingToolbarPlugin({
  anchorElem = document.body,
  isSnippetsEnabled,
  hiddenFormats = [],
  isAlignmentEnabled = false,
}: {
  anchorElem?: HTMLElement
  isSnippetsEnabled?: boolean
  hiddenFormats?: HiddenFormat[]
  isAlignmentEnabled?: boolean
}) {
  const [editor] = useLexicalComposerContext()
  return useFloatingFormatToolbar(editor, anchorElem, isSnippetsEnabled, hiddenFormats, isAlignmentEnabled)
}

function useFloatingFormatToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isSnippetsEnabled?: boolean,
  hiddenFormats: HiddenFormat[] = [],
  isAlignmentEnabled: boolean = false,
) {
  const [session] = useState<ToolbarSession>(() => createToolbarSession())
  const { type, href, hoveredLink } = useSyncExternalStore(session.handle.subscribe, session.handle.getState)

  const linkToolbarRef = useRef<HTMLDivElement | null>(null)
  const formatToolbarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
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

    document.addEventListener('mouseup', onRelease)
    document.addEventListener('touchend', onRelease)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      onMouseMove.cancel()
      document.removeEventListener('mouseup', onRelease)
      document.removeEventListener('touchend', onRelease)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [editor, session])
  useEffect(() => {
    const hoverFeed = createLinkHoverFeed(editor, session, { getToolbarElement: () => linkToolbarRef.current })
    const onMouseMove = debounce((event: MouseEvent) => hoverFeed.hover(event.target), LINK_HOVER_DEBOUNCE_MS)
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      onMouseMove.cancel()
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [editor, session])

  useEffect(() => {
    return registerToolbarSelectionSync(editor, session)
  }, [editor, session])

  useEffect(() => {
    return editor.registerCommand(
      DELETE_CHARACTER_COMMAND,
      () => {
        session.close()
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, session])

  useEffect(() => {
    return registerToolbarCommands(editor, session)
  }, [editor, session])

  useEffect(() => {
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
        isAlignmentEnabled={isAlignmentEnabled}
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
