import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'

import EyedropperIcon from '@/assets/icons/inkling-eyedropper.svg?react'
import ImgBgIcon from '@/assets/icons/inkling-img-bg.svg?react'
import { Button } from '@/components/ui/Button'
import { resolveSelectedSwatchTitle, resolveSwatchDisplayColor, resolveSwatchValue } from '@/components/ui/color-swatch'
import { Tooltip } from '@/components/ui/Tooltip'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { cx } from '@/utils/cx'
import { getAccentColor } from '@/utils/getAccentColor'

interface ColorPickerProps {
  value: string
  eyedropper?: boolean
  hasTransparentOption?: boolean
  onChange: (color: string) => void
  children?: ReactNode
}

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
  }
}

const CONIC_RING_BACKGROUND =
  'conic-gradient(hsl(360,100%,50%),hsl(315,100%,50%),hsl(270,100%,50%),hsl(225,100%,50%),hsl(180,100%,50%),hsl(135,100%,50%),hsl(90,100%,50%),hsl(45,100%,50%),hsl(0,100%,50%))'

/** The rainbow ring marking "custom color" on the selector and picker-toggle buttons. */
export function ConicRing() {
  return (
    <div
      className="absolute inset-0 rounded-full bg-clip-content p-[3px]"
      style={{
        background: CONIC_RING_BACKGROUND,
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite: 'exclude',
      }}
    />
  )
}

export function ColorPicker({ value, eyedropper, hasTransparentOption, onChange, children }: ColorPickerProps) {
  const labels = useInklingLabels()
  // HexColorInput doesn't support adding a ref on the input itself
  const inputWrapperRef = useRef<HTMLDivElement | null>(null)

  const stopPropagation = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()

    const inputElement = inputWrapperRef.current?.querySelector('input')
    const isInputField = e.target === inputElement

    // Allow text selection for events on the input field
    if (isInputField) {
      return
    }

    // Prevent closing the color picker when clicking somewhere inside it
    inputWrapperRef.current?.querySelector('input')?.focus()

    e.preventDefault()
  }, [])

  // the per-gesture document listener, so stop can remove it without the
  // listener self-referencing its own binding. The gesture's only real
  // effect is returning focus to the hex input on release — the named
  // "isUsingColorPicker" session state was never read and is gone.
  const gestureStopRef = useRef<(() => void) | null>(null)

  const stopUsingColorPicker = useCallback(() => {
    inputWrapperRef.current?.querySelector('input')?.focus()

    const stop = gestureStopRef.current
    if (stop) {
      document.removeEventListener('mouseup', stop)
      document.removeEventListener('touchend', stop)
      gestureStopRef.current = null
    }
  }, [])

  const startUsingColorPicker = useCallback(() => {
    const stop = () => stopUsingColorPicker()
    gestureStopRef.current = stop
    document.addEventListener('mouseup', stop)
    document.addEventListener('touchend', stop)
  }, [stopUsingColorPicker])

  const openColorPicker = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()

      document.body.style.setProperty('pointer-events', 'none')

      if (!window.EyeDropper) {
        document.body.style.removeProperty('pointer-events')
        return
      }
      const eyeDropper = new window.EyeDropper()
      try {
        const result = await eyeDropper.open()
        onChange(result.sRGBHex)
      } catch {
        // EyeDropper was cancelled or failed — pointer events are restored in finally
      } finally {
        document.body.style.removeProperty('pointer-events')
        inputWrapperRef.current?.querySelector('input')?.focus()
      }
    },
    [onChange],
  )

  useEffect(() => {
    inputWrapperRef.current?.querySelector('input')?.focus()
  }, [])

  // the keyword grammar ('accent'/'transparent' vs raw hex) lives in
  // @/components/ui/color-swatch; the picker's HexColorPicker takes '' for transparent
  const hexValue = resolveSwatchDisplayColor(value, { transparentAs: '' })

  const focusHexInputOnClick = useCallback(() => {
    inputWrapperRef.current?.querySelector('input')?.focus()
  }, [])

  return (
    <div onMouseDown={stopPropagation} onTouchStart={stopPropagation}>
      <HexColorPicker
        color={hexValue || '#ffffff'}
        onChange={onChange}
        onMouseDown={startUsingColorPicker}
        onTouchStart={startUsingColorPicker}
      />
      <div className="mt-3 flex gap-2">
        <div
          ref={inputWrapperRef}
          className={`relative flex w-full items-center rounded-lg border border-grey-100 bg-grey-100 px-3 py-1.5 font-sans text-sm font-normal text-grey-900 transition-colors placeholder:text-grey-500 focus-within:border-green focus-within:bg-white focus-within:shadow-[0_0_0_2px_rgba(48,207,67,.25)] focus-within:outline-none dark:border-transparent dark:bg-grey-900 dark:text-white dark:selection:bg-grey-800 dark:placeholder:text-grey-700 dark:focus-within:border-green dark:hover:bg-grey-925 dark:focus:bg-grey-925`}
          onClick={focusHexInputOnClick}
        >
          <span className="mr-2 ml-1 text-grey-700">#</span>
          <HexColorInput
            aria-label={labels['aria.colorValue']}
            className="z-50 w-full bg-transparent"
            color={hexValue}
            onChange={onChange}
          />
          {eyedropper && !!window.EyeDropper && (
            <button
              className="absolute inset-y-0 right-3 z-50 my-auto size-4 p-[1px]"
              type="button"
              onClick={(e) => void openColorPicker(e)}
            >
              <EyedropperIcon className="size-full stroke-2" />
            </button>
          )}
        </div>

        {hasTransparentOption && (
          <Button color="grey" value={labels['action.clear']} onClick={() => onChange('transparent')} />
        )}
        {children}
      </div>
    </div>
  )
}

interface ColorSwatchProps {
  hex?: string
  accent?: boolean
  transparent?: boolean
  title?: string
  isSelected?: boolean
  onSelect: (value: string) => void
}

function ColorSwatch({ hex, accent, transparent, title, isSelected, onSelect }: ColorSwatchProps) {
  const backgroundColor = accent ? getAccentColor() : hex

  const ref = useRef<HTMLButtonElement | null>(null)

  const onSelectHandler = (e: React.MouseEvent): void => {
    e.preventDefault()

    const swatchValue = resolveSwatchValue({ hex, accent, transparent })
    if (swatchValue) {
      onSelect(swatchValue)
    }
  }

  return (
    <button
      ref={ref}
      className={cx(
        `group relative flex size-5 shrink-0 items-center rounded-full border border-grey-250 dark:border-grey-800`,
        isSelected && 'outline outline-2 outline-green',
      )}
      style={{ backgroundColor }}
      title={title}
      type="button"
      onClick={onSelectHandler}
    >
      {transparent && (
        <div className="absolute top-0 left-0 z-10 w-[136%] origin-left rotate-45 border-b border-b-red" />
      )}
      <Tooltip label={title} />
    </button>
  )
}

export interface ColorSwatchData {
  hex?: string
  accent?: boolean
  transparent?: boolean
  image?: boolean
  title?: string
  customContent?: ReactNode
}

interface ColorIndicatorProps {
  value: string
  swatches: ColorSwatchData[]
  onSwatchChange: (value: string) => void
  onTogglePicker: (expanded: boolean) => void
  onChange: (value: string) => void
  isExpanded?: boolean
  eyedropper?: boolean
  hasTransparentOption?: boolean
  children?: ReactNode
  showChildren?: boolean
}

export function ColorIndicator({
  value,
  swatches,
  onSwatchChange,
  onTogglePicker,
  onChange,
  isExpanded,
  eyedropper,
  hasTransparentOption,
  children,
  showChildren,
}: ColorIndicatorProps) {
  const labels = useInklingLabels()
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useClickOutside(isOpen, popoverRef, () => setIsOpen(false))

  const stopPropagation = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }, [])

  // the indicator paints 'transparent' as white (the button needs a visible
  // paint); the picker and swatch resolutions share the one grammar module
  const backgroundColor = resolveSwatchDisplayColor(value, { transparentAs: 'white' })
  let selectedSwatch: string | undefined = resolveSelectedSwatchTitle(value, swatches)

  if (isExpanded) {
    selectedSwatch = undefined
  }

  const handleColorPickerChange = (newValue: string): void => {
    onChange(newValue)
    // Don't close the popover when using the color picker
  }

  return (
    <div className="relative" data-testid="color-selector-button">
      <button
        className={`relative size-6 cursor-pointer rounded-full ${value ? 'p-[2px]' : 'border border-grey-200 dark:border-grey-800'}`}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
        }}
      >
        {value && <ConicRing />}
        <span
          className={cx(
            'block size-full rounded-full border-2 border-white dark:border-grey-950',
            value === 'image' && 'flex items-center justify-center',
          )}
          style={{ backgroundColor }}
        >
          {value === 'image' && <ImgBgIcon className="size-[1.4rem]" />}
          {value === 'transparent' && (
            <div className="absolute top-[3px] left-[3px] z-10 w-[136%] origin-left rotate-45 border-b border-b-red" />
          )}
        </span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={cx(
            'absolute -right-3 bottom-full z-10 mb-2 flex flex-col gap-3 rounded-lg bg-white p-3 shadow transition-[width] duration-200 ease-in-out dark:bg-grey-900',
            (isExpanded || showChildren) && 'min-w-[296px]',
          )}
          onClick={stopPropagation}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
        >
          {!isExpanded && children}
          {isExpanded && (
            <ColorPicker
              eyedropper={eyedropper}
              hasTransparentOption={hasTransparentOption}
              value={value}
              onChange={handleColorPickerChange}
            />
          )}
          {showChildren && children}
          <div className="flex justify-end gap-1">
            <div className={`flex items-center gap-1`}>
              {swatches.map(({ customContent, ...swatch }) =>
                customContent ? (
                  <Fragment key={swatch.title}>{customContent}</Fragment>
                ) : (
                  <ColorSwatch
                    key={swatch.title}
                    isSelected={selectedSwatch === swatch.title}
                    onSelect={(val) => {
                      onSwatchChange(val)
                    }}
                    {...swatch}
                  />
                ),
              )}
            </div>
            <button
              aria-label={labels['aria.pickColor']}
              className={`group relative size-6 rounded-full ${!selectedSwatch ? 'p-[2px]' : 'border border-grey-200 dark:border-grey-800'}`}
              data-testid="color-picker-toggle"
              type="button"
              onClick={() => {
                onTogglePicker(!isExpanded)
              }}
            >
              {!selectedSwatch ? (
                <>
                  <ConicRing />
                  <span
                    className="block size-full rounded-full border-2 border-white dark:border-grey-950"
                    style={{ backgroundColor: value }}
                  >
                    {value === 'transparent' && (
                      <div className="absolute top-[3px] left-[3px] z-10 w-[136%] origin-left rotate-45 border-b border-b-red" />
                    )}
                  </span>
                </>
              ) : (
                <div className="absolute inset-0 rounded-full" style={{ background: CONIC_RING_BACKGROUND }} />
              )}
              <Tooltip label={labels['aria.pickColor']} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
