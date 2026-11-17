import { LabelledCheckbox } from '../shared/LabelledCheckbox'

export interface ToggleRowProps {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
}

export function ToggleRow(props: ToggleRowProps) {
  return <LabelledCheckbox {...props} />
}
