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
//   inkling's internal overlay).
// - `page-editor-upload` — paste/drop/file-dialog uploads through
//   `orpc.admin.images.upload` (a tiptap-era non-feature, now wired).
// - `page-editor-card-config` / `render-math` — image width policy, library
//   menu visibility, and the debounced server KaTeX preview channel.
// - `use-focus-mode` — the writing-focus toggle (focus UX is host-owned).
// - Music picking: slash inserts an empty `music-player` card; clicking its
//   placeholder opens `MusicPickerDialog` via `MusicPickContext` and the pick
//   writes `playerId` back onto the node.
//
// SSR: the inkling tree mounts only after hydration (`useHydrated`) — the
// placeholder below is what the server and the first client render agree on
// (the `immediatelyRender: false` placeholder of the tiptap era).

import '@/styles/inkling-editor.css'
import type { ExternalControlAPI, LexicalEditor, SerializedEditorState } from '@inkling/editor'

import { InklingComposer, InklingEditor, INSERT_IMAGE_COMMAND } from '@inkling/editor'
import { FocusIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AdminImageDto } from '@/shared/contracts/images'
import type { AdminMusicDto } from '@/shared/contracts/music'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { MusicPickContext, type MusicPickTarget } from '@/client/editor/cards/music-pick-context'
import { registerKobatoImageInsertCommands, toSiteOwnedImageSrc } from '@/client/editor/image-insert-override'
import { inklingLabels } from '@/client/editor/inkling-labels'
import { pageEditorCardConfig } from '@/client/editor/page-editor-card-config'
import { PAGE_EDITOR_NODES } from '@/client/editor/page-editor-nodes'
import { pageEditorFileUploader } from '@/client/editor/page-editor-upload'
import { useFocusModePreference } from '@/client/editor/use-focus-mode'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'
import { MusicPickerDialog } from '@/ui/admin/editor/pickers/MusicPickerDialog'
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
}

export function PageBodyEditor(props: PageBodyEditorProps) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        编辑器正在加载…
      </div>
    )
  }
  return <PageBodyEditorClient {...props} />
}

/** inkling's Ctrl+Q cycles paragraph → quote → aside; AsideNode is not
 *  registered in this composer (the storage whitelist rejects 'aside'), so
 *  the chord is captured on the wrapper before Lexical's KEY_DOWN dispatch
 *  (which rides a bubble-phase listener on the contentEditable root). */
function blockQuoteAsideCycle(event: React.KeyboardEvent) {
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyQ') {
    event.preventDefault()
    event.stopPropagation()
  }
}

function PageBodyEditorClient({ initialBody, bodyKey, onBodyChange, disabled }: PageBodyEditorProps) {
  const onBodyChangeRef = useRef(onBodyChange)
  useEffect(() => {
    onBodyChangeRef.current = onBodyChange
  })

  const { resolvedTheme } = useTheme()
  const [focusMode, toggleFocusMode] = useFocusModePreference()

  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null)
  const registerAPI = useCallback((api: ExternalControlAPI | null) => {
    setEditorInstance(api?.editorInstance ?? null)
  }, [])

  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [musicPickerOpen, setMusicPickerOpen] = useState(false)
  const musicPickTargetRef = useRef<MusicPickTarget | null>(null)

  // The stock image handlers mount on the shared 'image' type but would
  // build the stock class — intercept at HIGH for the editor's lifetime.
  useEffect(() => {
    if (editorInstance === null) {
      return
    }
    return registerKobatoImageInsertCommands(editorInstance, () => setImagePickerOpen(true))
  }, [editorInstance])

  // Lexical consumes the initial state only at editor creation; the lazy
  // state pins the mount-time snapshot (later initialBody prop changes must
  // NOT recreate the composer). Re-seeding on a bodyKey change (draft adopt,
  // conflict resolution) is imperative.
  const [mountedInitialState] = useState(() => initialBody)
  const lastResetKeyRef = useRef(bodyKey)
  useEffect(() => {
    if (editorInstance === null || lastResetKeyRef.current === bodyKey) {
      return
    }
    lastResetKeyRef.current = bodyKey
    editorInstance.setEditorState(editorInstance.parseEditorState(initialBody))
  }, [editorInstance, bodyKey, initialBody])

  const insertLibraryImage = useCallback(
    (image: AdminImageDto) => {
      const editor = editorInstance
      if (editor === null) {
        return
      }
      // Re-enters through the override's HIGH INSERT_IMAGE_COMMAND handler,
      // so the card is a KobatoImageNode carrying all four kobato keys.
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        src: toSiteOwnedImageSrc(image.publicUrl),
        alt: image.note ?? '',
        width: image.width,
        height: image.height,
        thumbhash: image.thumbhash ?? undefined,
        storagePath: image.storagePath,
        imageId: image.id,
      })
    },
    [editorInstance],
  )

  const openMusicPicker = useCallback((target: MusicPickTarget) => {
    musicPickTargetRef.current = target
    setMusicPickerOpen(true)
  }, [])

  const pickMusic = useCallback(
    (music: AdminMusicDto) => {
      const editor = editorInstance
      const target = musicPickTargetRef.current
      musicPickTargetRef.current = null
      if (editor === null || target === null) {
        return
      }
      try {
        editor.update(() => {
          target.playerId = music.playerId
        })
      } catch {
        // The card was deleted while the dialog was open — drop the pick.
      }
    },
    [editorInstance],
  )

  const handleChange = useCallback((state: SerializedEditorState) => {
    // The one narrowing boundary: inkling hands the stock
    // SerializedEditorState; kobato's LexicalEditorState is the same JSON
    // (schema.ts's WireCheck pins the extension) and the server re-validates
    // on save, so the per-keystroke path casts instead of zod-parsing.
    onBodyChangeRef.current(unsafeCast<LexicalEditorState>(state))
  }, [])

  return (
    <div
      className="kobato-page-editor relative flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-xl border bg-card"
      onKeyDownCapture={blockQuoteAsideCycle}
    >
      <div data-kobato-editor-scroll="" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <MusicPickContext value={openMusicPicker}>
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
            />
          </InklingComposer>
        </MusicPickContext>
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
      <ImageLibraryPicker open={imagePickerOpen} onOpenChange={setImagePickerOpen} onPick={insertLibraryImage} />
      <MusicPickerDialog open={musicPickerOpen} onOpenChange={setMusicPickerOpen} onPick={pickMusic} />
    </div>
  )
}
