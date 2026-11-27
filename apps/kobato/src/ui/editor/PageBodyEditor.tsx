import '@kobato/inkling/styles/index.css'
import '@/ui/styles/inkling-editor.css'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { InklingEditor, InklingHostComposer, blockQuoteAsideCycle, useEditorSurface } from '@kobato/inkling'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useHydrated } from '@kobato/ui/lib/use-hydrated'
import { FocusIcon } from 'lucide-react'
import { type ReactNode, useEffect, useMemo } from 'react'

import { registerKobatoImageInsertCommands } from '@/ui/editor/image-insert-override'
import { makePageEditorCardConfig } from '@/ui/editor/page-editor-card-config'
import { PAGE_EDITOR_NODES } from '@/ui/editor/page-editor-nodes'
import { pageEditorFileUploader } from '@/ui/editor/page-editor-upload'
import { useFocusModePreference } from '@/ui/editor/use-focus-mode'
import { useKobatoInklingLabels } from '@/ui/shared/use-inkling-labels'
export interface PageBodyEditorProps {
  initialBody: LexicalEditorState
  bodyKey: string
  onBodyChange: (body: LexicalEditorState) => void
  disabled?: boolean
  header?: ReactNode
}

export function PageBodyEditor(props: PageBodyEditorProps) {
  const { t } = useI18n()
  const hydrated = useHydrated()
  if (!hydrated) {
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
  const inklingLabels = useKobatoInklingLabels()
  const cardConfig = useMemo(() => makePageEditorCardConfig(t, localizeMessage), [t, localizeMessage])
  const [focusMode, toggleFocusMode] = useFocusModePreference()
  const { editorInstance, registerAPI, mountedInitialState, handleChange } = useEditorSurface({
    initialBody,
    bodyKey,
    onBodyChange,
  })

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
        <InklingHostComposer
          nodes={PAGE_EDITOR_NODES}
          initialEditorState={mountedInitialState}
          labels={inklingLabels}
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
        </InklingHostComposer>
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
