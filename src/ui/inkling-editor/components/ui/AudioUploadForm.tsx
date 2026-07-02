import type { RefObject } from 'react'

export interface AudioUploadFormProps {
  onFileChange?: React.ChangeEventHandler<HTMLInputElement>
  fileInputRef?: RefObject<HTMLInputElement | null> | ((element: HTMLInputElement | null) => void)
  mimeTypes?: string[]
  filePicker?: () => void
  [key: string]: unknown
}

export function AudioUploadForm({ onFileChange, fileInputRef, mimeTypes = ['audio/*'] }: AudioUploadFormProps) {
  const accept = mimeTypes?.join(',') ?? ''

  return (
    <form>
      <input
        ref={fileInputRef as RefObject<HTMLInputElement>}
        accept={accept}
        hidden={true}
        name="audio-input"
        type="file"
        onChange={onFileChange}
      />
    </form>
  )
}

export default AudioUploadForm
