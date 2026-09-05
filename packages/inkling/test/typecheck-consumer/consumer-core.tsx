/**
 * Clean-consumer type fixture for the published @inkling/editor/core
 * declaration (plan C5).
 *
 * This file is installed into isolated temp projects in
 * scripts/verify-packed-types.ts and type-checked against the packed tarball
 * only — it must not import from workspace aliases or undocumented paths.
 */
import {
  BASIC_NODES,
  BASIC_TRANSFORMERS,
  type CardConfig,
  // @ts-expect-error - DEFAULT_NODES is not part of the card-free core entry
  DEFAULT_NODES,
  type EditorState,
  type ExternalControlAPI,
  type FileUploader,
  InklingComposableEditor,
  type InklingComposableEditorProps,
  InklingComposer,
  type InklingComposerProps,
  type InklingInitialEditorState,
  InklingSurface,
  type InklingSurfaceProps,
  type LexicalEditor,
  MINIMAL_NODES,
  MINIMAL_TRANSFORMERS,
  RestrictContentPlugin,
  type SerializedEditorState,
  type Transformer,
  version,
} from '@inkling/editor/core'

declare const serializedState: SerializedEditorState
declare const handleChange: (editorState: SerializedEditorState) => void
declare const handleApi: (api: ExternalControlAPI | null) => void
declare const editor: LexicalEditor

// --- positive cases ---------------------------------------------------------

const stateFromString: InklingInitialEditorState =
  '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
const stateFromObject: InklingInitialEditorState = serializedState
const stateFromNull: InklingInitialEditorState = null
void stateFromString
void stateFromObject
void stateFromNull

const composerProps: InklingComposerProps = {
  nodes: [...MINIMAL_NODES],
  initialEditorState: serializedState,
  darkMode: false,
}
void composerProps

const surfaceProps: InklingSurfaceProps = {
  markdownTransformers: MINIMAL_TRANSFORMERS,
  onChange: handleChange,
  registerAPI: handleApi,
  singleParagraph: true,
  isDragEnabled: false,
}
void surfaceProps

// the documented comment-level composition (plan C5 §3): every import comes
// from the core entry
const fileUploader: FileUploader = {
  useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
}
const cardConfig: CardConfig = {}
const commentEditor = (
  <InklingComposer
    nodes={MINIMAL_NODES}
    initialEditorState={serializedState}
    cardConfig={cardConfig}
    fileUploader={fileUploader}
  >
    <InklingSurface
      onChange={handleChange}
      singleParagraph
      markdownTransformers={MINIMAL_TRANSFORMERS}
      isDragEnabled={false}
    />
  </InklingComposer>
)
void commentEditor

const basicComposer = <InklingComposer nodes={BASIC_NODES}>{null}</InklingComposer>
void basicComposer

const composableProps: InklingComposableEditorProps = {
  markdownTransformers: BASIC_TRANSFORMERS,
  onChange: handleChange,
}
void composableProps

const restricted = (
  <InklingComposableEditor markdownTransformers={BASIC_TRANSFORMERS}>
    <RestrictContentPlugin paragraphs={1} />
  </InklingComposableEditor>
)
void restricted

const transformers: readonly Transformer[] = MINIMAL_TRANSFORMERS
void transformers
const packageVersion: string = version
void packageVersion
const editorState: EditorState = editor.getEditorState()
void editorState

// --- negative cases ---------------------------------------------------------

// @ts-expect-error - the core composer's `nodes` prop is required
const composerWithoutNodes = <InklingComposer>{null}</InklingComposer>
void composerWithoutNodes

void DEFAULT_NODES
