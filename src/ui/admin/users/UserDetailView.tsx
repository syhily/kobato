import type { NavigateFunction } from 'react-router'

import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { AdminUserDto } from '@/shared/contracts/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate } from '@/shared/utils/formatter'
import { ROLE_LABEL_KEYS } from '@/shared/utils/roles'
import { idStr } from '@/shared/utils/tools'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { UserEditForm } from '@/ui/admin/users/UserEditForm'
import { UserOperationsCard } from '@/ui/admin/users/UserOperationsCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Separator } from '@/ui/components/separator'
import { Skeleton } from '@/ui/components/skeleton'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { CommentContentHtml } from '@/ui/public/comments/CommentContentHtml'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

// Structural view of an `admin.users.list` page — the controller declares the
// output schema inline, so there is no exported wire type to import.
type UsersListPage = { users: AdminUserDto[]; total: number; hasMore: boolean }

export interface UserDetailViewProps {
  userId: string
  /** The signed-in admin's id — the operations card hides self-targeting actions. */
  currentUserId: string
  navigate: NavigateFunction
  passkeyEnabled: boolean
}

export function UserDetailView({ userId, currentUserId, navigate, passkeyEnabled }: UserDetailViewProps) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const queryClient = useQueryClient()

  const userQuery = useQuery({
    ...orpcQuery.admin.users.get.queryOptions({ input: { id: userId } }),
    // Seed from any cached users-list page so the hero card (and its shared-element
    // transition partner in UsersTable) renders inside the navigation transition.
    placeholderData: () => {
      for (const [, data] of queryClient.getQueriesData<InfiniteData<UsersListPage, number>>({
        queryKey: orpcQuery.admin.users.list.key(),
      })) {
        const row = data?.pages.flatMap((page) => page.users).find((candidate) => idStr(candidate.id) === userId)
        if (row) {
          return { user: row }
        }
      }
      return undefined
    },
  })

  const commentsQuery = useQuery(
    orpcQuery.admin.comments.loadAll.queryOptions({
      input: { offset: 0, limit: 10, userId },
    }),
  )

  const user = userQuery.data?.user ?? null
  const comments: AdminComment[] = commentsQuery.data?.comments ?? []

  if (userQuery.isError) {
    return (
      <AdminListPage>
        <div className="flex flex-col items-center justify-center gap-2 py-32 text-muted-foreground">
          <p className="text-lg text-foreground">{t('admin.list.loadFailed')}</p>
          <p className="text-sm">{userQuery.error?.message ?? t('admin.list.retryHint')}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void userQuery.refetch()}>
            {t('common.action.retry')}
          </Button>
        </div>
      </AdminListPage>
    )
  }

  if (!user) {
    return <UserDetailSkeleton />
  }

  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase()

  return (
    <AdminListPage>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void navigate('/admin/security/users')}
            aria-label={t('admin.users.detail.back')}
          >
            <ArrowLeftIcon />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('admin.users.detail.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin.users.detail.description')}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <Avatar className="size-20">
                <AvatarImage src={avatarImageUrl(user.id)} alt={user.name} />
                <AvatarFallback className="bg-muted text-lg font-semibold">{initial}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-semibold">{user.name}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {user.role === 'admin' && <Badge variant="secondary">{t(ROLE_LABEL_KEYS.admin)}</Badge>}
                {user.role === 'author' && <Badge variant="secondary">{t(ROLE_LABEL_KEYS.author)}</Badge>}
                {user.role === 'visitor' && <Badge variant="secondary">{t(ROLE_LABEL_KEYS.visitor)}</Badge>}
                {user.role === null && <Badge variant="outline">{t('common.role.anonymous')}</Badge>}
                {user.deletedAt ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t('admin.users.status.deleted')}
                  </Badge>
                ) : user.isMuted ? (
                  <Badge variant="destructive">{t('admin.users.status.muted')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('admin.users.status.normal')}</Badge>
                )}
                {user.badgeName && (
                  <Badge
                    className="border-transparent"
                    style={{
                      backgroundColor: user.badgeColor || 'var(--brand)',
                      color: user.badgeTextColor || '#fff',
                    }}
                  >
                    {user.badgeName}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.users.detail.stats')}</CardTitle>
              <CardDescription>{t('admin.users.detail.statsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.users.detail.commentCount')}</span>
                <span className="font-medium">{user.commentCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.users.detail.pending')}</span>
                <span className={cn('font-medium', user.pendingCount > 0 && 'text-destructive')}>
                  {user.pendingCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.users.detail.lastComment')}</span>
                <span>
                  {user.lastCommentAt ? formatLocalDate(new Date(user.lastCommentAt), DATE_FORMAT, config) : '—'}
                </span>
              </div>
              <Separator className="my-2" />

              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.users.detail.registered')}</span>
                <span>{formatLocalDate(new Date(user.createdAt), DATE_FORMAT, config)}</span>
              </div>
              {passkeyEnabled && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Passkey</span>
                  <span className="font-medium">{user.passkeyCount}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <UserOperationsCard
            user={user}
            currentUserId={currentUserId}
            passkeyEnabled={passkeyEnabled}
            onDeleted={() => void navigate('/admin/security/users')}
          />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <UserEditForm user={user} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{t('admin.users.detail.recentComments')}</span>
                {comments.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('admin.users.detail.showing', { count: comments.length })}
                  </span>
                )}
              </CardTitle>
              <CardDescription>{t('admin.users.detail.recentCommentsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {commentsQuery.isPending && comments.length === 0 ? (
                <Skeleton className="h-32 w-full" />
              ) : commentsQuery.isError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-destructive">{t('admin.users.detail.commentsLoadFailed')}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void commentsQuery.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('admin.users.detail.noComments')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <li key={idStr(c.id)} className="border-b pb-3 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {c.pageTitle && c.pagePublicId && (
                          <Link
                            to={`/admin/comments?pageKey=${encodeURIComponent(c.pagePublicId)}`}
                            className="font-medium hover:underline"
                          >
                            {c.pageTitle}
                          </Link>
                        )}
                        <span className="text-muted-foreground">
                          {c.createAt && formatLocalDate(c.createAt, DATE_FORMAT, config)}
                        </span>
                        {c.isPending && <Badge variant="destructive">{t('admin.users.detail.pending')}</Badge>}
                      </div>
                      <CommentContentHtml
                        content={c.content}
                        className="comment-content typeset typeset-comment mt-1 line-clamp-3 text-sm leading-snug wrap-break-word whitespace-normal [&>*]:!my-0"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminListPage>
  )
}

function UserDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col items-center gap-3">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
