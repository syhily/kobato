import ImgBgIcon from '@/assets/icons/inkling-img-bg.svg?react'
import { Tooltip } from '@/components/ui/Tooltip'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { cx } from '@/utils/cx'

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
        `group relative flex size-6 shrink-0 items-center justify-center rounded-full border border-grey-300 bg-grey-100 text-black`,
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
