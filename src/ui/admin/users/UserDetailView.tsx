import type { NavigateFunction } from 'react-router'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate } from '@/shared/utils/formatter'
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
import { PortableTextBody } from '@/ui/pt/render'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

export interface UserDetailViewProps {
  userId: string
  /** The signed-in admin's id — the operations card hides self-targeting actions. */
  currentUserId: string
  navigate: NavigateFunction
  passkeyEnabled: boolean
}

export function UserDetailView({ userId, currentUserId, navigate, passkeyEnabled }: UserDetailViewProps) {
  const config = useSiteIdentity()

  const userQuery = useQuery(orpcQuery.admin.users.get.queryOptions({ input: { id: userId } }))

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
          <p className="text-lg text-foreground">加载失败</p>
          <p className="text-sm">{userQuery.error?.message ?? '请稍后重试'}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void userQuery.refetch()}>
            重试
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
            aria-label="返回用户列表"
          >
            <ArrowLeftIcon />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">用户详情</h1>
            <p className="text-sm text-muted-foreground">查看与编辑该用户信息，并管理其评论。</p>
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
                {user.role === 'admin' && <Badge variant="secondary">管理员</Badge>}
                {user.role === 'author' && <Badge variant="secondary">作者</Badge>}
                {user.role === 'visitor' && <Badge variant="secondary">访客</Badge>}
                {user.role === null && <Badge variant="outline">匿名</Badge>}
                {user.deletedAt ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    已删除
                  </Badge>
                ) : user.isMuted ? (
                  <Badge variant="destructive">已禁言</Badge>
                ) : (
                  <Badge variant="secondary">正常</Badge>
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
              <CardTitle>统计信息</CardTitle>
              <CardDescription>评论次数与最近活动。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">评论总数</span>
                <span className="font-medium">{user.commentCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">待审核</span>
                <span className={cn('font-medium', user.pendingCount > 0 && 'text-destructive')}>
                  {user.pendingCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">最近评论</span>
                <span>
                  {user.lastCommentAt ? formatLocalDate(new Date(user.lastCommentAt), DATE_FORMAT, config) : '—'}
                </span>
              </div>
              <Separator className="my-2" />

              <div className="flex justify-between">
                <span className="text-muted-foreground">注册时间</span>
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
                <span>最近评论</span>
                {comments.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">显示 {comments.length} 条</span>
                )}
              </CardTitle>
              <CardDescription>最近 10 条评论；点击文章标题可跳转到评论详情。</CardDescription>
            </CardHeader>
            <CardContent>
              {commentsQuery.isPending && comments.length === 0 ? (
                <Skeleton className="h-32 w-full" />
              ) : commentsQuery.isError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-destructive">评论加载失败。</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void commentsQuery.refetch()}>
                    重试
                  </Button>
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">该用户暂无评论。</p>
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
                        {c.isPending && <Badge variant="destructive">待审核</Badge>}
                      </div>
                      <div className="comment-content prose-blog prose prose-sm mt-1 line-clamp-3 max-w-none text-sm leading-snug wrap-break-word whitespace-normal [&>*]:!my-0">
                        <PortableTextBody body={c.body} />
                      </div>
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
