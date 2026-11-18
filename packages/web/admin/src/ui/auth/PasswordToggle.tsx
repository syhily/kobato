import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

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
