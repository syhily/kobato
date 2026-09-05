import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDragHandler, createUploader } from '#/utils/mock-file-factories'
import { HeaderCard } from '@/components/ui/cards/HeaderCard/HeaderCard'

vi.mock('../../../../src/components/ui/MediaUploader', () => ({
  MediaUploader: ({ additionalActions, ...props }: Record<string, unknown>) => (
    <div data-testid="media-uploader" {...props}>
      {additionalActions as React.ReactNode}
    </div>
  ),
}))

vi.mock('../../../../src/components/ui/SettingsPanel', () => ({
  SettingsPanel: ({ children }: { children?: React.ReactNode }) => <div data-testid="settings-panel">{children}</div>,
  ButtonGroupSetting: ({
    buttons,
    onClick,
    selectedName,
  }: {
    buttons: { name: string; label: string; dataTestId?: string }[]
    onClick: (name: string) => void
    selectedName?: string
  }) => (
    <div data-testid="button-group-setting">
      {buttons.map((button) => (
        <button key={button.name} data-testid={button.dataTestId} type="button" onClick={() => onClick(button.name)}>
          {button.label}
        </button>
      ))}
    </div>
  ),
  ColorPickerSetting: ({
    children,
    dataTestId,
    onTogglePicker,
    swatches,
  }: {
    children?: React.ReactNode
    dataTestId?: string
    onTogglePicker?: (expanded: boolean) => void
    swatches?: Array<{ id?: string; customContent?: React.ReactNode }>
  }) => (
    <div data-testid={dataTestId}>
      <button data-testid={`${dataTestId}-toggle`} type="button" onClick={() => onTogglePicker?.(true)}>
        Toggle
      </button>
      {swatches?.map((swatch, index) =>
        swatch.customContent ? <div key={swatch.id ?? index}>{swatch.customContent}</div> : null,
      )}
      {children}
    </div>
  ),
  InputSetting: ({
    dataTestId,
    value,
    onChange,
  }: {
    dataTestId?: string
    value?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  }) => <input data-testid={dataTestId} value={value ?? ''} onChange={onChange} />,
  InputUrlSetting: ({
    dataTestId,
    value,
    onChange,
  }: {
    dataTestId?: string
    value?: string
    onChange?: (value: string) => void
  }) => <input data-testid={dataTestId} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />,
  ToggleSetting: ({
    dataTestId,
    isChecked,
    onChange,
  }: {
    dataTestId?: string
    isChecked?: boolean
    onChange?: (checked: boolean) => void
  }) => (
    <button data-testid={dataTestId} type="button" onClick={() => onChange?.(!isChecked)}>
      {isChecked ? 'On' : 'Off'}
    </button>
  ),
  MediaUploadSetting: (props: Record<string, unknown>) => <div data-testid="media-upload-setting" {...props} />,
}))

vi.mock('../../../../src/components/InklingNestedEditor', () => ({
  default: ({ dataTestId }: { dataTestId?: string }) => <div data-testid={dataTestId} />,
}))

vi.mock('fast-average-color', () => ({
  FastAverageColor: class {
    getColorAsync = vi.fn().mockResolvedValue({ value: [100, 100, 100, 255] })
  },
}))

function createEditorInstance() {
  return createEditor({ namespace: 'test', onError: () => {} })
}

// the flat defaults the tests override per case; groupProps maps them onto
// the card's grouped seam (view/handlers/upload/editors)
type FlatHeaderCardProps = React.ComponentProps<typeof HeaderCard>['view'] &
  React.ComponentProps<typeof HeaderCard>['handlers'] &
  React.ComponentProps<typeof HeaderCard>['upload'] &
  React.ComponentProps<typeof HeaderCard>['editors']

const VIEW_KEYS = [
  'alignment',
  'backgroundColor',
  'backgroundImageSrc',
  'backgroundSize',
  'buttonColor',
  'buttonEnabled',
  'buttonText',
  'buttonTextColor',
  'buttonUrl',
  'isEditing',
  'isSwapped',
  'layout',
  'showBackgroundImage',
  'textColor',
] as const
const HANDLER_KEYS = [
  'handleAlignment',
  'handleBackgroundColor',
  'handleBackgroundSize',
  'handleButtonColor',
  'handleButtonEnabled',
  'handleButtonText',
  'handleButtonTextBlur',
  'handleButtonUrl',
  'handleButtonUrlBlur',
  'handleClearBackgroundImage',
  'handleHideBackgroundImage',
  'handleLayout',
  'handleShowBackgroundImage',
  'handleSwapLayout',
  'handleTextColor',
] as const
const UPLOAD_KEYS = [
  'fileUploader',
  'imageDragHandler',
  'isPinturaEnabled',
  'openImageEditor',
  'setFileInputRef',
  'onFileChange',
] as const
const EDITOR_KEYS = [
  'headerTextEditor',
  'headerTextEditorInitialState',
  'subheaderTextEditor',
  'subheaderTextEditorInitialState',
] as const

function groupProps(flat: FlatHeaderCardProps): React.ComponentProps<typeof HeaderCard> {
  const pick = (keys: readonly (keyof FlatHeaderCardProps)[]) =>
    Object.fromEntries(keys.filter((key) => key in flat).map((key) => [key, flat[key]]))
  return {
    view: pick(VIEW_KEYS),
    handlers: pick(HANDLER_KEYS),
    upload: pick(UPLOAD_KEYS),
    editors: pick(EDITOR_KEYS),
  } as unknown as React.ComponentProps<typeof HeaderCard>
}

describe('HeaderCard', () => {
  const defaultProps: FlatHeaderCardProps = {
    alignment: 'center',
    buttonEnabled: false,
    buttonText: '',
    buttonUrl: '',
    showBackgroundImage: false,
    backgroundImageSrc: '',
    backgroundSize: 'cover',
    backgroundColor: '#000000',
    buttonColor: '',
    buttonTextColor: '',
    textColor: '#ffffff',
    isEditing: false,
    fileUploader: createUploader({ progress: 0 }),
    handleAlignment: vi.fn(),
    handleButtonText: vi.fn(),
    handleButtonEnabled: vi.fn(),
    handleShowBackgroundImage: vi.fn(),
    handleHideBackgroundImage: vi.fn(),
    handleClearBackgroundImage: vi.fn(),
    handleBackgroundColor: vi.fn(),
    handleButtonColor: vi.fn(),
    handleLayout: vi.fn(),
    handleTextColor: vi.fn(),
    isPinturaEnabled: false,
    layout: 'regular',
    onFileChange: vi.fn(),
    openImageEditor: vi.fn(),
    imageDragHandler: createDragHandler(),
    headerTextEditor: createEditorInstance(),
    subheaderTextEditor: createEditorInstance(),
    isSwapped: false,
    handleSwapLayout: vi.fn(),
    handleBackgroundSize: vi.fn(),
    handleButtonTextBlur: vi.fn(),
    handleButtonUrlBlur: vi.fn(),
    handleButtonUrl: vi.fn(),
    setFileInputRef: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header card container', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps })} />)
    expect(screen.getByTestId('header-card-container')).toBeInTheDocument()
  })

  it('renders settings panel when editing', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true })} />)
    expect(screen.getByTestId('header-background-color')).toBeInTheDocument()
    expect(screen.getByTestId('header-alignment-left')).toBeInTheDocument()
    expect(screen.getByTestId('header-alignment-center')).toBeInTheDocument()
  })

  it('changes layout via button group', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true })} />)
    fireEvent.click(screen.getByTestId('header-layout-split'))
    expect(defaultProps.handleLayout).toHaveBeenCalledWith('split')
  })

  it('changes alignment via button group', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, alignment: 'left' })} />)
    fireEvent.click(screen.getByTestId('header-alignment-center'))
    expect(defaultProps.handleAlignment).toHaveBeenCalledWith('center')
  })

  it('toggles button enabled', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true })} />)
    fireEvent.click(screen.getByTestId('header-button-toggle'))
    expect(defaultProps.handleButtonEnabled).toHaveBeenCalled()
  })

  it('renders button input fields when button enabled', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, buttonEnabled: true })} />)
    expect(screen.getByTestId('header-button-text')).toBeInTheDocument()
    expect(screen.getByTestId('header-button-url')).toBeInTheDocument()
  })

  it('handles button text change', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, buttonEnabled: true })} />)
    fireEvent.change(screen.getByTestId('header-button-text'), { target: { value: 'Click me' } })
    expect(defaultProps.handleButtonText).toHaveBeenCalled()
  })

  it('handles button url change', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, buttonEnabled: true })} />)
    fireEvent.change(screen.getByTestId('header-button-url'), { target: { value: 'https://example.com' } })
    expect(defaultProps.handleButtonUrl).toHaveBeenCalledWith('https://example.com')
  })

  it('renders split layout with media uploader', () => {
    render(
      <HeaderCard
        {...groupProps({
          ...defaultProps,
          isEditing: true,
          layout: 'split',
          backgroundImageSrc: 'https://example.com/image.jpg',
        })}
      />,
    )
    expect(screen.getByTestId('media-uploader')).toBeInTheDocument()
  })

  it('toggles swap layout', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, layout: 'split' })} />)
    fireEvent.click(screen.getByTestId('header-swapped'))
    expect(defaultProps.handleSwapLayout).toHaveBeenCalled()
  })

  it('renders background image toggle', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, layout: 'regular' })} />)
    expect(screen.getByTestId('header-background-image-toggle')).toBeInTheDocument()
  })

  it('handles background image toggle click', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: true, layout: 'regular' })} />)
    fireEvent.click(screen.getByTestId('header-background-image-toggle'))
    expect(defaultProps.handleShowBackgroundImage).toHaveBeenCalled()
  })

  it('applies background image style', () => {
    render(
      <HeaderCard
        {...groupProps({
          ...defaultProps,
          layout: 'regular',
          backgroundImageSrc: 'https://example.com/bg.jpg',
          textColor: '#ffffff',
        })}
      />,
    )
    const container = screen.getByTestId('header-card-container')
    expect(container.style.backgroundImage).toContain('https://example.com/bg.jpg')
  })

  it('applies background color style', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, backgroundColor: '#ff0000', textColor: '#ffffff' })} />)
    const container = screen.getByTestId('header-card-container')
    expect(container.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('renders read-only overlay when not editing', () => {
    const { container } = render(<HeaderCard {...groupProps({ ...defaultProps, isEditing: false })} />)
    expect(container.querySelector('.absolute.z-10')).toBeInTheDocument()
  })

  it('toggles background size in split layout', () => {
    render(
      <HeaderCard
        {...groupProps({
          ...defaultProps,
          isEditing: true,
          layout: 'split',
          backgroundImageSrc: 'https://example.com/image.jpg',
          backgroundSize: 'cover',
        })}
      />,
    )

    fireEvent.click(screen.getByTestId('media-upload-size'))
    expect(defaultProps.handleBackgroundSize).toHaveBeenCalledWith('contain')
  })

  it('renders with wide layout', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, layout: 'wide', isEditing: true })} />)
    expect(screen.getByTestId('header-card-container')).toBeInTheDocument()
  })

  it('renders with full layout', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, layout: 'full', isEditing: true })} />)
    expect(screen.getByTestId('header-card-container')).toBeInTheDocument()
  })

  it('renders with swapped layout', () => {
    render(<HeaderCard {...groupProps({ ...defaultProps, layout: 'split', isSwapped: true, isEditing: true })} />)
    expect(screen.getByTestId('header-card-container')).toBeInTheDocument()
  })
})
