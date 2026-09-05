/**
 * Compile-time contract fixtures for card node datasets and insert commands.
 *
 * This file is included by the root tsconfig (unlike test/unit) and is only
 * type-checked — it is never executed and contains no runtime assertions.
 */
import type { EditorState, LexicalEditor } from 'lexical'

import { type AudioNodeDataset, INSERT_AUDIO_COMMAND } from '@/nodes/AudioNode'
import { type CodeBlockNodeDataset, INSERT_CODE_BLOCK_COMMAND } from '@/nodes/CodeBlockNode'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@/nodes/HorizontalRuleNode'
import { type HtmlNodeDataset, INSERT_HTML_COMMAND } from '@/nodes/HtmlNode'

declare const editor: LexicalEditor
declare const file: File
declare const captionEditor: LexicalEditor
declare const captionEditorInitialState: EditorState

// --- positive cases ---------------------------------------------------------

// file-upload card: transient `initialFile` alongside serialized fields
const fileUploadPayload = { src: 'https://example.com/a.mp3', initialFile: file } satisfies AudioNodeDataset
editor.dispatchCommand(INSERT_AUDIO_COMMAND, fileUploadPayload)

// nested-editor card: transient editor instances are part of the dataset
const nestedEditorPayload = {
  code: 'const a = 1',
  captionEditor,
  captionEditorInitialState,
} satisfies CodeBlockNodeDataset
editor.dispatchCommand(INSERT_CODE_BLOCK_COMMAND, nestedEditorPayload)

// plain data card: serialized fields only
const plainDataPayload = { html: '<p>hi</p>' } satisfies HtmlNodeDataset
editor.dispatchCommand(INSERT_HTML_COMMAND, plainDataPayload)

// payload-less command
editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)

// --- negative cases ---------------------------------------------------------

// @ts-expect-error - wrong primitive field type
const wrongPrimitive = { src: 123 } satisfies AudioNodeDataset
void wrongPrimitive

// @ts-expect-error - wrong editor field type
const wrongEditorField = { captionEditor: 'not-an-editor' } satisfies CodeBlockNodeDataset
void wrongEditorField

// @ts-expect-error - the horizontal rule command takes no payload
editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, { html: '<hr>' })
