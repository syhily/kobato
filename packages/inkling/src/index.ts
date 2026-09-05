import { ListPlugin } from '@lexical/react/LexicalListPlugin'

/* Components */
import InklingComposer from '@/components/InklingComposer'
import InklingEditor from '@/components/InklingEditor'
import InklingNestedComposer from '@/components/InklingNestedComposer'
/* Transformers */
import {
  CODE_BLOCK as CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
  ELEMENT_TRANSFORMERS,
  HR as HR_TRANSFORMER,
} from '@/markdown/transformers'
/* Nodes */
import DEFAULT_NODES, { EDITOR_BASE_NODES } from '@/nodes/DefaultNodes'
/* Plugins */
import CardInsertPlugin from '@/plugins/CardInsertPlugin'
import CardMenuPlugin from '@/plugins/CardMenuPlugin'
import DefaultFeaturePlugins, { DEFAULT_FEATURE_PLUGINS } from '@/plugins/DefaultFeaturePlugins'
import DragDropPastePlugin from '@/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@/plugins/DragDropReorderPlugin'
import EmEnDashPlugin from '@/plugins/EmEnDashPlugin'
import EmojiPickerPlugin from '@/plugins/EmojiPickerPlugin'
import ExternalControlPlugin from '@/plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from '@/plugins/FloatingToolbarPlugin'
import FootnotePlugin from '@/plugins/FootnotePlugin'
import HorizontalRulePlugin from '@/plugins/HorizontalRulePlugin'
import HtmlOutputPlugin from '@/plugins/HtmlOutputPlugin'
import InklingBehaviourPlugin from '@/plugins/InklingBehaviourPlugin'
import InklingSelectorPlugin from '@/plugins/InklingSelectorPlugin'
import InklingSnippetPlugin from '@/plugins/InklingSnippetPlugin'
import MarkdownShortcutPlugin from '@/plugins/MarkdownShortcutPlugin'
import MathInlinePlugin from '@/plugins/MathInlinePlugin'
import PlusCardMenuPlugin from '@/plugins/PlusCardMenuPlugin'
import ReplacementStringsPlugin from '@/plugins/ReplacementStringsPlugin'
import SlashCardMenuPlugin from '@/plugins/SlashCardMenuPlugin'
import TKCountPlugin from '@/plugins/TKCountPlugin'
import WordCountPlugin from '@/plugins/WordCountPlugin'

/* Exports ------------------------------------------------------------------ */

/* The contract shared with the `./core` entry (Lexical runtime types,
 * host-config types, labels, the library browser, the card-free composition
 * pieces, version) is single-sourced in ./shared-exports — add shared names
 * there, never here. */
export * from './shared-exports'

/* The defaulted composer's props are entry-specific: `nodes` is OPTIONAL
 * here (defaults to DEFAULT_NODES), required on the `./core` variant. */
export type { InklingComposerProps } from '@/components/InklingComposer'
export type { InklingEditorProps } from '@/components/InklingEditor'
export type { InklingNestedComposerProps } from '@/components/InklingNestedComposer'
export type { PinturaConfig } from '@/hooks/usePinturaEditor'
export type { FeaturePluginEntry } from '@/plugins/DefaultFeaturePlugins'

/* The card family (declaration order): node classes, guards, factories,
 * dataset and serialized types, and insert commands — everything CONTEXT.md's
 * "editor surface" composition promise needs (subset surfaces join picked
 * card classes with EDITOR_BASE_NODES). */
export { CodeBlockNode, $createCodeBlockNode, $isCodeBlockNode, INSERT_CODE_BLOCK_COMMAND } from '@/nodes/CodeBlockNode'
export type { CodeBlockNodeDataset, SerializedCodeBlockNode } from '@/nodes/CodeBlockNode'
export { ImageNode, $createImageNode, $isImageNode, INSERT_IMAGE_COMMAND } from '@/nodes/ImageNode'
export type { ImageNodeDataset, SerializedImageNode } from '@/nodes/ImageNode'
export { VideoNode, $createVideoNode, $isVideoNode, INSERT_VIDEO_COMMAND } from '@/nodes/VideoNode'
export type { SerializedVideoNode, VideoNodeDataset } from '@/nodes/VideoNode'
export { AudioNode, $createAudioNode, $isAudioNode, INSERT_AUDIO_COMMAND } from '@/nodes/AudioNode'
export type { AudioNodeDataset, SerializedAudioNode } from '@/nodes/AudioNode'
export { CalloutNode, $createCalloutNode, $isCalloutNode, INSERT_CALLOUT_COMMAND } from '@/nodes/CalloutNode'
export type { CalloutNodeDataset, SerializedCalloutNode } from '@/nodes/CalloutNode'
export {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@/nodes/HorizontalRuleNode'
export { HtmlNode, $createHtmlNode, $isHtmlNode, INSERT_HTML_COMMAND } from '@/nodes/HtmlNode'
export type { HtmlNodeDataset, SerializedHtmlNode } from '@/nodes/HtmlNode'
export { FileNode, $createFileNode, $isFileNode, INSERT_FILE_COMMAND } from '@/nodes/FileNode'
export type { FileNodeDataset, SerializedFileNode } from '@/nodes/FileNode'
export { ToggleNode, $createToggleNode, $isToggleNode, INSERT_TOGGLE_COMMAND } from '@/nodes/ToggleNode'
export type { SerializedToggleNode, ToggleNodeDataset } from '@/nodes/ToggleNode'
export { ButtonNode, $createButtonNode, $isButtonNode, INSERT_BUTTON_COMMAND } from '@/nodes/ButtonNode'
export type { ButtonNodeDataset, SerializedButtonNode } from '@/nodes/ButtonNode'
export { HeaderNode, $createHeaderNode, $isHeaderNode, INSERT_HEADER_COMMAND } from '@/nodes/HeaderNode'
export type { HeaderNodeDataset } from '@/nodes/HeaderNode'
export { BookmarkNode, $createBookmarkNode, $isBookmarkNode, INSERT_BOOKMARK_COMMAND } from '@/nodes/BookmarkNode'
export type { BookmarkNodeDataset, SerializedBookmarkNode } from '@/nodes/BookmarkNode'
export { GalleryNode, $createGalleryNode, $isGalleryNode, INSERT_GALLERY_COMMAND } from '@/nodes/GalleryNode'
export type { GalleryNodeDataset, SerializedGalleryNode } from '@/nodes/GalleryNode'
export { MathNode, $createMathNode, $isMathNode, INSERT_MATH_COMMAND } from '@/nodes/MathNode'
export type { MathNodeDataset } from '@/nodes/MathNode'

/* Inline math (not a card — cards are block-level): the host owns the inline
 * editing UI and listens for EDIT_MATH_INLINE_COMMAND. */
export { $createMathInlineNode, $isMathInlineNode, MathInlineNode } from '@/nodes/math/MathInlineNode'
export type { MathInlineDataset, SerializedMathInlineNode } from '@/nodes/math/MathInlineNode'
export { EDIT_MATH_INLINE_COMMAND } from '@/plugins/behaviour/math-inline'

/* Footnotes: the inline ref (a TextNode entity — its text IS the citation
 * index) and the menu-less definition card, created and ordered by the
 * footnote behaviour module (`FootnotePlugin` wires it on a surface). */
export { $createFootnoteRefNode, $isFootnoteRefNode, FootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
export type { SerializedFootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
export {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from '@/nodes/FootnoteDefinitionNode'
export type { FootnoteDefinitionNodeDataset } from '@/nodes/FootnoteDefinitionNode'

/* Host card pipeline (CONTEXT.md: "host card"): `defineCard` declares a card
 * once and every derived view (node class, menus, decorate target, insert
 * registrar, toolbar label, markdown fence) picks it up;
 * `generateDecoratorNode` builds the base node the declaration names.
 * `EDITOR_BASE_NODES` is the non-card run a subset surface composes with its
 * picked card classes instead of forking DEFAULT_NODES. */
export { defineCard } from '@/nodes/cards/host-cards'
export type { HostCard, HostCardMenuEntrySpec, HostCardSpec } from '@/nodes/cards/host-cards'
export { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
export type {
  CardSpecAccessorMap,
  CardSpecFieldMap,
  CardSpecFieldNames,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/nodes/base/card-specs'
export { InklingDecoratorNode } from '@/nodes/base/InklingDecoratorNode'
export type { CardNodeClass } from '@/nodes/assemble-card-node'
// the render-context seam hosts write card renderers against (defineCard
// docs name it in prose; ExportDOMOutput flows through `@/nodes/base`)
export type { RenderContext } from '@/nodes/base/render-context'

export * from '@/utils'
export { lexicalStateToMarkdown, markdownToLexicalState } from '@/markdown'
export type { MarkdownRoundTripOptions } from '@/markdown/round-trip'
export {
  htmlToLexicalState,
  lexicalStateToHtml,
  lexicalStateToPlainText,
  DEFAULT_HTML_NODES,
} from '@/html/headless-html'
export type {
  HtmlToLexicalStateOptions,
  LexicalStateToHtmlOptions,
  LexicalStateToPlainTextOptions,
} from '@/html/headless-html'
export type { ExportDOMDom, ExportPolicyKey } from '@/nodes/base'

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
  WordCountPlugin,
  DEFAULT_NODES,
  EDITOR_BASE_NODES,
  ELEMENT_TRANSFORMERS,
  HR_TRANSFORMER,
  CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
}
