import React from 'react'

export function FileUploadForm({
  onFileChange,
  fileInputRef,
}: {
  onFileChange: React.ChangeEventHandler<HTMLInputElement>
  fileInputRef: React.Ref<HTMLInputElement>
}) {
  return (
    <form>
      <input ref={fileInputRef} hidden={true} name="file-input" type="file" onChange={onFileChange} />
    </form>
  )
}

export default FileUploadForm
