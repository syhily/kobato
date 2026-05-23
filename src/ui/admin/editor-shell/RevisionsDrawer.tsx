import { ArrowLeftIcon, CheckIcon, HistoryIcon, RefreshCcwIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { AdminRevisionDto } from '@/shared/types/pages'

import { orpcQuery, useQuery } from '@/client/api/query'
import { diffBodies, DiffPanel } from '@/ui/admin/editor/portable-text-diff'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/components/sheet'
import { cn } from '@/ui/lib/cn'

// Revision history drawer. Two stages:
//
//   1. List view — all revisions, newest-first, with status,
//      timestamps, and a structural summary (heading / image
//      counts). Clicking a row drops into the detail view for
//      that revision.
//
//   2. Detail view — single-column diff between the selected
//      historical revision (left/red) and the editor's current
//      body (right/green). Below the diff: a "选择此版本"
//      button that adopts the historical body into the editor.
//      Adopting does NOT write to the server — it loads the body
//      into the editor pane so the operator can save a new draft
//      revision (or publish) on top of it.
//
// The drawer is intentionally wide enough for the diff
// (`w-[640px]`) but renders the list on smaller widths fine.

export interface RevisionHistoryDrawerProps {
  type: 'page' | 'post'
  ownerId: string
  /** Token of the currently displayed revision; used to highlight the row. */
  currentToken: string | null
  /** PortableText body currently displayed in the editor. */
  currentBody: PortableTextBody
  /**
   * Adopt the historical revision's body into the editor pane.
   * Implementation owned by the editor shell — typically `setBody`
   * + `setBodyKey` to force a remount, leaving the autosave layer
   * to push the adopted body through `saveDraft`.
   */
  onAdoptRevision: (revision: AdminRevisionDto) => void
}

export function RevisionHistoryDrawer({
  type,
  ownerId,
  currentToken,
  currentBody,
  onAdoptRevision,
}: RevisionHistoryDrawerProps) {
  const [open, setOpen] = useState(false)
  const [revisions, setRevisions] = useState<AdminRevisionDto[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQuery = useQuery(
    type === 'page'
      ? orpcQuery.admin.pages.listRevisions.queryOptions({
          input: { id: ownerId },
          enabled: open,
          staleTime: Infinity,
        })
      : orpcQuery.admin.posts.listRevisions.queryOptions({
          input: { id: ownerId },
          enabled: open,
          staleTime: Infinity,
        }),
  )

  useEffect(() => {
    if (listQuery.data) {
      setRevisions(listQuery.data.revisions)
    }
  }, [listQuery.data])

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载历史版本失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const isPending = listQuery.isFetching

  // Clear the selected detail view whenever the drawer closes so
  // the next open starts on the list.
  useEffect(() => {
    if (!open) {
      setSelectedId(null)
    }
  }, [open])

  const selectedRevision = useMemo<AdminRevisionDto | null>(
    () => revisions?.find((r) => r.id === selectedId) ?? null,
    [revisions, selectedId],
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="w-full justify-start" type="button">
            <HistoryIcon /> 历史版本
          </Button>
        }
      />
      <SheetContent side="right" className="flex min-h-0 w-full flex-col sm:max-w-160">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            {selectedRevision !== null ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedId(null)}
                  title="返回列表"
                  aria-label="返回列表"
                >
                  <ArrowLeftIcon />
                </Button>
                <span>R{selectedRevision.revisionNo} · 与当前正文对比</span>
              </>
            ) : (
              <>
                <HistoryIcon className="size-4" />
                <span>历史版本</span>
              </>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selectedRevision === null ? (
            <RevisionListView
              revisions={revisions}
              currentToken={currentToken}
              isFetching={isPending}
              onSelect={setSelectedId}
              onRefresh={() => {
                setRevisions(null)
                void listQuery.refetch()
              }}
            />
          ) : (
            <RevisionDetailView
              revision={selectedRevision}
              currentBody={currentBody}
              isCurrent={selectedRevision.clientRevisionToken === currentToken}
              onAdopt={() => {
                onAdoptRevision(selectedRevision)
                setOpen(false)
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// --- List view -------------------------------------------------------------

interface RevisionListViewProps {
  revisions: AdminRevisionDto[] | null
  currentToken: string | null
  isFetching: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
}

function RevisionListView({ revisions, currentToken, isFetching, onSelect, onRefresh }: RevisionListViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between p-4 pt-0">
        <span className="text-xs text-muted-foreground">
          {revisions !== null ? `${revisions.length} 个修订` : '加载中…'}
        </span>
        <Button variant="outline" size="sm" className="border-ink-4" onClick={onRefresh} disabled={isFetching}>
          <RefreshCcwIcon /> 刷新
        </Button>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-4">
        {revisions?.map((revision) => (
          <RevisionRow
            key={revision.id}
            revision={revision}
            isCurrent={revision.clientRevisionToken === currentToken}
            onClick={() => onSelect(revision.id)}
          />
        ))}
        {revisions !== null && revisions.length === 0 ? (
          <li className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">暂无历史</li>
        ) : null}
      </ol>
    </div>
  )
}

interface RevisionRowProps {
  revision: AdminRevisionDto
  isCurrent: boolean
  onClick: () => void
}

function RevisionRow({ revision, isCurrent, onClick }: RevisionRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full rounded border bg-card p-3 text-left text-sm transition',
          'hover:border-primary/60 hover:bg-accent',
          isCurrent ? 'border-primary' : 'border-border',
        )}
        aria-current={isCurrent ? 'true' : undefined}
      >
        <div className="flex items-center gap-2">
          <Badge variant={revision.status === 'published' ? 'default' : 'secondary'}>
            R{revision.revisionNo} · {revision.status === 'published' ? '已发布' : '草稿'}
          </Badge>
          {isCurrent ? <Badge variant="outline">当前</Badge> : null}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          创建于 {new Date(revision.createdAt).toLocaleString('zh-CN')}
        </div>
        <div className="text-xs text-muted-foreground">
          更新于 {new Date(revision.updatedAt).toLocaleString('zh-CN')}
        </div>
        {revision.headings.length > 0 || revision.imageSources.length > 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">
            {revision.headings.length} 个标题 · {revision.imageSources.length} 张图片
          </div>
        ) : null}
      </button>
    </li>
  )
}

// --- Detail (diff) view ----------------------------------------------------

interface RevisionDetailViewProps {
  revision: AdminRevisionDto
  currentBody: PortableTextBody
  isCurrent: boolean
  onAdopt: () => void
}

function RevisionDetailView({ revision, currentBody, isCurrent, onAdopt }: RevisionDetailViewProps) {
  // Historical on the *left* (red / removed if it differs from
  // current), editor's current on the *right* (green / added).
  // We render only the right side: a single column diff is enough
  // for the operator's "should I adopt this?" question. The
  // historical view is implicit (deletions show through line-
  // through styling on changed text blocks).
  const diff = useMemo(() => diffBodies(revision.body, currentBody), [revision.body, currentBody])
  const changedCount = diff.filter((entry) => entry.status !== 'unchanged').length

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const syncScrollLockRef = useRef(false)

  useEffect(() => {
    const left = leftScrollRef.current
    const right = rightScrollRef.current
    if (!left || !right) {
      return
    }
    left.scrollTop = 0
    right.scrollTop = 0
  }, [revision.id])

  useEffect(() => {
    const left = leftScrollRef.current
    const right = rightScrollRef.current
    if (!left || !right) {
      return
    }

    const onLeftScroll = () => {
      if (syncScrollLockRef.current) {
        return
      }
      syncScrollLockRef.current = true
      right.scrollTop = left.scrollTop
      syncScrollLockRef.current = false
    }
    const onRightScroll = () => {
      if (syncScrollLockRef.current) {
        return
      }
      syncScrollLockRef.current = true
      left.scrollTop = right.scrollTop
      syncScrollLockRef.current = false
    }

    left.addEventListener('scroll', onLeftScroll, { passive: true })
    right.addEventListener('scroll', onRightScroll, { passive: true })
    return () => {
      left.removeEventListener('scroll', onLeftScroll)
      right.removeEventListener('scroll', onRightScroll)
    }
  }, [diff])

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-hidden px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={revision.status === 'published' ? 'default' : 'secondary'}>
          R{revision.revisionNo} · {revision.status === 'published' ? '已发布' : '草稿'}
        </Badge>
        <span>更新于 {new Date(revision.updatedAt).toLocaleString('zh-CN')}</span>
        <span className="ml-auto">{changedCount === 0 ? '与当前一致' : `${changedCount} 处差异`}</span>
      </div>
      <div className="grid min-h-0 grow grid-cols-2 gap-2 overflow-hidden rounded-md border bg-card">
        <div className="flex min-h-0 flex-col border-r">
          <div className="border-b bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">历史版本</div>
          <div ref={leftScrollRef} className="min-h-0 grow overflow-y-auto overscroll-contain p-2">
            <DiffPanel diff={diff} side="left" />
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="border-b bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">当前正文</div>
          <div ref={rightScrollRef} className="min-h-0 grow overflow-y-auto overscroll-contain p-2">
            <DiffPanel diff={diff} side="right" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 text-xs text-muted-foreground">
        <span>选择此版本会用历史正文替换编辑器内容；更改不会立刻保存到服务器，需要再点一次「保存」或「发布」。</span>
        <Button onClick={onAdopt} disabled={isCurrent} title={isCurrent ? '当前正在编辑此版本' : '使用此版本'}>
          <CheckIcon /> {isCurrent ? '当前' : '选择此版本'}
        </Button>
      </div>
    </div>
  )
}
