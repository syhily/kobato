import CloseIcon from '@/assets/icons/inkling-close.svg?react'
import { useInklingLabels } from '@/hooks/useInklingLabels'

export const Input = ({
  value,
  onChange,
  onClear,
  onKeyDown,
}: {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}) => {
  const labels = useInklingLabels()

  return (
    <div className="relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white font-sans text-md font-normal text-black shadow-md dark:bg-grey-950">
      <input
        autoComplete="off"
        autoFocus={true}
        className={`mb-[1px] h-auto w-full bg-white py-1 pr-9 pl-3 leading-loose font-normal text-grey-900 selection:bg-grey/40 dark:bg-grey-950 dark:text-grey-100 dark:placeholder:text-grey-800 ${value ? 'rounded-t rounded-b-none' : 'rounded'}`}
        data-testid="snippet-name"
        placeholder={labels['snippet.name.placeholder']}
        value={value ?? ''}
        data-1p-ignore
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <button
        aria-label={labels['aria.close']}
        className="absolute right-3 cursor-pointer"
        type="button"
        onClick={onClear}
      >
        <CloseIcon className="size-3 stroke-2 text-grey" />
      </button>
    </div>
  )
}
