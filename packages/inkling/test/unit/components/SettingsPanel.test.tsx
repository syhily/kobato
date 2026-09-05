import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ListOptionItem } from '@/hooks/useSearchLinks'

import { SettingDescription, SettingLabel } from '@/components/ui/SettingLabel'
import {
  ButtonGroupSetting,
  ColorOptionSetting,
  ColorPickerSetting,
  InputListSetting,
  InputSetting,
  InputUrlSetting,
  MediaUploadSetting,
  SettingsPanel,
  ToggleSetting,
} from '@/components/ui/SettingsPanel'

import type { CardConfig } from '../../../src/context/InklingHostIntegrationContext'

const mocks = vi.hoisted(() => ({
  contextValue: { cardConfig: {} as CardConfig },
}))

function EmptyIcon() {
  return <svg />
}

function createListOptionItem(): ListOptionItem {
  return {
    Icon: EmptyIcon,
    highlight: false,
    label: 'Example',
    type: 'url',
    value: 'https://example.com',
  }
}

// Mock the host-integration linking channel used by InputUrlSetting
vi.mock('../../../src/context/InklingHostIntegrationContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/context/InklingHostIntegrationContext')>()
  return { ...actual, useInklingLinkingSettings: () => mocks.contextValue.cardConfig }
})

describe('SettingsPanel', function () {
  it('renders children in the default (non-tab) layout', function () {
    render(
      <SettingsPanel>
        <div data-testid="child-content">Hello settings</div>
      </SettingsPanel>,
    )

    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toHaveTextContent('Hello settings')
  })

  it('applies a dark mode class when requested', function () {
    render(
      <SettingsPanel darkMode>
        <div>content</div>
      </SettingsPanel>,
    )

    expect(screen.getByTestId('settings-panel').parentElement).toHaveClass('dark')
  })

  it('renders tabs from a record of children', function () {
    render(
      <SettingsPanel tabs defaultTab="general">
        {{
          general: <div data-testid="general-tab">General</div>,
          advanced: <div data-testid="advanced-tab">Advanced</div>,
        }}
      </SettingsPanel>,
    )

    expect(screen.getByTestId('tab-general')).toHaveTextContent('General')
    expect(screen.getByTestId('tab-advanced')).toHaveTextContent('Advanced')
  })

  describe('setting helpers', function () {
    it('renders ToggleSetting', function () {
      render(<ToggleSetting isChecked={false} label="Enable feature" onChange={() => {}} />)
      expect(screen.getByText('Enable feature')).toBeInTheDocument()
    })

    it('renders InputSetting', function () {
      render(<InputSetting label="Name" value="Inkling" onChange={() => {}} />)
      expect(screen.getByDisplayValue('Inkling')).toBeInTheDocument()
    })

    it('renders ButtonGroupSetting', function () {
      render(<ButtonGroupSetting buttons={[{ name: 'left' }]} label="Alignment" onClick={() => {}} />)
      expect(screen.getByText('Alignment')).toBeInTheDocument()
    })

    it('renders ColorOptionSetting', function () {
      render(<ColorOptionSetting buttons={[{ name: 'red', color: '#f00' }]} label="Color" onClick={() => {}} />)
      expect(screen.getByText('Color')).toBeInTheDocument()
    })

    it('renders ColorPickerSetting', function () {
      render(<ColorPickerSetting label="Picker" value="#000000" />)
      expect(screen.getByText('Picker')).toBeInTheDocument()
    })

    it('renders InputListSetting', function () {
      render(
        <InputListSetting
          label="URL"
          listOptions={[{ value: 'https://example.com', label: 'Example' }]}
          placeholder="https://..."
          value=""
          onChange={() => {}}
        />,
      )
      expect(screen.getByText('URL')).toBeInTheDocument()
    })

    it('renders MediaUploadSetting', function () {
      render(<MediaUploadSetting label="Cover" onFileChange={() => {}} onRemoveMedia={() => {}} />)
      expect(screen.getByText('Cover')).toBeInTheDocument()
      expect(screen.getByTestId('media-upload-setting')).toBeInTheDocument()
    })
  })

  describe('settings chrome', function () {
    it('renders SettingLabel with the shared label styling', function () {
      render(<SettingLabel>My label</SettingLabel>)

      const label = screen.getByText('My label')
      expect(label.tagName).toBe('DIV')
      expect(label).toHaveClass('text-sm', 'font-medium', 'tracking-normal', 'text-grey-900', 'dark:text-grey-300')
    })

    it('renders SettingDescription with the shared styling, merged with extra classes', function () {
      render(<SettingDescription className="mt-1 w-11/12">Help text</SettingDescription>)

      const description = screen.getByText('Help text')
      expect(description.tagName).toBe('P')
      expect(description).toHaveClass(
        'mt-1',
        'w-11/12',
        'text-xs',
        'leading-snug',
        'font-normal',
        'text-grey-700',
        'dark:text-grey-600',
      )
    })
  })

  describe('InputUrlSetting', function () {
    it('shows autocomplete suggestions once links resolve', async function () {
      const fetchAutocompleteLinks = vi.fn(async (): Promise<ListOptionItem[]> => [createListOptionItem()])
      mocks.contextValue.cardConfig = { fetchAutocompleteLinks }

      render(<InputUrlSetting dataTestId="url" label="URL" value="" onChange={() => {}} />)

      fireEvent.focus(screen.getByRole('textbox'))

      expect(await screen.findByTestId('url-listOption-Example')).toBeInTheDocument()
    })

    it('ignores autocomplete results that resolve after unmount', async function () {
      let resolveLinks: ((links: ListOptionItem[]) => void) | undefined
      const fetchAutocompleteLinks = vi.fn(
        () =>
          new Promise<ListOptionItem[]>((resolve) => {
            resolveLinks = resolve
          }),
      )
      mocks.contextValue.cardConfig = { fetchAutocompleteLinks }

      const { unmount } = render(<InputUrlSetting dataTestId="url" label="URL" value="" onChange={() => {}} />)

      expect(fetchAutocompleteLinks).toHaveBeenCalled()

      unmount()
      if (!resolveLinks) {
        throw new Error('Expected autocomplete request to create a resolver')
      }
      resolveLinks([createListOptionItem()])
      // the late resolution must not trigger a state update on the unmounted
      // component — act() flushes the microtask without errors or warnings
      await act(async () => {})
    })
  })
})
