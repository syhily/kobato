import { $insertHtmlDocument } from '@kobato/inkling-internal/html/html-to-lexical/insert-html'
import $convertToHtmlString from '@kobato/inkling-internal/html/renderer/convert-to-html-string'
import { debounce } from '@kobato/inkling-internal/utils/timing'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { $getRoot, $isParagraphNode } from 'lexical'
import React from 'react'

export const HtmlOutputPlugin = ({
  html = '',
  setHtml,
  debounceMs = 0,
}: {
  html?: string
  setHtml?: (html: string) => void
  debounceMs?: number
}) => {
  const [editor] = useLexicalComposerContext()
  const isFirstRender = React.useRef(true)

  const exportHtml = React.useCallback(() => {
    editor.read(() => {
      const htmlString = $convertToHtmlString(editor)
      const children = $getRoot().getChildren()
      const isEmptyDocument =
        children.length === 0 ||
        (children.length === 1 && $isParagraphNode(children[0]) && children[0].getTextContent().trim() === '')
      setHtml?.(isEmptyDocument ? '' : htmlString)
    })
  }, [editor, setHtml])

  const debouncedExportHtml = React.useMemo(() => debounce(exportHtml, debounceMs), [exportHtml, debounceMs])

  React.useEffect(() => {
    return () => {
      debouncedExportHtml.cancel()
    }
  }, [debouncedExportHtml])

  React.useLayoutEffect(() => {
    if (!isFirstRender.current) {
      return
    }

    isFirstRender.current = false

    if (!html) {
      return
    }

    editor.update(
      () => {
        const parser = new DOMParser()
        const dom = parser.parseFromString(html, 'text/html')

        $insertHtmlDocument(editor, dom)
      },
      { discrete: true },
    )

    exportHtml()
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onChange = React.useCallback(() => {
    if (debounceMs > 0) {
      debouncedExportHtml()
      return
    }
    exportHtml()
  }, [debounceMs, debouncedExportHtml, exportHtml])

  return <OnChangePlugin onChange={onChange} />
}

export default HtmlOutputPlugin
