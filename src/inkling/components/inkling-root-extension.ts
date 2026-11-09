import { ReactExtension } from '@lexical/react/ReactExtension'
import {
  $getRoot,
  configExtension,
  defineExtension,
  type CreateEditorArgs,
  type InitialEditorStateType,
  type LexicalEditor,
} from 'lexical'

import InklingErrorBoundary from '@/inkling/components/InklingErrorBoundary'
import { DEFAULT_CONFIG } from '@/inkling/nodes/base'
import defaultTheme from '@/inkling/themes/default'

export interface InklingRootExtensionInput {
  nodes: CreateEditorArgs['nodes']
  onError: (error: Error) => void
  /** The mount-time state: `null` when collaboration owns the bootstrap. */
  initialEditorState: InitialEditorStateType | undefined
}

/**
 * Map the composer's normalized initial state onto the extension API with the
 * legacy `LexicalComposer` semantics intact:
 *
 * - `undefined` falls through to `InitialStateExtension`'s default initializer
 *   (seed one empty paragraph when the root is empty). The legacy composer also
 *   selected that paragraph when the editor was already focused, but it ran
 *   before any root element existed, so the selection branch was unreachable —
 *   nothing is lost.
 * - an initializer function keeps its legacy `root.isEmpty()` guard —
 *   `InitialStateExtension` calls functions unconditionally.
 * - strings/`EditorState` instances/`null` pass through; both pipelines apply
 *   them with `HISTORY_MERGE` options, and `null` skips initialization
 *   entirely (the collaboration path).
 */
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

/**
 * The composer's root extension: carries the createEditor configuration the
 * legacy `LexicalComposer initialConfig` used to hold. Built once per composer
 * mount (the caller freezes it in a mount-scoped memo) because
 * `LexicalExtensionComposer` rebuilds the editor when the extension identity
 * changes.
 *
 * The `ReactExtension` dependency keeps decorator errors on the inkling
 * boundary (host `onError` sink + localized fallback): under the extension
 * composer, decorators render through `ReactExtension`, so `RichTextPlugin`'s
 * own `ErrorBoundary` prop is inert there.
 */
export function buildInklingRootExtension({ nodes, onError, initialEditorState }: InklingRootExtensionInput) {
  return defineExtension({
    name: 'inkling/root',
    namespace: 'InklingEditor',
    theme: defaultTheme,
    html: DEFAULT_CONFIG.html,
    nodes,
    // Lexical calls its onError with (Error, LexicalEditor); the public
    // callback follows the React error-boundary shape, so only the error is
    // forwarded — the original callback stays in context for the boundary
    onError: (error: Error) => onError(error),
    $initialEditorState: toExtensionInitialState(initialEditorState),
    dependencies: [configExtension(ReactExtension, { ErrorBoundary: InklingErrorBoundary })],
  })
}
