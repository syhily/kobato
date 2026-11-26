import type { Transformer } from '@lexical/markdown'
import type { LexicalEditor, SerializedEditorState } from 'lexical'

import {
  BASIC_NODES,
  BASIC_TRANSFORMERS,
  type CardConfig,
  // @ts-expect-error - DesignSandbox is not exported from the public barrel
  DesignSandbox as _DesignSandbox,
  DefaultFeaturePlugins,
  type ExternalControlAPI,
  type FileUploader,
  type FileUploaderInput,
  type GifSettings,
  // @ts-expect-error - InklingCardWrapper is not exported from the public barrel
  InklingCardWrapper as _InklingCardWrapper,
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
} from '@kobato/inkling-internal/index'
import { ORDERED_LIST } from '@lexical/markdown'

declare const nestedEditor: LexicalEditor
declare const serializedState: SerializedEditorState
declare const handleChange: (editorState: SerializedEditorState) => void
declare const handleApi: (api: ExternalControlAPI | null) => void

const customTransformers: readonly Transformer[] = [ORDERED_LIST, ...BASIC_TRANSFORMERS]

const _stateFromString: InklingInitialEditorState =
  '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
const _stateFromObject: InklingInitialEditorState = serializedState
const _stateFromNull: InklingInitialEditorState = null
const _stateFromInitializer: InklingInitialEditorState = () => {}

const _composerProps: InklingComposerProps = {
  darkMode: true,
  fileUploader: { fileTypes: { image: { mimeTypes: ['image/png'] } } },
  initialEditorState: serializedState,
}

const _composer = (
  <InklingComposer initialEditorState={serializedState} nodes={BASIC_NODES} onError={(_error) => {}}>
    {null}
  </InklingComposer>
)

const _composableEditorProps: InklingComposableEditorProps = {
  markdownTransformers: customTransformers,
  onChange: handleChange,
  registerAPI: handleApi,
}

const _composableEditor = (
  <InklingComposableEditor
    markdownTransformers={customTransformers}
    onChange={handleChange}
    placeholderText="Start writing"
    registerAPI={handleApi}
  />
)

const _editorProps: InklingEditorProps = { onChange: handleChange, readOnly: true }

const _editor = <InklingEditor onChange={handleChange} registerAPI={handleApi} />

const _nestedComposerProps: InklingNestedComposerProps = {
  initialEditor: nestedEditor,
  initialNodes: BASIC_NODES,
  skipEditableListener: true,
}

const _nestedComposer = (
  <InklingNestedComposer initialEditor={nestedEditor} initialNodes={BASIC_NODES} skipEditableListener={true}>
    {null}
  </InklingNestedComposer>
)

const _surfaceProps: InklingSurfaceProps = { onChange: handleChange, readOnly: true }

const _customSurface = (
  <InklingComposer initialEditorState={serializedState} nodes={BASIC_NODES} onError={(_error) => {}}>
    <InklingSurface onChange={handleChange} placeholderText="Start writing">
      <DefaultFeaturePlugins />
    </InklingSurface>
  </InklingComposer>
)

// @ts-expect-error - node lists must contain Lexical node classes or replacements
const _invalidNodes = <InklingComposer nodes={[42]} />

// @ts-expect-error - markdown transformers must be Lexical Transformers
const _invalidTransformer = <InklingComposableEditor markdownTransformers={[{ notATransformer: true }]} />

// @ts-expect-error - onChange receives a SerializedEditorState, not a string
const _wrongCallback = <InklingEditor onChange={(_state: string) => {}} />

// @ts-expect-error - InklingSurface onChange receives a SerializedEditorState, not a string
const _wrongSurfaceCallback = <InklingSurface onChange={(_state: string) => {}} />

const gifSettings: GifSettings = {
  klipy: { apiKey: 'key', contentFilter: 'high' },
  tenor: { googleApiKey: 'key', contentFilter: 'medium' },
}
const snippetItems: SnippetItem[] = [{ name: 'welcome', value: '{"root":{}}' }]
const snippetSettings: SnippetSettings = {
  snippets: snippetItems,
  createSnippet: ({ name: _name, value: _value }) => {},
  deleteSnippet: async ({ name: _name }) => {},
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

const _searchResult: SearchResult = { label: 'Pages', items: [{ title: 'Home', url: 'https://example.com' }] }
const _listOption: ListOptionItem = {
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
const _fileUploaderInput: FileUploaderInput = { fileTypes: { image: { mimeTypes: ['image/png'] } } }

const cardConfig: CardConfig = {
  ...gifSettings,
  ...linkingSettings,
  ...snippetSettings,
  ...uploadSettings,
}
const _composerWithConfig = (
  <InklingComposer cardConfig={cardConfig} fileUploader={fileUploader}>
    {null}
  </InklingComposer>
)

// @ts-expect-error - unknown cardConfig keys are rejected by the closed type
const _composerWithUnknownKey = <InklingComposer cardConfig={{ membersEnabled: true }} />
