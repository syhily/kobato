import { ListPlugin } from '@lexical/react/LexicalListPlugin'

/* Components */
import DesignSandbox from '@/ui/inkling-editor/components/DesignSandbox'
import EmailEditor, {
  EMAIL_EDITOR_CARD_CONFIG,
  getEmailEditorCardConfig,
} from '@/ui/inkling-editor/components/EmailEditor'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import InklingComposableEditor from '@/ui/inkling-editor/components/InklingComposableEditor'
import InklingComposer from '@/ui/inkling-editor/components/InklingComposer'
import InklingEditor from '@/ui/inkling-editor/components/InklingEditor'
import InklingNestedComposer from '@/ui/inkling-editor/components/InklingNestedComposer'
/* Nodes */
import BASIC_NODES from '@/ui/inkling-editor/nodes/BasicNodes'
import DEFAULT_NODES from '@/ui/inkling-editor/nodes/DefaultNodes'
import EMAIL_EDITOR_NODES from '@/ui/inkling-editor/nodes/EmailEditorNodes'
import EMAIL_NODES from '@/ui/inkling-editor/nodes/EmailNodes'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
/* Plugins */
import AllDefaultPlugins from '@/ui/inkling-editor/plugins/AllDefaultPlugins'
import AudioPlugin from '@/ui/inkling-editor/plugins/AudioPlugin'
import BookmarkPlugin from '@/ui/inkling-editor/plugins/BookmarkPlugin'
import ButtonPlugin from '@/ui/inkling-editor/plugins/ButtonPlugin'
import CalloutPlugin from '@/ui/inkling-editor/plugins/CalloutPlugin'
import CardMenuPlugin from '@/ui/inkling-editor/plugins/CardMenuPlugin'
import DragDropPastePlugin from '@/ui/inkling-editor/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@/ui/inkling-editor/plugins/DragDropReorderPlugin'
import EmEnDashPlugin from '@/ui/inkling-editor/plugins/EmEnDashPlugin'
import EmojiPickerPlugin from '@/ui/inkling-editor/plugins/EmojiPickerPlugin'
import ExternalControlPlugin from '@/ui/inkling-editor/plugins/ExternalControlPlugin'
import FilePlugin from '@/ui/inkling-editor/plugins/FilePlugin'
import FloatingToolbarPlugin from '@/ui/inkling-editor/plugins/FloatingToolbarPlugin'
import GalleryPlugin from '@/ui/inkling-editor/plugins/GalleryPlugin'
import HeaderPlugin from '@/ui/inkling-editor/plugins/HeaderPlugin'
import HorizontalRulePlugin from '@/ui/inkling-editor/plugins/HorizontalRulePlugin'
import HtmlOutputPlugin from '@/ui/inkling-editor/plugins/HtmlOutputPlugin'
import HtmlPlugin from '@/ui/inkling-editor/plugins/HtmlPlugin'
import ImagePlugin from '@/ui/inkling-editor/plugins/ImagePlugin'
import InklingBehaviourPlugin from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import InklingSelectorPlugin from '@/ui/inkling-editor/plugins/InklingSelectorPlugin'
import InklingSnippetPlugin from '@/ui/inkling-editor/plugins/InklingSnippetPlugin'
/* Transformers */
import MarkdownShortcutPlugin, {
  BASIC_TRANSFORMERS,
  CODE_BLOCK as CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
  ELEMENT_TRANSFORMERS,
  EMAIL_TRANSFORMERS,
  HR as HR_TRANSFORMER,
  MINIMAL_TRANSFORMERS,
} from '@/ui/inkling-editor/plugins/MarkdownShortcutPlugin'
import PlusCardMenuPlugin from '@/ui/inkling-editor/plugins/PlusCardMenuPlugin'
import ReplacementStringsPlugin from '@/ui/inkling-editor/plugins/ReplacementStringsPlugin'
import RestrictContentPlugin from '@/ui/inkling-editor/plugins/RestrictContentPlugin'
import SlashCardMenuPlugin from '@/ui/inkling-editor/plugins/SlashCardMenuPlugin'
import TKCountPlugin from '@/ui/inkling-editor/plugins/TKCountPlugin'
import TogglePlugin from '@/ui/inkling-editor/plugins/TogglePlugin'
import VideoPlugin from '@/ui/inkling-editor/plugins/VideoPlugin'
import WordCountPlugin from '@/ui/inkling-editor/plugins/WordCountPlugin'

/* Exports ------------------------------------------------------------------ */

export * from '@/ui/inkling-editor/utils'

export {
  DesignSandbox,
  EmailEditor,
  InklingComposableEditor,
  InklingComposer,
  InklingEditor,
  InklingNestedComposer,
  InklingCardWrapper,
  AllDefaultPlugins,
  AudioPlugin,
  BookmarkPlugin,
  ButtonPlugin,
  CalloutPlugin,
  CardMenuPlugin,
  DragDropPastePlugin,
  DragDropReorderPlugin,
  EmEnDashPlugin,
  EmojiPickerPlugin,
  ExternalControlPlugin,
  FilePlugin,
  FloatingToolbarPlugin,
  GalleryPlugin,
  HeaderPlugin,
  HorizontalRulePlugin,
  HtmlOutputPlugin,
  HtmlPlugin,
  ImagePlugin,
  InklingBehaviourPlugin,
  InklingSelectorPlugin,
  InklingSnippetPlugin,
  ListPlugin,
  MarkdownShortcutPlugin,
  PlusCardMenuPlugin,
  ReplacementStringsPlugin,
  RestrictContentPlugin,
  SlashCardMenuPlugin,
  TKCountPlugin,
  TogglePlugin,
  VideoPlugin,
  WordCountPlugin,
  DEFAULT_NODES,
  BASIC_NODES,
  EMAIL_EDITOR_NODES,
  EMAIL_NODES,
  MINIMAL_NODES,
  EMAIL_EDITOR_CARD_CONFIG,
  ELEMENT_TRANSFORMERS,
  HR_TRANSFORMER,
  CODE_BLOCK_TRANSFORMER,
  DEFAULT_TRANSFORMERS,
  BASIC_TRANSFORMERS,
  EMAIL_TRANSFORMERS,
  MINIMAL_TRANSFORMERS,
  getEmailEditorCardConfig,
}

export const version = __APP_VERSION__ ? __APP_VERSION__ : 'development'
