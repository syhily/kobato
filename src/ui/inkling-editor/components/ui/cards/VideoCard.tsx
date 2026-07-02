import type { RefObject } from 'react'

import type {
  DragHandlerLike,
  FileChangeEvent,
  FileUploaderLike,
} from '@/ui/inkling-editor/components/ui/cards/AudioCard'

import ImgFullIcon from '@/ui/inkling-editor/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/ui/inkling-editor/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/ui/inkling-editor/assets/icons/inkling-img-wide.svg?react'
import PlayIcon from '@/ui/inkling-editor/assets/icons/inkling-play.svg?react'
import { CardCaptionEditor } from '@/ui/inkling-editor/components/ui/CardCaptionEditor'
import { MediaPlaceholder } from '@/ui/inkling-editor/components/ui/MediaPlaceholder'
import { MediaPlayer } from '@/ui/inkling-editor/components/ui/MediaPlayer'
import { ProgressBar } from '@/ui/inkling-editor/components/ui/ProgressBar'
import { ReadOnlyOverlay } from '@/ui/inkling-editor/components/ui/ReadOnlyOverlay'
import {
  ButtonGroupSetting,
  MediaUploadSetting,
  SettingsPanel,
  ToggleSetting,
} from '@/ui/inkling-editor/components/ui/SettingsPanel'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

interface PopulatedVideoCardProps {
  thumbnail: string
  customThumbnail: string
  onCustomThumbnailChange: (e: FileChangeEvent) => void
  videoUploader?: FileUploaderLike
  customThumbnailUploader?: FileUploaderLike
  onRemoveCustomThumbnail: () => void
  totalDuration: string
  cardWidth: string
  isLoopChecked: boolean
  onLoopChange: (checked: boolean) => void
  onCardWidthChange: (width: string) => void
  isEditing?: boolean
  thumbnailMimeTypes: string[]
  thumbnailDragHandler?: DragHandlerLike
}

function PopulatedVideoCard({
  thumbnail,
  customThumbnail,
  onCustomThumbnailChange,
  videoUploader = {} as FileUploaderLike,
  customThumbnailUploader = {} as FileUploaderLike,
  onRemoveCustomThumbnail,
  totalDuration,
  cardWidth,
  isLoopChecked,
  onLoopChange,
  onCardWidthChange,
  isEditing,
  thumbnailMimeTypes,
  thumbnailDragHandler = {} as DragHandlerLike,
}: PopulatedVideoCardProps) {
  const progressStyle = {
    width: `${videoUploader.progress?.toFixed(0) ?? '0'}%`,
  }

  const buttonGroupChildren = [
    {
      label: 'Regular',
      name: 'regular',
      Icon: ImgRegularIcon,
    },
    {
      label: 'Wide',
      name: 'wide',
      Icon: ImgWideIcon,
    },
    {
      label: 'Full',
      name: 'full',
      Icon: ImgFullIcon,
    },
  ]

  // oxlint-disable-next-line typescript/no-explicit-any
  return (
    <>
      <div className="not-inkling-prose relative" data-testid="video-card-populated">
        <div>
          <img alt="Video thumbnail" className="mx-auto" src={thumbnail} />
          {customThumbnail && (
            <img
              alt="Video custom thumbnail"
              className="absolute inset-0 size-full bg-white object-cover"
              src={customThumbnail}
            />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/0 via-black/5 to-black/30">
          {videoUploader.isLoading || (
            <button className="flex size-20 items-center justify-center rounded-full bg-black/50" type="button">
              <PlayIcon className="h-auto w-5 fill-white" />
            </button>
          )}
        </div>
        <div
          className={`absolute bottom-0 flex h-20 w-full justify-end bg-gradient-to-b from-black/0 to-black/50 ${cardWidth === 'full' ? 'px-7 py-4' : 'px-4'}`}
        >
          <MediaPlayer duration={totalDuration} theme="light" />
        </div>
        {/* This prevents interacting with the buttons that don't do anything, causing focus loss */}
        <ReadOnlyOverlay />
      </div>
      {videoUploader.isLoading && (
        <div
          className="absolute inset-0 flex min-w-full items-center justify-center overflow-hidden bg-white/50"
          data-testid="video-progress"
        >
          <ProgressBar bgStyle="transparent" style={progressStyle} />
        </div>
      )}

      {!!thumbnail && !videoUploader.isLoading && isEditing && (
        <SettingsPanel>
          <ButtonGroupSetting
            buttons={buttonGroupChildren}
            label="Video width"
            selectedName={cardWidth}
            onClick={onCardWidthChange}
          />
          <ToggleSetting
            dataTestId="loop-video"
            description="Autoplay your video on a loop without sound."
            isChecked={isLoopChecked}
            label="Loop"
            onChange={onLoopChange}
          />
          <MediaUploadSetting
            alt="Custom thumbnail"
            borderStyle={'simple'}
            dataTestId="custom-thumbnail-replace"
            errors={customThumbnailUploader.errors}
            icon="file"
            isDraggedOver={thumbnailDragHandler.isDraggedOver}
            isLoading={customThumbnailUploader.isLoading}
            label="Custom thumbnail"
            mimeTypes={thumbnailMimeTypes}
            placeholderRef={thumbnailDragHandler.setRef as (node: HTMLElement | null) => void}
            progress={customThumbnailUploader.progress}
            size="xsmall"
            src={customThumbnail}
            onFileChange={onCustomThumbnailChange}
            onRemoveMedia={onRemoveCustomThumbnail}
          />
        </SettingsPanel>
      )}
    </>
  )
}

interface EmptyVideoCardProps {
  onFileChange: (e: React.ChangeEvent<HTMLFormElement>) => void
  fileInputRef: RefObject<HTMLInputElement>
  errors?: Array<{ message?: string }>
  videoMimeTypes?: string[]
  videoDragHandler?: DragHandlerLike
}

function EmptyVideoCard({
  onFileChange,
  fileInputRef,
  errors,
  videoMimeTypes = [],
  videoDragHandler = {} as DragHandlerLike,
}: EmptyVideoCardProps) {
  return (
    <>
      <MediaPlaceholder
        desc="Click to select a video"
        // oxlint-disable-next-line typescript/no-explicit-any
        errors={errors}
        filePicker={() => openFileSelection({ fileInputRef })}
        icon="video"
        size="small"
        isDraggedOver={videoDragHandler.isDraggedOver}
        placeholderRef={videoDragHandler.setRef as (node: HTMLElement | null) => void}
      />
      <form onChange={onFileChange}>
        <input
          // oxlint-disable-next-line typescript/no-explicit-any
          ref={fileInputRef}
          accept={videoMimeTypes.join(',')}
          hidden={true}
          name="image-input"
          type="file"
        />
      </form>
    </>
  )
}

interface VideoHolderProps {
  fileInputRef: RefObject<HTMLInputElement>
  onVideoFileChange: (e: React.ChangeEvent<HTMLFormElement>) => void
  videoDragHandler: DragHandlerLike
  videoUploader?: FileUploaderLike
  videoUploadErrors?: Array<{ message?: string }>
  videoMimeTypes: string[]
  customThumbnail: string
  thumbnail: string
  onCustomThumbnailChange: (e: FileChangeEvent) => void
  customThumbnailUploader?: FileUploaderLike
  onRemoveCustomThumbnail: () => void
  totalDuration: string
  cardWidth: string
  isLoopChecked: boolean
  onLoopChange: (checked: boolean) => void
  onCardWidthChange: (width: string) => void
  isEditing?: boolean
  thumbnailMimeTypes: string[]
  thumbnailDragHandler?: DragHandlerLike
}

const VideoHolder = ({
  fileInputRef,
  onVideoFileChange,
  videoDragHandler,
  videoUploader = {} as FileUploaderLike,
  videoUploadErrors,
  videoMimeTypes,
  ...props
}: VideoHolderProps) => {
  const showPopulatedCard = props.customThumbnail || props.thumbnail || videoUploader.isLoading
  if (showPopulatedCard) {
    return <PopulatedVideoCard {...props} videoUploader={videoUploader} />
  } else {
    return (
      <EmptyVideoCard
        errors={videoUploadErrors}
        fileInputRef={fileInputRef}
        videoDragHandler={videoDragHandler}
        videoMimeTypes={videoMimeTypes}
        onFileChange={onVideoFileChange}
      />
    )
  }
}

export interface VideoCardProps {
  captionEditor: import('lexical').LexicalEditor | null
  captionEditorInitialState: import('lexical').EditorState | undefined
  isSelected?: boolean
  isEditing?: boolean
  fileInputRef: RefObject<HTMLInputElement>
  onVideoFileChange: (e: React.ChangeEvent<HTMLFormElement>) => void
  videoDragHandler: DragHandlerLike
  videoUploader?: FileUploaderLike
  videoUploadErrors?: Array<{ message?: string }>
  videoMimeTypes: string[]
  customThumbnail: string
  thumbnail: string
  onCustomThumbnailChange: (e: FileChangeEvent) => void
  customThumbnailUploader?: FileUploaderLike
  onRemoveCustomThumbnail: () => void
  totalDuration: string
  cardWidth: string
  isLoopChecked: boolean
  onLoopChange: (checked: boolean) => void
  onCardWidthChange: (width: string) => void
  thumbnailMimeTypes: string[]
  thumbnailDragHandler?: DragHandlerLike
}

export function VideoCard({
  captionEditor,
  captionEditorInitialState,
  isSelected,
  isEditing,
  ...props
}: VideoCardProps) {
  return (
    <figure className="not-inkling-prose">
      <VideoHolder {...props} isEditing={isEditing} />
      <CardCaptionEditor
        captionEditor={captionEditor!}
        captionEditorInitialState={captionEditorInitialState}
        captionPlaceholder="Type caption for video (optional)"
        dataTestId="video-card-caption"
        isSelected={isSelected}
      />
    </figure>
  )
}
