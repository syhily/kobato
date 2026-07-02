import clsx from 'clsx'
import React from 'react'

import type { FileChangeEvent } from '@/ui/inkling-editor/components/ui/cards/AudioCard'

import { ButtonGroup, type ButtonGroupButton } from '@/ui/inkling-editor/components/ui/ButtonGroup'
import { ColorOptionButtons } from '@/ui/inkling-editor/components/ui/ColorOptionButtons'
import { ColorIndicator, type ColorSwatchData } from '@/ui/inkling-editor/components/ui/ColorPicker'
import { Dropdown } from '@/ui/inkling-editor/components/ui/Dropdown'
import { Input } from '@/ui/inkling-editor/components/ui/Input'
import { type InputListItemData } from '@/ui/inkling-editor/components/ui/InputList'
import { InputList, InputListItem } from '@/ui/inkling-editor/components/ui/InputList'
import { MediaUploader } from '@/ui/inkling-editor/components/ui/MediaUploader'
import { MultiSelectDropdown } from '@/ui/inkling-editor/components/ui/MultiSelectDropdown'
import { Slider } from '@/ui/inkling-editor/components/ui/Slider'
import { TabView } from '@/ui/inkling-editor/components/ui/TabView'
import { Toggle } from '@/ui/inkling-editor/components/ui/Toggle'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import useSettingsPanelReposition from '@/ui/inkling-editor/hooks/useSettingsPanelReposition'

export interface SettingsPanelProps {
  children: React.ReactNode | Record<string, React.ReactNode>
  darkMode?: boolean
  cardWidth?: 'regular' | 'wide' | 'full' | 'split'
  tabs?: boolean
  defaultTab?: string
  className?: string
}

export function SettingsPanel({ children, darkMode, cardWidth, tabs, defaultTab, className = '' }: SettingsPanelProps) {
  const { ref } = useSettingsPanelReposition({}, cardWidth ?? 'regular')

  const tabContent = React.useMemo(() => {
    if (!tabs) {
      return { default: children }
    }
    return typeof children === 'object' && children !== null
      ? (children as Record<string, React.ReactNode>)
      : { default: children }
  }, [tabs, children])

  const tabItems = React.useMemo(() => {
    if (!tabs) {
      return []
    }
    return Object.keys(tabContent).map((key) => ({ id: key, label: key.charAt(0).toUpperCase() + key.slice(1) }))
  }, [tabs, tabContent])

  return (
    // Ideally we would use Portal to avoid issues with transformed ancestors (https://bugs.chromium.org/p/chromium/issues/detail?id=20574)
    // However, Portal causes problems with drag/drop, focus, etc
    <div className={`!mt-0 touch-none ${darkMode ? 'dark' : ''} ${className ?? ''}`}>
      {tabs ? (
        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className="not-inkling-prose fixed top-0 left-0 z-[9999999] m-0 flex w-[320px] flex-col rounded-lg bg-white bg-clip-padding font-sans shadow-lg will-change-transform dark:bg-grey-950 dark:shadow-xl"
          data-testid="settings-panel"
          data-inkling-settings-panel
        >
          <TabView defaultTab={defaultTab} tabContent={tabContent as Record<string, React.ReactNode>} tabs={tabItems} />
        </div>
      ) : (
        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className="not-inkling-prose fixed top-0 left-0 z-[9999999] m-0 flex w-[320px] flex-col gap-3 rounded-lg bg-white bg-clip-padding p-6 font-sans shadow-lg will-change-transform dark:bg-grey-950 dark:shadow-xl"
          data-testid="settings-panel"
          data-inkling-settings-panel
        >
          {children as React.ReactNode}
        </div>
      )}
    </div>
  )
}

interface ToggleSettingProps {
  label?: string
  description?: string
  isChecked: boolean
  onChange: ((checked: boolean) => void) | ((event: React.ChangeEvent<HTMLInputElement>) => void)
  dataTestId?: string
}

export function ToggleSetting({ label, description, isChecked, onChange, dataTestId }: ToggleSettingProps) {
  return (
    <label className="flex w-full cursor-pointer items-center justify-between">
      <div>
        <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>
        {description && (
          <p className="mt-1 w-11/12 text-xs leading-snug font-normal text-grey-700 dark:text-grey-600">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 pl-2">
        <Toggle dataTestId={dataTestId} isChecked={isChecked} onChange={onChange} />
      </div>
    </label>
  )
}

interface SliderSettingProps {
  label?: string
  onChange: (value: number) => void
  max: number
  min: number
  value: number
  defaultValue?: number
  description?: string
  dataTestId?: string
}

export function SliderSetting({
  label,
  onChange,
  max,
  min,
  value,
  defaultValue,
  description,
  dataTestId,
}: SliderSettingProps) {
  return (
    <div className="my-2 flex w-full flex-col gap-1">
      <div className="flex items-center justify-between font-sans text-[1.3rem] font-normal">
        <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>
        <div className="text-grey-900 dark:text-grey-100" data-testid={`${dataTestId}-value`}>
          {value}
        </div>
      </div>
      <Slider
        dataTestId={dataTestId}
        defaultValue={defaultValue}
        max={max}
        min={min}
        value={value ?? ''}
        onChange={onChange}
      />
      {description && (
        <p className="mt-1 text-xs leading-snug font-normal text-grey-700 dark:text-grey-600">{description}</p>
      )}
    </div>
  )
}

interface InputSettingProps {
  label?: string
  hideLabel?: boolean
  description?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  value: string
  placeholder?: string
  dataTestId?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}

export function InputSetting({
  label,
  hideLabel,
  description,
  onChange,
  value,
  placeholder,
  dataTestId,
  onBlur,
}: InputSettingProps) {
  return (
    <div className="flex w-full flex-col justify-between">
      <div
        className={
          hideLabel ? 'sr-only' : 'mb-1.5 text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300'
        }
      >
        {label}
      </div>
      <Input
        dataTestId={dataTestId}
        placeholder={placeholder}
        value={value ?? ''}
        onBlur={onBlur}
        onChange={onChange}
      />
      {description && (
        <p className="text-xs leading-snug font-normal text-grey-700 dark:text-grey-600">{description}</p>
      )}
    </div>
  )
}

export interface ListOption {
  value: string
  label: string
}

/**
 * Enter a link with autocompletion
 */
interface InputUrlSettingProps {
  dataTestId?: string
  label?: string
  value: string
  onChange: (value: string) => void
}

export function InputUrlSetting({ dataTestId, label, value, onChange }: InputUrlSettingProps) {
  const { cardConfig } = React.useContext(InklingComposerContext)
  const [listOptions, setListOptions] = React.useState<ListOption[]>([])

  React.useEffect(() => {
    if (cardConfig?.fetchAutocompleteLinks) {
      cardConfig
        .fetchAutocompleteLinks()
        .then((links) => {
          setListOptions(
            links?.map((link) => {
              return { value: link.value ?? '', label: link.label }
            }) ?? [],
          )
        })
        .catch(() => {
          setListOptions([])
        })
    }
  }, [cardConfig])

  const filteredSuggestedUrls = listOptions.filter((u) => {
    return u.label.toLocaleLowerCase().includes(value.toLocaleLowerCase())
  })

  return (
    <InputListSetting
      dataTestId={dataTestId}
      label={label}
      listOptions={filteredSuggestedUrls}
      placeholder="https://yoursite.com/#/portal/signup/"
      value={value ?? ''}
      onChange={onChange}
    />
  )
}

interface InputListSettingProps {
  dataTestId?: string
  description?: string
  label?: string
  listOptions: ListOption[]
  onChange: (value: string) => void
  placeholder?: string
  value: string
}

/**
 * A text input with autocomplete suggestions.
 * @param {object} options
 * @param {(value: string) => void} options.onChange Does not pass an event, only the value
 * @param {{value: string, label: string}[]} options.listOptions
 * @returns
 */
export function InputListSetting({
  dataTestId,
  description,
  label,
  listOptions,
  onChange,
  placeholder,
  value,
}: InputListSettingProps) {
  function onClick(item: ListOption) {
    onChange(item.value)
  }

  const getItem = (item: ListOption, selected: boolean, onMouseOver: () => void, scrollIntoView: boolean) => {
    return (
      <InputListItem
        key={item.value}
        className={clsx(
          selected && 'bg-grey-100 dark:bg-grey-925',
          'm-0 px-3 hover:bg-grey-100 dark:hover:bg-grey-925 cursor-pointer py-[7px] text-left',
        )}
        dataTestId={dataTestId ?? ''}
        item={item as InputListItemData}
        scrollIntoView={scrollIntoView}
        selected={selected}
        onClick={onClick}
        onMouseOver={onMouseOver}
      >
        <span
          className="block text-sm leading-tight font-normal text-black dark:text-white"
          data-testid={`${dataTestId}-listOption-${item.label}`}
        >
          {item.label}
        </span>
        <span
          className="block truncate text-xs leading-tight text-grey-700 dark:text-grey-600"
          data-testid={`${dataTestId}-listOption-${item.value}`}
        >
          {item.value}
        </span>
      </InputListItem>
    )
  }

  return (
    <div className="flex w-full flex-col justify-between">
      <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>
      <InputList
        dataTestId={dataTestId ?? ''}
        getItem={getItem}
        listOptions={listOptions}
        placeholder={placeholder ?? ''}
        value={value ?? ''}
        onChange={onChange}
      />
      {description && (
        <p className="text-xs leading-snug font-normal text-grey-700 dark:text-grey-600">{description}</p>
      )}
    </div>
  )
}

interface DropdownSettingProps {
  label?: string
  description?: string
  value: string
  menu: Array<{ label: string; name: string }>
  onChange: (name: string) => void
  dataTestId?: string
}

export function DropdownSetting({ label, description, value, menu, onChange, dataTestId }: DropdownSettingProps) {
  return (
    <div className="flex w-full flex-col justify-between gap-1">
      <div
        className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300"
        data-testid={`${dataTestId}-label`}
      >
        {label}
      </div>
      <Dropdown dataTestId={dataTestId} menu={menu} value={value ?? ''} onChange={onChange} />
      {description && (
        <p className="text-xs leading-snug font-normal text-grey-700 dark:text-grey-600">{description}</p>
      )}
    </div>
  )
}

interface MultiSelectDropdownSettingProps<T = string> {
  label?: string
  description?: string
  placeholder?: string
  items: T[]
  availableItems: T[]
  onChange: (items: T[]) => void
  dataTestId?: string
  allowAdd?: boolean
}

/**
 *
 * @param {object} options
 * @param {T[]} options.items The currently selected items
 * @param {T[]} options.availableItems The items available for selection
 * @param {boolean} options.allowAdd Whether to allow adding new items
 * @returns
 */
export function MultiSelectDropdownSetting({
  label,
  description,
  placeholder = '',
  items,
  availableItems,
  onChange,
  dataTestId,
  allowAdd = true,
}: MultiSelectDropdownSettingProps) {
  return (
    <div className="flex w-full flex-col justify-between gap-1">
      <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>
      <MultiSelectDropdown
        allowAdd={allowAdd}
        availableItems={availableItems}
        dataTestId={dataTestId}
        items={items}
        placeholder={placeholder}
        onChange={onChange}
      />
      {description && (
        <p className="text-xs leading-snug font-normal text-grey-700 dark:text-grey-600">{description}</p>
      )}
    </div>
  )
}

interface ButtonGroupSettingProps {
  label?: string
  onClick: (name: string) => void
  selectedName?: string
  buttons: Array<{
    label?: string
    name: string
    Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
    dataTestId?: string
  }>
  hasTooltip?: boolean
}

export function ButtonGroupSetting({ label, onClick, selectedName, buttons, hasTooltip }: ButtonGroupSettingProps) {
  return (
    <div className="flex w-full items-center justify-between text-[1.3rem]">
      <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>

      <div className="shrink-0 pl-2">
        <ButtonGroup
          buttons={buttons as ButtonGroupButton[]}
          hasTooltip={hasTooltip}
          selectedName={selectedName}
          onClick={onClick}
        />
      </div>
    </div>
  )
}

interface ColorOptionSettingProps {
  label?: string
  onClick: (name: string) => void
  selectedName?: string
  buttons: Array<{ name: string; label?: string; color?: string }>
  layout?: 'inline' | 'stacked'
  dataTestId?: string
}

export function ColorOptionSetting({
  label,
  onClick,
  selectedName,
  buttons,
  layout,
  dataTestId,
}: ColorOptionSettingProps) {
  return (
    <div
      className={`flex w-full text-[1.3rem] ${layout === 'stacked' ? 'flex-col' : 'items-center justify-between'}`}
      data-testid={dataTestId}
    >
      <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>

      <div className={`shrink-0 ${layout === 'stacked' ? '-mx-1 pt-[.6rem]' : 'pl-2'}`}>
        <ColorOptionButtons buttons={buttons} selectedName={selectedName} onClick={onClick} />
      </div>
    </div>
  )
}

interface ColorPickerSettingProps {
  label?: string
  isExpanded?: boolean
  onSwatchChange?: (value: string) => void
  onPickerChange?: (value: string) => void
  onTogglePicker?: (isExpanded?: boolean) => void
  value: string
  swatches?: ColorSwatchData[]
  eyedropper?: boolean
  hasTransparentOption?: boolean
  dataTestId?: string
  children?: React.ReactNode
  showChildren?: React.ReactNode
}

export function ColorPickerSetting({
  label,
  isExpanded,
  onSwatchChange,
  onPickerChange,
  onTogglePicker,
  value,
  swatches,
  eyedropper,
  hasTransparentOption,
  dataTestId,
  children,
  showChildren,
}: ColorPickerSettingProps) {
  const markClickedInside = (event: React.MouseEvent) => {
    event.stopPropagation()
  }

  return (
    <div className="flex-col" data-testid={dataTestId} onClick={markClickedInside}>
      <div className="flex w-full items-center justify-between text-[1.3rem]">
        <div className="text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300">{label}</div>

        <div className="shrink-0 pl-2">
          <ColorIndicator
            eyedropper={eyedropper}
            hasTransparentOption={hasTransparentOption}
            isExpanded={isExpanded}
            showChildren={showChildren}
            swatches={swatches ?? []}
            value={value ?? ''}
            onChange={onPickerChange ?? (() => {})}
            onSwatchChange={onSwatchChange ?? (() => {})}
            onTogglePicker={onTogglePicker ?? (() => {})}
          >
            {children}
          </ColorIndicator>
        </div>
      </div>
    </div>
  )
}

interface MediaUploadSettingProps {
  className?: string
  imgClassName?: string
  label?: string
  hideLabel?: boolean
  onFileChange: (e: FileChangeEvent) => void
  isDraggedOver?: boolean
  placeholderRef?: (node: HTMLElement | null) => void
  src?: string
  alt?: string
  isLoading?: boolean
  errors?: Error[] | { message?: string }[]
  progress?: number
  onRemoveMedia: () => void
  icon?: string
  desc?: string
  size?: 'small' | 'large' | string
  type?: string
  stacked?: boolean
  borderStyle?: 'simple' | 'heavy' | 'squared' | 'rounded'
  mimeTypes?: string[]
  isPinturaEnabled?: boolean
  openImageEditor?: (handleSave: (file: File) => void) => void
  setFileInputRef?: (ref: React.MutableRefObject<HTMLInputElement | null>) => void
  dataTestId?: string
}

export function MediaUploadSetting({
  dataTestId,
  className,
  imgClassName,
  label,
  hideLabel,
  onFileChange,
  isDraggedOver,
  placeholderRef,
  src,
  alt,
  isLoading,
  errors = [],
  progress,
  onRemoveMedia,
  icon,
  desc,
  size,
  type,
  stacked,
  borderStyle,
  mimeTypes,
  isPinturaEnabled,
  openImageEditor,
  setFileInputRef,
}: MediaUploadSettingProps) {
  return (
    <div className={clsx(className, !stacked && 'gap-3 flex justify-between')} data-testid="media-upload-setting">
      <div
        className={
          hideLabel ? 'sr-only' : 'mb-2 shrink-0 text-sm font-medium tracking-normal text-grey-900 dark:text-grey-400'
        }
      >
        {label}
      </div>
      <MediaUploader
        alt={alt}
        borderStyle={borderStyle}
        className={clsx(
          stacked && 'h-32',
          !stacked && src && 'h-[5.2rem]',
          !stacked && type !== 'button' && !src && 'h-[5.2rem] w-[7.2rem]',
        )}
        desc={desc}
        dragHandler={{ isDraggedOver: !!isDraggedOver, setRef: placeholderRef }}
        errors={errors}
        icon={icon}
        imgClassName={imgClassName}
        isLoading={isLoading}
        isPinturaEnabled={isPinturaEnabled}
        mimeTypes={mimeTypes}
        openImageEditor={openImageEditor}
        progress={progress}
        setFileInputRef={setFileInputRef}
        size={size}
        src={src}
        type={type}
        onFileChange={onFileChange}
        onRemoveMedia={onRemoveMedia}
      />
    </div>
  )
}
