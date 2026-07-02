import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import React from 'react'
import { WebsocketProvider } from 'y-websocket'
import { Doc } from 'yjs'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { InklingSelectedCardContext } from '@/ui/inkling-editor/context/InklingSelectedCardContext'
import { TKContext } from '@/ui/inkling-editor/context/TKContext'
import { DEFAULT_CONFIG } from '@/ui/inkling-editor/nodes/base'
import DEFAULT_NODES from '@/ui/inkling-editor/nodes/DefaultNodes'
import defaultTheme from '@/ui/inkling-editor/themes/default'

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed. If you don't throw them, Lexical will
// try to recover gracefully without losing user data.
function defaultOnError(error: Error) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(error)
  }
}

const defaultConfig = {
  namespace: 'InklingEditor',
  theme: defaultTheme,
  html: DEFAULT_CONFIG.html,
}

interface InklingComposerProps {
  initialEditorState?: string | Record<string, unknown> | null
  nodes?: typeof DEFAULT_NODES
  onError?: (error: Error) => void
  fileUploader?: import('@/ui/inkling-editor/context/InklingComposerContext').FileUploader | Record<string, unknown>
  cardConfig?: import('@/ui/inkling-editor/context/InklingComposerContext').CardConfig
  darkMode?: boolean
  enableMultiplayer?: boolean
  isTKEnabled?: boolean
  multiplayerEndpoint?: string
  multiplayerDebug?: boolean
  multiplayerDocId?: string
  multiplayerUsername?: string
  children?: React.ReactNode
}

const InklingComposer = ({
  initialEditorState,
  nodes = [...DEFAULT_NODES],
  onError = defaultOnError,
  fileUploader = {},
  cardConfig = {},
  darkMode = false,
  enableMultiplayer = false,
  isTKEnabled,
  multiplayerEndpoint,
  multiplayerDebug = true,
  multiplayerDocId,
  multiplayerUsername,
  children,
}: InklingComposerProps) => {
  const initialConfig = React.useMemo(() => {
    let editorState: string | Record<string, unknown> | null | undefined = initialEditorState

    // root needs to have at least one paragraph node for the editor to work
    if (editorState) {
      if (typeof editorState === 'string') {
        editorState = JSON.parse(editorState) as Record<string, unknown>
      }

      const state = editorState as { root?: { children?: unknown[] } }
      if (state.root?.children?.length === 0) {
        state.root.children.push({
          children: [],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        })
      }

      editorState = JSON.stringify(editorState) as string
    }

    return Object.assign({}, defaultConfig, {
      nodes,
      editorState: enableMultiplayer ? null : editorState,
      onError,
    })
  }, [enableMultiplayer, initialEditorState, nodes, onError])

  const editorContainerRef = React.useRef(null)
  const onWordCountChangeRef = React.useRef(null)

  const _fileUploader = fileUploader as import('@/ui/inkling-editor/context/InklingComposerContext').FileUploader
  if (!_fileUploader.useFileUpload) {
    // oxlint-disable-next-line typescript/no-explicit-any
    ;(_fileUploader as any).useFileUpload = function (): { upload: () => Promise<undefined> } {
      console.error(
        '<InklingComposer> requires a `fileUploader` prop object to be passed containing a `useFileUpload` custom hook',
      )
      return { upload: () => Promise.resolve(undefined) }
    }
  }

  const createWebsocketProvider = React.useCallback(
    (id: string, yjsDocMap: Map<string, import('yjs').Doc>) => {
      let doc = yjsDocMap.get(id)

      if (doc === undefined) {
        doc = new Doc()
        yjsDocMap.set(id, doc)
      } else {
        doc.load()
      }

      const provider = new WebsocketProvider(multiplayerEndpoint!, multiplayerDocId + '/' + id, doc, {
        connect: false,
      })

      if (multiplayerDebug) {
        provider.on('status', (event) => {
          console.warn(event.status, `id: ${multiplayerDocId}/${id}`)
        })
      }

      // oxlint-disable-next-line typescript/no-explicit-any
      return provider as InstanceType<typeof WebsocketProvider>
    },
    [multiplayerEndpoint, multiplayerDocId, multiplayerDebug],
  )

  const composerContextValue = React.useMemo(
    () => ({
      fileUploader: _fileUploader,
      editorContainerRef,
      cardConfig,
      darkMode,
      enableMultiplayer,
      isTKEnabled,
      multiplayerEndpoint,
      multiplayerDocId,
      multiplayerUsername,
      // oxlint-disable-next-line typescript/no-explicit-any
      createWebsocketProvider: createWebsocketProvider as any,
      onWordCountChangeRef,
      onError,
    }),
    [
      _fileUploader,
      cardConfig,
      createWebsocketProvider,
      darkMode,
      editorContainerRef,
      enableMultiplayer,
      isTKEnabled,
      multiplayerDocId,
      multiplayerEndpoint,
      multiplayerUsername,
      onError,
      onWordCountChangeRef,
    ],
  )

  return (
    // oxlint-disable-next-line typescript/no-explicit-any
    <LexicalComposer initialConfig={initialConfig as any}>
      <InklingComposerContext.Provider value={composerContextValue}>
        <InklingSelectedCardContext>
          <TKContext>
            {enableMultiplayer ? (
              <CollaborationPlugin
                id="main"
                // oxlint-disable-next-line typescript/no-explicit-any
                initialEditorState={initialEditorState as any}
                // oxlint-disable-next-line typescript/no-explicit-any
                providerFactory={createWebsocketProvider as any}
                shouldBootstrap={true}
                username={multiplayerUsername}
              />
            ) : null}
            {children}
          </TKContext>
        </InklingSelectedCardContext>
      </InklingComposerContext.Provider>
    </LexicalComposer>
  )
}

export default InklingComposer
