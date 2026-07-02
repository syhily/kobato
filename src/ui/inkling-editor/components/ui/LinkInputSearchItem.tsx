import { HighlightedString } from '@/ui/inkling-editor/components/ui/HighlightedString'
import { InputListItem } from '@/ui/inkling-editor/components/ui/InputList'

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
  // oxlint-disable-next-line typescript/no-explicit-any
  item: any
  highlightString?: string
  selected: boolean
  onMouseOver: () => void
  scrollIntoView: boolean
  // oxlint-disable-next-line typescript/no-explicit-any
  onClick: (item: any) => void
}) {
  return (
    <InputListItem
      className="my-[0.125rem] flex cursor-pointer items-center justify-between gap-3 rounded-md px-4 py-2 text-left text-black dark:text-white"
      dataTestId={dataTestId}
      item={item}
      scrollIntoView={scrollIntoView}
      selected={selected}
      selectedClassName="bg-grey-100 dark:bg-grey-900"
      onClick={onClick}
      onMouseOver={onMouseOver}
    >
      <span className="line-clamp-1 flex items-center gap-[0.375rem]">
        {item.Icon && <item.Icon className="size-[0.875rem] stroke-[1.5px]" />}
        <span
          className="block truncate text-sm leading-snug font-medium"
          data-testid={`${dataTestId}-listOption-label`}
        >
          <HighlightedString highlightString={highlightString} shouldHighlight={item.highlight} string={item.label} />
        </span>
      </span>
      {selected && (item.metaText || item.MetaIcon) && (
        <span
          className="flex shrink-0 items-center gap-[0.375rem] text-[0.8125rem] leading-snug tracking-tight text-grey-600 dark:text-grey-500"
          data-testid={`${dataTestId}-listOption-meta`}
        >
          <span title={item.metaIconTitle}>{item.MetaIcon && <item.MetaIcon className="size-[0.875rem]" />}</span>
          {item.metaText && <span>{item.metaText}</span>}
        </span>
      )}
    </InputListItem>
  )
}
