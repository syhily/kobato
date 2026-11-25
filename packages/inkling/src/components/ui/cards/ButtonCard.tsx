import type { ChangeEvent } from 'react'

import CenterAlignIcon from '@kobato/inkling-internal/assets/icons/inkling-align-center.svg?react'
import LeftAlignIcon from '@kobato/inkling-internal/assets/icons/inkling-align-left.svg?react'
import { Button } from '@kobato/inkling-internal/components/ui/Button'
import { ReadOnlyOverlay } from '@kobato/inkling-internal/components/ui/ReadOnlyOverlay'
import {
  ButtonGroupSetting,
  InputSetting,
  InputUrlSetting,
  SettingsPanel,
} from '@kobato/inkling-internal/components/ui/SettingsPanel'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'

export function ButtonCard({
  alignment,
  buttonText,
  buttonPlaceholder,
  buttonUrl,
  handleAlignmentChange = () => undefined,
  handleButtonTextChange = () => undefined,
  handleButtonUrlChange = () => undefined,
  isEditing,
}: {
  alignment?: string
  buttonText?: string
  buttonPlaceholder?: string
  buttonUrl?: string
  handleAlignmentChange?: (name: string) => void
  handleButtonTextChange?: (e: ChangeEvent<HTMLInputElement>) => void
  handleButtonUrlChange?: (value: string) => void
  isEditing?: boolean
}) {
  const labels = useInklingLabels()

  const buttonGroupChildren = [
    {
      label: labels['settings.alignment.left'],
      name: 'left',
      Icon: LeftAlignIcon,
      dataTestId: 'button-align-left',
    },
    {
      label: labels['settings.alignment.center'],
      name: 'center',
      Icon: CenterAlignIcon,
      dataTestId: 'button-align-center',
    },
  ]

  return (
    <>
      <div className="inline-block w-full">
        <div
          className={`my-3 flex items-center ${isEditing || buttonUrl ? 'opacity-100' : 'opacity-50'} ${alignment === 'left' ? 'justify-start' : 'justify-center'} `}
          data-testid="button-card"
        >
          <Button dataTestId="button-card-btn" href={buttonUrl} shrink={true}>
            <span data-testid="button-card-btn-span">{buttonText || buttonPlaceholder}</span>
          </Button>
        </div>
      </div>
      <ReadOnlyOverlay />
      {isEditing && (
        <SettingsPanel>
          <ButtonGroupSetting
            buttons={buttonGroupChildren}
            label={labels['settings.contentAlignment']}
            selectedName={alignment}
            onClick={handleAlignmentChange}
          />
          <InputSetting
            dataTestId="button-input-text"
            label={labels['settings.buttonText']}
            placeholder={labels['button.text.placeholder']}
            value={buttonText ?? ''}
            onChange={handleButtonTextChange}
          />
          <InputUrlSetting
            dataTestId="button-input-url"
            label={labels['settings.buttonUrl']}
            value={buttonUrl ?? ''}
            onChange={handleButtonUrlChange}
          />
        </SettingsPanel>
      )}
    </>
  )
}
