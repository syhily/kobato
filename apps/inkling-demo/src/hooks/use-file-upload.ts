import { isTestEnv } from '@kobato/inkling-demo/utils/isTestEnv'
import { useState } from 'react'

export interface FileTypeConfig {
  mimeTypes: string[]
  extensions: string[]
}

export interface FileTypes {
  image: FileTypeConfig
  video: FileTypeConfig
  audio: FileTypeConfig
  mediaThumbnail: FileTypeConfig
  file: FileTypeConfig
}

export interface UseFileUploadOptions {
  isMultiplayer?: boolean
}

export interface FileUploadState {
  progress: number
  isLoading: boolean
  upload: (
    files: FileList | File[],
    options?: { formData?: Record<string, string> },
  ) => Promise<Array<{ url?: string; fileName?: string }> | undefined>
  errors: Error[]
  filesNumber: number
}

class FileUploadError extends Error {
  fileName: string

  constructor(fileName: string, message: string) {
    super(message)
    this.fileName = fileName
  }
}

export const fileTypes: FileTypes = {
  image: {
    mimeTypes: ['image/gif', 'image/jpg', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
    extensions: ['gif', 'jpg', 'jpeg', 'png', 'svg', 'svgz', 'webp'],
  },
  video: {
    mimeTypes: ['video/mp4', 'video/webm', 'video/ogg'],
    extensions: ['mp4', 'webm', 'ogv'],
  },
  audio: {
    mimeTypes: [
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/vnd.wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
    ],
    extensions: ['mp3', 'wav', 'ogg', 'm4a'],
  },
  mediaThumbnail: {
    mimeTypes: ['image/gif', 'image/jpg', 'image/jpeg', 'image/png', 'image/webp'],
    extensions: ['gif', 'jpg', 'jpeg', 'png', 'webp'],
  },
  file: {
    mimeTypes: [],
    extensions: [],
  },
}

function isFileTypeKey(type: string): type is keyof FileTypes {
  return Object.hasOwn(fileTypes, type)
}

export function useFileUpload({ isMultiplayer = false }: UseFileUploadOptions = {}) {
  return function useFileUploadFn(type: keyof FileTypes): FileUploadState {
    const [progress, setProgress] = useState(100)
    const [isLoading, setLoading] = useState(false)
    const [errors, setErrors] = useState<Error[]>([])
    const [filesNumber, setFilesNumber] = useState(0)

    function defaultValidator(file: File): boolean | string {
      if (type === 'file') {
        return true
      }
      const fileTypeConfig = isFileTypeKey(type) ? fileTypes[type] : undefined
      if (!fileTypeConfig) {
        return true
      }
      const { extensions } = fileTypeConfig
      const [, extension] = /(?:\.([^.]+))?$/.exec(file.name) ?? []

      if (!extension || !extensions.includes(extension.toLowerCase())) {
        const validExtensions = `.${extensions.join(', .').toUpperCase()}`
        return `The file type you uploaded is not supported. Please use ${validExtensions}`
      }
      return true
    }

    function validate(files: FileList | File[] = []) {
      const validationResult: Error[] = []

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        const result = defaultValidator(file)
        if (typeof result !== 'string') {
          continue
        }

        validationResult.push(new FileUploadError(file.name, result))
      }

      return validationResult
    }

    async function upload(files: FileList | File[] = [], _options: { formData?: Record<string, string> } = {}) {
      setFilesNumber(files.length)
      setLoading(true)

      const validationResult = validate(files)

      if (validationResult.length) {
        setErrors(validationResult)
        setLoading(false)
        setProgress(100)

        return undefined
      }

      let stepDelay = 200
      if (isTestEnv) {
        stepDelay = 5
      }

      setProgress(30)
      await delay(stepDelay)
      setProgress(60)
      await delay(stepDelay)
      setProgress(90)
      await delay(stepDelay)

      const fileErrors = Array.from(files).filter((file) => file.name.includes('fail'))
      if (fileErrors.length) {
        setErrors(fileErrors.map((file) => new FileUploadError(file.name, 'Upload failed')))
        setLoading(false)
        setProgress(100)
        return undefined
      }

      let uploadResult: Array<{ url: string; fileName: string }> = []
      if (isMultiplayer) {
        try {
          for (const file of Array.from(files)) {
            const reader = new FileReader()
            const url = await new Promise<string>((resolve, reject) => {
              reader.addEventListener('load', () => {
                if (typeof reader.result === 'string') {
                  resolve(reader.result)
                } else {
                  reject(new FileUploadError(file.name, `Failed to read ${file.name}`))
                }
              })
              reader.addEventListener('error', () => {
                reject(new FileUploadError(file.name, `Failed to read ${file.name}`))
              })
              reader.addEventListener('abort', () => {
                reject(new FileUploadError(file.name, `Reading ${file.name} was aborted`))
              })
              reader.readAsDataURL(file)
            })

            uploadResult.push({
              url,
              fileName: file.name,
            })
          }
        } catch (error) {
          setErrors([error instanceof Error ? error : new Error(String(error))])
          setLoading(false)
          setProgress(100)
          return undefined
        }
      } else {
        uploadResult = Array.from(files).map((file) => ({
          url: URL.createObjectURL(file),
          fileName: file.name,
        }))
      }

      setProgress(100)
      setLoading(false)

      setErrors([])

      return uploadResult
    }

    return { progress, isLoading, upload, errors, filesNumber }
  }
}

function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, time)
  })
}
