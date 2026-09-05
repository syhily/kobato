import type { InitialEditorStateType } from '@lexical/react/LexicalComposer'
import type { LexicalEditor } from 'lexical'

import React, { useEffect, useState } from 'react'

import type { DragHandlerLike, FileUploaderLike } from '@/components/ui/cards/card-ui-types'

import CenterAlignIcon from '@/assets/icons/inkling-align-center.svg?react'
import LeftAlignIcon from '@/assets/icons/inkling-align-left.svg?react'
import ExpandIcon from '@/assets/icons/inkling-expand.svg?react'
import ImgBgIcon from '@/assets/icons/inkling-img-bg.svg?react'
import ImgFullIcon from '@/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/assets/icons/inkling-img-wide.svg?react'
import LayoutSplitIcon from '@/assets/icons/inkling-layout-split.svg?react'
import ShrinkIcon from '@/assets/icons/inkling-shrink.svg?react'
import InklingNestedEditor from '@/components/InklingNestedEditor'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { MediaUploader } from '@/components/ui/MediaUploader'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import {
  ButtonGroupSetting,
  ColorPickerSetting,
  InputSetting,
  InputUrlSetting,
  MediaUploadSetting,
  SettingsPanel,
  ToggleSetting,
} from '@/components/ui/SettingsPanel'
import { Tooltip } from '@/components/ui/Tooltip'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import {
  headerHexColor,
  matchingHeaderTextColor,
  resolveHeaderImageTextColor,
} from '@/nodes/header/header-accent-color'
import trackEvent from '@/utils/analytics'
import { cx } from '@/utils/cx'
import { isEditorEmpty } from '@/utils/isEditorEmpty'

/** The card's view state — every presentational value the node carries. */
export interface HeaderCardViewModel {
  alignment?: string
  backgroundColor?: string
  backgroundImageSrc?: string
  backgroundSize?: 'cover' | 'contain'
  buttonColor?: string
  buttonEnabled?: boolean
  buttonText?: string
  buttonTextColor?: string
  buttonUrl?: string
  isEditing?: boolean
  isSwapped?: boolean
  layout?: 'regular' | 'wide' | 'full' | 'split'
  showBackgroundImage?: boolean
  textColor?: string
}

/** The card's write handlers — field-name-as-data on the node side (header-field-writer). */
export interface HeaderCardHandlers {
  handleAlignment: (alignment: string) => void
  handleBackgroundColor: (color: string, matchingTextColor: string) => void
  handleBackgroundSize: (size: string) => void
  handleButtonColor: (color: string, matchingTextColor: string) => void
  handleButtonEnabled: () => void
  handleButtonText: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleButtonTextBlur: (event: React.FocusEvent<HTMLInputElement>) => void
  handleButtonUrl: (value: string) => void
  handleButtonUrlBlur: (event: React.FocusEvent<HTMLInputElement>) => void
  handleClearBackgroundImage: () => void
  handleHideBackgroundImage: () => void
  handleLayout: (layout: string) => void
  handleShowBackgroundImage: () => void
  handleSwapLayout: () => void
  handleTextColor: (color: string) => void
}

/** The background-image upload channel (the media-card upload wiring). */
export interface HeaderCardUpload {
  fileUploader?: FileUploaderLike
  imageDragHandler: DragHandlerLike
  isPinturaEnabled?: boolean
  openImageEditor: (options: { image: string; handleSave: (blob: Blob) => void }) => void
  setFileInputRef: (ref: React.RefObject<HTMLInputElement | null>) => void
  onFileChange: (files: File[]) => void
}

/** The two nested editors. */
export interface HeaderCardEditors {
  headerTextEditor: LexicalEditor
  headerTextEditorInitialState?: InitialEditorStateType
  subheaderTextEditor: LexicalEditor
  subheaderTextEditorInitialState?: InitialEditorStateType
}

// The seam, narrowed: four view-model objects instead of ~40 flat props.
// Internally the groups flatten — the card body is unchanged.
interface HeaderCardProps {
  view: HeaderCardViewModel
  handlers: HeaderCardHandlers
  upload: HeaderCardUpload
  editors: HeaderCardEditors
}

export function HeaderCard({ view, handlers, upload, editors }: HeaderCardProps) {
  const {
    alignment,
    backgroundColor,
    backgroundImageSrc,
    backgroundSize,
    buttonColor,
    buttonEnabled,
    buttonText,
    buttonTextColor,
    buttonUrl,
    isEditing,
    isSwapped,
    layout,
    showBackgroundImage,
    textColor,
  } = view
  const {
    handleAlignment,
    handleBackgroundColor,
    handleBackgroundSize,
    handleButtonColor,
    handleButtonEnabled,
    handleButtonText,
    handleButtonTextBlur,
    handleButtonUrl,
    handleClearBackgroundImage,
    handleHideBackgroundImage,
    handleLayout,
    handleShowBackgroundImage,
    handleSwapLayout,
    handleTextColor,
  } = handlers
  const { fileUploader, imageDragHandler, isPinturaEnabled, openImageEditor, setFileInputRef, onFileChange } = upload
  const { headerTextEditor, headerTextEditorInitialState, subheaderTextEditor, subheaderTextEditorInitialState } =
    editors

  const labels = useInklingLabels()
  const [backgroundColorPickerExpanded, setBackgroundColorPickerExpanded] = useState(false)
  const [buttonColorPickerExpanded, setButtonColorPickerExpanded] = useState(false)

  // the background-image text color resolves in @/nodes/header/header-accent-color
  useEffect(() => {
    let cancelled = false
    void resolveHeaderImageTextColor(backgroundImageSrc, layout).then((color) => {
      // the background image changed again before the color was
      // extracted — don't apply the previous image's color
      if (color && !cancelled) {
        handleTextColor(color)
      }
    })
    return () => {
      cancelled = true
    }
    // This is only needed when the background image or layout is changed
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImageSrc, layout === 'split'])

  useEffect(() => {
    if (backgroundColor && layout === 'split') {
      // Make sure the text color matches the background color
      // It might be different if an image was uploaded in a non-split layout
      handleBackgroundColor(backgroundColor, matchingHeaderTextColor(backgroundColor))
    }
    // This is only needed when the layout is changed
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [layout === 'split'])

  const layoutChildren = [
    {
      label: labels['settings.layout.regular'],
      name: 'regular',
      Icon: ImgRegularIcon,
      dataTestId: 'header-layout-regular',
    },
    {
      label: labels['settings.layout.wide'],
      name: 'wide',
      Icon: ImgWideIcon,
      dataTestId: 'header-layout-wide',
    },
    {
      label: labels['settings.layout.full'],
      name: 'full',
      Icon: ImgFullIcon,
      dataTestId: 'header-layout-full',
    },
    {
      label: labels['settings.layout.split'],
      name: 'split',
      Icon: LayoutSplitIcon,
      dataTestId: 'header-layout-split',
    },
  ]

  const alignmentChildren = [
    {
      label: labels['settings.alignment.left'],
      name: 'left',
      Icon: LeftAlignIcon,
      dataTestId: 'header-alignment-left',
    },
    {
      label: labels['settings.alignment.center'],
      name: 'center',
      Icon: CenterAlignIcon,
      dataTestId: 'header-alignment-center',
    },
  ]

  const { isLoading, progress } = fileUploader || {}

  const headerPlaceholder =
    layout === 'split' ? labels['header.heading.placeholder.split'] : labels['header.heading.placeholder']
  const subheaderPlaceholder =
    layout === 'split' ? labels['header.subheading.placeholder.split'] : labels['header.subheading.placeholder']

  const wrapperStyle = () => {
    if (backgroundImageSrc && layout !== 'split' && textColor) {
      return {
        backgroundImage: `url(${backgroundImageSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundColor: 'white',
        color: headerHexColor(textColor || ''),
      }
    } else if (backgroundColor && textColor) {
      return {
        backgroundColor: headerHexColor(backgroundColor),
        color: headerHexColor(textColor || ''),
      }
    }

    return {
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ctitle%3ERectangle%3C/title%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath fill='%23F2F6F8' d='M0 0h24v24H0z'/%3E%3Cpath fill='%23E5ECF0' d='M0 0h12v12H0zM12 12h12v12H12z'/%3E%3C/g%3E%3C/svg%3E")`,
      backgroundColor: 'transparent',
      color: headerHexColor(textColor || ''),
    }
  }

  const toggleBackgroundSize = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (backgroundSize === 'cover') {
      handleBackgroundSize('contain')
      trackEvent('header Card Toggle Size', { size: 'contain' })
    } else {
      handleBackgroundSize('cover')
      trackEvent('header Card Toggle Size', { size: 'cover' })
    }
  }

  const toggleSwapped = () => {
    trackEvent('header Card Toggle Swapped', { swapped: !isSwapped })
    handleSwapLayout()
  }

  const toggleButton = () => {
    trackEvent('header card button toggled', { buttonEnabled: !buttonEnabled })
    handleButtonEnabled()
  }

  const correctedBackgroundSize = backgroundSize === 'contain' && backgroundImageSrc ? 'contain' : 'cover'

  // Tailwind scans source text, so no runtime interpolation — map the
  // alignment vocabulary to full class names ('' / legacy values read as
  // left, the element's default)
  const buttonAlignmentClass = alignment === 'center' ? 'text-center' : 'text-left'

  const getButtonSize = (layoutString: string) => {
    if (layoutString === 'regular') {
      return 'medium'
    }

    if (layoutString === 'wide') {
      return 'medium'
    }

    if (layoutString === 'full') {
      return 'large'
    }

    if (layoutString === 'split') {
      return 'medium'
    }
  }

  return (
    <>
      <div
        className="flex w-full font-sans text-black transition-colors ease-in-out"
        data-testid={'header-card-container'}
        style={wrapperStyle()}
      >
        <div
          className={cx(
            'flex w-full flex-col transition-colors ease-in-out sm:flex-row',
            layout === 'split' && isSwapped && 'flex-col-reverse sm:flex-row-reverse',
            // This is needed to align the content with wide breakout width
            (layout === 'full' || (layout === 'split' && correctedBackgroundSize === 'contain')) &&
              'mx-auto w-[calc(740px+4rem)] xs:w-[calc(740px+8rem)] md:w-[calc(740px+12rem)] lg:w-[calc(740px+22rem)] xl:w-[calc(740px+40rem)]',
            backgroundImageSrc && layout === 'split' && correctedBackgroundSize === 'contain' && 'items-center',
          )}
          data-testid={'header-card-content'}
        >
          {layout === 'split' && (
            <MediaUploader
              additionalActions={
                <>
                  <IconButton
                    dataTestId="media-upload-size"
                    Icon={backgroundSize === 'cover' ? ShrinkIcon : ExpandIcon}
                    label={
                      backgroundSize === 'cover'
                        ? labels['header.backgroundSize.contain']
                        : labels['header.backgroundSize.cover']
                    }
                    onClick={toggleBackgroundSize}
                  />
                </>
              }
              alt={labels['alt.backgroundImage']}
              backgroundSize={backgroundSize}
              className={cx(
                'sm:w-1/2',
                correctedBackgroundSize === 'contain' && 'sm:my-10 md:my-14',
                !isSwapped &&
                  correctedBackgroundSize === 'contain' &&
                  'mt-10 px-[calc(32px-(4rem/2))] xs:px-[calc(92px-(8rem/2))] sm:pr-0 sm:pl-[calc(92px-(12rem/2))] md:pl-[calc(92px-(12rem/2))] lg:pl-0',
                isSwapped &&
                  correctedBackgroundSize === 'contain' &&
                  'mb-10 px-[calc(32px-(4rem/2))] xs:px-[calc(92px-(8rem/2))] sm:pr-[calc(92px-(12rem/2))] sm:pl-0 md:pr-[calc(92px-(12rem/2))] lg:pr-0',
              )}
              desc={labels['upload.header.desc']}
              dragHandler={imageDragHandler}
              errors={fileUploader?.errors}
              icon="image"
              imgClassName={`${correctedBackgroundSize === 'cover' && 'aspect-[3/2]'}`}
              isEditing={isEditing}
              isLoading={isLoading}
              isPinturaEnabled={isPinturaEnabled}
              mimeTypes={['image/*']}
              openImageEditor={openImageEditor}
              progress={progress}
              size="large"
              src={backgroundImageSrc}
              onFileChange={onFileChange}
              onRemoveMedia={handleClearBackgroundImage}
            />
          )}

          <div
            className={cx(
              'mx-auto flex w-full flex-1 flex-col justify-center',
              alignment === 'center' && 'items-center',
              layout === 'regular' && 'p-[4rem] sm:py-[6rem] md:px-[6rem] md:py-[10rem] lg:px-[8rem]',
              layout === 'wide' && 'max-w-[740px] p-[4rem] sm:py-[6rem] md:px-[8rem] md:py-[14rem] lg:px-0',
              layout === 'full' &&
                'px-[calc(32px-(4rem/2))] py-[4rem] xs:px-[calc(92px-(8rem/2))] sm:py-[6rem] md:px-[calc(92px-(12rem/2))] md:py-[12rem] lg:px-0 lg:py-[14rem] xl:py-[18rem]',
              layout === 'split' && 'p-[4rem] sm:py-[6rem] md:px-[6rem] md:py-[12rem] lg:px-[8rem] lg:py-[16rem]',
              !isSwapped &&
                layout === 'split' &&
                correctedBackgroundSize === 'contain' &&
                'px-[calc(32px-(4rem/2))] xs:px-[calc(92px-(8rem/2))] sm:px-[calc(92px-(12rem/2))] md:pr-[calc(92px-(12rem/2))] lg:pr-0',
              isSwapped &&
                layout === 'split' &&
                correctedBackgroundSize === 'contain' &&
                'px-[calc(32px-(4rem/2))] xs:px-[calc(92px-(8rem/2))] sm:px-[calc(92px-(12rem/2))] md:pl-[calc(92px-(12rem/2))] lg:pl-0',
            )}
          >
            {/* Heading */}
            {
              <InklingNestedEditor
                autoFocus={true}
                dataTestId="header-heading-editor"
                focusNext={subheaderTextEditor}
                hasSettingsPanel={true}
                hiddenFormats={['bold']}
                initialEditor={headerTextEditor}
                initialEditorState={headerTextEditorInitialState}
                nodes="minimal"
                placeholderClassName={cx(
                  '!leading-[1.1] !font-bold !tracking-tight opacity-50',
                  alignment === 'center' && 'text-center',
                  layout === 'regular' && 'text-3xl sm:text-4xl',
                  (layout === 'wide' || layout === 'split') && 'text-3xl sm:text-4xl md:text-5xl',
                  layout === 'full' && 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl',
                )}
                placeholderText={headerPlaceholder}
                singleParagraph={true}
                textClassName={cx(
                  'inkling-lexical-heading relative w-full font-bold whitespace-normal caret-current',
                  !isEditing && isEditorEmpty(headerTextEditor) ? 'hidden' : 'peer',
                  alignment === 'center' && 'text-center [&:has(.placeholder)]:w-fit [&:has(.placeholder)]:text-left',
                  layout === 'regular' && 'heading-small',
                  (layout === 'wide' || layout === 'split') && 'heading-medium',
                  layout === 'full' && 'heading-large',
                )}
              />
            }

            {/* Subheading */}
            {
              <InklingNestedEditor
                dataTestId="header-subheader-editor"
                defaultInklingEnterBehaviour={true}
                hasSettingsPanel={true}
                initialEditor={subheaderTextEditor}
                initialEditorState={subheaderTextEditorInitialState}
                nodes="minimal"
                placeholderClassName={cx(
                  '!leading-snug !font-medium !tracking-tight opacity-60',
                  alignment === 'center' && 'text-center',
                  layout === 'regular' && 'text-lg sm:text-xl',
                  (layout === 'wide' || layout === 'split') && 'text-lg leading-snug sm:text-xl md:text-[2.2rem]',
                  layout === 'full' && 'text-lg sm:text-xl md:text-[2.2rem] lg:text-[2.6rem] xl:max-w-[880px]',
                )}
                placeholderText={subheaderPlaceholder}
                singleParagraph={true}
                textClassName={cx(
                  'inkling-lexical-subheading relative w-full whitespace-normal caret-current',
                  !isEditing && isEditorEmpty(subheaderTextEditor) ? 'hidden' : 'peer',
                  alignment === 'center' && 'text-center [&:has(.placeholder)]:w-fit [&:has(.placeholder)]:text-left',
                  layout === 'regular' && 'subheading-small !mt-2',
                  (layout === 'wide' || layout === 'split') && 'subheading-medium !mt-3',
                  layout === 'full' && 'subheading-large !mt-3 xl:max-w-[880px]',
                )}
              />
            }

            {/* Button */}

            {buttonEnabled && (
              <div
                className={`${buttonAlignmentClass} w-full ${layout === 'regular' ? 'peer-[.inkling-lexical]:mt-8' : layout === 'wide' ? 'peer-[.inkling-lexical]:mt-8 md:w-2/3' : layout === 'full' ? 'peer-[.inkling-lexical]:mt-8 md:w-2/3 peer-[.inkling-lexical]:md:mt-8 xl:w-1/2' : 'max-w-[500px] peer-[.inkling-lexical]:mt-8 peer-[.inkling-lexical]:md:mt-8'}`}
              >
                <Button
                  dataTestId="header-card-button"
                  disabled={true}
                  placeholder={labels['button.text.placeholder']}
                  size={getButtonSize(layout || 'regular')}
                  style={
                    buttonColor
                      ? {
                          backgroundColor: headerHexColor(buttonColor),
                          color: headerHexColor(buttonTextColor || ''),
                        }
                      : { backgroundColor: `#000000`, color: `#ffffff` }
                  }
                  value={buttonText || ''}
                />
              </div>
            )}
          </div>
        </div>

        {/* Read-only overlay */}
        {!isEditing && <ReadOnlyOverlay />}
      </div>

      {isEditing && (
        <SettingsPanel cardWidth={layout} className="mt-0">
          <ButtonGroupSetting
            buttons={layoutChildren}
            label={labels['settings.layout']}
            selectedName={layout}
            onClick={handleLayout}
          />

          {layout === 'split' && (
            <ToggleSetting
              dataTestId="header-swapped"
              isChecked={!!isSwapped}
              label={labels['settings.flipLayout']}
              onChange={toggleSwapped}
            />
          )}

          <ButtonGroupSetting
            buttons={alignmentChildren}
            label={labels['settings.alignment']}
            selectedName={alignment}
            onClick={handleAlignment}
          />

          <ColorPickerSetting
            dataTestId="header-background-color"
            eyedropper={layout === 'split'}
            hasTransparentOption={true}
            isExpanded={backgroundColorPickerExpanded}
            label={labels['settings.background']}
            swatches={[
              ...(layout !== 'split'
                ? [
                    {
                      title: labels['color.image'],
                      customContent: (
                        <button
                          className={cx(
                            `group relative flex size-6 shrink-0 items-center justify-center rounded-full border border-grey-300 bg-grey-100 text-black`,
                            showBackgroundImage && 'outline outline-2 outline-green',
                          )}
                          data-testid="header-background-image-toggle"
                          title={labels['color.image']}
                          type="button"
                          onClick={() => {
                            handleShowBackgroundImage()
                            setBackgroundColorPickerExpanded(false)
                            setButtonColorPickerExpanded(false)
                          }}
                        >
                          <ImgBgIcon className="size-[1.4rem]" />
                          <Tooltip label={labels['color.image']} />
                        </button>
                      ),
                    },
                  ]
                : []),
              { title: labels['color.black'], hex: '#000000' },
              { title: labels['color.grey'], hex: '#F0F0F0' },
              { title: labels['color.brandColor'], accent: true },
            ]}
            value={showBackgroundImage && layout !== 'split' ? 'image' : backgroundColor || ''}
            onPickerChange={(color) => handleBackgroundColor(color, matchingHeaderTextColor(color))}
            onSwatchChange={(color) => {
              handleBackgroundColor(color, matchingHeaderTextColor(color))
              setBackgroundColorPickerExpanded(false)
            }}
            onTogglePicker={(isExpanded) => {
              if (isExpanded) {
                if (layout !== 'split') {
                  handleHideBackgroundImage()
                }

                if (backgroundColor) {
                  handleBackgroundColor(backgroundColor, matchingHeaderTextColor(backgroundColor))
                }
              }

              setBackgroundColorPickerExpanded(!!isExpanded)
              if (isExpanded) {
                setButtonColorPickerExpanded(!isExpanded)
              }
            }}
          >
            <MediaUploadSetting
              alt={labels['alt.backgroundImage']}
              borderStyle="rounded"
              className={cx('min-w-[296px]', (!showBackgroundImage || layout === 'split') && 'hidden')}
              errors={fileUploader?.errors}
              hideLabel={layout !== 'split'}
              icon="file"
              imgClassName="w-full"
              isDraggedOver={imageDragHandler?.isDraggedOver}
              isLoading={isLoading}
              isPinturaEnabled={isPinturaEnabled}
              label={labels['settings.backgroundImage']}
              mimeTypes={['image/*']}
              openImageEditor={openImageEditor}
              placeholderRef={imageDragHandler?.setRef ?? undefined}
              progress={progress}
              setFileInputRef={setFileInputRef}
              size="xsmall"
              src={backgroundImageSrc}
              stacked={true}
              onFileChange={onFileChange}
              onRemoveMedia={() => {
                handleClearBackgroundImage()
                handleTextColor(matchingHeaderTextColor(backgroundColor || ''))
              }}
            />
          </ColorPickerSetting>

          {/* Button settings */}
          <ToggleSetting
            dataTestId="header-button-toggle"
            isChecked={!!buttonEnabled}
            label={labels['settings.button']}
            onChange={toggleButton}
          />
          {buttonEnabled && (
            <>
              <ColorPickerSetting
                dataTestId="header-button-color"
                eyedropper={layout === 'split'}
                isExpanded={buttonColorPickerExpanded}
                label={labels['settings.buttonColor']}
                swatches={[
                  { title: labels['color.white'], hex: '#ffffff' },
                  { title: labels['color.black'], hex: '#000000' },
                  { title: labels['color.brandColor'], accent: true },
                ]}
                value={buttonColor || ''}
                onPickerChange={(color) => handleButtonColor(color, matchingHeaderTextColor(color))}
                onSwatchChange={(color) => {
                  handleButtonColor(color, matchingHeaderTextColor(color))
                  setButtonColorPickerExpanded(false)
                }}
                onTogglePicker={(isExpanded) => {
                  setButtonColorPickerExpanded(!!isExpanded)
                  if (isExpanded) {
                    setBackgroundColorPickerExpanded(!isExpanded)
                  }
                }}
              />
              <InputSetting
                dataTestId="header-button-text"
                label={labels['settings.buttonText']}
                placeholder={labels['button.text.placeholder']}
                value={buttonText || ''}
                onBlur={handleButtonTextBlur}
                onChange={handleButtonText}
              />
              <InputUrlSetting
                dataTestId="header-button-url"
                label={labels['settings.buttonUrl']}
                value={buttonUrl || ''}
                onChange={handleButtonUrl}
              />
            </>
          )}
        </SettingsPanel>
      )}
    </>
  )
}
