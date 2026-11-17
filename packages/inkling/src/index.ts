import { ListPlugin } from '@lexical/react/LexicalListPlugin'

/* Components */
import InklingComposer from './components/InklingComposer'
import InklingEditor from './components/InklingEditor'
import InklingNestedComposer from './components/InklingNestedComposer'
/* Transformers */
import {
  CODE_BLOCK as CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
  ELEMENT_TRANSFORMERS,
  HR as HR_TRANSFORMER,
} from './markdown/transformers'
import { registerCardDecorateAdapter } from './nodes/decorate-card'
/* Nodes */
import DEFAULT_NODES, { EDITOR_BASE_NODES } from './nodes/DefaultNodes'
/* Plugins */
import CardInsertPlugin from './plugins/CardInsertPlugin'
import CardMenuPlugin from './plugins/CardMenuPlugin'
import CardPickerHostPlugin from './plugins/CardPickerHostPlugin'
import DefaultFeaturePlugins, { DEFAULT_FEATURE_PLUGINS } from './plugins/DefaultFeaturePlugins'
import DragDropPastePlugin from './plugins/DragDropPastePlugin'
import DragDropReorderPlugin from './plugins/DragDropReorderPlugin'
import EmEnDashPlugin from './plugins/EmEnDashPlugin'
import EmojiPickerPlugin from './plugins/EmojiPickerPlugin'
import ExternalControlPlugin from './plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from './plugins/FloatingToolbarPlugin'
import FootnotePlugin from './plugins/FootnotePlugin'
import HorizontalRulePlugin from './plugins/HorizontalRulePlugin'
import HtmlOutputPlugin from './plugins/HtmlOutputPlugin'
import InklingBehaviourPlugin from './plugins/InklingBehaviourPlugin'
import InklingSelectorPlugin from './plugins/InklingSelectorPlugin'
import InklingSnippetPlugin from './plugins/InklingSnippetPlugin'
import MarkdownShortcutPlugin from './plugins/MarkdownShortcutPlugin'
import MathInlinePlugin from './plugins/MathInlinePlugin'
import PlusCardMenuPlugin from './plugins/PlusCardMenuPlugin'
import ReplacementStringsPlugin from './plugins/ReplacementStringsPlugin'
import SlashCardMenuPlugin from './plugins/SlashCardMenuPlugin'
import TKCountPlugin from './plugins/TKCountPlugin'
import TypographyPlugin from './plugins/TypographyPlugin'
import WordCountPlugin from './plugins/WordCountPlugin'

/* Card decorate wiring: assembled card classes resolve decorate() through the
 * injection port in `@/inkling/nodes/card-decorate-slot`; this call fills the
 * slot for every full-entry consumer. Keep it an explicit entry-level
 * statement rather than a module side effect, so registration holds regardless
 * of the bundler's side-effect assumptions and the headless graph (which never
 * imports this barrel) stays free of the React component tree. */
registerCardDecorateAdapter()

/* The contract shared across entry surfaces (Lexical runtime types,
 * host-config types, labels, the library browser, the card-free composition
 * pieces, version) is single-sourced in ./shared-exports — add shared names
 * there, never here. */
export * from './shared-exports'

/* The defaulted composer's props are entry-specific: `nodes` is OPTIONAL
 * here (defaults to DEFAULT_NODES); the card-free `InklingComposerBase`
 * requires it. */
export type { InklingComposerProps } from './components/InklingComposer'
export type { InklingEditorProps } from './components/InklingEditor'
export type { InklingNestedComposerProps } from './components/InklingNestedComposer'
export type { PinturaConfig } from './hooks/usePinturaEditor'
export type { FeaturePluginEntry } from './plugins/DefaultFeaturePlugins'

/* The card family: node classes, guards, factories, dataset and serialized
 * types, and insert commands. A subset surface joins picked card classes with
 * EDITOR_BASE_NODES. */
export { CodeBlockNode, $createCodeBlockNode, $isCodeBlockNode, INSERT_CODE_BLOCK_COMMAND } from './nodes/CodeBlockNode'
export type { CodeBlockNodeDataset, SerializedCodeBlockNode } from './nodes/CodeBlockNode'
export { ImageNode, $createImageNode, $isImageNode, INSERT_IMAGE_COMMAND } from './nodes/ImageNode'
export type { ImageNodeDataset, SerializedImageNode } from './nodes/ImageNode'
export { VideoNode, $createVideoNode, $isVideoNode, INSERT_VIDEO_COMMAND } from './nodes/VideoNode'
export type { SerializedVideoNode, VideoNodeDataset } from './nodes/VideoNode'
export { AudioNode, $createAudioNode, $isAudioNode, INSERT_AUDIO_COMMAND } from './nodes/AudioNode'
export type { AudioNodeDataset, SerializedAudioNode } from './nodes/AudioNode'
export { CalloutNode, $createCalloutNode, $isCalloutNode, INSERT_CALLOUT_COMMAND } from './nodes/CalloutNode'
export type { CalloutNodeDataset, SerializedCalloutNode } from './nodes/CalloutNode'
export {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from './nodes/HorizontalRuleNode'
export { HtmlNode, $createHtmlNode, $isHtmlNode, INSERT_HTML_COMMAND } from './nodes/HtmlNode'
export type { HtmlNodeDataset, SerializedHtmlNode } from './nodes/HtmlNode'
export { FileNode, $createFileNode, $isFileNode, INSERT_FILE_COMMAND } from './nodes/FileNode'
export type { FileNodeDataset, SerializedFileNode } from './nodes/FileNode'
export { ToggleNode, $createToggleNode, $isToggleNode, INSERT_TOGGLE_COMMAND } from './nodes/ToggleNode'
export type { SerializedToggleNode, ToggleNodeDataset } from './nodes/ToggleNode'
export { ButtonNode, $createButtonNode, $isButtonNode, INSERT_BUTTON_COMMAND } from './nodes/ButtonNode'
export type { ButtonNodeDataset, SerializedButtonNode } from './nodes/ButtonNode'
export { HeaderNode, $createHeaderNode, $isHeaderNode, INSERT_HEADER_COMMAND } from './nodes/HeaderNode'
export type { HeaderNodeDataset } from './nodes/HeaderNode'
export { BookmarkNode, $createBookmarkNode, $isBookmarkNode, INSERT_BOOKMARK_COMMAND } from './nodes/BookmarkNode'
export type { BookmarkNodeDataset, SerializedBookmarkNode } from './nodes/BookmarkNode'
export { GalleryNode, $createGalleryNode, $isGalleryNode, INSERT_GALLERY_COMMAND } from './nodes/GalleryNode'
export type { GalleryNodeDataset, SerializedGalleryNode } from './nodes/GalleryNode'
export { MathNode, $createMathNode, $isMathNode, INSERT_MATH_COMMAND } from './nodes/MathNode'
export type { MathNodeDataset } from './nodes/MathNode'

/* Inline math is not a card (cards are block-level): the host owns the inline
 * editing UI and listens for EDIT_MATH_INLINE_COMMAND. */
export { $createMathInlineNode, $isMathInlineNode, MathInlineNode } from './nodes/math/MathInlineNode'
export type { MathInlineDataset, SerializedMathInlineNode } from './nodes/math/MathInlineNode'
export { EDIT_MATH_INLINE_COMMAND } from './plugins/behaviour/math-inline'

/* Footnotes: the inline ref (a TextNode entity — its text IS the citation
 * index) and the menu-less definition card. FootnotePlugin wires the
 * behaviour module that creates and orders them. */
export { $createFootnoteRefNode, $isFootnoteRefNode, FootnoteRefNode } from './nodes/footnote/FootnoteRefNode'
export type { SerializedFootnoteRefNode } from './nodes/footnote/FootnoteRefNode'
export {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './nodes/FootnoteDefinitionNode'
export type { FootnoteDefinitionNodeDataset } from './nodes/FootnoteDefinitionNode'

/* Host card pipeline: `defineCard` declares a card once and every derived view
 * (node class, menus, decorate target, insert registrar, toolbar label,
 * markdown fence) picks it up; `generateDecoratorNode` builds the base node the
 * declaration names. `EDITOR_BASE_NODES` is the non-card run a subset surface
 * composes with its picked card classes instead of forking DEFAULT_NODES. */
export { defineCard } from './nodes/cards/host-cards'
export type { HostCard, HostCardMenuEntrySpec, HostCardSpec } from './nodes/cards/host-cards'
/* The host-card node-set projection: every registered host card's assembled
 * class in registration order, so a host composes `...getHostCardNodes()` into
 * its node set instead of hand-spreading each handle's `node`. */
export { getHostCardNodes } from './nodes/cards/host-card-nodes'

/* The shared card-insert dispatch target: a host that intercepts a per-card
 * INSERT_* command to construct its own node class (kobato's KobatoImageNode;
 * the stock registration builds the declaration's assembled class and drops
 * host dataset keys) re-dispatches INSERT_CARD_COMMAND to reuse the same
 * selection/scroll choreography. DELETE_CARD_COMMAND is the removal half — a
 * host card's chrome dispatches it so removal gets the built-in
 * sibling-selection/focus handling instead of a bare node.remove(). */
export { DELETE_CARD_COMMAND, INSERT_CARD_COMMAND } from './plugins/behaviour/commands'
export type { InsertCardPayload } from './plugins/behaviour/types'

/* The image-library open command: with a host subclass registered for node
 * type `image` (KobatoImageNode), InklingSelectorPlugin's LOW-priority handler
 * still mounts — `hasNodes` gates on the TYPE — but would open inkling's
 * selector overlay. The host intercepts this command at HIGH priority to open
 * its own library dialog, then re-enters through INSERT_IMAGE_COMMAND. */
export { OPEN_IMAGE_LIBRARY_COMMAND } from './nodes/cards/card-commands'

/* Editor factory for host-side node tests: Lexical forbids constructing nodes
 * with no active editor. Source consumption resolves a single Lexical instance
 * for host and inkling alike, so this is one import for a test's whole node
 * kit. */
export { createHeadlessEditor } from '@lexical/headless'

export { generateDecoratorNode } from './nodes/base/generate-decorator-node'
export type {
  CardSpecAccessorMap,
  CardSpecFieldMap,
  CardSpecFieldMapFor,
  CardSpecFieldNames,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from './nodes/base/card-specs'
export { InklingDecoratorNode } from './nodes/base/InklingDecoratorNode'
export type { CardNodeClass } from './nodes/assemble-card-node'
// The render-context seam hosts write card renderers against; ExportDOMOutput
// flows through `@/inkling/nodes/base`.
export type { RenderContext } from './nodes/base/render-context'
// A host VARIANT subclassing an assembled card class (kobato's KobatoImageNode)
// overrides exportDOM and needs the entry-internal context factory:
// `renderFn(this, createRenderContext(options))`. React-free (it already sits
// in the headless graph via generateDecoratorNode), but the headless surface
// keeps it unexported — server-side projection classes are spec-built fresh and
// never delegate.
export { createRenderContext } from './nodes/base/render-context'
export type { ExportDOMOptions } from './nodes/base/export-dom'

export * from './utils'
export { lexicalStateToMarkdown, markdownToLexicalState } from './markdown'
export type { MarkdownRoundTripOptions } from './markdown/round-trip'
// The HTML/plain-text converters and their option/DOM types live ONLY on
// `@/inkling/headless`: headless-html reaches jsdom through headless-dom's
// lazy import, and re-exporting them here would drag jsdom (and undici) into
// the CLIENT module graph (pinned by
// tests/inkling/unit/html/jsdom-import-guard.test.ts).

export {
  InklingComposer,
  InklingEditor,
  InklingNestedComposer,
  DefaultFeaturePlugins,
  DEFAULT_FEATURE_PLUGINS,
  CardInsertPlugin,
  CardMenuPlugin,
  CardPickerHostPlugin,
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
