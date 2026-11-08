import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, CheckIcon, HistoryIcon, RefreshCcwIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AdminRevisionDto } from '@/shared/contracts/revision'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { formatDateTime } from '@/shared/i18n/format'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { diffBodies, DiffPanel } from '@/ui/admin/editor/lexical-body-diff'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/components/sheet'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface RevisionHistoryDrawerProps {
  type: 'page' | 'post'
  ownerId: string
  /** Token of the currently displayed revision; used to highlight the row. */
  currentToken: string | null
  /** Lexical body currently displayed in the editor. */
  currentBody: LexicalEditorState
  onAdoptRevision: (revision: AdminRevisionDto) => void
}

export function RevisionHistoryDrawer({
  type,
  ownerId,
  currentToken,
  currentBody,
  onAdoptRevision,
}: RevisionHistoryDrawerProps) {
  const { t } = useI18n()
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

  const [lastAppliedData, setLastAppliedData] = useState(listQuery.data)
  if (listQuery.data !== lastAppliedData) {
    setLastAppliedData(listQuery.data)
    if (listQuery.data) {
      setRevisions(listQuery.data.revisions)
    }
  }

  useEffect(() => {
    if (listQuery.error) {
      toastApiError(listQuery.error, 'admin.toast.revisionsLoadFailed', t)
    }
  }, [listQuery.error, t])

  const isPending = listQuery.isFetching

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setSelectedId(null)
    }
  }

  const selectedRevision = useMemo<AdminRevisionDto | null>(
    () => revisions?.find((r) => r.id === selectedId) ?? null,
    [revisions, selectedId],
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="w-full justify-start" type="button">
            <HistoryIcon /> {t('admin.editor.revisions.title')}
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
                  title={t('admin.editor.backToList')}
                  aria-label={t('admin.editor.backToList')}
                >
                  <ArrowLeftIcon />
                </Button>
                <span>{t('admin.editor.revisions.compareTitle', { revision: selectedRevision.revisionNo })}</span>
              </>
            ) : (
              <>
                <HistoryIcon className="size-4" />
                <span>{t('admin.editor.revisions.title')}</span>
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
                // Settle from the refetch promise, not the render-phase
                // guard above: with `staleTime: Infinity` an unchanged
                // refetch returns the same data reference, so the guard
                // never re-fires and the list would stick on 加载中….
                void listQuery.refetch().then((result) => {
                  if (result.data) {
                    setRevisions(result.data.revisions)
                  }
                })
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

interface RevisionListViewProps {
  revisions: AdminRevisionDto[] | null
  currentToken: string | null
  isFetching: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
}

function RevisionListView({ revisions, currentToken, isFetching, onSelect, onRefresh }: RevisionListViewProps) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between p-4 pt-0">
        <span className="text-xs text-muted-foreground">
          {revisions !== null
            ? t('admin.editor.revisions.count', { count: revisions.length })
            : t('common.state.loading')}
        </span>
        <Button variant="outline" size="sm" className="border-ink-4" onClick={onRefresh} disabled={isFetching}>
          <RefreshCcwIcon /> {t('common.action.reload')}
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
          <li className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t('admin.editor.revisions.empty')}
          </li>
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
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
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
            R{revision.revisionNo} ·{' '}
            {revision.status === 'published'
              ? t('admin.editor.revisions.statusPublished')
              : t('admin.editor.revisions.statusDraft')}
          </Badge>
          {isCurrent ? <Badge variant="outline">{t('admin.editor.revisions.current')}</Badge> : null}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {t('admin.editor.revisions.createdAt', {
            time: formatDateTime(new Date(revision.createdAt), { locale, timeZone }),
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {t('admin.editor.revisions.updatedAt', {
            time: formatDateTime(new Date(revision.updatedAt), { locale, timeZone }),
          })}
        </div>
        {revision.headings.length > 0 || revision.imageSources.length > 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">
            {t('admin.editor.revisions.stats', {
              headings: revision.headings.length,
              images: revision.imageSources.length,
            })}
          </div>
        ) : null}
      </button>
    </li>
  )
}

interface RevisionDetailViewProps {
  revision: AdminRevisionDto
  currentBody: LexicalEditorState
  isCurrent: boolean
  onAdopt: () => void
}

function RevisionDetailView({ revision, currentBody, isCurrent, onAdopt }: RevisionDetailViewProps) {
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  const revisionBody = revision.body
  const diff = useMemo(() => diffBodies(revisionBody, currentBody), [revisionBody, currentBody])
  const changedCount = diff.filter((entry) => entry.status !== 'unchanged').length

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-hidden px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={revision.status === 'published' ? 'default' : 'secondary'}>
          R{revision.revisionNo} ·{' '}
          {revision.status === 'published'
            ? t('admin.editor.revisions.statusPublished')
            : t('admin.editor.revisions.statusDraft')}
        </Badge>
        <span>
          {t('admin.editor.revisions.updatedAt', {
            time: formatDateTime(new Date(revision.updatedAt), { locale, timeZone }),
          })}
        </span>
        <span className="ml-auto">
          {changedCount === 0
            ? t('admin.editor.revisions.same')
            : t('admin.editor.revisions.diffCount', { count: changedCount })}
        </span>
      </div>
      <div className="grid min-h-0 grow grid-cols-2 gap-2 overflow-hidden rounded-xl border bg-card">
        {/* key-remount: switching revisions rebuilds both panes, which resets their scroll positions */}
        <RevisionPanes key={revision.id} diff={diff} />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <span>{t('admin.editor.revisions.adoptHint')}</span>
        <Button
          onClick={onAdopt}
          disabled={isCurrent}
          title={isCurrent ? t('admin.editor.revisions.adoptCurrentTitle') : t('admin.editor.revisions.adoptTitle')}
        >
          <CheckIcon /> {isCurrent ? t('admin.editor.revisions.current') : t('admin.editor.revisions.adopt')}
        </Button>
      </div>
    </div>
  )
}

/** The two scroll-synced diff panes. Remounted per revision (key) so scroll starts at the top. */
function RevisionPanes({ diff }: { diff: ReturnType<typeof diffBodies> }) {
  const { t } = useI18n()
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const syncScrollLockRef = useRef(false)

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
    // The panes are stable host elements — attach once; `diff` only swaps their children.
  }, [])

  return (
    <>
      <div className="flex min-h-0 flex-col border-r">
        <div className="border-b bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
          {t('admin.editor.revisions.paneOld')}
        </div>
        <div ref={leftScrollRef} className="min-h-0 grow overflow-y-auto overscroll-contain p-2">
          <DiffPanel diff={diff} side="left" />
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="border-b bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
          {t('admin.editor.revisions.paneCurrent')}
        </div>
        <div ref={rightScrollRef} className="min-h-0 grow overflow-y-auto overscroll-contain p-2">
          <DiffPanel diff={diff} side="right" />
        </div>
      </div>
    </>
  )
}
