import '@/styles/inkling-editor.css'
import { FocusIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { blockQuoteAsideCycle } from '@/client/editor/block-quote-aside-cycle'
import { EditorSurfaceComposer, useEditorSurface } from '@/client/editor/editor-surface'
import { registerKobatoImageInsertCommands } from '@/client/editor/image-insert-override'
import { makePageEditorCardConfig } from '@/client/editor/page-editor-card-config'
import { PAGE_EDITOR_NODES } from '@/client/editor/page-editor-nodes'
import { pageEditorFileUploader } from '@/client/editor/page-editor-upload'
import { useFocusModePreference } from '@/client/editor/use-focus-mode'
import { InklingEditor } from '@/inkling'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'
import { useHydrated } from '@/ui/lib/use-hydrated'

export interface PageBodyEditorProps {
  /** Initial Lexical body. Only read on first mount + when `bodyKey` changes. */
  initialBody: LexicalEditorState
  /** Identity of the body source — a change resets the editor content from `initialBody`. */
  bodyKey: string
  /** Fired on every editor update with the freshly-serialized Lexical state. */
  onBodyChange: (body: LexicalEditorState) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /** Chrome rendered inside the scroll container above the canvas (the
   *  title/slug strip) so it scrolls with the document as one centered
   *  writing column. */
  header?: React.ReactNode
}

export function PageBodyEditor(props: PageBodyEditorProps) {
  const { t } = useI18n()
  const hydrated = useHydrated()
  if (!hydrated) {
    // SSR/hydration placeholder: same shell + scroll container as the hydrated
    // tree so the header (title/slug strip) renders identically on the server.
    return (
      <div className="kobato-page-editor relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <div data-kobato-editor-scroll="" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {props.header}
          <div className="flex items-center justify-center p-4 py-24 text-sm text-muted-foreground">
            {t('admin.editor.body.loading')}
          </div>
        </div>
      </div>
    )
  }
  return <PageBodyEditorClient {...props} />
}

function PageBodyEditorClient({ initialBody, bodyKey, onBodyChange, disabled, header }: PageBodyEditorProps) {
  const { t, localizeMessage } = useI18n()
  // `localizeMessage` closes over the same `intl` instance as `t`, so the
  // translator identity is the correct (and stable) memo key — keying on the
  // callback itself would rebuild the card config on every provider render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const cardConfig = useMemo(() => makePageEditorCardConfig(t, localizeMessage), [t])
  const [focusMode, toggleFocusMode] = useFocusModePreference()
  const { editorInstance, registerAPI, mountedInitialState, handleChange } = useEditorSurface({
    initialBody,
    bodyKey,
    onBodyChange,
  })

  // The stock image handlers mount on the shared 'image' type but would
  // build the stock class / mount inkling's selector overlay — intercept at
  // HIGH for the editor's lifetime.
  useEffect(() => {
    if (editorInstance === null) {
      return
    }
    return registerKobatoImageInsertCommands(editorInstance)
  }, [editorInstance])

  return (
    <div
      className="kobato-page-editor relative flex min-h-0 w-full min-w-0 flex-1 flex-col"
      onKeyDownCapture={blockQuoteAsideCycle}
    >
      <div data-kobato-editor-scroll="" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {header}
        <EditorSurfaceComposer
          nodes={PAGE_EDITOR_NODES}
          initialEditorState={mountedInitialState}
          fileUploader={pageEditorFileUploader}
          cardConfig={cardConfig}
          dragScrollContainerSelector="[data-kobato-editor-scroll]"
        >
          <InklingEditor
            readOnly={disabled === true}
            focusMode={focusMode}
            registerAPI={registerAPI}
            onChange={handleChange}
            placeholderText={t('admin.editor.body.placeholder')}
            placeholderClassName="kobato-page-placeholder"
            contentEditableClassName="typeset typeset-post"
          />
        </EditorSurfaceComposer>
      </div>
      <div className="absolute right-3 bottom-3 z-30">
        <Button
          type="button"
          variant={focusMode ? 'secondary' : 'outline'}
          size="icon"
          title={focusMode ? t('admin.editor.focus.off') : t('admin.editor.focus.on')}
          aria-pressed={focusMode}
          onClick={toggleFocusMode}
        >
          <FocusIcon />
        </Button>
      </div>
    </div>
  )
}
