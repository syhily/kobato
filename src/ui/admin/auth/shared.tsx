import { EyeIcon, EyeOffIcon } from 'lucide-react'

// Shared auth input styling across login / install / reset forms.
export const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

export function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center px-2 text-muted-foreground hover:text-foreground"
      aria-label={show ? '隐藏密码' : '显示密码'}
    >
      {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
    </button>
  )
}
