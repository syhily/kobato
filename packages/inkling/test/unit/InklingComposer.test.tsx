import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import InklingComposer from '@/components/InklingComposer'
import InklingErrorBoundary from '@/components/InklingErrorBoundary'
import InklingCollaborationContext, {
  noopWebsocketProviderFactory,
  type LexicalProviderFactory,
} from '@/context/InklingCollaborationContext'
import { type FileUploader, useInklingHostEssentials } from '@/context/InklingHostIntegrationContext'
import trackEvent from '@/utils/analytics'
import { normalizeInitialEditorState } from '@/utils/initial-document'

vi.mock('@lexical/react/LexicalCollaborationPlugin', () => ({
  CollaborationPlugin: vi.fn(() => null),
}))

function EditorTree() {
  return (
    <RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={InklingErrorBoundary} placeholder={null} />
  )
}

const stateWithText = JSON.stringify({
  root: {
    children: [
      {
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'hello', type: 'text', version: 1 }],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

const emptyRootState = JSON.stringify({
  root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 },
})

describe('InklingComposer', function () {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders', () => {
    const { container } = render(
      <InklingComposer>
        <EditorTree />
      </InklingComposer>,
    )

    expect(container.querySelector('[contenteditable]')).toBeInTheDocument()
  })

  it('routes trackEvent through cardConfig.telemetry while mounted', () => {
    const telemetry = vi.fn()
    const { unmount } = render(
      <InklingComposer cardConfig={{ telemetry }}>
        <EditorTree />
      </InklingComposer>,
    )

    trackEvent('test-event', { foo: 'bar' })
    expect(telemetry).toHaveBeenCalledWith('test-event', { foo: 'bar' })

    // unmounting restores the default adapter
    telemetry.mockClear()
    unmount()
    trackEvent('test-event')
    expect(telemetry).not.toHaveBeenCalled()
  })

  it('accepts initialEditorState prop', () => {
    const { container } = render(
      <InklingComposer initialEditorState={stateWithText}>
        <EditorTree />
      </InklingComposer>,
    )

    expect(container.querySelector('[contenteditable]')).toHaveTextContent('hello')
  })

  it('injects an empty paragraph when initialEditorState has no root children', () => {
    const { container } = render(
      <InklingComposer initialEditorState={emptyRootState}>
        <EditorTree />
      </InklingComposer>,
    )

    const editable = container.querySelector('[contenteditable]')
    expect(editable).toBeInTheDocument()
    expect(editable!.querySelector('p')).toBeInTheDocument()
  })

  it('logs a warning and installs a no-op uploader when fileUploader.useFileUpload is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    let upload: ((files: FileList | File[]) => Promise<unknown>) | undefined

    function FileUploadConsumer() {
      const { fileUploader } = useInklingHostEssentials()
      const uploader = fileUploader.useFileUpload('image')
      upload = uploader.upload
      return null
    }

    render(
      <InklingComposer>
        <FileUploadConsumer />
      </InklingComposer>,
    )

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '<InklingComposer> requires a `fileUploader` prop object to be passed containing a `useFileUpload` custom hook',
    )
    await expect(upload!([])).resolves.toBeUndefined()
  })

  it('does not mutate the fileUploader prop object', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const fileUploader = Object.freeze({ fileTypes: { image: { mimeTypes: ['image/png'] } } })

    expect(() =>
      render(
        <InklingComposer fileUploader={fileUploader}>
          <EditorTree />
        </InklingComposer>,
      ),
    ).not.toThrow()
    expect(fileUploader).toEqual({ fileTypes: { image: { mimeTypes: ['image/png'] } } })
    expect('useFileUpload' in fileUploader).toBe(false)
  })

  it('passes the normalized bootstrap state to the collaboration plugin in multiplayer', async () => {
    render(
      <InklingComposer
        enableMultiplayer
        initialEditorState={emptyRootState}
        multiplayerDocId="doc"
        multiplayerEndpoint="ws://localhost:1234"
      >
        <EditorTree />
      </InklingComposer>,
    )

    // the collaboration chunk loads lazily (dynamic import in an effect), so
    // the plugin mounts one async tick after the composer
    await waitFor(() => expect(CollaborationPlugin).toHaveBeenCalled())
    const pluginProps = vi.mocked(CollaborationPlugin).mock.calls[0][0]
    expect(typeof pluginProps.initialEditorState).toBe('string')
    const bootstrapState = JSON.parse(pluginProps.initialEditorState as string)
    expect(bootstrapState.root.children).toHaveLength(1)
    expect(bootstrapState.root.children[0].type).toBe('paragraph')
  })

  it('exposes a websocket provider factory returning the methods Lexical requires', async () => {
    let factory: LexicalProviderFactory | undefined

    function FactoryConsumer() {
      const { createWebsocketProvider } = React.useContext(InklingCollaborationContext)
      factory = createWebsocketProvider
      return null
    }

    render(
      <InklingComposer
        enableMultiplayer
        multiplayerDebug={false}
        multiplayerDocId="doc"
        multiplayerEndpoint="ws://localhost:1234"
      >
        <FactoryConsumer />
      </InklingComposer>,
    )

    // the real factory replaces the inert default once the lazy collaboration
    // chunk resolves
    await waitFor(() => {
      expect(factory).toBeDefined()
      expect(factory).not.toBe(noopWebsocketProviderFactory)
    })
    if (!factory) {
      throw new Error('Expected InklingComposer to provide a websocket factory')
    }

    const provider = factory('card-1', new Map())
    expect(provider.awareness).toBeDefined()
    expect(typeof provider.connect).toBe('function')
    expect(typeof provider.disconnect).toBe('function')
    expect(typeof provider.on).toBe('function')
    expect(typeof provider.off).toBe('function')
    provider.disconnect()
  })

  it.each([{ multiplayerEndpoint: 'ws://localhost:1234' }, { multiplayerDocId: 'doc' }])(
    'rejects invalid multiplayer configuration at the composer boundary',
    (props) => {
      expect(() =>
        render(
          <InklingComposer enableMultiplayer {...props}>
            content
          </InklingComposer>,
        ),
      ).toThrow('<InklingComposer> enableMultiplayer requires both multiplayerEndpoint and multiplayerDocId')
    },
  )

  it('serves the inert provider factory while multiplayer is disabled', () => {
    let factory: LexicalProviderFactory | undefined

    function FactoryConsumer() {
      factory = React.useContext(InklingCollaborationContext).createWebsocketProvider
      return null
    }

    render(
      <InklingComposer>
        <FactoryConsumer />
      </InklingComposer>,
    )

    // no collaboration chunk is loaded without enableMultiplayer: the context
    // keeps the inert factory, and calling it is a no-op (never a network
    // attempt, never a config error)
    expect(factory).toBe(noopWebsocketProviderFactory)
    if (!factory) {
      throw new Error('Expected InklingComposer to provide a websocket factory')
    }
    const provider = factory('card-1', new Map())
    expect(provider.awareness.getLocalState()).toBeNull()
    expect(() => provider.disconnect()).not.toThrow()
  })

  it('drops fileTypes entries whose shape consumers cannot read', () => {
    let captured: FileUploader | undefined

    function FileUploaderConsumer() {
      captured = useInklingHostEssentials().fileUploader
      return null
    }

    render(
      <InklingComposer
        fileUploader={{
          useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
          fileTypes: {
            audio: 'junk',
            image: { mimeTypes: ['image/png'] },
            video: { mimeTypes: [42] },
          },
        }}
      >
        <FileUploaderConsumer />
      </InklingComposer>,
    )

    expect(captured!.fileTypes).toEqual({ image: { mimeTypes: ['image/png'] } })
  })
})

describe('normalizeInitialEditorState', () => {
  it('returns null and undefined unchanged', () => {
    expect(normalizeInitialEditorState(null)).toBeNull()
    expect(normalizeInitialEditorState(undefined)).toBeUndefined()
  })

  it('returns a non-empty JSON string unchanged', () => {
    expect(normalizeInitialEditorState(stateWithText)).toBe(stateWithText)
  })

  it('repairs an empty-root JSON string with a fallback paragraph', () => {
    const result = normalizeInitialEditorState(emptyRootState) as string

    expect(result).not.toBe(emptyRootState)
    const parsed = JSON.parse(result)
    expect(parsed.root.children).toHaveLength(1)
    expect(parsed.root.children[0].type).toBe('paragraph')
  })

  it('converts a serialized object to a JSON string without mutating it', () => {
    const serialized = JSON.parse(stateWithText)
    const result = normalizeInitialEditorState(serialized)

    expect(typeof result).toBe('string')
    expect(JSON.parse(result as string)).toEqual(serialized)
    expect(serialized).toEqual(JSON.parse(stateWithText))
  })

  it('repairs an empty-root serialized object without mutating it', () => {
    const serialized = JSON.parse(emptyRootState)
    const result = normalizeInitialEditorState(serialized) as string

    expect(serialized.root.children).toHaveLength(0)
    expect(JSON.parse(result).root.children[0].type).toBe('paragraph')
  })

  it('throws on malformed JSON', () => {
    expect(() => normalizeInitialEditorState('{not json')).toThrow()
  })
})
