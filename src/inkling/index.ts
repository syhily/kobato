import { ListPlugin } from '@lexical/react/LexicalListPlugin'

/* Components */
import InklingComposer from '@/inkling/components/InklingComposer'
import InklingEditor from '@/inkling/components/InklingEditor'
import InklingNestedComposer from '@/inkling/components/InklingNestedComposer'
/* Transformers */
import {
  CODE_BLOCK as CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
  ELEMENT_TRANSFORMERS,
  HR as HR_TRANSFORMER,
} from '@/inkling/markdown/transformers'
import { registerCardDecorateAdapter } from '@/inkling/nodes/decorate-card'
/* Nodes */
import DEFAULT_NODES, { EDITOR_BASE_NODES } from '@/inkling/nodes/DefaultNodes'
/* Plugins */
import CardInsertPlugin from '@/inkling/plugins/CardInsertPlugin'
import CardMenuPlugin from '@/inkling/plugins/CardMenuPlugin'
import DefaultFeaturePlugins, { DEFAULT_FEATURE_PLUGINS } from '@/inkling/plugins/DefaultFeaturePlugins'
import DragDropPastePlugin from '@/inkling/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@/inkling/plugins/DragDropReorderPlugin'
import EmEnDashPlugin from '@/inkling/plugins/EmEnDashPlugin'
import EmojiPickerPlugin from '@/inkling/plugins/EmojiPickerPlugin'
import ExternalControlPlugin from '@/inkling/plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from '@/inkling/plugins/FloatingToolbarPlugin'
import FootnotePlugin from '@/inkling/plugins/FootnotePlugin'
import HorizontalRulePlugin from '@/inkling/plugins/HorizontalRulePlugin'
import HtmlOutputPlugin from '@/inkling/plugins/HtmlOutputPlugin'
import InklingBehaviourPlugin from '@/inkling/plugins/InklingBehaviourPlugin'
import InklingSelectorPlugin from '@/inkling/plugins/InklingSelectorPlugin'
import InklingSnippetPlugin from '@/inkling/plugins/InklingSnippetPlugin'
import MarkdownShortcutPlugin from '@/inkling/plugins/MarkdownShortcutPlugin'
import MathInlinePlugin from '@/inkling/plugins/MathInlinePlugin'
import PlusCardMenuPlugin from '@/inkling/plugins/PlusCardMenuPlugin'
import ReplacementStringsPlugin from '@/inkling/plugins/ReplacementStringsPlugin'
import SlashCardMenuPlugin from '@/inkling/plugins/SlashCardMenuPlugin'
import TKCountPlugin from '@/inkling/plugins/TKCountPlugin'
import TypographyPlugin from '@/inkling/plugins/TypographyPlugin'
import WordCountPlugin from '@/inkling/plugins/WordCountPlugin'

/* Exports ------------------------------------------------------------------ */

/* Card decorate wiring (plan 039 + the `./headless` split): assembled card
 * classes resolve decorate() through the injection port in
 * `@/inkling/nodes/card-decorate-slot`; this call fills the slot for every
 * full-entry consumer. It is an explicit entry-level statement — not a
 * module side effect — so the bundler can keep dropping the wrapper layer
 * from the `./core`/`./headless` graphs (the package's sideEffects table
 * covers CSS only). */
registerCardDecorateAdapter()

/* The contract shared with the `./core` entry (Lexical runtime types,
 * host-config types, labels, the library browser, the card-free composition
 * pieces, version) is single-sourced in ./shared-exports — add shared names
 * there, never here. */
export * from '@/inkling/shared-exports'

/* The defaulted composer's props are entry-specific: `nodes` is OPTIONAL
 * here (defaults to DEFAULT_NODES), required on the `./core` variant. */
export type { InklingComposerProps } from '@/inkling/components/InklingComposer'
export type { InklingEditorProps } from '@/inkling/components/InklingEditor'
export type { InklingNestedComposerProps } from '@/inkling/components/InklingNestedComposer'
export type { PinturaConfig } from '@/inkling/hooks/usePinturaEditor'
export type { FeaturePluginEntry } from '@/inkling/plugins/DefaultFeaturePlugins'

/* The card family (declaration order): node classes, guards, factories,
 * dataset and serialized types, and insert commands — everything CONTEXT.md's
 * "editor surface" composition promise needs (subset surfaces join picked
 * card classes with EDITOR_BASE_NODES). */
export {
  CodeBlockNode,
  $createCodeBlockNode,
  $isCodeBlockNode,
  INSERT_CODE_BLOCK_COMMAND,
} from '@/inkling/nodes/CodeBlockNode'
export type { CodeBlockNodeDataset, SerializedCodeBlockNode } from '@/inkling/nodes/CodeBlockNode'
export { ImageNode, $createImageNode, $isImageNode, INSERT_IMAGE_COMMAND } from '@/inkling/nodes/ImageNode'
export type { ImageNodeDataset, SerializedImageNode } from '@/inkling/nodes/ImageNode'
export { VideoNode, $createVideoNode, $isVideoNode, INSERT_VIDEO_COMMAND } from '@/inkling/nodes/VideoNode'
export type { SerializedVideoNode, VideoNodeDataset } from '@/inkling/nodes/VideoNode'
export { AudioNode, $createAudioNode, $isAudioNode, INSERT_AUDIO_COMMAND } from '@/inkling/nodes/AudioNode'
export type { AudioNodeDataset, SerializedAudioNode } from '@/inkling/nodes/AudioNode'
export { CalloutNode, $createCalloutNode, $isCalloutNode, INSERT_CALLOUT_COMMAND } from '@/inkling/nodes/CalloutNode'
export type { CalloutNodeDataset, SerializedCalloutNode } from '@/inkling/nodes/CalloutNode'
export {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@/inkling/nodes/HorizontalRuleNode'
export { HtmlNode, $createHtmlNode, $isHtmlNode, INSERT_HTML_COMMAND } from '@/inkling/nodes/HtmlNode'
export type { HtmlNodeDataset, SerializedHtmlNode } from '@/inkling/nodes/HtmlNode'
export { FileNode, $createFileNode, $isFileNode, INSERT_FILE_COMMAND } from '@/inkling/nodes/FileNode'
export type { FileNodeDataset, SerializedFileNode } from '@/inkling/nodes/FileNode'
export { ToggleNode, $createToggleNode, $isToggleNode, INSERT_TOGGLE_COMMAND } from '@/inkling/nodes/ToggleNode'
export type { SerializedToggleNode, ToggleNodeDataset } from '@/inkling/nodes/ToggleNode'
export { ButtonNode, $createButtonNode, $isButtonNode, INSERT_BUTTON_COMMAND } from '@/inkling/nodes/ButtonNode'
export type { ButtonNodeDataset, SerializedButtonNode } from '@/inkling/nodes/ButtonNode'
export { HeaderNode, $createHeaderNode, $isHeaderNode, INSERT_HEADER_COMMAND } from '@/inkling/nodes/HeaderNode'
export type { HeaderNodeDataset } from '@/inkling/nodes/HeaderNode'
export {
  BookmarkNode,
  $createBookmarkNode,
  $isBookmarkNode,
  INSERT_BOOKMARK_COMMAND,
} from '@/inkling/nodes/BookmarkNode'
export type { BookmarkNodeDataset, SerializedBookmarkNode } from '@/inkling/nodes/BookmarkNode'
export { GalleryNode, $createGalleryNode, $isGalleryNode, INSERT_GALLERY_COMMAND } from '@/inkling/nodes/GalleryNode'
export type { GalleryNodeDataset, SerializedGalleryNode } from '@/inkling/nodes/GalleryNode'
export { MathNode, $createMathNode, $isMathNode, INSERT_MATH_COMMAND } from '@/inkling/nodes/MathNode'
export type { MathNodeDataset } from '@/inkling/nodes/MathNode'

/* Inline math (not a card — cards are block-level): the host owns the inline
 * editing UI and listens for EDIT_MATH_INLINE_COMMAND. */
export { $createMathInlineNode, $isMathInlineNode, MathInlineNode } from '@/inkling/nodes/math/MathInlineNode'
export type { MathInlineDataset, SerializedMathInlineNode } from '@/inkling/nodes/math/MathInlineNode'
export { EDIT_MATH_INLINE_COMMAND } from '@/inkling/plugins/behaviour/math-inline'

/* Footnotes: the inline ref (a TextNode entity — its text IS the citation
 * index) and the menu-less definition card, created and ordered by the
 * footnote behaviour module (`FootnotePlugin` wires it on a surface). */
export { $createFootnoteRefNode, $isFootnoteRefNode, FootnoteRefNode } from '@/inkling/nodes/footnote/FootnoteRefNode'
export type { SerializedFootnoteRefNode } from '@/inkling/nodes/footnote/FootnoteRefNode'
export {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from '@/inkling/nodes/FootnoteDefinitionNode'
export type { FootnoteDefinitionNodeDataset } from '@/inkling/nodes/FootnoteDefinitionNode'

/* Host card pipeline (CONTEXT.md: "host card"): `defineCard` declares a card
 * once and every derived view (node class, menus, decorate target, insert
 * registrar, toolbar label, markdown fence) picks it up;
 * `generateDecoratorNode` builds the base node the declaration names.
 * `EDITOR_BASE_NODES` is the non-card run a subset surface composes with its
 * picked card classes instead of forking DEFAULT_NODES. */
export { defineCard } from '@/inkling/nodes/cards/host-cards'
export type { HostCard, HostCardMenuEntrySpec, HostCardSpec } from '@/inkling/nodes/cards/host-cards'

/* The shared card-insert dispatch target: a host that intercepts a per-card
 * INSERT_* command to construct its OWN node class (kobato's KobatoImageNode
 * — the stock registration in CardInsertPlugin constructs the declaration's
 * assembled class, silently dropping host-declared dataset keys) hands its
 * instance to the same selection/scroll choreography the built-in path uses
 * by re-dispatching INSERT_CARD_COMMAND. The per-card INSERT_* commands ride
 * the shim exports above. */
export { INSERT_CARD_COMMAND } from '@/inkling/plugins/behaviour/commands'
export type { OpenCardInEditModePayload } from '@/inkling/plugins/behaviour/types'

/* The image-library open command (kobato R11): with a host subclass
 * registered for node type `image` (KobatoImageNode), InklingSelectorPlugin's
 * LOW-priority handler still mounts — `hasNodes` gates on the TYPE — but
 * would open inkling's selector overlay (LibraryPlugin is entry-internal).
 * The host intercepts this command at HIGH priority to open its own library
 * dialog instead, then re-enters through INSERT_IMAGE_COMMAND. */
export { OPEN_IMAGE_LIBRARY_COMMAND } from '@/inkling/nodes/cards/card-commands'

/* Editor factory for host-side node tests (kobato R11): Lexical 0.46's
 * constructor invariants forbid constructing nodes with no active editor,
 * and this bundle INLINES its own Lexical copy — an external
 * `@lexical/headless` would carry a second module state (getActiveEditor)
 * and could never host these classes. Re-exporting the bundled factory is
 * the only way a host test constructs registered nodes. */
export { createHeadlessEditor } from '@lexical/headless'

export { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
export type {
  CardSpecAccessorMap,
  CardSpecFieldMap,
  CardSpecFieldNames,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'
export { InklingDecoratorNode } from '@/inkling/nodes/base/InklingDecoratorNode'
export type { CardNodeClass } from '@/inkling/nodes/assemble-card-node'
// the render-context seam hosts write card renderers against (defineCard
// docs name it in prose; ExportDOMOutput flows through `@/inkling/nodes/base`)
export type { RenderContext } from '@/inkling/nodes/base/render-context'

export * from '@/inkling/utils'
export { lexicalStateToMarkdown, markdownToLexicalState } from '@/inkling/markdown'
export type { MarkdownRoundTripOptions } from '@/inkling/markdown/round-trip'
export {
  htmlToLexicalState,
  lexicalStateToHtml,
  lexicalStateToPlainText,
  DEFAULT_HTML_NODES,
} from '@/inkling/html/headless-html'
export type {
  HtmlToLexicalStateOptions,
  LexicalStateToHtmlOptions,
  LexicalStateToPlainTextOptions,
} from '@/inkling/html/headless-html'
export type { ExportDOMDom, ExportPolicyKey } from '@/inkling/nodes/base'

export {
  InklingComposer,
  InklingEditor,
  InklingNestedComposer,
  DefaultFeaturePlugins,
  DEFAULT_FEATURE_PLUGINS,
  CardInsertPlugin,
  CardMenuPlugin,
  DragDropPastePlugin,
  DragDropReorderPlugin,
  EmEnDashPlugin,
  EmojiPickerPlugin,
  ExternalControlPlugin,
  FloatingToolbarPlugin,
  FootnotePlugin,
  HorizontalRulePlugin,
  HtmlOutputPlugin,
  InklingBehaviourPlugin,
  InklingSelectorPlugin,
  InklingSnippetPlugin,
  ListPlugin,
  MarkdownShortcutPlugin,
  MathInlinePlugin,
  PlusCardMenuPlugin,
  ReplacementStringsPlugin,
  SlashCardMenuPlugin,
  TKCountPlugin,
  TypographyPlugin,
  WordCountPlugin,
  DEFAULT_NODES,
  EDITOR_BASE_NODES,
  ELEMENT_TRANSFORMERS,
  HR_TRANSFORMER,
  CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
}
