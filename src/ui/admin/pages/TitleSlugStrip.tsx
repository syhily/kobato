import { Input } from '@/ui/components/input'

interface TitleSlugStripProps {
  title: string
  slug: string
  onTitleChange: (value: string) => void
  onSlugChange: (value: string) => void
  disabled?: boolean
}

export function TitleSlugStrip({ title, slug, onTitleChange, onSlugChange, disabled }: TitleSlugStripProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <Input
        aria-label="页面标题"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="页面标题"
        maxLength={200}
        disabled={disabled}
        className="h-auto border-0 bg-transparent px-0 text-2xl leading-tight font-bold tracking-tight shadow-none focus-visible:ring-0 md:text-3xl dark:bg-transparent"
      />
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>/</span>
        <Input
          aria-label="URL slug"
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="留空将根据标题按拼音生成"
          maxLength={80}
          disabled={disabled}
          className="h-7 grow border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
    </div>
  )
}
