import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { LazyCommentBodyEditor } from '@kobato/web-public/ui/comments/LazyCommentBodyEditor'
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PAYLOAD_LABELS = { 'placeholder.editor': 'PAYLOAD labels' }

const loader = vi.hoisted(() => ({ load: vi.fn() }))
const zoomLock = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }))

vi.mock('@kobato/web-client/editor/inkling-labels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/web-client/editor/inkling-labels')>()
  return { ...actual, loadInklingLabels: loader.load }
})

vi.mock('@kobato/web-client/lib/viewport-zoom-lock', () => ({
  acquireViewportZoomLock: zoomLock.acquire,
  releaseViewportZoomLock: zoomLock.release,
}))

vi.mock('@kobato/web-public/ui/comments/CommentBodyEditor', () => ({
  CommentBodyEditor: ({ labels }: { labels?: Record<string, string> }) => (
    <div data-testid="composer" contentEditable suppressContentEditableWarning>
      {labels?.['placeholder.editor'] ?? 'english-defaults'}
    </div>
  ),
}))

const SEED = { root: {} }

function makeRouter(rootLoaderData: { i18n?: unknown } = SEED.root as never) {
  return createMemoryRouter(editorRoute(), { hydrationData: { loaderData: { root: rootLoaderData } } })
}

function editorRoute(options: { eager?: boolean; focusOnMount?: boolean } = {}): RouteObject[] {
  return [
    {
      id: 'root',
      path: '*',
      element: wrapWithI18n(
        <LazyCommentBodyEditor
          eager={options.eager === true}
          focusOnMount={options.focusOnMount === true}
          initialBody={{} as never}
          bodyKey="comment-1"
          onBodyChange={() => {}}
        />,
        { locale: 'zh-CN' },
      ),
    },
  ]
}

beforeEach(() => {
  loader.load.mockReset()
  loader.load.mockImplementation(async (locale: string) => ({ 'placeholder.editor': `${locale} labels` }))
})

describe('LazyCommentBodyEditor — public labels load on activation', () => {
  it('mounts the placeholder first and loads only the active locale after activation', async () => {
    render(<RouterProvider router={makeRouter()} />)

    expect(screen.queryByTestId('composer')).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(loader.load).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByRole('textbox'))

    await waitFor(() => expect(screen.getByTestId('composer')).toBeTruthy())
    expect(screen.getByTestId('composer').textContent).toBe('zh-CN labels')
    expect(loader.load.mock.calls.every(([locale]) => locale === 'zh-CN')).toBe(true)
    expect(loader.load).toHaveBeenCalledWith('zh-CN')
  })

  it('prefetches the active locale label chunk on hover, before any activation', () => {
    render(<RouterProvider router={makeRouter()} />)

    fireEvent.pointerEnter(screen.getByRole('textbox'))

    expect(loader.load).toHaveBeenCalledWith('zh-CN')
    expect(screen.queryByTestId('composer')).toBeNull()
  })

  it('does not fetch a label chunk on hover when the workspace payload already has one', () => {
    render(<RouterProvider router={makeRouter({ i18n: { locale: 'zh-CN', inklingLabels: PAYLOAD_LABELS } })} />)

    fireEvent.pointerEnter(screen.getByRole('textbox'))

    expect(loader.load).not.toHaveBeenCalled()
  })

  it('eager composers (an already-interacted surface) load the active locale directly', async () => {
    render(
      <RouterProvider
        router={createMemoryRouter(editorRoute({ eager: true }), { hydrationData: { loaderData: SEED } })}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('composer')).toBeTruthy())
    expect(loader.load.mock.calls.every(([locale]) => locale === 'zh-CN')).toBe(true)
    expect(loader.load).toHaveBeenCalledWith('zh-CN')
  })

  it('uses the workspace payload table without fetching any chunk', async () => {
    render(<RouterProvider router={makeRouter({ i18n: { locale: 'zh-CN', inklingLabels: PAYLOAD_LABELS } })} />)

    fireEvent.pointerDown(screen.getByRole('textbox'))

    await waitFor(() => expect(screen.getByTestId('composer')).toBeTruthy())
    expect(screen.getByTestId('composer').textContent).toBe('PAYLOAD labels')
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('still mounts the composer with English defaults when the table chunk fails', async () => {
    loader.load.mockRejectedValue(new Error('chunk load failed'))
    render(<RouterProvider router={makeRouter()} />)

    fireEvent.pointerDown(screen.getByRole('textbox'))

    await waitFor(() => expect(screen.getByTestId('composer')).toBeTruthy())
    expect(screen.getByTestId('composer').textContent).toBe('english-defaults')
  })
})

describe('LazyCommentBodyEditor — SSR placeholder parity', () => {
  it('renders the same placeholder with and without a workspace label payload', () => {
    const staticHtml = (rootLoaderData: { i18n?: unknown }): string => {
      const router = createMemoryRouter(editorRoute(), { hydrationData: { loaderData: { root: rootLoaderData } } })
      return renderToStaticMarkup(<RouterProvider router={router} />)
    }

    expect(staticHtml(SEED.root as never)).toBe(
      staticHtml({
        i18n: { locale: 'zh-CN', inklingLabels: PAYLOAD_LABELS },
      } as never),
    )
  })
})

describe('LazyCommentBodyEditor — focusOnMount hands focus to the mounted composer', () => {
  it('focuses the contenteditable as soon as the eager composer mounts', async () => {
    render(
      <RouterProvider
        router={createMemoryRouter(editorRoute({ eager: true, focusOnMount: true }), {
          hydrationData: { loaderData: SEED },
        })}
      />,
    )

    const composer = await screen.findByTestId('composer')
    await waitFor(() => expect(document.activeElement).toBe(composer))
  })

  it('leaves the composer unfocused without focusOnMount', async () => {
    render(
      <RouterProvider
        router={createMemoryRouter(editorRoute({ eager: true }), { hydrationData: { loaderData: SEED } })}
      />,
    )

    const composer = await screen.findByTestId('composer')
    expect(document.activeElement).not.toBe(composer)
  })
})

describe('LazyCommentBodyEditor — iOS zoom lock around the focus handoff', () => {
  beforeEach(() => {
    zoomLock.acquire.mockClear()
    zoomLock.release.mockClear()
  })

  it('holds the lock from the tap until one task after focus lands', async () => {
    render(<RouterProvider router={makeRouter()} />)

    fireEvent.pointerDown(screen.getByRole('textbox'))
    expect(zoomLock.acquire).toHaveBeenCalledTimes(1)

    const composer = await waitFor(() => screen.getByTestId('composer'))
    await waitFor(() => expect(zoomLock.release).toHaveBeenCalledTimes(1))
    expect(document.activeElement).toBe(composer)
    expect(zoomLock.acquire.mock.invocationCallOrder[0]).toBeLessThan(zoomLock.release.mock.invocationCallOrder[0])
  })

  it('releases the lock when the surface unmounts before the composer mounts', async () => {
    loader.load.mockImplementation(() => new Promise(() => {}) as Promise<Record<string, string>>)
    const view = render(<RouterProvider router={makeRouter()} />)

    fireEvent.pointerDown(screen.getByRole('textbox'))
    expect(zoomLock.acquire).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(zoomLock.release).toHaveBeenCalledTimes(1)
  })
})
