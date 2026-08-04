// @vitest-environment happy-dom

import type { UseFileUploadOptions } from '@kobato/client/hooks/use-file-upload'
import type { FontsSettings } from '@kobato/shared/config/types'

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The upload choreography itself is pinned by use-file-upload.test.tsx; this
// spec pins the FontsForm wiring: the exact options each slot hands to the
// hook and the pending-driven button UX. The hook is stubbed so every call
// records its options.
const hookMock = vi.hoisted(() => ({
  calls: [] as UseFileUploadOptions[],
  upload: vi.fn(),
  pending: false,
}))

vi.mock('@kobato/client/hooks/use-file-upload', () => ({
  useFileUpload: (options: UseFileUploadOptions) => {
    hookMock.calls.push(options)
    return { upload: hookMock.upload, pending: hookMock.pending }
  },
}))

import { FontsForm } from '@kobato/ui/admin/settings/FontsForm'

const fonts: FontsSettings = {
  og: { family: 'OPPOSans' },
  calendar: { family: 'OPPOSerif' },
  global: [],
  post: [],
  code: [],
}

function renderForm() {
  return render(
    <MemoryRouter>
      <FontsForm fonts={fonts} />
    </MemoryRouter>,
  )
}

function optionsForSlot(slot: string): UseFileUploadOptions {
  const options = hookMock.calls.find((o) => o.fields?.slot === slot)
  if (!options) {
    throw new Error(`no useFileUpload call recorded for slot ${slot}`)
  }
  return options
}

describe('FontsForm upload wiring', () => {
  beforeEach(() => {
    hookMock.calls.length = 0
    hookMock.upload.mockReset()
    hookMock.upload.mockResolvedValue(true)
    hookMock.pending = false
  })

  it('hands each canvas slot the shared upload options', () => {
    renderForm()
    for (const slot of ['og', 'calendar']) {
      const options = optionsForSlot(slot)
      expect(options.endpoint).toBe('/api/admin/fonts/upload')
      expect(options.fields).toEqual({ slot })
      expect(options.accept).toEqual(['.ttf', '.otf'])
      expect(options.maxBytes).toBe(60 * 1024 * 1024)
      expect(options.messages?.invalidType).toEqual({
        title: '文件类型错误',
        description: '仅支持 .ttf 或 .otf 字体文件',
      })
      expect(options.messages?.tooLarge?.(new File([new Uint8Array(1)], 'x.ttf'))).toEqual({
        title: '文件过大',
        description: '字体文件大小上限为 60 MB',
      })
    }
    expect(optionsForSlot('og').messages?.success).toBe('OG 图字体 已上传')
    expect(optionsForSlot('calendar').messages?.success).toBe('日历图字体 已上传')
  })

  it('sends the selected file through the choreography', () => {
    renderForm()
    const file = new File([new Uint8Array(8)], 'OPPOSans.ttf')
    fireEvent.change(screen.getByLabelText('选择 OG 图字体 文件'), { target: { files: [file] } })
    expect(hookMock.upload).toHaveBeenCalledWith(file)
  })

  it('disables the buttons and shows progress copy while pending', () => {
    hookMock.pending = true
    renderForm()
    const buttons = screen.getAllByRole('button', { name: '上传中…' })
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button).toBeDisabled()
    }
  })
})
