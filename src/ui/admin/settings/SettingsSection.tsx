import { type ReactNode, useId } from 'react'

import { Checkbox } from '@/ui/components/checkbox'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/ui/components/field'
import { cn } from '@/ui/lib/cn'

export interface SettingsControlProps {
  'aria-invalid'?: true
  'aria-describedby'?: string
}

type SettingsRowChildren = ReactNode | ((controlProps: SettingsControlProps) => ReactNode)

interface SettingsRowProps {
  /** Label rendered in the row's left column on desktop. */
  label: string
  /** Sets the label's `htmlFor` so it points at the control's `id`. */
  htmlFor?: string
  /** Optional helper text rendered below the control. */
  hint?: ReactNode
  /** Validation error rendered through `FieldError`. Drives `data-invalid` styling. */
  error?: string
  /** Form control(s) — `<Input>`, `<Select>`, etc. May receive a11y props by render prop. */
  children: SettingsRowChildren
}

export function SettingsRow({ label, htmlFor, hint, error, children }: SettingsRowProps) {
  const generatedId = useId()
  const descriptionId = hint ? `${generatedId}-description` : undefined
  const errorId = error ? `${generatedId}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined
  const controlProps: SettingsControlProps = {
    ...(error ? { 'aria-invalid': true } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
  }
  const renderedChildren = typeof children === 'function' ? children(controlProps) : children

  return (
    <Field
      data-invalid={error ? true : undefined}
      className="gap-2 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start sm:gap-4"
    >
      <FieldLabel
        htmlFor={htmlFor}
        className={cn(
          'text-sm leading-none font-medium text-foreground sm:pt-2',
          'group-data-[invalid=true]/field:text-destructive',
        )}
      >
        {label}
      </FieldLabel>
      <FieldContent>
        {renderedChildren}
        {hint ? <FieldDescription id={descriptionId}>{hint}</FieldDescription> : null}
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  )
}

interface SettingsCheckboxRowProps {
  /** Row label (left column on desktop, "feature group" of the toggle). */
  rowLabel: string
  /** Optional helper text rendered below the checkbox. */
  hint?: ReactNode
  /** Inline label sitting right next to the checkbox. */
  checkboxLabel: string
  /** DOM id shared between the checkbox and the inline label. */
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function SettingsCheckboxRow({
  rowLabel,
  hint,
  checkboxLabel,
  id,
  checked,
  onCheckedChange,
  disabled,
}: SettingsCheckboxRowProps) {
  return (
    <SettingsRow label={rowLabel} hint={hint}>
      <Field orientation="horizontal" className="w-fit">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <FieldLabel htmlFor={id} className="font-normal">
          {checkboxLabel}
        </FieldLabel>
      </Field>
    </SettingsRow>
  )
}

interface ReadOnlyFieldProps {
  label: string
  value: ReactNode
  hint?: ReactNode
}

export function ReadOnlyField({ label, value, hint }: ReadOnlyFieldProps) {
  return (
    <SettingsRow label={label} hint={hint}>
      <div className="rounded-xl border bg-muted/40 px-3 py-2 font-mono text-sm break-all text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </SettingsRow>
  )
}
