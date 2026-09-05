/**
 * Compile-time contract fixtures for the public editor component API.
 *
 * This file is included by the root tsconfig (unlike test/unit) and is only
 * type-checked — it is never executed and contains no runtime assertions.
 */
import type { Transformer } from '@lexical/markdown'
import type { LexicalEditor, SerializedEditorState } from 'lexical'

import { ORDERED_LIST } from '@lexical/markdown'

import {
  BASIC_NODES,
  BASIC_TRANSFORMERS,
  type CardConfig,
  // @ts-expect-error - DesignSandbox was removed from the public barrel in 2.0.0
  DesignSandbox,
  DefaultFeaturePlugins,
  type ExternalControlAPI,
  type FileUploader,
  type FileUploaderInput,
  type GifSettings,
  // @ts-expect-error - InklingCardWrapper was removed from the public barrel in 2.0.0
  InklingCardWrapper,
  InklingComposableEditor,
  type InklingComposableEditorProps,
  InklingComposer,
  type InklingComposerProps,
  InklingEditor,
  type InklingEditorProps,
  type InklingInitialEditorState,
  InklingNestedComposer,
  type InklingNestedComposerProps,
  InklingSurface,
  type InklingSurfaceProps,
  type LinkingSettings,
  type ListOptionItem,
  type SearchResult,
  type SnippetItem,
  type SnippetSettings,
  type UploadSettings,
} from '@/index'

declare const nestedEditor: LexicalEditor
declare const serializedState: SerializedEditorState
declare const handleChange: (editorState: SerializedEditorState) => void
declare const handleApi: (api: ExternalControlAPI | null) => void

const customTransformers: readonly Transformer[] = [ORDERED_LIST, ...BASIC_TRANSFORMERS]

// --- positive cases ---------------------------------------------------------

// every InklingInitialEditorState shape is accepted
const stateFromString: InklingInitialEditorState =
  '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
const stateFromObject: InklingInitialEditorState = serializedState
const stateFromNull: InklingInitialEditorState = null
const stateFromInitializer: InklingInitialEditorState = () => {}
void stateFromString
void stateFromObject
void stateFromNull
void stateFromInitializer

const composerProps: InklingComposerProps = {
  darkMode: true,
  // a partial uploader (missing useFileUpload) is accepted for compatibility
  fileUploader: { fileTypes: { image: { mimeTypes: ['image/png'] } } },
  initialEditorState: serializedState,
}
void composerProps

const composer = (
  <InklingComposer initialEditorState={serializedState} nodes={BASIC_NODES} onError={(error) => void error}>
    {null}
  </InklingComposer>
)
void composer

const composableEditorProps: InklingComposableEditorProps = {
  markdownTransformers: customTransformers,
  onChange: handleChange,
  registerAPI: handleApi,
}
void composableEditorProps

const composableEditor = (
  <InklingComposableEditor
    markdownTransformers={customTransformers}
    onChange={handleChange}
    placeholderText="Start writing"
    registerAPI={handleApi}
  />
)
void composableEditor

const editorProps: InklingEditorProps = { onChange: handleChange, readOnly: true }
void editorProps

const editor = <InklingEditor onChange={handleChange} registerAPI={handleApi} />
void editor

const nestedComposerProps: InklingNestedComposerProps = {
  initialEditor: nestedEditor,
  // oxlint-disable-next-line typescript/no-deprecated -- this typecheck file intentionally pins the deprecated prop in the public API
  initialNodes: BASIC_NODES,
  skipEditableListener: true,
}
void nestedComposerProps

const nestedComposer = (
  <InklingNestedComposer
    initialEditor={nestedEditor}
    // oxlint-disable-next-line typescript/no-deprecated -- this typecheck file intentionally pins the deprecated prop in the public API
    initialNodes={BASIC_NODES}
    skipEditableListener={true}
  >
    {null}
  </InklingNestedComposer>
)
void nestedComposer

const surfaceProps: InklingSurfaceProps = { onChange: handleChange, readOnly: true }
void surfaceProps

// a host-composed custom surface through InklingSurface: shared-state wiring
// (one undo stack, top-level onChange routing) comes from the surface itself
const customSurface = (
  <InklingComposer initialEditorState={serializedState} nodes={BASIC_NODES} onError={(error) => void error}>
    <InklingSurface onChange={handleChange} placeholderText="Start writing">
      <DefaultFeaturePlugins />
    </InklingSurface>
  </InklingComposer>
)
void customSurface

// --- negative cases ---------------------------------------------------------

// @ts-expect-error - node lists must contain Lexical node classes or replacements
const invalidNodes = <InklingComposer nodes={[42]} />
void invalidNodes

// @ts-expect-error - markdown transformers must be Lexical Transformers
const invalidTransformer = <InklingComposableEditor markdownTransformers={[{ notATransformer: true }]} />
void invalidTransformer

// @ts-expect-error - onChange receives a SerializedEditorState, not a string
const wrongCallback = <InklingEditor onChange={(state: string) => void state} />
void wrongCallback

// @ts-expect-error - InklingSurface onChange receives a SerializedEditorState, not a string
const wrongSurfaceCallback = <InklingSurface onChange={(state: string) => void state} />
void wrongSurfaceCallback

// --- host-config type family (2.0.0) -----------------------------------------

const gifSettings: GifSettings = {
  klipy: { apiKey: 'key', contentFilter: 'high' },
  tenor: { googleApiKey: 'key', contentFilter: 'medium' },
}
const snippetItems: SnippetItem[] = [{ name: 'welcome', value: '{"root":{}}' }]
const snippetSettings: SnippetSettings = {
  snippets: snippetItems,
  createSnippet: ({ name, value }) => void (name + value),
  deleteSnippet: ({ name }) => Promise.resolve(void name),
}
const linkingSettings: LinkingSettings = {
  fetchAutocompleteLinks: () => Promise.resolve(undefined),
  fetchEmbed: (href) =>
    Promise.resolve({
      url: href,
      metadata: { author: '', icon: '', title: '', description: '', publisher: '', thumbnail: '' },
    }),
  searchLinks: (term) => Promise.resolve(term ? [] : undefined),
  siteUrl: 'https://example.com',
}
const uploadSettings: UploadSettings = { image: { allowedWidths: ['regular'] }, pinturaConfig: {} }

const searchResult: SearchResult = { label: 'Pages', items: [{ title: 'Home', url: 'https://example.com' }] }
const listOption: ListOptionItem = {
  label: 'Home',
  value: 'https://example.com',
  Icon: () => null,
  highlight: false,
  type: 'url',
}

const fileUploader: FileUploader = {
  useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
  fileTypes: { image: { mimeTypes: ['image/png'] } },
}
const fileUploaderInput: FileUploaderInput = { fileTypes: { image: { mimeTypes: ['image/png'] } } }

// a full closed CardConfig literal is accepted on InklingComposer
const cardConfig: CardConfig = {
  ...gifSettings,
  ...linkingSettings,
  ...snippetSettings,
  ...uploadSettings,
}
const composerWithConfig = (
  <InklingComposer cardConfig={cardConfig} fileUploader={fileUploader}>
    {null}
  </InklingComposer>
)
void composerWithConfig
void searchResult
void listOption
void fileUploaderInput
void DesignSandbox
void InklingCardWrapper

// @ts-expect-error - unknown cardConfig keys are rejected by the closed type
const composerWithUnknownKey = <InklingComposer cardConfig={{ membersEnabled: true }} />
void composerWithUnknownKey
