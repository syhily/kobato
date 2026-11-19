import InklingErrorBoundary from '@kobato/inkling-internal/components/InklingErrorBoundary'
import { DEFAULT_CONFIG } from '@kobato/inkling-internal/nodes/base'
import defaultTheme from '@kobato/inkling-internal/themes/default'
import { ReactExtension } from '@lexical/react/ReactExtension'
import {
  $getRoot,
  configExtension,
  defineExtension,
  type CreateEditorArgs,
  type InitialEditorStateType,
  type LexicalEditor,
} from 'lexical'

export interface InklingRootExtensionInput {
  nodes: CreateEditorArgs['nodes']
  onError: (error: Error) => void
  initialEditorState: InitialEditorStateType | undefined
}

function toExtensionInitialState(
  initialEditorState: InitialEditorStateType | undefined,
): InitialEditorStateType | undefined {
  if (typeof initialEditorState !== 'function') {
    return initialEditorState
  }

  return (editor: LexicalEditor) => {
    if ($getRoot().isEmpty()) {
      initialEditorState(editor)
    }
  }
}

export function buildInklingRootExtension({ nodes, onError, initialEditorState }: InklingRootExtensionInput) {
  return defineExtension({
    name: 'inkling/root',
    namespace: 'InklingEditor',
    theme: defaultTheme,
    html: DEFAULT_CONFIG.html,
    nodes,
    onError: (error: Error) => onError(error),
    $initialEditorState: toExtensionInitialState(initialEditorState),
    dependencies: [configExtension(ReactExtension, { ErrorBoundary: InklingErrorBoundary })],
  })
}
