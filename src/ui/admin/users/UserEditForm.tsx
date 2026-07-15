import { SaveIcon } from 'lucide-react'

import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Checkbox } from '@/ui/components/checkbox'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'

interface UserEditFormProps {
  name: string
  setName: (v: string) => void
  email: string
  setEmail: (v: string) => void
  link: string
  setLink: (v: string) => void
  badgeName: string
  setBadgeName: (v: string) => void
  badgeColor: string
  setBadgeColor: (v: string) => void
  useTextOverride: boolean
  setUseTextOverride: (v: boolean) => void
  badgeTextColor: string
  setBadgeTextColor: (v: string) => void
  updateMutation: {
    isPending: boolean
    error: { message: string } | null
    mutate: (vars: Record<string, string | null> & { userId: string }) => void
  }
  userId: string
}

export function UserEditForm({
  name,
  setName,
  email,
  setEmail,
  link,
  setLink,
  badgeName,
  setBadgeName,
  badgeColor,
  setBadgeColor,
  useTextOverride,
  setUseTextOverride,
  badgeTextColor,
  setBadgeTextColor,
  updateMutation,
  userId,
}: UserEditFormProps) {
  const updateError = updateMutation.error?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle>编辑信息</CardTitle>
        <CardDescription>修改后立即对该用户在前后台的展示生效。</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const payload: Record<string, string | null> = { name, email }
            if (link) {
              payload.link = link
            }
            if (badgeName) {
              payload.badgeName = badgeName
            }
            if (badgeColor) {
              payload.badgeColor = badgeColor
            }
            payload.badgeTextColor = useTextOverride ? badgeTextColor : null
            updateMutation.mutate({ ...payload, userId })
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-name">用户名</Label>
            <Input id="user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-email">邮箱</Label>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="user-link">网站链接</Label>
            <Input
              id="user-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-badge-name">徽章名称</Label>
            <Input id="user-badge-name" type="text" value={badgeName} onChange={(e) => setBadgeName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-badge-color">徽章颜色</Label>
            <Input
              id="user-badge-color"
              type="color"
              value={badgeColor}
              onChange={(e) => setBadgeColor(e.target.value)}
              className="h-9 p-1"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="user-badge-text-color-toggle"
                checked={useTextOverride}
                onCheckedChange={(next) => setUseTextOverride(next === true)}
              />
              <Label htmlFor="user-badge-text-color-toggle" className="cursor-pointer font-normal">
                自定义徽章字体颜色
              </Label>
              <span className="text-xs text-muted-foreground">未勾选时按背景自动选择黑/白对比色</span>
            </div>
            {useTextOverride && (
              <div className="flex items-center gap-3">
                <Input
                  id="user-badge-text-color"
                  type="color"
                  value={badgeTextColor}
                  onChange={(e) => setBadgeTextColor(e.target.value)}
                  className="h-9 w-20 p-1"
                />
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: badgeColor || '#007a82',
                    color: badgeTextColor,
                  }}
                >
                  {badgeName || '预览'}
                </span>
              </div>
            )}
          </div>
          {updateError && <div className="text-sm text-destructive sm:col-span-2">{updateError}</div>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              <SaveIcon data-icon /> {updateMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
