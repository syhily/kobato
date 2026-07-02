import DownloadIcon from '@/ui/inkling-editor/assets/icons/inkling-download.svg?react'
import UnsplashHeartIcon from '@/ui/inkling-editor/assets/icons/inkling-unsplash-heart.svg?react'

const BUTTON_ICONS: Record<string, typeof UnsplashHeartIcon> = {
  heart: UnsplashHeartIcon,
  download: DownloadIcon,
}

function UnsplashButton({
  icon,
  label,
  ...props
}: {
  icon?: keyof typeof BUTTON_ICONS
  label?: string
  [key: string]: unknown
}) {
  const Icon = BUTTON_ICONS[icon as keyof typeof BUTTON_ICONS]

  return (
    <a
      className="flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-white px-3 py-2 font-sans text-sm leading-6 font-medium text-grey-700 opacity-90 transition-all ease-in-out first-of-type:mr-3 hover:opacity-100"
      type="button"
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {icon && <Icon className={`fill-red size-4 stroke-[3px] ${label && 'mr-1'}`} />}
      {label && <span>{label}</span>}
    </a>
  )
}

export default UnsplashButton
