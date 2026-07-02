import { $isLinkNode, type LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createRangeSelection, $getNearestNodeFromDOMNode, $isTextNode, $setSelection } from 'lexical'
import debounce from 'lodash/debounce'
import React from 'react'

import FloatingToolbar from '@/ui/inkling-editor/components/ui/FloatingToolbar'
import { LinkToolbar } from '@/ui/inkling-editor/components/ui/LinkToolbar'

interface FloatingLinkToolbarProps {
  anchorElem: HTMLElement
  onEditLink: (data: { href: string }) => void
  disabled?: boolean
}

export function FloatingLinkToolbar({ anchorElem, onEditLink, disabled }: FloatingLinkToolbarProps) {
  const [editor] = useLexicalComposerContext()
  const [linkNode, setLinkNode] = React.useState<LinkNode | null>(null)
  const [href, setHref] = React.useState('')
  const toolbarRef = React.useRef<HTMLDivElement | null>(null)
  const [targetElem, setTargetElem] = React.useState<HTMLElement | null>(null)

  React.useEffect(() => {
    if (disabled) {
      if (linkNode) {
        setLinkNode(null)
        setHref('')
      }
      return
    }

    const onMouseEnter = (event: MouseEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) {
        return
      }

      editor.update(() => {
        const target = event.target as HTMLElement
        const node = $getNearestNodeFromDOMNode(target)
        setTargetElem(target)
        const isLink = $isLinkNode(node) || $isLinkNode(node?.getParent())

        if (!isLink) {
          if (linkNode) {
            setLinkNode(null)
          }

          return
        }
        const link = ($isLinkNode(node) ? node : node!.getParent()) as LinkNode

        setLinkNode(link)
        setHref(link.getURL())
      })
    }

    const onMouseEnterDebounced = debounce(onMouseEnter, 50)

    const handler = (e: MouseEvent) => onMouseEnterDebounced(e)
    document.addEventListener('mousemove', handler)

    return () => {
      onMouseEnterDebounced.cancel()
      document.removeEventListener('mousemove', handler)
    }
  }, [disabled, editor, linkNode])

  const onEdit = () => {
    if (!linkNode) {
      return
    }
    editor.update(() => {
      const firstChild = linkNode!.getFirstChild()
      const lastChild = linkNode!.getLastChild()
      if (!$isTextNode(firstChild) || !$isTextNode(lastChild)) {
        return
      }
      const selection = $createRangeSelection()
      // select all children because createRectsFromDOMRange method from lexical is not working properly for link node
      selection.setTextNodeRange(firstChild, 0, lastChild, lastChild.getTextContentSize())
      $setSelection(selection)
      onEditLink({ href })
    })
  }

  const onRemove = () => {
    if (!linkNode) {
      return
    }
    editor.update(() => {
      linkNode!.select()
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
      setLinkNode(null)
    })
  }

  if (!linkNode) {
    return null
  }
  return (
    <FloatingToolbar
      anchorElem={anchorElem}
      controlOpacity={true}
      editor={editor}
      isVisible={true}
      targetElem={targetElem}
      toolbarRef={toolbarRef}
    >
      <LinkToolbar href={href} onEdit={onEdit} onRemove={onRemove} />
    </FloatingToolbar>
  )
}
