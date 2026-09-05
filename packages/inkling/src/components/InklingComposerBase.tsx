import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import React from 'react'

import type { CardConfig, FileUploader, FileUploaderInput } from '@/context/InklingHostIntegrationContext'

import { ComposerHandlesProvider } from '@/context/ComposerHandlesProvider'
import InklingCollaborationContext, { noopWebsocketProviderFactory } from '@/context/InklingCollaborationContext'
import { InklingHostIntegrationProvider } from '@/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { useCollaborationProviderFactory } from '@/hooks/useCollaborationProviderFactory'
import { resolveLabels, type InklingLabelsInput } from '@/labels/inkling-labels'
import { DEFAULT_CONFIG } from '@/nodes/base'
import defaultTheme from '@/themes/default'
import { setTelemetryHandler } from '@/utils/analytics'
import { normalizeFileUploader } from '@/utils/file-uploader'
import { type InklingInitialEditorState, normalizeInitialEditorState } from '@/utils/initial-document'
import { requireMultiplayerConfig } from '@/utils/services/multiplayer-config'

export type { InklingInitialEditorState }

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed. If you don't throw them, Lexical will
// try to recover gracefully without losing user data.
function defaultOnError(error: unknown, _info?: React.ErrorInfo) {
  if (import.meta.env.DEV) {
    console.error(error)
  }
}

const defaultConfig = {
  namespace: 'InklingEditor',
  theme: defaultTheme,
  html: DEFAULT_CONFIG.html,
}

/**
 * The core composer variant (plan C5): `nodes` is REQUIRED — the host names
 * its node set (MINIMAL_NODES, a subset over EDITOR_BASE_NODES, or its own
 * composition) instead of defaulting to the full card set. The `.` entry
 * keeps the defaulted variant; `@/components/InklingComposer` wraps this one
 * with `nodes = [...DEFAULT_NODES]`.
 *
 * Keeping `nodes` mandatory is what lets the base stay free of the
 * `DefaultNodes` import — the static chain that drags every card's decorate
 * tree into any consumer of the composer.
 */
export interface InklingComposerProps {
  initialEditorState?: InklingInitialEditorState
  nodes: InitialConfigType['nodes']
  onError?: (error: unknown, info?: React.ErrorInfo) => void
  fileUploader?: FileUploaderInput
  cardConfig?: CardConfig
  darkMode?: boolean
  enableMultiplayer?: boolean
  isTKEnabled?: boolean
  /** Host label overrides — a partial table
   * merged over the English defaults; unknown keys are compile errors. */
  labels?: InklingLabelsInput
  multiplayerEndpoint?: string
  multiplayerDebug?: boolean
  multiplayerDocId?: string
  multiplayerUsername?: string
  /** The host's drag auto-scroll container selector — when a drag's only
   * scrollable ancestor is the document, the drag-scroll prefers this
   * element (kobato passes its editor container selector; absent, the
   * document scrolling element is used). */
  dragScrollContainerSelector?: string
  children?: React.ReactNode
}

const InklingComposerBase = ({
  initialEditorState,
  nodes,
  onError = defaultOnError,
  fileUploader = {},
  cardConfig = {},
  darkMode = false,
  enableMultiplayer = false,
  isTKEnabled,
  labels,
  multiplayerEndpoint,
  multiplayerDebug = true,
  multiplayerDocId,
  multiplayerUsername,
  dragScrollContainerSelector,
  children,
}: InklingComposerProps) => {
  if (enableMultiplayer) {
    requireMultiplayerConfig(multiplayerEndpoint, multiplayerDocId)
  }

  const normalizedInitialEditorState = React.useMemo(
    () => normalizeInitialEditorState(initialEditorState),
    [initialEditorState],
  )

  const initialConfig = React.useMemo(
    () =>
      ({
        ...defaultConfig,
        nodes,
        // collaboration owns the bootstrap state via the plugin below
        editorState: enableMultiplayer ? null : normalizedInitialEditorState,
        // Lexical calls its onError with (Error, LexicalEditor); the public
        // callback follows the React error-boundary shape, so only the error is
        // forwarded — the original callback stays in context for the boundary
        onError: (error: Error) => onError(error),
      }) satisfies InitialConfigType,
    [enableMultiplayer, normalizedInitialEditorState, nodes, onError],
  )

  // the five per-composer handles are created and provided by
  // ComposerHandlesProvider (src/context/ComposerHandlesProvider)

  // the legacy-bag degradation policy lives in @/utils/file-uploader (a
  // synchronous test table); the composer keeps one memo line
  const normalizedFileUploader = React.useMemo<FileUploader>(() => normalizeFileUploader(fileUploader), [fileUploader])

  // the lazy collaboration chunk's load choreography (the C5 tradeoff:
  // inert factory + unmounted plugin until the chunk resolves) lives in
  // useCollaborationProviderFactory over the headless session
  const createWebsocketProvider = useCollaborationProviderFactory({
    enabled: enableMultiplayer,
    endpoint: multiplayerEndpoint,
    docId: multiplayerDocId,
    debug: multiplayerDebug,
  })

  // the telemetry port: the host's handler replaces the default
  // plausible/posthog adapter page-wide while this composer is mounted
  React.useEffect(() => setTelemetryHandler(cardConfig.telemetry), [cardConfig.telemetry])

  // the whole-value transport — InklingHostIntegrationProvider fans it out
  // into the per-lifecycle channels (plan C4), each memoized on its own
  // leaves, so a fresh `cardConfig = {}` default keeps every channel stable
  const hostIntegrationValue = React.useMemo(
    () => ({
      fileUploader: normalizedFileUploader,
      cardConfig,
      onError,
      dragScrollContainerSelector,
    }),
    [normalizedFileUploader, cardConfig, onError, dragScrollContainerSelector],
  )

  const collaborationValue = React.useMemo(
    () => ({ createWebsocketProvider: createWebsocketProvider ?? noopWebsocketProviderFactory }),
    [createWebsocketProvider],
  )

  const uiPrefsValue = React.useMemo(
    () => ({
      darkMode,
      isTKEnabled,
      // the host's override table merges over the English defaults exactly
      // once, here — every label-reading consumer sees a full table
      labels: resolveLabels(labels),
    }),
    [darkMode, isTKEnabled, labels],
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ComposerHandlesProvider>
        <InklingHostIntegrationProvider value={hostIntegrationValue}>
          <InklingCollaborationContext.Provider value={collaborationValue}>
            <InklingUiPrefsContext.Provider value={uiPrefsValue}>
              <LexicalCollaboration>
                {enableMultiplayer && createWebsocketProvider ? (
                  <CollaborationPlugin
                    id="main"
                    initialEditorState={normalizedInitialEditorState}
                    providerFactory={createWebsocketProvider}
                    shouldBootstrap={true}
                    username={multiplayerUsername}
                  />
                ) : null}
                {children}
              </LexicalCollaboration>
            </InklingUiPrefsContext.Provider>
          </InklingCollaborationContext.Provider>
        </InklingHostIntegrationProvider>
      </ComposerHandlesProvider>
    </LexicalComposer>
  )
}

export default InklingComposerBase
