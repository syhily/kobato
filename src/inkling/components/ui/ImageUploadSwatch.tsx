import ImgBgIcon from '@/inkling/assets/icons/inkling-img-bg.svg?react'
import { Tooltip } from '@/inkling/components/ui/Tooltip'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'
import { cx } from '@/inkling/utils/cx'

export const ImageUploadSwatch = ({
  showBackgroundImage,
  onClickHandler,
  dataTestId,
}: {
  showBackgroundImage?: boolean
  onClickHandler?: () => void
  dataTestId?: string
}) => {
  const labels = useInklingLabels()

  return (
    <button
      className={cx(
        `group border-grey-300 bg-grey-100 relative flex size-6 shrink-0 items-center justify-center rounded-full border text-black`,
        showBackgroundImage && 'outline outline-2 outline-green',
      )}
      data-testid={dataTestId}
      title={labels['color.image']}
      type="button"
      onClick={onClickHandler}
    >
      <ImgBgIcon className="size-[1.4rem]" />
      <Tooltip label={labels['color.image']} />
    </button>
  )
}
