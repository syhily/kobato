import CardContext from '@kobato/inkling-internal/context/CardContext'
import { useTKHandle, useTKHandleState } from '@kobato/inkling-internal/context/TKHandleContext'
import { useInklingTextEntity } from '@kobato/inkling-internal/hooks/useInklingTextEntity'
import { $createTKNode, ExtendedTextNode, TKNode } from '@kobato/inkling-internal/nodes/base'
import { resolveTkIndicatorPosition } from '@kobato/inkling-internal/plugins/behaviour/tk-indicator'
import { getTKMatch } from '@kobato/inkling-internal/plugins/behaviour/tk-matcher'
import {
  $selectTkFromIndicator,
  applyTkHoverHighlight,
  registerTkNodeTracking,
} from '@kobato/inkling-internal/plugins/behaviour/tk-tracking'
import { themeClassList } from '@kobato/inkling-internal/themes/inkling-theme-classes'
import { getEditorTheme } from '@kobato/inkling-internal/utils/lexical-internals'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type LexicalEditor, TextNode } from 'lexical'
import { useCallback, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function TKIndicator({
  editor,
  rootElement,
  parentKey,
  nodeKeys,
}: {
  editor: LexicalEditor
  rootElement: HTMLElement
  parentKey: string
  nodeKeys: string[]
}) {
  const theme = getEditorTheme(editor)
  const tkClasses = themeClassList(theme, 'tk')
  const tkHighlightClasses = themeClassList(theme, 'tkHighlighted')

  const containingElement = editor.getElementByKey(parentKey)

  const calculatePosition = useCallback(() => {
    if (!containingElement) {
      return resolveTkIndicatorPosition(null, null)
    }

    const positioningElement = containingElement.querySelector('[data-inkling-card]') || containingElement

    return resolveTkIndicatorPosition(rootElement.getBoundingClientRect(), positioningElement.getBoundingClientRect())
  }, [rootElement, containingElement])

  const [position, setPosition] = useState(calculatePosition())

  useEffect(() => {
    if (!containingElement) {
      return
    }
    const observer = new ResizeObserver(() => setPosition(calculatePosition()))

    observer.observe(rootElement)
    observer.observe(containingElement)

    return () => {
      observer.disconnect()
    }
  }, [rootElement, containingElement, calculatePosition])

  if (!containingElement) {
    return null
  }

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    editor.update(() => {
      $selectTkFromIndicator(editor, parentKey, nodeKeys)
    })
  }

  const toggleHighlightClasses = (isHighlighted: boolean) => {
    applyTkHoverHighlight(editor, parentKey, nodeKeys, { tkClasses, tkHighlightClasses }, isHighlighted)
  }

  const onMouseEnter = () => {
    toggleHighlightClasses(true)
  }

  const onMouseLeave = () => {
    toggleHighlightClasses(false)
  }

  const style = {
    top: `${position.top}px`,
    right: `${position.right}px`,
  }

  return (
    <div
      className="text-2xs text-grey-600 absolute cursor-pointer p-1 font-medium"
      data-testid="tk-indicator"
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      TK
    </div>
  )
}

export default function TKPlugin() {
  const [editor] = useLexicalComposerContext()
  const tkHandle = useTKHandle()
  const tkNodeMap = useTKHandleState((state) => state.tkNodeMap)
  const { nodeKey: parentEditorNodeKey } = useContext(CardContext)

  useEffect(() => {
    if (!editor.hasNodes([TKNode])) {
      throw new Error('TKPlugin: TKNode not registered on editor')
    }

    return () => {
      tkHandle.removeEditor(editor.getKey())
    }
  }, [editor, tkHandle])

  useEffect(() => {
    return registerTkNodeTracking(editor, tkHandle, parentEditorNodeKey)
  }, [editor, tkHandle, parentEditorNodeKey])

  const createTKNode = useCallback((textNode: TextNode): TKNode => {
    return $createTKNode(textNode.getTextContent())
  }, [])

  const nodeType = editor.hasNode(ExtendedTextNode) ? ExtendedTextNode : TextNode

  useInklingTextEntity(getTKMatch, TKNode, createTKNode, nodeType)

  if (parentEditorNodeKey) {
    return null
  }
  const editorRoot = editor.getRootElement()
  const editorRootParent = editorRoot?.parentElement

  if (!editorRoot || !editorRootParent) {
    return null
  }

  const TKIndicators = Object.entries(tkNodeMap)
    .map(([parentKey, nodeKeys]) => {
      const parentContainer = editor.getElementByKey(parentKey)

      if (!parentContainer) {
        return false
      }

      return (
        <TKIndicator
          key={parentKey}
          editor={editor}
          nodeKeys={nodeKeys}
          parentKey={parentKey}
          rootElement={editorRoot}
        />
      )
    })
    .filter(Boolean)

  return createPortal(TKIndicators, editorRootParent)
}
