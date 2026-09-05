import type { EditorState, LexicalEditor } from 'lexical'

/**
 * Transient client-side fields shared by card nodes that keep a nested
 * caption editor instance on the node. These fields are never serialized
 * to JSON — captions are exported as cleaned HTML instead.
 */
export interface CaptionEditorDataset {
  captionEditor?: LexicalEditor
  captionEditorInitialState?: EditorState
}
