import { Loader2Icon, SendIcon } from 'lucide-react'

import { Button } from '@/ui/components/button'

// Positioning and visibility are the caller's responsibility (return `null` to hide).
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
