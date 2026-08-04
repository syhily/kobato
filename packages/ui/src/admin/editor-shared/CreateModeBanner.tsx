interface CreateModeBannerProps {
  entityLabel: string
  draftSavedAt: number | null
}

export function CreateModeBanner({ entityLabel, draftSavedAt }: CreateModeBannerProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-destructive/10 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
      <span>{`新${entityLabel}正文仅本地保留，点击「创建${entityLabel}」后才会同步到服务器。`}</span>
      {draftSavedAt !== null ? (
        <span className="font-mono">已恢复本地草稿 · {new Date(draftSavedAt).toLocaleTimeString('zh-CN')}</span>
      ) : null}
    </div>
  )
}
