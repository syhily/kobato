import React from 'react'

import { Delayed } from '@/components/ui/Delayed'
import { DropdownContainer } from '@/components/ui/DropdownContainer'
import { Input } from '@/components/ui/Input'
import { KeyboardSelectionWithGroups } from '@/components/ui/KeyboardSelectionWithGroups'
import { Spinner } from '@/components/ui/Spinner'
import { useInklingLabels } from '@/hooks/useInklingLabels'

export interface InputListItemData {
  value: string | null
  label: string
  type?: string
}

export interface InputListGroupData<T extends InputListItemData = InputListItemData> {
  label: string
  items: T[]
}

// Flat option lists and grouped option lists are told apart by the presence of
// an `items` array on the first entry (groups always carry one, items never do).
function isGroupList<T extends InputListItemData>(
  listOptions: T[] | InputListGroupData<T>[] | undefined,
): listOptions is InputListGroupData<T>[] {
  return !!listOptions && listOptions.length > 0 && 'items' in listOptions[0]
}

export function InputListLoadingItem({ dataTestId }: { dataTestId: string }) {
  const labels = useInklingLabels()

  return (
    <Delayed>
      <li className={`mb-0 px-4 py-2 text-left`} data-testid={`${dataTestId}-loading`}>
        <span className="block text-sm leading-tight font-medium text-grey-900 dark:text-white">
          {labels['search.loading']}
        </span>
      </li>
    </Delayed>
  )
}

export function InputListItem<T extends InputListItemData = InputListItemData>({
  dataTestId,
  item,
  selected,
  onClick,
  onMouseOver,
  scrollIntoView,
  className,
  selectedClassName,
  children,
}: {
  dataTestId: string
  item: T
  selected: boolean
  onClick: (item: T) => void
  onMouseOver: () => void
  scrollIntoView: boolean
  className: string
  selectedClassName?: string
  children: React.ReactNode
}) {
  const itemRef = React.useRef<HTMLLIElement>(null)

  React.useEffect(() => {
    if (selected && scrollIntoView) {
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [selected, scrollIntoView])

  // We use the capture phase of the mouse down event, otherwise the list option will be removed when blurring the input
  // before calling the click event
  const handleMouseDown = (event: React.MouseEvent) => {
    // Prevent losing focus when clicking an option
    event.preventDefault()
    onClick(item)
  }

  const pointerClassName = !item.value ? 'pointer-events-none' : ''

  return (
    <li
      ref={itemRef}
      aria-selected={selected}
      className={`${selected ? selectedClassName : ''} ${pointerClassName} ${className}`}
      data-testid={`${dataTestId}-listOption`}
      role="option"
      onMouseDownCapture={handleMouseDown}
      onMouseOver={onMouseOver}
    >
      {children}
    </li>
  )
}

export function InputListGroup({
  dataTestId,
  group,
  showSpinner,
}: {
  dataTestId: string
  group: { label: string }
  showSpinner?: boolean
}) {
  return (
    <li
      className="mt-2 mb-0 flex items-center justify-between border-t border-grey-200 px-4 pt-3 pb-2 text-[1.1rem] font-semibold tracking-wide text-grey-600 uppercase first-of-type:mt-0 first-of-type:border-t-0 dark:border-grey-900"
      data-testid={`${dataTestId}-listGroup`}
    >
      <div className="flex items-center gap-1.5">
        {group.label}
        {showSpinner && (
          <span className="ml-px" data-testid="input-list-spinner">
            <Spinner size="mini" />
          </span>
        )}
      </div>
    </li>
  )
}

// The onChange handler receives the input's value directly, not the change event.
export function InputList<T extends InputListItemData = InputListItemData>({
  autoFocus,
  className,
  inputClassName,
  dropdownClassName,
  dropdownPlacementBottomClass,
  dropdownPlacementTopClass,
  dataTestId,
  listOptions,
  isLoading,
  value,
  placeholder,
  onChange,
  onSelect,
  getItem,
}: {
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  dropdownClassName?: string
  dropdownPlacementBottomClass?: string
  dropdownPlacementTopClass?: string
  dataTestId: string
  listOptions?: T[] | InputListGroupData<T>[]
  isLoading?: boolean
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSelect?: (value: string, type?: string) => void
  getItem: (item: T, selected: boolean, onMouseOver: () => void, scrollIntoView: boolean) => React.ReactElement
}) {
  const [inputFocused, setInputFocused] = React.useState(false)

  const onFocus = () => {
    setInputFocused(true)
  }

  const onBlur = () => {
    setInputFocused(false)
  }

  const getGroup = (group: { label: string }, { showSpinner }: { showSpinner?: boolean } = {}) => {
    return <InputListGroup key={group.label} dataTestId={dataTestId} group={group} showSpinner={showSpinner} />
  }

  const onChangeEvent = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value)
  }

  const onSelectEvent = (item: T) => {
    // null-valued options are non-interactive placeholders ("no results")
    if (item.value === null) {
      return
    }
    if (onSelect) {
      onSelect(item.value, item.type)
    } else {
      onChange(item.value)
    }
  }

  const showSuggestions = (isLoading || (listOptions && !!listOptions.length)) && inputFocused

  return (
    <>
      <div className={`relative z-0 ${className || ''}`}>
        <Input
          autoFocus={autoFocus}
          className={inputClassName}
          dataTestId={dataTestId}
          placeholder={placeholder}
          value={value}
          onBlur={onBlur}
          onChange={onChangeEvent}
          onFocus={onFocus}
        />
        {showSuggestions && (
          <DropdownContainer
            className={dropdownClassName}
            dataTestId={dataTestId}
            placementBottomClass={dropdownPlacementBottomClass}
            placementTopClass={dropdownPlacementTopClass}
          >
            {isLoading && !listOptions?.length && <InputListLoadingItem dataTestId={dataTestId} />}
            {isGroupList(listOptions) ? (
              <KeyboardSelectionWithGroups
                getGroup={getGroup}
                getItem={getItem}
                groups={listOptions}
                isLoading={isLoading}
                onSelect={onSelectEvent}
              />
            ) : (
              // a flat option list is one degenerate group with no header
              <KeyboardSelectionWithGroups
                getGroup={() => <></>}
                getItem={getItem}
                groups={[{ label: '', items: listOptions ?? [] }]}
                onSelect={onSelectEvent}
              />
            )}
          </DropdownContainer>
        )}
      </div>
    </>
  )
}
