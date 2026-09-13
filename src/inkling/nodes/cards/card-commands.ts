import type { LexicalCommand } from 'lexical'

import { createCommand } from 'lexical'

import type { CardSpecNestedEditorDataset, CardSpecTransientDataset } from '@/inkling/nodes/base/card-specs'
import type { AudioData, audioTransientProps } from '@/inkling/nodes/base/nodes/audio/AudioNode'
import type {
  BookmarkData,
  bookmarkNestedEditors,
  bookmarkTransientProps,
} from '@/inkling/nodes/base/nodes/bookmark/BookmarkNode'
import type { ButtonData } from '@/inkling/nodes/base/nodes/button/ButtonNode'
import type { CalloutData, calloutNestedEditors } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
import type {
  CodeBlockData,
  codeBlockNestedEditors,
  codeBlockTransientProps,
} from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
import type { FileData, fileTransientProps } from '@/inkling/nodes/base/nodes/file/FileNode'
import type { GalleryData, galleryNestedEditors } from '@/inkling/nodes/base/nodes/gallery/GalleryNode'
import type { HeaderData, headerNestedEditors } from '@/inkling/nodes/base/nodes/header/HeaderNode'
import type { HtmlData } from '@/inkling/nodes/base/nodes/html/HtmlNode'
import type { ImageData, imageNestedEditors, imageTransientProps } from '@/inkling/nodes/base/nodes/image/ImageNode'
import type { MathData } from '@/inkling/nodes/base/nodes/math/MathNode'
import type { ToggleData, toggleNestedEditors } from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
import type { VideoData, videoNestedEditors, videoTransientProps } from '@/inkling/nodes/base/nodes/video/VideoNode'
import type { CardNodeType } from '@/inkling/nodes/cards'
import type { CardMenuCommand } from '@/inkling/nodes/cards/card-declaration'
import type { SnippetDataset } from '@/inkling/plugins/behaviour/snippet-insertion'

/**
 * The card insert commands — one React-free home, and a DERIVED VIEW over
 * the card declarations: declarations never import this module — their menu
 * entries and insert specs name commands by string (`CardMenuCommand` in
 * `@/inkling/nodes/cards/card-declaration`), and the resolution maps at the bottom
 * of this file key the command objects by card node type. Each command's
 * payload is the card's public `*NodeDataset`
 * type, DERIVED here from two registry-layer sources: the base node
 * module's `*Data` (the generated property vocabulary) intersected with the
 * base module's exported spec arrays through `CardSpecTransientDataset` /
 * `CardSpecNestedEditorDataset` (the transient/nested-editor vocabulary).
 * The shims re-export these types — no dataset vocabulary is hand-restated
 * in the wrapper layer, and this module never imports from there. The
 * derivation reads the spec ARRAYS (not `typeof declaration`) on purpose:
 * the spec arrays never reference the commands, and the imports above are
 * type-only, so the runtime module graph is untouched.
 * `OPEN_GIF_SELECTOR_COMMAND` is kept here for the Image card's
 * GIF menu entry; `@/inkling/plugins/InklingSelectorPlugin` re-exports it.
 * `OPEN_IMAGE_LIBRARY_COMMAND` shares the home for the Image card's media
 * library menu entry.
 * `INSERT_SNIPPET_COMMAND` shares the home: the snippet menu entry built by
 * `@/inkling/nodes/cards/card-menu-build` dispatches it through the same type-erased menu
 * insert path, while `@/inkling/plugins/InklingSnippetPlugin` keeps only the
 * registration and `@/inkling/plugins/behaviour/snippet-insertion` owns the
 * `SnippetDataset` payload type and the insertion surgery.
 */

export type AudioNodeDataset = AudioData & CardSpecTransientDataset<typeof audioTransientProps>
export const INSERT_AUDIO_COMMAND = createCommand<AudioNodeDataset>()

export type BookmarkNodeDataset = BookmarkData &
  CardSpecNestedEditorDataset<typeof bookmarkNestedEditors> &
  CardSpecTransientDataset<typeof bookmarkTransientProps> & {
    // AtLinkPlugin passes a top-level `title` alongside `url`; the base node
    // constructor only reads `metadata.title`, so this is a tolerated no-op field.
    title?: string
  }
export const INSERT_BOOKMARK_COMMAND = createCommand<BookmarkNodeDataset>()

export type ButtonNodeDataset = ButtonData
export const INSERT_BUTTON_COMMAND = createCommand<ButtonNodeDataset>('INSERT_BUTTON_COMMAND')

export type CalloutNodeDataset = CalloutData & CardSpecNestedEditorDataset<typeof calloutNestedEditors>
export const INSERT_CALLOUT_COMMAND = createCommand<CalloutNodeDataset>()

export type CodeBlockNodeDataset = CodeBlockData &
  CardSpecNestedEditorDataset<typeof codeBlockNestedEditors> &
  CardSpecTransientDataset<typeof codeBlockTransientProps>
export const INSERT_CODE_BLOCK_COMMAND = createCommand<CodeBlockNodeDataset>()

export type FileNodeDataset = FileData & CardSpecTransientDataset<typeof fileTransientProps>
export const INSERT_FILE_COMMAND = createCommand<FileNodeDataset>()

export type GalleryNodeDataset = GalleryData & CardSpecNestedEditorDataset<typeof galleryNestedEditors>
export const INSERT_GALLERY_COMMAND = createCommand<GalleryNodeDataset>()

export type HeaderNodeDataset = HeaderData & CardSpecNestedEditorDataset<typeof headerNestedEditors>
export const INSERT_HEADER_COMMAND = createCommand<HeaderNodeDataset>()

export const INSERT_HORIZONTAL_RULE_COMMAND = createCommand<undefined>()

export type HtmlNodeDataset = HtmlData
export const INSERT_HTML_COMMAND = createCommand<HtmlNodeDataset>()

export type ImageNodeDataset = ImageData &
  CardSpecNestedEditorDataset<typeof imageNestedEditors> &
  CardSpecTransientDataset<typeof imageTransientProps> & {
    // Drag-and-drop payload extras (formerly covered by a Record<string,
    // unknown> opening). Gallery drags carry the GalleryImage keys
    // useGalleryReorder picks into DraggableInfo.dataset — the image→gallery
    // merge (`@/inkling/plugins/behaviour/drop-surgery`) reads fileName back, row
    // just rides along from the pick.
    fileName?: string
    row?: number
    // Image-library picks map host-schema pass-through keys onto the insert
    // dataset (`@/inkling/components/ui/LibraryPlugin`.toImageDataset); the stock
    // declaration ignores them, a host card's own properties persist them.
    thumbhash?: string
    storagePath?: string
    imageId?: string
    // A dragged image CARD's payload is its getDataset(), which re-exposes
    // the datasetKey'd transient fields (generate-decorator-node's
    // appendTransientDataset), so they ride the drag payload too.
    __previewSrc?: string | null
    __triggerFileDialog?: boolean
  }
export const INSERT_IMAGE_COMMAND = createCommand<ImageNodeDataset>()

export type MathNodeDataset = MathData
export const INSERT_MATH_COMMAND = createCommand<MathNodeDataset>()

export const INSERT_SNIPPET_COMMAND = createCommand<SnippetDataset>('INSERT_SNIPPET_COMMAND')

export type ToggleNodeDataset = ToggleData & CardSpecNestedEditorDataset<typeof toggleNestedEditors>
export const INSERT_TOGGLE_COMMAND = createCommand<ToggleNodeDataset>('INSERT_TOGGLE_COMMAND')

export type VideoNodeDataset = VideoData &
  CardSpecNestedEditorDataset<typeof videoNestedEditors> &
  CardSpecTransientDataset<typeof videoTransientProps>
export const INSERT_VIDEO_COMMAND = createCommand<VideoNodeDataset>()

export const OPEN_GIF_SELECTOR_COMMAND = createCommand<ImageNodeDataset>()
export const OPEN_IMAGE_LIBRARY_COMMAND = createCommand<ImageNodeDataset>()

/**
 * The per-card insert commands keyed by card node type — the table the
 * declarations' `'insert'` menu command and their insert specs resolve
 * through. The declarations never name a command object; this map is where
 * the named constants meet the registry. Keyed with an exhaustive
 * `satisfies` Record over every card node type but the footnote definition's
 * (the one card with no insert command — the footnote behaviour module
 * creates and orders definitions), so adding a card declaration without its
 * command fails typecheck here. Host cards are not in this table: their
 * insert command is created on demand by `resolveCardInsertCommand` below.
 */
const BUILTIN_INSERT_COMMANDS = {
  audio: INSERT_AUDIO_COMMAND,
  bookmark: INSERT_BOOKMARK_COMMAND,
  button: INSERT_BUTTON_COMMAND,
  callout: INSERT_CALLOUT_COMMAND,
  codeblock: INSERT_CODE_BLOCK_COMMAND,
  file: INSERT_FILE_COMMAND,
  gallery: INSERT_GALLERY_COMMAND,
  header: INSERT_HEADER_COMMAND,
  horizontalrule: INSERT_HORIZONTAL_RULE_COMMAND,
  html: INSERT_HTML_COMMAND,
  image: INSERT_IMAGE_COMMAND,
  math: INSERT_MATH_COMMAND,
  toggle: INSERT_TOGGLE_COMMAND,
  video: INSERT_VIDEO_COMMAND,
} satisfies Record<Exclude<CardNodeType, 'footnotedefinition'>, LexicalCommand<unknown>>

/**
 * The named non-insert menu commands (`CardMenuCommand` minus `'insert'`) —
 * today exactly the Image card's two selector entries. Keyed exhaustively
 * over the name union so a new named extra fails typecheck until its command
 * joins.
 */
const NAMED_MENU_COMMANDS: Record<Exclude<CardMenuCommand, 'insert'>, LexicalCommand<unknown>> = {
  openGifSelector: OPEN_GIF_SELECTOR_COMMAND,
  openImageLibrary: OPEN_IMAGE_LIBRARY_COMMAND,
}

// Host card insert commands, created on demand and memoized — mirroring
// Lexical `createCommand`'s global idiom (host cards register at module top
// level, before their composer mounts). Memoization is what makes menu
// dispatch and command registration name the same object: every consumer
// resolves through the function below.
const hostInsertCommands = new Map<string, LexicalCommand<unknown>>()

/**
 * Resolves a card's insert command by node type: a built-in card answers
 * from the exhaustive table above; an unknown (host) node type gets one
 * command created and memoized on first resolution. The menu projection
 * (`@/inkling/nodes/cards/card-menus`) and the insert registrar
 * (`@/inkling/nodes/cards/card-insert-commands`) both resolve through this function,
 * so a card's menu dispatch and its command registration always name the
 * same object.
 */
export function resolveCardInsertCommand(nodeType: string): LexicalCommand<unknown> {
  const builtin = (BUILTIN_INSERT_COMMANDS as Partial<Record<string, LexicalCommand<unknown>>>)[nodeType]
  if (builtin !== undefined) {
    return builtin
  }
  let command = hostInsertCommands.get(nodeType)
  if (command === undefined) {
    command = createCommand()
    hostInsertCommands.set(nodeType, command)
  }
  return command
}

/**
 * Resolves a menu entry's named command (`CardMenuCommand`) to the command
 * object: `'insert'` names the entry's own card insert command (derived from
 * the card's node type); the extras name the Image card's selector commands.
 */
export function resolveCardMenuCommand(command: CardMenuCommand, nodeType: string): LexicalCommand<unknown> {
  return command === 'insert' ? resolveCardInsertCommand(nodeType) : NAMED_MENU_COMMANDS[command]
}
