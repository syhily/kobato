import clsx from 'clsx'

import AudioPlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-audio-placeholder.svg?react'
import FilePlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-file-placeholder.svg?react'
import GalleryPlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-gallery-placeholder.svg?react'
import ImgPlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-img-placeholder.svg?react'
import ProductPlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-product-placeholder.svg?react'
import VideoPlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-video-placeholder.svg?react'

export const PLACEHOLDER_ICONS: Record<string, typeof ImgPlaceholderIcon> = {
  image: ImgPlaceholderIcon,
  gallery: GalleryPlaceholderIcon,
  video: VideoPlaceholderIcon,
  audio: AudioPlaceholderIcon,
  file: FilePlaceholderIcon,
  product: ProductPlaceholderIcon,
}

export const CardText = ({ text, type }: { text?: string; type?: string }) => (
  <span
    className={clsx(
      'font-sans text-sm font-semibold text-grey-800 group-hover:text-grey-800 text-center transition-all',
      type === 'button' && 'px-3 py-1',
    )}
    data-inkling-card-drag-text
  >
    {text}
  </span>
)

const ButtonContents = ({ desc, hasErrors }: { desc?: string; hasErrors?: boolean }) => {
  if (hasErrors) {
    return null
  }
  return <p className="!font-sans !text-[0.8125rem] !font-medium text-grey-900">{desc}</p>
}

const StandardContents = ({
  desc,
  hasErrors,
  icon,
  size,
}: {
  desc?: string
  hasErrors?: boolean
  icon: keyof typeof PLACEHOLDER_ICONS
  size?: string
}) => {
  if (size === 'xsmall' && hasErrors) {
    return null
  }

  const Icon = PLACEHOLDER_ICONS[icon]

  const iconClasses = clsx(
    'shrink-0 opacity-80 transition-all ease-linear group-hover:opacity-100 hover:scale-105',
    size === 'large' && 'size-20 text-grey',
    size === 'small' && 'size-14 text-grey',
    size === 'xsmall' && 'size-5 text-grey-700',
    !['large', 'small', 'xsmall'].includes(size!) && 'size-16 text-grey',
    size === 'xsmall' && desc && 'mr-3',
  )

  const descriptionClasses = clsx(
    '!font-sans !text-sm !font-normal text-grey-700 flex min-w-[auto] opacity-80 transition-all group-hover:opacity-100',
    size === 'xsmall' && '!mt-0',
    size !== 'xsmall' && '!mt-4',
  )

  return (
    <>
      <Icon className={iconClasses} />
      <p className={descriptionClasses}>{desc}</p>
    </>
  )
}

export function MediaPlaceholder({
  desc,
  icon,
  filePicker,
  size,
  type,
  borderStyle = 'squared',
  isDraggedOver,
  errors = [],
  placeholderRef,
  dataTestId = 'media-placeholder',
  errorDataTestId = 'media-placeholder-errors',
  multiple = false,
  ...props
}: {
  desc: string
  icon: keyof typeof PLACEHOLDER_ICONS
  filePicker: () => void
  size: string
  type?: string
  borderStyle?: 'squared' | 'rounded' | 'simple' | 'heavy'
  isDraggedOver?: boolean
  errors?: Error[] | { message?: string }[]
  placeholderRef?: (node: HTMLElement | null) => void
  dataTestId?: string
  errorDataTestId?: string
  multiple?: boolean
}) {
  const containerClasses = clsx(
    'relative flex h-full items-center justify-center',
    type === 'button' ? 'rounded-lg bg-grey-100' : 'bg-grey-50 border',
    size === 'xsmall' && type !== 'button' && 'dark:bg-grey-900 before:pb-[12.5%]',
    size !== 'xsmall' && type !== 'button' && 'dark:bg-grey-950 before:pb-[62.5%]',
    (borderStyle === 'rounded' || borderStyle === 'heavy') &&
      type !== 'button' &&
      'rounded-lg border-grey/20 dark:border-transparent',
    (borderStyle === 'squared' || borderStyle === 'simple') &&
      type !== 'button' &&
      'border-grey/20 dark:border-grey/10',
  )

  const buttonClasses = clsx(
    'group flex cursor-pointer items-center justify-center select-none',
    type === 'button' && 'px-3 py-1',
    type !== 'button' && (size === 'xsmall' ? 'p-4' : 'p-20 flex-col'),
  )

  const errorClasses = clsx('font-sans text-sm font-semibold text-red', size !== 'xsmall' && 'mt-3 max-w-[65%]')

  const errorMessages = errors?.map((error) => (
    <span key={error.message} className={errorClasses} data-testid={errorDataTestId}>
      {error.message}
    </span>
  ))

  return (
    <div ref={placeholderRef} className="not-inkling-prose size-full" {...props} data-testid={dataTestId}>
      <div className={containerClasses}>
        {isDraggedOver ? (
          <CardText text={`Drop ${multiple ? "'em" : 'it'} like it's hot 🔥`} type={type} />
        ) : (
          <button className={buttonClasses} name="placeholder-button" type="button" onClick={filePicker}>
            {type === 'button' ? (
              <ButtonContents desc={desc} hasErrors={errors.length > 0} />
            ) : (
              <StandardContents desc={desc} hasErrors={errors.length > 0} icon={icon} size={size} />
            )}

            {errorMessages}
          </button>
        )}
      </div>
    </div>
  )
}
