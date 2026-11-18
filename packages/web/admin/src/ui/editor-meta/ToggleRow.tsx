import { LabelledCheckbox } from '@kobato/web-admin/ui/shared/form/LabelledCheckbox.tsx'

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
