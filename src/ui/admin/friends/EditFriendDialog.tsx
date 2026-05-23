import { SaveIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminFriendDto, UpsertFriendInput } from '@/shared/types/friends'

import { useMutation, orpcQuery } from '@/client/api/query'
import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { buildPublicBaseUrlFromStorage, extractFriendHostSafe } from '@/shared/types/images'
import { CoverInputRow } from '@/ui/admin/shared/CoverInputRow'
import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'

// Discriminator: `friend === null` opens the dialog in "new friend"
// mode; a populated `friend` opens it in "edit existing" mode. The
// parent owns the state — closing the dialog flips this back to
// `undefined` so the dialog returns to the closed state.
export interface EditFriendDialogProps {
  friend: AdminFriendDto | null | undefined
  onClose: () => void
  onSaved: (friend: AdminFriendDto) => void
}

const EMPTY_DRAFT = {
  website: '',
  description: '',
  homepage: '',
  poster: '',
  rssUrl: '',
  visible: true,
}

export function EditFriendDialog({ friend, onClose, onSaved }: EditFriendDialogProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const upsertMutation = useMutation({
    ...orpcQuery.admin.friends.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('友链已保存')
      setErrorMessage(null)
      onSaved(payload.friend)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: submit, isPending } = upsertMutation

  // Reset the form whenever the parent toggles the dialog. `friend ===
  // undefined` means "closed" — leave the form alone so the close
  // animation doesn't blank the fields the user just saw. `friend ===
  // null` is the "open for new" trigger; a populated `friend` is the
  // "open for edit" trigger.
  useEffect(() => {
    if (friend === undefined) {
      return
    }
    setErrorMessage(null)
    if (friend === null) {
      setDraft(EMPTY_DRAFT)
      return
    }
    setDraft({
      website: friend.website,
      description: friend.description ?? '',
      homepage: friend.homepage,
      poster: friend.poster,
      rssUrl: friend.rssUrl ?? '',
      visible: friend.visible,
    })
  }, [friend])

  const open = friend !== undefined
  const isEditing = friend !== null && friend !== undefined

  // Read assets config so the cover row can preview the auto-managed
  // public URL. Returns `null` while the upload toggle is off (or
  // the section isn't configured yet); the dialog hides the preview
  // and the upload button in that case so the operator immediately
  // sees they need to enable S3 first.
  const assetsSettings = useAssetsSettingsOptional()
  const friendHost = useMemo(() => extractFriendHostSafe(draft.homepage), [draft.homepage])
  const expectedAutoUrl = useMemo(() => {
    if (friendHost === null) {
      return ''
    }
    const base = buildPublicBaseUrlFromStorage(
      assetsSettings ? { storageEnabled: assetsSettings.storage.enabled, asset: assetsSettings.asset } : undefined,
    )
    if (base === null) {
      return ''
    }
    return `${base}/images/links/${friendHost}.jpg`
  }, [assetsSettings, friendHost])
  const homepageChanged = isEditing && friend && friend.homepage !== draft.homepage.trim()

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? '编辑友链' : '新增友链'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '修改友链信息；隐藏后该友链不再出现在公共页面。' : '填写新友链的展示信息。'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const payload: UpsertFriendInput = {
              ...(isEditing && friend ? { id: friend.id } : {}),
              website: draft.website.trim(),
              homepage: draft.homepage.trim(),
              poster: draft.poster.trim(),
              visible: draft.visible,
            }
            const description = draft.description.trim()
            if (description !== '') {
              payload.description = description
            }
            const rssUrl = draft.rssUrl.trim()
            if (rssUrl !== '') {
              payload.rssUrl = rssUrl
            }
            submit(payload)
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="friend-website">站名</Label>
            <Input
              id="friend-website"
              type="text"
              value={draft.website}
              onChange={(e) => setDraft((prev) => ({ ...prev, website: e.target.value }))}
              maxLength={80}
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="friend-homepage">主页 URL</Label>
            <Input
              id="friend-homepage"
              type="url"
              value={draft.homepage}
              onChange={(e) => setDraft((prev) => ({ ...prev, homepage: e.target.value }))}
              placeholder="https://example.com"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <CoverInputRow
              label="封面图 (1280×425)"
              htmlFor="friend-poster"
              description={
                homepageChanged
                  ? '注意：主页 URL 已修改，新海报会写入新 host 对应的 S3 对象，旧对象会成为孤儿，需要在「图片管理」手动删除。'
                  : '裁剪、旋转、调整画质后将上传到 images/links/<host>.jpg。'
              }
              value={draft.poster}
              onChange={(value) => setDraft((prev) => ({ ...prev, poster: value }))}
              uploadKind={friendHost === null ? null : { kind: 'friend', host: friendHost }}
              expectedAutoUrl={expectedAutoUrl}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="friend-description">简介（可选）</Label>
            <Textarea
              id="friend-description"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={999}
              rows={2}
              placeholder="一两句话介绍这位博友"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="friend-rss">RSS URL（可选）</Label>
            <Input
              id="friend-rss"
              type="url"
              value={draft.rssUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, rssUrl: e.target.value }))}
              placeholder="https://example.com/rss"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="friend-visible"
              checked={draft.visible}
              onCheckedChange={(value) => setDraft((prev) => ({ ...prev, visible: value === true }))}
            />
            <Label htmlFor="friend-visible" className="cursor-pointer font-normal">
              在公共页面显示
            </Label>
            <span className="text-xs text-muted-foreground">取消勾选则临时隐藏，不删除原始数据</span>
          </div>
          {errorMessage ? <p className="text-sm text-destructive sm:col-span-2">{errorMessage}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={isPending}>
              <SaveIcon data-icon /> {isPending ? '保存中…' : isEditing ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
