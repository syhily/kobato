import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminFriendDto } from '@/shared/contracts/friends'
import type { UpsertFriendInput } from '@/shared/types/friends'

import { orpcQuery } from '@/client/api/orpc-query'
import { extractFriendHostSafe } from '@/shared/types/images'
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
import { useI18n } from '@/ui/lib/I18nProvider'

// Discriminator: `null` = new friend, a friend = edit, `undefined` = closed.
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
  const { t } = useI18n()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastFriend, setLastFriend] = useState<typeof friend>(friend)

  const upsertMutation = useMutation({
    ...orpcQuery.admin.friends.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success(t('admin.friends.form.saved'))
      setErrorMessage(null)
      onSaved(payload.friend)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: submit, isPending } = upsertMutation

  // Re-seed the form when the parent toggles the dialog (discriminator semantics above).
  if (friend !== lastFriend) {
    setLastFriend(friend)
    if (friend === undefined) {
      // closed — leave current draft for animation continuity
    } else if (friend === null) {
      setErrorMessage(null)
      setDraft(EMPTY_DRAFT)
    } else {
      setErrorMessage(null)
      setDraft({
        website: friend.website,
        description: friend.description ?? '',
        homepage: friend.homepage,
        poster: friend.poster,
        rssUrl: friend.rssUrl ?? '',
        visible: friend.visible,
      })
    }
  }

  const open = friend !== undefined
  const isEditing = friend !== null && friend !== undefined

  const friendHost = useMemo(() => extractFriendHostSafe(draft.homepage), [draft.homepage])
  const homepageChanged = isEditing && friend && friend.homepage !== draft.homepage.trim()

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t('admin.friends.form.editTitle') : t('admin.friends.form.newTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing ? t('admin.friends.form.editDescription') : t('admin.friends.form.newDescription')}
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
            <Label htmlFor="friend-website">{t('admin.friends.form.website')}</Label>
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
            <Label htmlFor="friend-homepage">{t('admin.friends.form.homepage')}</Label>
            <Input
              id="friend-homepage"
              type="url"
              value={draft.homepage}
              onChange={(e) => setDraft((prev) => ({ ...prev, homepage: e.target.value }))}
              placeholder={t('admin.friends.form.homepagePlaceholder')}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <CoverInputRow
              label={t('admin.friends.form.poster')}
              htmlFor="friend-poster"
              description={homepageChanged ? t('admin.friends.form.posterChanged') : t('admin.friends.form.posterHint')}
              value={draft.poster}
              onChange={(value) => setDraft((prev) => ({ ...prev, poster: value }))}
              uploadKind={friendHost === null ? null : { kind: 'friend', host: friendHost }}
              objectFit="contain"
              thumbnailClassName="aspect-3/1 w-full"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="friend-description">{t('admin.friends.form.description')}</Label>
            <Textarea
              id="friend-description"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={999}
              rows={2}
              placeholder={t('admin.friends.form.descriptionPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="friend-rss">{t('admin.friends.form.rss')}</Label>
            <Input
              id="friend-rss"
              type="url"
              value={draft.rssUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, rssUrl: e.target.value }))}
              placeholder={t('admin.friends.form.rssPlaceholder')}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="friend-visible"
              checked={draft.visible}
              onCheckedChange={(value) => setDraft((prev) => ({ ...prev, visible: value === true }))}
            />
            <Label htmlFor="friend-visible" className="cursor-pointer font-normal">
              {t('admin.friends.form.visible')}
            </Label>
            <span className="text-xs text-muted-foreground">{t('admin.friends.form.visibleHint')}</span>
          </div>
          {errorMessage ? <p className="text-sm text-destructive sm:col-span-2">{errorMessage}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              <SaveIcon data-icon />{' '}
              {isPending
                ? t('admin.friends.form.saving')
                : isEditing
                  ? t('common.action.save')
                  : t('admin.friends.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
