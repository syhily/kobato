import React from 'react'

export function ImageUploadForm({
  onFileChange,
  fileInputRef,
  mimeTypes = ['image/*'],
  multiple = false,
  disabled,
}: {
  onFileChange: React.ChangeEventHandler<HTMLInputElement>
  fileInputRef: React.Ref<HTMLInputElement>
  mimeTypes?: string[]
  multiple?: boolean
  disabled?: boolean
}) {
  const accept = mimeTypes.join(',')

  return (
    <form>
      <input
        ref={fileInputRef}
        accept={accept}
        disabled={disabled}
        hidden={true}
        multiple={multiple}
        name="image-input"
        type="file"
        onChange={onFileChange}
        onClick={(e) => e.stopPropagation()}
      />
    </form>
  )
}

export default ImageUploadForm
