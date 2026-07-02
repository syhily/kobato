import CenterAlignIcon from '@/ui/inkling-editor/assets/icons/inkling-align-center.svg?react'
import LeftAlignIcon from '@/ui/inkling-editor/assets/icons/inkling-align-left.svg?react'
import { Button } from '@/ui/inkling-editor/components/ui/Button'
import { ReadOnlyOverlay } from '@/ui/inkling-editor/components/ui/ReadOnlyOverlay'
import {
  ButtonGroupSetting,
  InputSetting,
  InputUrlSetting,
  SettingsPanel,
} from '@/ui/inkling-editor/components/ui/SettingsPanel'

export function ButtonCard({
  alignment,
  buttonText,
  buttonPlaceholder,
  buttonUrl,
  handleAlignmentChange,
  handleButtonTextChange,
  handleButtonUrlChange,
  isEditing,
}: {
  alignment?: string
  buttonText?: string
  buttonPlaceholder?: string
  buttonUrl?: string
  handleAlignmentChange?: (name: string) => void
  handleButtonTextChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleButtonUrlChange?: (value: string) => void
  isEditing?: boolean
}) {
  const buttonGroupChildren = [
    {
      label: 'Left',
      name: 'left',
      Icon: LeftAlignIcon,
      dataTestId: 'button-align-left',
    },
    {
      label: 'Center',
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
            label="Content alignment"
            selectedName={alignment!}
            onClick={handleAlignmentChange!}
          />
          <InputSetting
            dataTestId="button-input-text"
            label="Button text"
            placeholder="Add button text"
            value={buttonText!}
            onChange={handleButtonTextChange!}
          />
          <InputUrlSetting
            dataTestId="button-input-url"
            label="Button URL"
            value={buttonUrl!}
            onChange={handleButtonUrlChange!}
          />
        </SettingsPanel>
      )}
    </>
  )
}
