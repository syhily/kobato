import type {
  CardConfig,
  FileUploader,
  FileUploaderInput,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'

import { buildInklingRootExtension } from '@kobato/inkling-internal/components/inkling-root-extension'
import { ComposerHandlesProvider } from '@kobato/inkling-internal/context/ComposerHandlesProvider'
import InklingCollaborationContext, {
  noopWebsocketProviderFactory,
} from '@kobato/inkling-internal/context/InklingCollaborationContext'
import { InklingHostIntegrationProvider } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useCollaborationProviderFactory } from '@kobato/inkling-internal/hooks/useCollaborationProviderFactory'
import { resolveLabels, type InklingLabelsInput } from '@kobato/inkling-internal/labels/inkling-labels'
import { requireMultiplayerConfig } from '@kobato/inkling-internal/services/multiplayer-config'
import { setTelemetryHandler } from '@kobato/inkling-internal/utils/analytics'
import { normalizeFileUploader } from '@kobato/inkling-internal/utils/file-uploader'
import {
  type InklingInitialEditorState,
  normalizeInitialEditorState,
} from '@kobato/inkling-internal/utils/initial-document'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer'
import { type CreateEditorArgs } from 'lexical'
import React from 'react'

export type { InklingInitialEditorState }

function defaultOnError(error: unknown, _info?: React.ErrorInfo) {
  if (import.meta.env.DEV) {
    console.error(error)
  }
}

export interface InklingComposerProps {
  initialEditorState?: InklingInitialEditorState
  nodes: CreateEditorArgs['nodes']
  onError?: (error: unknown, info?: React.ErrorInfo) => void
  fileUploader?: FileUploaderInput
  cardConfig?: CardConfig
  darkMode?: boolean
  enableMultiplayer?: boolean
  isTKEnabled?: boolean
  isEmojiEnabled?: boolean

  codeEditor?: 'rich' | 'plain'
  wordCountLanguage?: string
  labels?: InklingLabelsInput
  multiplayerEndpoint?: string
  multiplayerDebug?: boolean
  multiplayerDocId?: string
  multiplayerUsername?: string
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
  isEmojiEnabled,
  codeEditor,
  wordCountLanguage,
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

  const [rootExtension] = React.useState(() =>
    buildInklingRootExtension({
      nodes,
      onError: (error: Error) => onError(error),

      initialEditorState: enableMultiplayer ? null : normalizedInitialEditorState,
    }),
  )

  const normalizedFileUploader = React.useMemo<FileUploader>(() => normalizeFileUploader(fileUploader), [fileUploader])

  const createWebsocketProvider = useCollaborationProviderFactory({
    enabled: enableMultiplayer,
    endpoint: multiplayerEndpoint,
    docId: multiplayerDocId,
    debug: multiplayerDebug,
  })

  React.useEffect(() => setTelemetryHandler(cardConfig.telemetry), [cardConfig.telemetry])
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
      isEmojiEnabled,
      codeEditor,

      wordCountLanguage,

      labels: resolveLabels(labels),
    }),
    [darkMode, isTKEnabled, isEmojiEnabled, codeEditor, wordCountLanguage, labels],
  )

  return (
    <ComposerHandlesProvider>
      <InklingHostIntegrationProvider value={hostIntegrationValue}>
        <InklingCollaborationContext.Provider value={collaborationValue}>
          <InklingUiPrefsContext.Provider value={uiPrefsValue}>
            <LexicalCollaboration>
              <LexicalExtensionComposer extension={rootExtension} contentEditable={null}>
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
              </LexicalExtensionComposer>
            </LexicalCollaboration>
          </InklingUiPrefsContext.Provider>
        </InklingCollaborationContext.Provider>
      </InklingHostIntegrationProvider>
    </ComposerHandlesProvider>
  )
}

export default InklingComposerBase
