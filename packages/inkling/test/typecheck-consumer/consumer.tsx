/**
 * Clean-consumer type fixture for the published @inkling/editor declaration.
 *
 * This file is installed into isolated temp projects in
 * scripts/verify-packed-types.ts and type-checked against the packed tarball
 * only — it must not import from workspace aliases or undocumented paths.
 */
import {
  BASIC_TRANSFORMERS,
  type CardConfig,
  type CardNodeClass,
  DEFAULT_HTML_NODES,
  DEFAULT_NODES,
  defineCard,
  type DecoratorNodeProperty,
  // @ts-expect-error - DesignSandbox was removed from the public barrel in 2.0.0
  DesignSandbox,
  EDITOR_BASE_NODES,
  type ExportDOMDom,
  type ExternalControlAPI,
  type FileUploader,
  type FileUploaderInput,
  generateDecoratorNode,
  type GifSettings,
  type HostCard,
  type HostCardMenuEntrySpec,
  type HostCardSpec,
  type HtmlToLexicalStateOptions,
  htmlToLexicalState,
  // @ts-expect-error - InklingCardWrapper was removed from the public barrel in 2.0.0
  InklingCardWrapper,
  InklingComposer,
  InklingComposableEditor,
  type InklingComposableEditorProps,
  InklingDecoratorNode,
  InklingEditor,
  type InklingEditorProps,
  type InklingInitialEditorState,
  INSERT_AUDIO_COMMAND,
  type LexicalEditor,
  type LexicalStateToHtmlOptions,
  lexicalStateToHtml,
  type LexicalStateToPlainTextOptions,
  lexicalStateToPlainText,
  type LinkingSettings,
  type ListOptionItem,
  type MarkdownRoundTripOptions,
  markdownToLexicalState,
  type NestedEditorSpec,
  type SearchResult,
  type SerializedEditorState,
  type SnippetItem,
  type SnippetSettings,
  type TransientPropSpec,
  type UploadSettings,
  type AudioNodeDataset,
} from '@inkling/editor'

declare const serializedState: SerializedEditorState
declare const handleChange: (editorState: SerializedEditorState) => void
declare const handleApi: (api: ExternalControlAPI | null) => void
declare const editor: LexicalEditor
declare const file: File

// --- positive cases ---------------------------------------------------------

const stateFromString: InklingInitialEditorState =
  '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
const stateFromObject: InklingInitialEditorState = serializedState
const stateFromNull: InklingInitialEditorState = null
void stateFromString
void stateFromObject
void stateFromNull

const editorProps: InklingEditorProps = { onChange: handleChange, readOnly: true }
void editorProps

const composer = (
  <InklingComposer initialEditorState={serializedState} nodes={[]} onError={(error) => void error}>
    {null}
  </InklingComposer>
)
void composer

const composableProps: InklingComposableEditorProps = {
  markdownTransformers: BASIC_TRANSFORMERS,
  onChange: handleChange,
  registerAPI: handleApi,
}
void composableProps

const composableEditor = (
  <InklingComposableEditor
    markdownTransformers={BASIC_TRANSFORMERS}
    onChange={handleChange}
    placeholderText="Start writing"
    registerAPI={handleApi}
  />
)
void composableEditor

const typedInsertPayload: AudioNodeDataset = {
  src: 'https://example.com/audio.mp3',
  initialFile: file,
}
editor.dispatchCommand(INSERT_AUDIO_COMMAND, typedInsertPayload)

// --- negative cases ---------------------------------------------------------

// @ts-expect-error - onChange receives a SerializedEditorState, not a string
const wrongCallback = <InklingEditor onChange={(state: string) => void state} />
void wrongCallback

// @ts-expect-error - AudioNodeDataset.src must be a string
const badAudioPayload: AudioNodeDataset = { src: 123 }
void badAudioPayload

// @ts-expect-error - INSERT_AUDIO_COMMAND payload must match AudioNodeDataset
editor.dispatchCommand(INSERT_AUDIO_COMMAND, { html: '<p>not audio</p>' })

// --- host-config type family (2.0.0) -----------------------------------------

const gifSettings: GifSettings = {
  klipy: { apiKey: 'key', contentFilter: 'high' },
  tenor: { googleApiKey: 'key' },
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

// --- headless HTML API (C1) --------------------------------------------------

const htmlOptions: LexicalStateToHtmlOptions = {
  nodes: [...DEFAULT_HTML_NODES],
  onError: (error) => void error,
  siteUrl: 'https://example.com',
}
const renderedHtml: Promise<string> = lexicalStateToHtml(serializedState, htmlOptions)
void renderedHtml

const importOptions: HtmlToLexicalStateOptions = { dom: { window: { document } } }
const importedState: Promise<SerializedEditorState> = htmlToLexicalState('<p>hi</p>', importOptions)
void importedState

const plainTextOptions: LexicalStateToPlainTextOptions = { onError: (error) => void error }
const plainText: string = lexicalStateToPlainText(serializedState, plainTextOptions)
void plainText

// the structural DOM shape every headless option bag accepts
const structuralDom: ExportDOMDom = { window: { document } }
void structuralDom

// @ts-expect-error - LexicalStateToHtmlOptions is a closed type: unknown keys are rejected
const badHtmlOptions: LexicalStateToHtmlOptions = { unknownKey: true }
void badHtmlOptions

// --- host card pipeline (C3) -------------------------------------------------

// generateDecoratorNode builds the base node a host card declaration names;
// the spec language (properties, nested editors, transient props) is exported
const musicPlayerProperties = [{ name: 'src', default: '' }] as const satisfies readonly DecoratorNodeProperty[]
const nestedEditorSpec: NestedEditorSpec = { name: 'caption', serializedKey: 'caption', nodes: [] }
const transientPropSpec: TransientPropSpec = { name: 'initialFile' }
void nestedEditorSpec
void transientPropSpec

const musicPlayerMenuEntry: HostCardMenuEntrySpec = {
  label: 'Music',
  labelKey: 'music',
  // a built-in CardIconId names the icon; a component is accepted too
  icon: 'audio',
  // a raw host-defined LexicalCommand passes through …
  command: INSERT_AUDIO_COMMAND,
  matches: ['music'],
}

// … and the `'insert'` name resolves to the host card's own derived insert
// command — the same mechanism the built-in declarations use
const derivedCommandMenuEntry: HostCardMenuEntrySpec = {
  label: 'Music (derived)',
  labelKey: 'musicDerived',
  icon: 'audio',
  command: 'insert',
  matches: ['music derived'],
}

const musicPlayerSpec: HostCardSpec<'musicPlayer'> = {
  nodeType: 'musicPlayer',
  baseNode: generateDecoratorNode({ nodeType: 'musicPlayer', properties: musicPlayerProperties }),
  // presence is the opt-in — the insert command is derived from the node type
  insert: {},
  menu: [musicPlayerMenuEntry, derivedCommandMenuEntry],
  toolbarLabel: 'music-player',
  render: () => null,
}
const musicPlayer: HostCard<'musicPlayer'> = defineCard(musicPlayerSpec)

// the assembled class composes into the composer node set — full set or a
// subset over EDITOR_BASE_NODES
const composerWithHostCard = <InklingComposer nodes={[...DEFAULT_NODES, musicPlayer.node]}>{null}</InklingComposer>
void composerWithHostCard
const subsetNodes = [...EDITOR_BASE_NODES, musicPlayer.node]
void subsetNodes

// the assembled class satisfies the public class type and the
// InklingDecoratorNode contract
declare const someCardClass: CardNodeClass<InklingDecoratorNode>
void someCardClass
const isInklingDecorator = (node: unknown) => node instanceof InklingDecoratorNode
void isInklingDecorator

// a host card carrying a fence payload joins the markdown round-trip through
// the cards option
const roundTripOptions: MarkdownRoundTripOptions = { cards: [musicPlayer] }
const hostMarkdownState: SerializedEditorState = markdownToLexicalState('# hi', roundTripOptions)
void hostMarkdownState

// @ts-expect-error - a host card spec without its toolbarLabel is rejected
const badHostCardSpec: HostCardSpec = { nodeType: 'bad', baseNode: musicPlayerSpec.baseNode, render: () => null }
void badHostCardSpec
