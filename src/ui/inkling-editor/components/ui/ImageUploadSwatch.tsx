import clsx from 'clsx'

import ImgBgIcon from '@/ui/inkling-editor/assets/icons/inkling-img-bg.svg?react'
import { Tooltip } from '@/ui/inkling-editor/components/ui/Tooltip'

export const ImageUploadSwatch = ({
  showBackgroundImage,
  onClickHandler,
  dataTestId,
}: {
  showBackgroundImage?: boolean
  onClickHandler?: () => void
  dataTestId?: string
}) => {
  return (
    <button
      className={clsx(
        `group relative flex size-6 shrink-0 items-center justify-center rounded-full border border-grey-300 bg-grey-100 text-black`,
        showBackgroundImage && 'outline-green outline outline-2',
      )}
      data-testid={dataTestId}
      title="Image"
      type="button"
      onClick={onClickHandler}
    >
      <ImgBgIcon className="size-[1.4rem]" />
      <Tooltip label="Image" />
    </button>
  )
}
