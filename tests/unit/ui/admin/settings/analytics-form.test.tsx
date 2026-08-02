// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseFileUploadOptions } from '@/client/hooks/use-file-upload'
import type { AnalyticsSettings } from '@/shared/config/types'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

// The GeoIP rows read status / fire mutations through orpc + TanStack Query;
// the canonical inert hook doubles keep this spec focused on the upload wiring.
mockTanstackQuery()

// The upload choreography itself is pinned by use-file-upload.test.tsx; this
// spec pins the AnalyticsForm wiring: the exact options the MaxMind row
// hands to the hook and the pending-driven button UX.
const hookMock = vi.hoisted(() => ({
  options: undefined as UseFileUploadOptions | undefined,
  upload: vi.fn(),
  pending: false,
}))

vi.mock('@/client/hooks/use-file-upload', () => ({
  useFileUpload: (options: UseFileUploadOptions) => {
    hookMock.options = options
    return { upload: hookMock.upload, pending: hookMock.pending }
  },
}))

import { AnalyticsForm } from '@/ui/admin/settings/AnalyticsForm'

const analytics: AnalyticsSettings = {
  analytics: { trackAdmin: false, keepBotRows: false, geoipAutoUpdate: true },
}

function options(): UseFileUploadOptions {
  if (!hookMock.options) {
    throw new Error('useFileUpload was not called')
  }
  return hookMock.options
}

describe('AnalyticsForm MaxMind upload wiring', () => {
  beforeEach(() => {
    hookMock.options = undefined
    hookMock.upload.mockReset()
    hookMock.upload.mockResolvedValue(true)
    hookMock.pending = false
  })

  it('hands the MaxMind row the shared upload options', () => {
    render(<AnalyticsForm analytics={analytics} />)
    const opts = options()
    expect(opts.endpoint).toBe('/api/admin/maxmind/upload')
    expect(opts.fields).toBeUndefined()
    expect(opts.accept).toEqual(['.mmdb'])
    expect(opts.maxBytes).toBe(100 * 1024 * 1024)
    expect(opts.messages?.invalidType).toEqual({
      title: '文件类型错误',
      description: '仅支持 .mmdb 格式的 MaxMind 数据库文件',
    })
    expect(opts.messages?.tooLarge?.(new File([new Uint8Array(1)], 'x.mmdb'))).toEqual({
      title: '文件过大',
      description: 'MaxMind 数据库文件大小上限为 100 MB',
    })
    expect(opts.messages?.success).toBe('MaxMind 数据库已上传')
  })

  it('sends the selected file through the choreography', () => {
    render(<AnalyticsForm analytics={analytics} />)
    const file = new File([new Uint8Array(8)], 'GeoLite2-City.mmdb')
    fireEvent.change(screen.getByLabelText('选择 MaxMind 数据库文件'), { target: { files: [file] } })
    expect(hookMock.upload).toHaveBeenCalledWith(file)
  })

  it('disables the button and shows progress copy while pending', () => {
    hookMock.pending = true
    render(<AnalyticsForm analytics={analytics} />)
    expect(screen.getByRole('button', { name: '上传中…' })).toBeDisabled()
  })
})
