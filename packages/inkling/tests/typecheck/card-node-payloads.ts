import type { EditorState, LexicalEditor } from 'lexical'

import { type AudioNodeDataset, INSERT_AUDIO_COMMAND } from '@kobato/inkling-internal/nodes/AudioNode'
import { type CodeBlockNodeDataset, INSERT_CODE_BLOCK_COMMAND } from '@kobato/inkling-internal/nodes/CodeBlockNode'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@kobato/inkling-internal/nodes/HorizontalRuleNode'
import { type HtmlNodeDataset, INSERT_HTML_COMMAND } from '@kobato/inkling-internal/nodes/HtmlNode'

declare const editor: LexicalEditor
declare const file: File
declare const captionEditor: LexicalEditor
declare const captionEditorInitialState: EditorState

const fileUploadPayload = { src: 'https://example.com/a.mp3', initialFile: file } satisfies AudioNodeDataset
editor.dispatchCommand(INSERT_AUDIO_COMMAND, fileUploadPayload)

const nestedEditorPayload = {
  code: 'const a = 1',
  captionEditor,
  captionEditorInitialState,
} satisfies CodeBlockNodeDataset
editor.dispatchCommand(INSERT_CODE_BLOCK_COMMAND, nestedEditorPayload)

const plainDataPayload = { html: '<p>hi</p>' } satisfies HtmlNodeDataset
editor.dispatchCommand(INSERT_HTML_COMMAND, plainDataPayload)

editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)

// @ts-expect-error - wrong primitive field type
const wrongPrimitive = { src: 123 } satisfies AudioNodeDataset
void wrongPrimitive

// @ts-expect-error - wrong editor field type
const wrongEditorField = { captionEditor: 'not-an-editor' } satisfies CodeBlockNodeDataset
void wrongEditorField

// @ts-expect-error - the horizontal rule command takes no payload
editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, { html: '<hr>' })
