import type { EditorState, LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import type { DragHandlerLike, FileUploaderLike } from '@/components/ui/cards/card-ui-types'

import ImgFullIcon from '@/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/assets/icons/inkling-img-wide.svg?react'
import PlayIcon from '@/assets/icons/inkling-play.svg?react'
import { CardCaptionEditor } from '@/components/ui/CardCaptionEditor'
import { MediaPlayer } from '@/components/ui/MediaPlayer'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import { ButtonGroupSetting, MediaUploadSetting, SettingsPanel, ToggleSetting } from '@/components/ui/SettingsPanel'
import { UploadingOverlay, UploadPlaceholder } from '@/components/ui/UploadChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'

interface PopulatedVideoCardProps {
  thumbnail: string
  customThumbnail: string
  onCustomThumbnailChange: (files: File[]) => void
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
  videoUploader,
  customThumbnailUploader,
  onRemoveCustomThumbnail,
  totalDuration,
  cardWidth,
  isLoopChecked,
  onLoopChange,
  onCardWidthChange,
  isEditing,
  thumbnailMimeTypes,
  thumbnailDragHandler,
}: PopulatedVideoCardProps) {
  const labels = useInklingLabels()

  const buttonGroupChildren = [
    {
      label: labels['settings.layout.regular'],
      name: 'regular',
      Icon: ImgRegularIcon,
    },
    {
      label: labels['settings.layout.wide'],
      name: 'wide',
      Icon: ImgWideIcon,
    },
    {
      label: labels['settings.layout.full'],
      name: 'full',
      Icon: ImgFullIcon,
    },
  ]

  return (
    <>
      <div className="not-inkling-prose relative" data-testid="video-card-populated">
        <div>
          <img alt={labels['alt.videoThumbnail']} className="mx-auto" src={thumbnail} />
          {customThumbnail && (
            <img
              alt={labels['alt.videoCustomThumbnail']}
              className="absolute inset-0 size-full bg-white object-cover"
              src={customThumbnail}
            />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/0 via-black/5 to-black/30">
          {videoUploader?.isLoading || (
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
      {videoUploader?.isLoading && (
        <UploadingOverlay bgStyle="transparent" dataTestId="video-progress" progress={videoUploader?.progress} />
      )}

      {!!thumbnail && !videoUploader?.isLoading && isEditing && (
        <SettingsPanel>
          <ButtonGroupSetting
            buttons={buttonGroupChildren}
            label={labels['settings.videoWidth']}
            selectedName={cardWidth}
            onClick={onCardWidthChange}
          />
          <ToggleSetting
            dataTestId="loop-video"
            description={labels['settings.loop.description']}
            isChecked={isLoopChecked}
            label={labels['settings.loop']}
            onChange={onLoopChange}
          />
          <MediaUploadSetting
            alt={labels['alt.customThumbnail']}
            borderStyle={'simple'}
            errors={customThumbnailUploader?.errors}
            icon="file"
            isDraggedOver={thumbnailDragHandler?.isDraggedOver}
            isLoading={customThumbnailUploader?.isLoading}
            label={labels['settings.customThumbnail']}
            mimeTypes={thumbnailMimeTypes}
            placeholderRef={thumbnailDragHandler?.setRef}
            progress={customThumbnailUploader?.progress}
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

export interface VideoCardProps {
  captionEditor: LexicalEditor | null
  captionEditorInitialState: EditorState | undefined
  isSelected?: boolean
  isEditing?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onVideoFileChange: (files: File[]) => void
  videoDragHandler: DragHandlerLike
  videoUploader?: FileUploaderLike
  videoUploadErrors?: Array<{ message?: string }>
  videoMimeTypes: string[]
  customThumbnail: string
  thumbnail: string
  onCustomThumbnailChange: (files: File[]) => void
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
  fileInputRef,
  onVideoFileChange,
  videoDragHandler,
  videoUploader,
  videoUploadErrors,
  videoMimeTypes,
  ...props
}: VideoCardProps) {
  const labels = useInklingLabels()
  const showPopulatedCard = props.customThumbnail || props.thumbnail || videoUploader?.isLoading

  return (
    <figure className="not-inkling-prose">
      {showPopulatedCard ? (
        <PopulatedVideoCard {...props} isEditing={isEditing} videoUploader={videoUploader} />
      ) : (
        <UploadPlaceholder
          desc={labels['upload.video.desc']}
          dragHandler={videoDragHandler}
          errors={videoUploadErrors}
          fileInputRef={fileInputRef}
          icon="video"
          inputName="video-input"
          mimeTypes={videoMimeTypes}
          size="small"
          onFileChange={onVideoFileChange}
        />
      )}
      <CardCaptionEditor
        captionEditor={captionEditor}
        captionEditorInitialState={captionEditorInitialState}
        captionPlaceholder={labels['caption.video.placeholder']}
        dataTestId="video-card-caption"
        isSelected={isSelected}
      />
    </figure>
  )
}
