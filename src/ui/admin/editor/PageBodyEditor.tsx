// The page/article body editor (R11, plan
// docs/plans/inkling-editor-replacement.md M3): the tiptap micro-app is
// replaced by inkling's full surface (`InklingComposer` + `InklingEditor`)
// with kobato host glue — no fixed toolbar, no live preview; insertion is
// slash/plus driven and the canvas is the WYSIWYG render.
//
// Host wiring, one module per concern under `@/client/editor/`:
// - `page-editor-nodes` — the composer node set (AsideNode filtered;
//   KobatoImageNode replaces the stock image card by type).
// - `image-insert-override` — HIGH-priority INSERT_IMAGE_COMMAND /
//   OPEN_IMAGE_LIBRARY_COMMAND handlers (the stock LOW handlers still mount
//   on the shared `image` type but would build the stock class / open
//   inkling's internal overlay). The library pick itself rides the inkling
//   pick seam (`image-library-pick` registers the 'image' picker): the
//   override inserts the empty card with the `openPicker` payload flag and
//   the seam opens `ImageLibraryPicker` on it. No editor-level dialog wiring
//   remains here.
// - `page-editor-upload` — paste/drop/file-dialog uploads through
//   `orpc.admin.images.upload` (a tiptap-era non-feature, now wired).
// - `page-editor-card-config` / `render-math` — image width policy, library
//   menu visibility, and the debounced server KaTeX preview channel.
// - `use-focus-mode` — the writing-focus toggle (focus UX is host-owned).
// - `block-quote-aside-cycle` / `use-editor-body-reset` — the Ctrl+Q capture
//   and the body mount-snapshot/reseed glue shared with the comment surface.
// - Music picking: the `music-player` card declares its picker on its
//   defineCard spec (inkling's pick seam) — the slash insert auto-opens
//   `MusicPickerDialog` on the fresh node, and the placeholder/replace
//   chrome reopens it. No editor-level wiring remains here.
//
// SSR: the inkling tree mounts only after hydration (`useHydrated`) — the
// placeholder below is what the server and the first client render agree on
// (the `immediatelyRender: false` placeholder of the tiptap era).

import '@/styles/inkling-editor.css'
import { FocusIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ExternalControlAPI, LexicalEditor } from '@/inkling'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { blockQuoteAsideCycle } from '@/client/editor/block-quote-aside-cycle'
import { registerKobatoImageInsertCommands } from '@/client/editor/image-insert-override'
import { inklingLabels } from '@/client/editor/inkling-labels'
import { pageEditorCardConfig } from '@/client/editor/page-editor-card-config'
import { PAGE_EDITOR_NODES } from '@/client/editor/page-editor-nodes'
import { pageEditorFileUploader } from '@/client/editor/page-editor-upload'
import { useEditorBodyReset } from '@/client/editor/use-editor-body-reset'
import { useFocusModePreference } from '@/client/editor/use-focus-mode'
import { InklingComposer, InklingEditor } from '@/inkling'
import { Button } from '@/ui/components/button'
import { useTheme } from '@/ui/lib/ThemeProvider'
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
  const hydrated = useHydrated()
  if (!hydrated) {
    // SSR/hydration placeholder: same shell + scroll container as the hydrated
    // tree so the header (title/slug strip) renders identically on the server.
    return (
      <div className="kobato-page-editor relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <div data-kobato-editor-scroll="" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {props.header}
          <div className="flex items-center justify-center p-4 py-24 text-sm text-muted-foreground">
            编辑器正在加载…
          </div>
        </div>
      </div>
    )
  }
  return <PageBodyEditorClient {...props} />
}

function PageBodyEditorClient({ initialBody, bodyKey, onBodyChange, disabled, header }: PageBodyEditorProps) {
  const { resolvedTheme } = useTheme()
  const [focusMode, toggleFocusMode] = useFocusModePreference()

  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null)
  const registerAPI = useCallback((api: ExternalControlAPI | null) => {
    setEditorInstance(api?.editorInstance ?? null)
  }, [])

  const { mountedInitialState, handleChange } = useEditorBodyReset(editorInstance, initialBody, bodyKey, onBodyChange)

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
        <InklingComposer
          nodes={PAGE_EDITOR_NODES}
          initialEditorState={mountedInitialState}
          fileUploader={pageEditorFileUploader}
          cardConfig={pageEditorCardConfig}
          labels={inklingLabels}
          darkMode={resolvedTheme === 'dark'}
          dragScrollContainerSelector="[data-kobato-editor-scroll]"
        >
          <InklingEditor
            readOnly={disabled === true}
            focusMode={focusMode}
            registerAPI={registerAPI}
            onChange={handleChange}
            placeholderText="在此处开始编写内容…（/ 命令菜单，^ 空格插入脚注）"
            placeholderClassName="kobato-page-placeholder"
            contentEditableClassName="typeset typeset-post"
          />
        </InklingComposer>
      </div>
      <div className="absolute right-3 bottom-3 z-30">
        <Button
          type="button"
          variant={focusMode ? 'secondary' : 'outline'}
          size="icon"
          title={focusMode ? '关闭书写聚焦' : '开启书写聚焦'}
          aria-pressed={focusMode}
          onClick={toggleFocusMode}
        >
          <FocusIcon />
        </Button>
      </div>
    </div>
  )
}
