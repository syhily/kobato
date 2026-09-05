import AudioPlaceholderIcon from '@/assets/icons/inkling-audio-placeholder.svg?react'
import FilePlaceholderIcon from '@/assets/icons/inkling-file-placeholder.svg?react'
import GalleryPlaceholderIcon from '@/assets/icons/inkling-gallery-placeholder.svg?react'
import ImgPlaceholderIcon from '@/assets/icons/inkling-img-placeholder.svg?react'
import ProductPlaceholderIcon from '@/assets/icons/inkling-product-placeholder.svg?react'
import VideoPlaceholderIcon from '@/assets/icons/inkling-video-placeholder.svg?react'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { cx } from '@/utils/cx'

export const PLACEHOLDER_ICONS = {
  image: ImgPlaceholderIcon,
  gallery: GalleryPlaceholderIcon,
  video: VideoPlaceholderIcon,
  audio: AudioPlaceholderIcon,
  file: FilePlaceholderIcon,
  product: ProductPlaceholderIcon,
} satisfies Record<string, typeof ImgPlaceholderIcon>

export type PlaceholderIconName = keyof typeof PLACEHOLDER_ICONS

// `icon` arrives as a free string from host-driven props upstream — only the
// declared keys have an icon to render. Object.hasOwn (not `in`) so prototype
// keys like 'constructor' can't slip through and crash the render.
export function isPlaceholderIconName(icon: unknown): icon is PlaceholderIconName {
  return typeof icon === 'string' && Object.hasOwn(PLACEHOLDER_ICONS, icon)
}

export const CardText = ({ text, type }: { text?: string; type?: string }) => (
  <span
    className={cx(
      'text-center font-sans text-sm font-semibold text-grey-800 transition-all group-hover:text-grey-800',
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
  return <p className="!font-sans !text-[1.3rem] !font-medium text-grey-900">{desc}</p>
}

const StandardContents = ({
  desc,
  hasErrors,
  icon,
  size,
}: {
  desc?: string
  hasErrors?: boolean
  icon: PlaceholderIconName
  size: string
}) => {
  if (size === 'xsmall' && hasErrors) {
    return null
  }

  const Icon = PLACEHOLDER_ICONS[icon]

  const iconClasses = cx(
    'shrink-0 opacity-80 transition-all ease-linear group-hover:opacity-100 hover:scale-105',
    size === 'large' && 'size-20 text-grey',
    size === 'small' && 'size-14 text-grey',
    size === 'xsmall' && 'size-5 text-grey-700',
    size === 'medium' && 'size-16 text-grey',
    size === 'xsmall' && desc && 'mr-3',
  )

  const descriptionClasses = cx(
    'flex min-w-[auto] !font-sans !text-sm !font-normal text-grey-700 opacity-80 transition-all group-hover:opacity-100',
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

/** The placeholder's styled sizes ('medium' takes the default-style branch — it is the ErrorState story's size). */
export type MediaPlaceholderSize = 'large' | 'medium' | 'small' | 'xsmall'

/** The placeholder's style variants: 'button' restyles the container; 'image' (or absent) is the default. */
export type MediaPlaceholderType = 'button' | 'image'

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
  icon: PlaceholderIconName
  filePicker: () => void
  size: MediaPlaceholderSize
  type?: MediaPlaceholderType
  borderStyle?: 'squared' | 'rounded' | 'simple' | 'heavy'
  isDraggedOver?: boolean
  errors?: Error[] | { message?: string }[]
  placeholderRef?: (node: HTMLElement | null) => void
  dataTestId?: string
  errorDataTestId?: string
  multiple?: boolean
}) {
  const labels = useInklingLabels()

  const containerClasses = cx(
    'relative flex h-full items-center justify-center',
    type === 'button' ? 'rounded-lg bg-grey-100' : 'border bg-grey-50',
    size === 'xsmall' && type !== 'button' && 'before:pb-[12.5%] dark:bg-grey-900',
    size !== 'xsmall' && type !== 'button' && 'before:pb-[62.5%] dark:bg-grey-950',
    (borderStyle === 'rounded' || borderStyle === 'heavy') &&
      type !== 'button' &&
      'rounded-lg border-grey/20 dark:border-transparent',
    (borderStyle === 'squared' || borderStyle === 'simple') &&
      type !== 'button' &&
      'border-grey/20 dark:border-grey/10',
  )

  const buttonClasses = cx(
    'group flex cursor-pointer items-center justify-center select-none',
    type === 'button' && 'px-3 py-1',
    type !== 'button' && (size === 'xsmall' ? 'p-4' : 'flex-col p-20'),
  )

  const errorClasses = cx('font-sans text-sm font-semibold text-red', size !== 'xsmall' && 'mt-3 max-w-[65%]')

  const errorMessages = errors.map((error) => (
    <span key={error.message} className={errorClasses} data-testid={errorDataTestId}>
      {error.message}
    </span>
  ))

  return (
    <div ref={placeholderRef} className="not-inkling-prose size-full" {...props} data-testid={dataTestId}>
      <div className={containerClasses}>
        {isDraggedOver ? (
          <CardText text={multiple ? labels['media.dragText.multiple'] : labels['media.dragText.single']} type={type} />
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
