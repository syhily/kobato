import type { DragHandlerLike, FileInputRef, FileUploaderLike } from '@/components/ui/cards/card-ui-types'

import FileUploadIcon from '@/assets/icons/inkling-file-upload.svg?react'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import { TextInput } from '@/components/ui/TextInput'
import { UploadingPanel, UploadPlaceholder } from '@/components/ui/UploadChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'

interface PopulatedFileCardProps {
  isEditing?: boolean
  title?: string
  titlePlaceholder?: string
  desc?: string
  descPlaceholder?: string
  name?: string
  size?: string
  handleFileTitle: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFileDesc: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export interface FileCardProps {
  isPopulated?: boolean
  fileTitle?: string
  fileTitlePlaceholder?: string
  fileDesc?: string
  fileDescPlaceholder?: string
  fileName?: string
  fileSize?: string
  fileDragHandler: DragHandlerLike
  isEditing?: boolean
  fileInputRef?: FileInputRef
  onFileChange: (files: File[]) => void
  handleFileTitle: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFileDesc: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileUploader?: FileUploaderLike
}

function PopulatedFileCard({
  isEditing,
  title,
  titlePlaceholder,
  desc,
  descPlaceholder,
  name,
  size,
  handleFileTitle,
  handleFileDesc,
}: PopulatedFileCardProps) {
  return (
    <div>
      <div className="flex justify-between rounded-md border border-grey/30 p-2">
        <div
          className={`flex w-full flex-col px-2 font-sans ${title || desc || isEditing ? 'justify-between' : 'justify-center'}`}
        >
          {(isEditing || title || desc) && (
            <div className="flex flex-col">
              {(isEditing || title) && (
                <TextInput
                  className="h-[30px] bg-transparent text-lg leading-none font-bold tracking-tight text-black dark:text-grey-200"
                  data-inkling-file-card="fileTitle"
                  maxLength="80"
                  placeholder={titlePlaceholder}
                  value={title}
                  onChange={handleFileTitle}
                />
              )}
              {(isEditing || desc) && (
                <TextInput
                  className="h-[26px] bg-transparent pb-1 text-[1.6rem] leading-none font-normal text-grey-700 placeholder:text-grey-500 dark:text-grey-300 dark:placeholder:text-grey-800"
                  data-inkling-file-card="fileDescription"
                  maxLength="100"
                  placeholder={descPlaceholder}
                  value={desc}
                  onChange={handleFileDesc}
                />
              )}
            </div>
          )}
          <div
            className="!mt-0 py-1 text-sm font-medium text-grey-900 dark:text-grey-200"
            data-inkling-file-card="dataset"
          >
            {name}
            <span className="text-grey-700"> • {size}</span>
          </div>
        </div>
        <div
          className={`!mt-0 flex w-full max-w-[96px] items-center justify-center rounded-md bg-grey-200 dark:bg-grey-900 ${(title && desc) || isEditing ? 'h-[96px]' : title || desc ? 'h-[64px]' : 'h-[40px]'}`}
        >
          <FileUploadIcon
            className={`text-green transition-all duration-75 ease-in ${title || desc || isEditing ? 'size-6' : 'size-5'}`}
          />
        </div>
      </div>
      {!isEditing && <ReadOnlyOverlay />}
    </div>
  )
}

export function FileCard({
  isPopulated,
  fileTitle,
  fileTitlePlaceholder,
  fileDesc,
  fileDescPlaceholder,
  fileName,
  fileSize,
  fileDragHandler,
  isEditing,
  fileInputRef,
  onFileChange,
  handleFileTitle,
  handleFileDesc,
  fileUploader,
}: FileCardProps) {
  const labels = useInklingLabels()
  const { isLoading: isUploading, progress, errors } = fileUploader || {}

  if (isUploading) {
    return <UploadingPanel progress={progress} />
  }
  if (isPopulated) {
    return (
      <PopulatedFileCard
        desc={fileDesc}
        descPlaceholder={fileDescPlaceholder}
        handleFileDesc={handleFileDesc}
        handleFileTitle={handleFileTitle}
        isEditing={isEditing}
        name={fileName}
        size={fileSize}
        title={fileTitle}
        titlePlaceholder={fileTitlePlaceholder}
      />
    )
  }

  return (
    <UploadPlaceholder
      desc={labels['upload.file.desc']}
      dragHandler={fileDragHandler}
      errors={errors}
      fileInputRef={fileInputRef}
      icon="file"
      inputName="file-input"
      onFileChange={onFileChange}
      size="xsmall"
    />
  )
}
