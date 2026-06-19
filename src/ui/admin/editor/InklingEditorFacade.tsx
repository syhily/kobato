import { useEffect, useRef, useState } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'

export interface InklingEditorFacadeProps {
  /** Initial document. Only read on first mount + when `documentKey` changes. */
  initialDocument: InklingDocument
  /**
   * Identity of the document source. When this string changes the editor
   * resets its content from `initialDocument`.
   */
  documentKey: string
  /** Fired when the document changes from test controls. */
  onDocumentChange: (document: InklingDocument) => void
  /** When true, the editor surface becomes read-only. */
  disabled?: boolean
  /** Live preview column layout flag (mirrors the old PageBodyEditor API). */
  livePreviewOpen?: boolean
  /** Ref to the scrollable container so the parent shell can wire scroll sync. */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  /** Shell-level actions rendered next to the placeholder controls. */
  floatingActions?: React.ReactNode
}

/**
 * Temporary facade used by Plan 008 to prove the editor shell can operate on
 * InklingDocument without importing Tiptap. It renders a placeholder surface
 * and a few controls that emit synthetic document changes for tests.
 */
export function InklingEditorFacade({
  initialDocument,
  documentKey,
  onDocumentChange,
  disabled,
  livePreviewOpen,
  scrollContainerRef,
  floatingActions,
}: InklingEditorFacadeProps) {
  const onDocumentChangeRef = useRef(onDocumentChange)
  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange
  })

  const [document, setDocument] = useState<InklingDocument>(initialDocument)
  const lastResetKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastResetKeyRef.current === documentKey) {
      return
    }
    lastResetKeyRef.current = documentKey
    setDocument(initialDocument)
  }, [documentKey, initialDocument])

  const emit = (next: InklingDocument) => {
    setDocument(next)
    onDocumentChangeRef.current(next)
  }

  const appendText = () => {
    const root = document.root
    const next: InklingDocument = {
      ...document,
      root: {
        ...root,
        children: [
          ...root.children,
          {
            type: 'paragraph',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [{ type: 'text', version: 1, text: 'Changed' }],
          },
        ],
      },
    }
    emit(next)
  }

  const insertImageCard = () => {
    const root = document.root
    const next: InklingDocument = {
      ...document,
      root: {
        ...root,
        children: [
          ...root.children,
          {
            type: 'image-card',
            version: 1,
            src: 'https://example.com/image.png',
            alt: 'Placeholder image',
          },
        ],
      },
    }
    emit(next)
  }

  const resetToEmpty = () => {
    emit(EMPTY_INKLING_DOCUMENT)
  }

  return (
    <div
      ref={scrollContainerRef}
      className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-xl border bg-card"
    >
      <div className="shrink-0 border-b bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
        Inkling 编辑器外壳（POC 占位）{livePreviewOpen ? '· 实时预览模式' : ''}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground">
          <p>当前文档根节点子节点数：{document.root.children.length}</p>
          <p>lexicalVersion：{document.lexicalVersion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={appendText}
            disabled={disabled}
            className="rounded border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            追加段落
          </button>
          <button
            type="button"
            onClick={insertImageCard}
            disabled={disabled}
            className="rounded border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            插入图片卡片
          </button>
          <button
            type="button"
            onClick={resetToEmpty}
            disabled={disabled}
            className="rounded border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            重置为空文档
          </button>
          {floatingActions}
        </div>
      </div>
    </div>
  )
}
