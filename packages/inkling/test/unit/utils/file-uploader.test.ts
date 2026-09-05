import { describe, expect, it, vi } from 'vitest'

import type { FileUploader, FileUploaderInput } from '@/context/InklingHostIntegrationContext'

import { normalizeFileUploader } from '@/utils/file-uploader'

const validHook: FileUploader['useFileUpload'] = () => ({
  upload: () => Promise.resolve([{ url: 'https://cdn.example.com/a.png' }]),
})

describe('normalizeFileUploader', () => {
  it('passes a full uploader through', () => {
    const result = normalizeFileUploader({
      useFileUpload: validHook,
      fileTypes: { image: { mimeTypes: ['image/png'] } },
    })

    expect(result.useFileUpload).toBe(validHook)
    expect(result.fileTypes).toEqual({ image: { mimeTypes: ['image/png'] } })
  })

  it('installs the erroring fallback hook when useFileUpload is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = normalizeFileUploader({})

    const hookResult = result.useFileUpload('image')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('useFileUpload'))
    await expect(hookResult.upload([])).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })

  it('installs the fallback hook when useFileUpload is not a function', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = normalizeFileUploader({ useFileUpload: 'not-a-function' })

    result.useFileUpload('image')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('omits fileTypes when the key is absent', () => {
    expect(normalizeFileUploader({ useFileUpload: validHook }).fileTypes).toBeUndefined()
  })

  it('omits fileTypes when the value is not an object', () => {
    expect(normalizeFileUploader({ useFileUpload: validHook, fileTypes: 'image/*' }).fileTypes).toBeUndefined()
    expect(normalizeFileUploader({ useFileUpload: validHook, fileTypes: null }).fileTypes).toBeUndefined()
  })

  it('forwards only the four media keys, dropping unknown ones', () => {
    const input: FileUploaderInput = {
      useFileUpload: validHook,
      fileTypes: {
        image: { mimeTypes: ['image/png'] },
        video: { mimeTypes: ['video/mp4'] },
        audio: { mimeTypes: ['audio/mpeg'] },
        file: { mimeTypes: ['application/pdf'] },
        archive: { mimeTypes: ['application/zip'] },
      },
    }
    const result = normalizeFileUploader(input)

    expect(Object.keys(result.fileTypes ?? {})).toEqual(['image', 'video', 'audio', 'file'])
  })

  it('skips malformed entries but keeps valid siblings', () => {
    const input: FileUploaderInput = {
      useFileUpload: validHook,
      fileTypes: {
        image: { mimeTypes: ['image/png'] },
        video: { extensions: ['mp4'] },
        audio: null,
        file: { mimeTypes: 'application/pdf' },
      },
    }
    const result = normalizeFileUploader(input)

    expect(result.fileTypes).toEqual({ image: { mimeTypes: ['image/png'] } })
  })

  it('rejects mimeTypes arrays containing non-strings', () => {
    const input: FileUploaderInput = {
      useFileUpload: validHook,
      fileTypes: { image: { mimeTypes: ['image/png', 42] } },
    }
    const result = normalizeFileUploader(input)

    expect(result.fileTypes).toEqual({})
  })
})
