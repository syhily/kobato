import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'

export function EditorPlaceholder({ className, text }: { className?: string; text?: string }) {
  const labels = useInklingLabels()

  return (
    <div
      className={`text-grey-500 dark:text-grey-800 pointer-events-none absolute top-0 left-0 min-w-full cursor-text font-serif text-xl ${className ?? ''}`}
    >
      {text ?? labels['placeholder.editor']}
    </div>
  )
}
