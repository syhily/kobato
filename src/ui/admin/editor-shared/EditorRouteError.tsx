import { ArrowLeftIcon, AlertTriangleIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/ui/components/button'

export interface EditorRouteErrorProps {
  message: string
  /** Display noun (文章 / 页面) — the title renders as 无法打开{entityLabel}编辑器. */
  entityLabel: string
  /** Admin list path the back button returns to. */
  listPath: string
}

export function EditorRouteError({ message, entityLabel, listPath }: EditorRouteErrorProps) {
  return (
    <div className="flex min-h-dialog-max-h-sm flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangleIcon className="size-10 text-destructive" />
      <h1 className="text-lg font-semibold">无法打开{entityLabel}编辑器</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        render={
          <Link to={listPath}>
            <ArrowLeftIcon /> 返回列表
          </Link>
        }
      />
    </div>
  )
}
