// @vitest-environment happy-dom

import type { UseFileUploadOptions } from '@kobato/client/hooks/use-file-upload'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The upload choreography itself is pinned by use-file-upload.test.tsx; this
// spec pins the FontUploadButton wiring: the exact options handed to the
// hook (endpoint, guards, message factories, family-name field) and the
// phase transitions driven by onSuccess / onError.
const hookMock = vi.hoisted(() => ({
  options: undefined as UseFileUploadOptions | undefined,
  upload: vi.fn(),
}))

vi.mock('@kobato/client/hooks/use-file-upload', () => ({
  useFileUpload: (options: UseFileUploadOptions) => {
    hookMock.options = options
    return { upload: hookMock.upload, pending: false }
  },
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn() }),
  }
})

vi.mock('@kobato/client/api/orpc-query', () => ({
  orpcQuery: { admin: { fonts: { list: { key: () => ['admin', 'fonts', 'list'] } } } },
}))

import { FontUploadButton } from '@kobato/ui/admin/fonts/FontUploadButton'

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function options(): UseFileUploadOptions {
  if (!hookMock.options) {
    throw new Error('useFileUpload was not called')
  }
  return hookMock.options
}

function selectFile(file: File) {
  // The hidden input is the only file input the button renders.
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('file input not rendered')
  }
  fireEvent.change(input, { target: { files: [file] } })
}

describe('FontUploadButton', () => {
  beforeEach(() => {
    hookMock.options = undefined
    hookMock.upload.mockReset()
    hookMock.upload.mockResolvedValue(true)
  })

  it('hands the package upload the shared options, with the family name field tracking the input phase', async () => {
    render(<FontUploadButton />, { wrapper: makeWrapper() })
    selectFile(new File([new Uint8Array(8)], 'OPPOSans.ttf'))

    // Input phase: family name prefilled from the file name.
    expect(await screen.findByDisplayValue('OPPOSans')).toBeInTheDocument()

    const opts = options()
    expect(opts.endpoint).toBe('/api/admin/fonts/package/upload')
    expect(opts.accept).toEqual(['.ttf', '.otf'])
    expect(opts.maxBytes).toBe(60 * 1024 * 1024)
    expect(opts.fields).toEqual({ familyName: 'OPPOSans' })
    expect(opts.messages?.invalidType).toEqual({ title: '仅支持 .ttf 或 .otf 字体文件' })
    expect(opts.messages?.tooLarge?.(new File([new Uint8Array(1)], 'x.ttf'))).toEqual({
      title: '字体文件大小上限为 60 MB',
    })
    expect(opts.messages?.httpFailure?.(502)).toBe('服务器错误 (502)')
    expect(opts.messages?.failure).toBe('未知错误，请稍后重试')
    // No success toast — the success phase is the feedback.
    expect(opts.messages?.success).toBeUndefined()

    // Editing the family name re-renders the hook with the new field value.
    fireEvent.change(screen.getByDisplayValue('OPPOSans'), { target: { value: '  My Sans  ' } })
    expect(options().fields).toEqual({ familyName: 'My Sans' })
  })

  it('moves through uploading to the success phase when the choreography succeeds', async () => {
    render(<FontUploadButton />, { wrapper: makeWrapper() })
    const file = new File([new Uint8Array(8)], 'OPPOSans.ttf')
    selectFile(file)
    await screen.findByDisplayValue('OPPOSans')

    fireEvent.click(screen.getByRole('button', { name: '上传' }))
    expect(hookMock.upload).toHaveBeenCalledWith(file)
    expect(await screen.findByText('处理中…')).toBeInTheDocument()
    expect(screen.getByText('OPPOSans.ttf')).toBeInTheDocument()

    await act(async () => {
      await options().onSuccess?.(undefined)
    })
    expect(await screen.findByText('上传成功')).toBeInTheDocument()
    expect(screen.getByText(/已添加到网站字体库/)).toBeInTheDocument()
  })

  it('renders the error phase with the routed message on failure', async () => {
    render(<FontUploadButton />, { wrapper: makeWrapper() })
    selectFile(new File([new Uint8Array(8)], 'OPPOSans.ttf'))
    await screen.findByDisplayValue('OPPOSans')

    fireEvent.click(screen.getByRole('button', { name: '上传' }))
    await screen.findByText('处理中…')

    await act(async () => {
      options().onError?.('存储后端不可用')
    })
    expect(await screen.findByText('上传失败')).toBeInTheDocument()
    expect(screen.getByText('存储后端不可用')).toBeInTheDocument()
  })

  it('keeps the upload button disabled until a family name is present', async () => {
    render(<FontUploadButton />, { wrapper: makeWrapper() })
    selectFile(new File([new Uint8Array(8)], 'OPPOSans.ttf'))
    const familyInput = await screen.findByDisplayValue('OPPOSans')

    fireEvent.change(familyInput, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: '上传' })).toBeDisabled()
    expect(hookMock.upload).not.toHaveBeenCalled()
  })
})
