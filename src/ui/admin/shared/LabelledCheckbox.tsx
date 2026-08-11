import { Checkbox } from '@/ui/components/checkbox'

export interface LabelledCheckboxProps {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (next: boolean) => void
  description?: string
  disabled?: boolean
}

// Base UI puts our `id` on a hidden native `<input>` (the visible
// `<span role="checkbox">` gets a generated one), so `htmlFor` activates
// the control natively; `aria-labelledby` names the visible span.
export function LabelledCheckbox({
  id,
  label,
  checked,
  onCheckedChange,
  description,
  disabled,
}: LabelledCheckboxProps) {
  const control = (
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      disabled={disabled}
      aria-labelledby={`${id}-label`}
    />
  )
  if (description === undefined) {
    return (
      <div className="flex items-center gap-2">
        {control}
        <label id={`${id}-label`} htmlFor={id} className="text-sm select-none">
          {label}
        </label>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3">
      {control}
      <div className="grid gap-1 text-sm">
        <label id={`${id}-label`} htmlFor={id} className="font-medium select-none">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
