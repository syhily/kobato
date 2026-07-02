import type { DragHandlerLike, FileInputRef, FileUploaderLike } from '@/ui/inkling-editor/components/ui/cards/AudioCard'

import FileUploadIcon from '@/ui/inkling-editor/assets/icons/inkling-file-upload.svg?react'
import FileUploadForm from '@/ui/inkling-editor/components/ui/FileUploadForm'
import { MediaPlaceholder } from '@/ui/inkling-editor/components/ui/MediaPlaceholder'
import { ProgressBar } from '@/ui/inkling-editor/components/ui/ProgressBar'
import { TextInput } from '@/ui/inkling-editor/components/ui/TextInput'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

interface FileUploadingProps {
  progress?: number
}

interface EmptyFileCardProps {
  handleSelectorClick: () => void
  fileDragHandler: DragHandlerLike
  errors?: Error[] | { message?: string }[]
}

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
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFileTitle: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFileDesc: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileUploader?: FileUploaderLike
}

function FileUploading({ progress }: FileUploadingProps) {
  const progressStyle = {
    width: `${progress?.toFixed(0)}%`,
  }

  return (
    <div className="h-full border border-transparent">
      <div className="relative flex h-full items-center justify-center border border-grey/20 bg-grey-50 before:pb-[12.5%] dark:bg-grey-900">
        <div className="flex w-full items-center justify-center overflow-hidden">
          <ProgressBar style={progressStyle} />
        </div>
      </div>
    </div>
  )
}

function EmptyFileCard({ handleSelectorClick, fileDragHandler, errors }: EmptyFileCardProps) {
  return (
    <MediaPlaceholder
      desc="Click to upload a file"
      errors={errors}
      filePicker={() => handleSelectorClick()}
      icon="file"
      isDraggedOver={fileDragHandler.isDraggedOver}
      placeholderRef={fileDragHandler.setRef}
      size="xsmall"
    />
  )
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
                  className="h-[26px] bg-transparent pb-1 text-[1rem] leading-none font-normal text-grey-700 placeholder:text-grey-500 dark:text-grey-300 dark:placeholder:text-grey-800"
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
      {!isEditing && <div className="absolute inset-0 z-50"></div>}
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
  const { isLoading: isUploading, progress, errors } = fileUploader || {}
  const onFileInputRef = (element: HTMLInputElement | null) => {
    if (fileInputRef) {
      fileInputRef.current = element
    }
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileChange(e)
  }
  const handleOpenFileSelection = () => {
    if (fileInputRef) {
      openFileSelection({ fileInputRef })
    }
  }
  if (isUploading) {
    return <FileUploading progress={progress} />
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
    <>
      <EmptyFileCard errors={errors} fileDragHandler={fileDragHandler} handleSelectorClick={handleOpenFileSelection} />
      <FileUploadForm fileInputRef={onFileInputRef} onFileChange={handleFileChange} />
    </>
  )
}
