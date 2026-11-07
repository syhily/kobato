import { EyeIcon, EyeOffIcon } from 'lucide-react'

import { useI18n } from '@/ui/lib/I18nProvider'

// Shared auth input styling across login / install / reset forms.
export const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

export function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center px-2 text-muted-foreground hover:text-foreground"
      aria-label={show ? t('auth.shared.hidePassword') : t('auth.shared.showPassword')}
    >
      {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
    </button>
  )
}
