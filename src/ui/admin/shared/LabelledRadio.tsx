import { Label } from '@/ui/components/label'
import { RadioGroupItem } from '@/ui/components/radio-group'
import { cn } from '@/ui/lib/cn'

export interface LabelledRadioProps {
  id: string
  value: string
  label: string
  description: string
  disabled?: boolean
}

// Base UI puts our `id` on a hidden native `<input type="radio">` (the
// visible `<span role="radio">` gets a generated one), so `htmlFor`
// activates the control natively; `aria-labelledby` names the visible span.
export function LabelledRadio({ id, value, label, description, disabled }: LabelledRadioProps) {
  return (
    <div className="flex items-start gap-3">
      <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-1" aria-labelledby={`${id}-label`} />
      <div className="flex flex-col gap-1">
        <Label id={`${id}-label`} htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export interface LabelledRadioCardProps {
  id: string
  value: string
  label: string
  description: string
  active: boolean
}

// The whole card is the `<label>`; the same Base UI wiring as LabelledRadio
// applies — `htmlFor` targets the hidden native input, `aria-labelledby`
// names the visible span.
export function LabelledRadioCard({ id, value, label, description, active }: LabelledRadioCardProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-xl border bg-background p-2 transition-colors',
        active ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-accent/40',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" aria-labelledby={`${id}-label`} />
      <div className="grid gap-0.5 text-sm leading-tight">
        <span id={`${id}-label`} className="font-medium">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </label>
  )
}
