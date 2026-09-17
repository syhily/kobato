import type { ListOptionItem } from '@/inkling/hooks/useSearchLinks'

import { HighlightedString } from '@/inkling/components/ui/HighlightedString'
import { InputListItem } from '@/inkling/components/ui/InputList'

export function LinkInputSearchItem({
  dataTestId,
  item,
  highlightString,
  selected,
  onMouseOver,
  scrollIntoView,
  onClick,
}: {
  dataTestId: string
  item: ListOptionItem
  highlightString?: string
  selected: boolean
  onMouseOver: () => void
  scrollIntoView: boolean
  onClick: (item: ListOptionItem) => void
}) {
  return (
    <InputListItem
      className="my-[.2rem] flex cursor-pointer items-center justify-between gap-3 rounded-md px-4 py-2 text-left text-black dark:text-white"
      dataTestId={dataTestId}
      item={item}
      scrollIntoView={scrollIntoView}
      selected={selected}
      selectedClassName="bg-grey-100 dark:bg-grey-900"
      onClick={onClick}
      onMouseOver={onMouseOver}
    >
      <span className="line-clamp-1 flex items-center gap-[.6rem]">
        {item.Icon && <item.Icon className="size-[1.4rem] stroke-[0.15rem]" />}
        <span
          className="block truncate text-sm leading-snug font-medium"
          data-testid={`${dataTestId}-listOption-label`}
        >
          <HighlightedString highlightString={highlightString} shouldHighlight={item.highlight} string={item.label} />
        </span>
      </span>
      {selected && (item.metaText || item.MetaIcon) && (
        <span
          className="text-grey-600 dark:text-grey-500 flex shrink-0 items-center gap-[.6rem] text-[1.3rem] leading-snug tracking-tight"
          data-testid={`${dataTestId}-listOption-meta`}
        >
          <span title={item.metaIconTitle}>{item.MetaIcon && <item.MetaIcon className="size-[1.4rem]" />}</span>
          {item.metaText && <span>{item.metaText}</span>}
        </span>
      )}
    </InputListItem>
  )
}
