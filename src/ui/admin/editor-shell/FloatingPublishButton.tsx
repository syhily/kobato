import { Loader2Icon, SendIcon } from 'lucide-react'

import { Button } from '@/ui/components/button'

// component is positioning-agnostic — the floating layout lives inside
// `PageBodyEditor`'s `floatingActions` slot, which docks the button
// immediately to the right of the floating editor toolbar so the two
// stay paired regardless of toolbar density.
//
// Visibility is the caller's responsibility (return `null` from the
// shell when there is nothing publishable, e.g. create mode).
interface FloatingPublishButtonProps {
  onPublish: () => void
  disabled: boolean
  pending: boolean
  title: string
}

export function FloatingPublishButton({ onPublish, disabled, pending, title }: FloatingPublishButtonProps) {
  return (
    <Button
      size="icon"
      type="button"
      onClick={onPublish}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="h-11 w-11 rounded-full shadow-lg"
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
    </Button>
  )
}
