export function EditorPlaceholder({ className, text }: { className?: string; text?: string }) {
  return (
    <div
      className={`pointer-events-none absolute top-0 left-0 min-w-full cursor-text font-serif text-xl text-grey-500 dark:text-grey-800 ${className}`}
    >
      {typeof text === 'string' ? text : 'Begin writing your post...'}
    </div>
  )
}
