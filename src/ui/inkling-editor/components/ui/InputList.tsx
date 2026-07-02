import React from 'react'

import type { KeyboardSelectionWithGroupsProps } from '@/ui/inkling-editor/components/ui/KeyboardSelectionWithGroups'

import { Delayed } from '@/ui/inkling-editor/components/ui/Delayed'
import { DropdownContainer } from '@/ui/inkling-editor/components/ui/DropdownContainer'
import { Input } from '@/ui/inkling-editor/components/ui/Input'
import { KeyboardSelection } from '@/ui/inkling-editor/components/ui/KeyboardSelection'
import { KeyboardSelectionWithGroups } from '@/ui/inkling-editor/components/ui/KeyboardSelectionWithGroups'
import { Spinner } from '@/ui/inkling-editor/components/ui/Spinner'

export interface InputListItemData {
  value: string
  label: string
  type?: string
}

export interface InputListGroupData {
  label: string
  items: InputListItemData[]
}

export type InputListOption = InputListItemData | InputListGroupData

export function InputListLoadingItem({ dataTestId }: { dataTestId: string }) {
  return (
    <Delayed>
      <li className={`mb-0 px-4 py-2 text-left`} data-testid={`${dataTestId}-loading`}>
        <span className="block text-sm leading-tight font-medium text-grey-900 dark:text-white">Searching...</span>
      </li>
    </Delayed>
  )
}

export function InputListItem({
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
  item: InputListItemData
  selected: boolean
  onClick: (item: InputListItemData) => void
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

function defaultGetItem(
  _item: InputListItemData,
  _selected: boolean,
  _onMouseOver: () => void,
  _scrollIntoView: boolean,
): React.ReactElement {
  throw new Error('<InputList> getItem function prop must be provided')
}

/**
 * Little warning here: this has an onChange handler that doesn't have an event as parameter, but just the value.
 *
 * @param {object} options
 * @param {{value: string, label: string}[]} [options.listOptions]
 * @param {string} [options.list]
 * @returns
 */
export function InputList({
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
  getItem = defaultGetItem,
}: {
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  dropdownClassName?: string
  dropdownPlacementBottomClass?: string
  dropdownPlacementTopClass?: string
  dataTestId: string
  listOptions?: InputListItemData[] | InputListGroupData[]
  isLoading?: boolean
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSelect?: (value: string, type?: string) => void
  getItem?: (
    item: InputListItemData,
    selected: boolean,
    onMouseOver: () => void,
    scrollIntoView: boolean,
  ) => React.ReactElement
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

  const onSelectEvent = (item: InputListItemData) => {
    ;(onSelect || onChange)(item.value, item.type)
  }

  const hasGroups = listOptions && (listOptions[0] as { items?: unknown })?.items
  const showSuggestions = (isLoading || (listOptions && !!listOptions.length)) && inputFocused

  const Suggestions = () => {
    return (
      <DropdownContainer
        className={dropdownClassName}
        dataTestId={dataTestId}
        placementBottomClass={dropdownPlacementBottomClass}
        placementTopClass={dropdownPlacementTopClass}
      >
        {isLoading && !listOptions?.length && <InputListLoadingItem dataTestId={dataTestId} />}
        {hasGroups ? (
          <KeyboardSelectionWithGroups
            getGroup={getGroup as KeyboardSelectionWithGroupsProps['getGroup']}
            getItem={getItem as KeyboardSelectionWithGroupsProps['getItem']}
            groups={listOptions as unknown as KeyboardSelectionWithGroupsProps['groups']}
            isLoading={isLoading}
            onSelect={onSelectEvent as KeyboardSelectionWithGroupsProps['onSelect']}
          />
        ) : (
          <KeyboardSelection
            getItem={(item, selected) => getItem(item, selected, () => {}, false)}
            items={listOptions as InputListItemData[]}
            onSelect={onSelectEvent}
          />
        )}
      </DropdownContainer>
    )
  }

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
        {showSuggestions && <Suggestions />}
      </div>
    </>
  )
}
