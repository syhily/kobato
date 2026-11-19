import InklingComposer from '@kobato/inkling-internal/components/InklingComposer'
import InklingEditor from '@kobato/inkling-internal/components/InklingEditor'
import InklingNestedComposer from '@kobato/inkling-internal/components/InklingNestedComposer'
import {
  CODE_BLOCK as CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
  ELEMENT_TRANSFORMERS,
  HR as HR_TRANSFORMER,
} from '@kobato/inkling-internal/markdown/transformers'
import { registerCardDecorateAdapter } from '@kobato/inkling-internal/nodes/decorate-card'
import DEFAULT_NODES, { EDITOR_BASE_NODES } from '@kobato/inkling-internal/nodes/DefaultNodes'
import CardInsertPlugin from '@kobato/inkling-internal/plugins/CardInsertPlugin'
import CardMenuPlugin from '@kobato/inkling-internal/plugins/CardMenuPlugin'
import CardPickerHostPlugin from '@kobato/inkling-internal/plugins/CardPickerHostPlugin'
import DefaultFeaturePlugins, { DEFAULT_FEATURE_PLUGINS } from '@kobato/inkling-internal/plugins/DefaultFeaturePlugins'
import DragDropPastePlugin from '@kobato/inkling-internal/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@kobato/inkling-internal/plugins/DragDropReorderPlugin'
import EmEnDashPlugin from '@kobato/inkling-internal/plugins/EmEnDashPlugin'
import EmojiPickerPlugin from '@kobato/inkling-internal/plugins/EmojiPickerPlugin'
import ExternalControlPlugin from '@kobato/inkling-internal/plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from '@kobato/inkling-internal/plugins/FloatingToolbarPlugin'
import FootnotePlugin from '@kobato/inkling-internal/plugins/FootnotePlugin'
import HorizontalRulePlugin from '@kobato/inkling-internal/plugins/HorizontalRulePlugin'
import HtmlOutputPlugin from '@kobato/inkling-internal/plugins/HtmlOutputPlugin'
import InklingBehaviourPlugin from '@kobato/inkling-internal/plugins/InklingBehaviourPlugin'
import InklingSelectorPlugin from '@kobato/inkling-internal/plugins/InklingSelectorPlugin'
import InklingSnippetPlugin from '@kobato/inkling-internal/plugins/InklingSnippetPlugin'
import MarkdownShortcutPlugin from '@kobato/inkling-internal/plugins/MarkdownShortcutPlugin'
import MathInlinePlugin from '@kobato/inkling-internal/plugins/MathInlinePlugin'
import PlusCardMenuPlugin from '@kobato/inkling-internal/plugins/PlusCardMenuPlugin'
import ReplacementStringsPlugin from '@kobato/inkling-internal/plugins/ReplacementStringsPlugin'
import SlashCardMenuPlugin from '@kobato/inkling-internal/plugins/SlashCardMenuPlugin'
import TKCountPlugin from '@kobato/inkling-internal/plugins/TKCountPlugin'
import TypographyPlugin from '@kobato/inkling-internal/plugins/TypographyPlugin'
import WordCountPlugin from '@kobato/inkling-internal/plugins/WordCountPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'

registerCardDecorateAdapter()

export * from '@kobato/inkling-internal/shared-exports'

export type { InklingComposerProps } from '@kobato/inkling-internal/components/InklingComposer'
export type { InklingEditorProps } from '@kobato/inkling-internal/components/InklingEditor'
export type { InklingNestedComposerProps } from '@kobato/inkling-internal/components/InklingNestedComposer'
export type { PinturaConfig } from '@kobato/inkling-internal/hooks/usePinturaEditor'
export type { FeaturePluginEntry } from '@kobato/inkling-internal/plugins/DefaultFeaturePlugins'

export {
  CodeBlockNode,
  $createCodeBlockNode,
  $isCodeBlockNode,
  INSERT_CODE_BLOCK_COMMAND,
} from '@kobato/inkling-internal/nodes/CodeBlockNode'
export type { CodeBlockNodeDataset, SerializedCodeBlockNode } from '@kobato/inkling-internal/nodes/CodeBlockNode'
export {
  ImageNode,
  $createImageNode,
  $isImageNode,
  INSERT_IMAGE_COMMAND,
} from '@kobato/inkling-internal/nodes/ImageNode'
export type { ImageNodeDataset, SerializedImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
export {
  VideoNode,
  $createVideoNode,
  $isVideoNode,
  INSERT_VIDEO_COMMAND,
} from '@kobato/inkling-internal/nodes/VideoNode'
export type { SerializedVideoNode, VideoNodeDataset } from '@kobato/inkling-internal/nodes/VideoNode'
export {
  AudioNode,
  $createAudioNode,
  $isAudioNode,
  INSERT_AUDIO_COMMAND,
} from '@kobato/inkling-internal/nodes/AudioNode'
export type { AudioNodeDataset, SerializedAudioNode } from '@kobato/inkling-internal/nodes/AudioNode'
export {
  CalloutNode,
  $createCalloutNode,
  $isCalloutNode,
  INSERT_CALLOUT_COMMAND,
} from '@kobato/inkling-internal/nodes/CalloutNode'
export type { CalloutNodeDataset, SerializedCalloutNode } from '@kobato/inkling-internal/nodes/CalloutNode'
export {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@kobato/inkling-internal/nodes/HorizontalRuleNode'
export { HtmlNode, $createHtmlNode, $isHtmlNode, INSERT_HTML_COMMAND } from '@kobato/inkling-internal/nodes/HtmlNode'
export type { HtmlNodeDataset, SerializedHtmlNode } from '@kobato/inkling-internal/nodes/HtmlNode'
export { FileNode, $createFileNode, $isFileNode, INSERT_FILE_COMMAND } from '@kobato/inkling-internal/nodes/FileNode'
export type { FileNodeDataset, SerializedFileNode } from '@kobato/inkling-internal/nodes/FileNode'
export {
  ToggleNode,
  $createToggleNode,
  $isToggleNode,
  INSERT_TOGGLE_COMMAND,
} from '@kobato/inkling-internal/nodes/ToggleNode'
export type { SerializedToggleNode, ToggleNodeDataset } from '@kobato/inkling-internal/nodes/ToggleNode'
export {
  ButtonNode,
  $createButtonNode,
  $isButtonNode,
  INSERT_BUTTON_COMMAND,
} from '@kobato/inkling-internal/nodes/ButtonNode'
export type { ButtonNodeDataset, SerializedButtonNode } from '@kobato/inkling-internal/nodes/ButtonNode'
export {
  HeaderNode,
  $createHeaderNode,
  $isHeaderNode,
  INSERT_HEADER_COMMAND,
} from '@kobato/inkling-internal/nodes/HeaderNode'
export type { HeaderNodeDataset } from '@kobato/inkling-internal/nodes/HeaderNode'
export {
  BookmarkNode,
  $createBookmarkNode,
  $isBookmarkNode,
  INSERT_BOOKMARK_COMMAND,
} from '@kobato/inkling-internal/nodes/BookmarkNode'
export type { BookmarkNodeDataset, SerializedBookmarkNode } from '@kobato/inkling-internal/nodes/BookmarkNode'
export {
  GalleryNode,
  $createGalleryNode,
  $isGalleryNode,
  INSERT_GALLERY_COMMAND,
} from '@kobato/inkling-internal/nodes/GalleryNode'
export type { GalleryNodeDataset, SerializedGalleryNode } from '@kobato/inkling-internal/nodes/GalleryNode'
export { MathNode, $createMathNode, $isMathNode, INSERT_MATH_COMMAND } from '@kobato/inkling-internal/nodes/MathNode'
export type { MathNodeDataset } from '@kobato/inkling-internal/nodes/MathNode'

export {
  $createMathInlineNode,
  $isMathInlineNode,
  MathInlineNode,
} from '@kobato/inkling-internal/nodes/math/MathInlineNode'
export type { MathInlineDataset, SerializedMathInlineNode } from '@kobato/inkling-internal/nodes/math/MathInlineNode'
export { EDIT_MATH_INLINE_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/math-inline'

export {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
  FootnoteRefNode,
} from '@kobato/inkling-internal/nodes/footnote/FootnoteRefNode'
export type { SerializedFootnoteRefNode } from '@kobato/inkling-internal/nodes/footnote/FootnoteRefNode'
export {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from '@kobato/inkling-internal/nodes/FootnoteDefinitionNode'
export type { FootnoteDefinitionNodeDataset } from '@kobato/inkling-internal/nodes/FootnoteDefinitionNode'

export { defineCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
export type { HostCard, HostCardMenuEntrySpec, HostCardSpec } from '@kobato/inkling-internal/nodes/cards/host-cards'

export { getHostCardNodes } from '@kobato/inkling-internal/nodes/cards/host-card-nodes'
export { DELETE_CARD_COMMAND, INSERT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
export type { InsertCardPayload } from '@kobato/inkling-internal/plugins/behaviour/types'

export { OPEN_IMAGE_LIBRARY_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'

/* Editor factory for host-side node tests: Lexical forbids constructing nodes
 * with no active editor. Source consumption resolves a single Lexical instance
 * for host and inkling alike, so this is one import for a test's whole node
 * kit. */
export { createHeadlessEditor } from '@lexical/headless'

export { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
export type {
  CardSpecAccessorMap,
  CardSpecFieldMap,
  CardSpecFieldMapFor,
  CardSpecFieldNames,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
export { InklingDecoratorNode } from '@kobato/inkling-internal/nodes/base/InklingDecoratorNode'
export type { CardNodeClass } from '@kobato/inkling-internal/nodes/assemble-card-node'

export type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
// A host VARIANT subclassing an assembled card class (kobato's KobatoImageNode)
// overrides exportDOM and needs the entry-internal context factory:
// `renderFn(this, createRenderContext(options))`. React-free (it already sits
// in the headless graph via generateDecoratorNode), but the headless surface
// keeps it unexported — server-side projection classes are spec-built fresh and
// never delegate.
export { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
export type { ExportDOMOptions } from '@kobato/inkling-internal/nodes/base/export-dom'
export * from '@kobato/inkling-internal/utils'
export { lexicalStateToMarkdown, markdownToLexicalState } from '@kobato/inkling-internal/markdown'
export type { MarkdownRoundTripOptions } from '@kobato/inkling-internal/markdown/round-trip'

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
