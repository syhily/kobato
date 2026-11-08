import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { AdminTagDto } from '@/shared/contracts/tags'
import type { UpsertTagInput } from '@/shared/types/tags'

import { orpcQuery } from '@/client/api/orpc-query'
import { brandingVersionSuffix } from '@/shared/config/utils'
import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { CoverInputRow } from '@/ui/admin/shared/CoverInputRow'
import { Button } from '@/ui/components/button'
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
import { useI18n } from '@/ui/lib/I18nProvider'

export interface EditTagDialogProps {
  tag: AdminTagDto | null | undefined
  onClose: () => void
  onSaved: (tag: AdminTagDto) => void
}

const EMPTY_DRAFT = {
  name: '',
  slug: '',
  ogImage: '',
}

export function EditTagDialog({ tag, onClose, onSaved }: EditTagDialogProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastTag, setLastTag] = useState<typeof tag>(tag)
  const assets = useAssetsSettingsOptional()
  const defaultOgImage = `/images/open-graph.png${brandingVersionSuffix(assets?.branding?.openGraph)}`

  const upsertMutation = useMutation({
    ...orpcQuery.admin.tags.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success(t('admin.tags.form.saved'))
      setErrorMessage(null)
      // The list lives in the TanStack cache — invalidate the namespace instead of patching a local mirror.
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.tags.list.key() })
      onSaved(payload.tag)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: submit, isPending } = upsertMutation

  if (tag !== lastTag) {
    setLastTag(tag)
    if (tag === undefined) {
      // closed — leave current draft for animation continuity
    } else if (tag === null) {
      setErrorMessage(null)
      setDraft(EMPTY_DRAFT)
    } else {
      setErrorMessage(null)
      setDraft({
        name: tag.name,
        slug: tag.slug,
        ogImage: tag.ogImage,
      })
    }
  }

  const open = tag !== undefined
  const isEditing = tag !== null && tag !== undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('admin.tags.form.editTitle') : t('admin.tags.form.newTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing ? t('admin.tags.form.editDescription') : t('admin.tags.form.newDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmedSlug = draft.slug.trim()
            const payload: UpsertTagInput = {
              ...(isEditing && tag ? { id: tag.id } : {}),
              name: draft.name.trim(),
              ...(trimmedSlug !== '' ? { slug: trimmedSlug } : {}),
              ...(draft.ogImage.trim() !== '' ? { ogImage: draft.ogImage.trim() } : {}),
            }
            submit(payload)
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-[auto_auto]"
        >
          <div className="flex w-full flex-col gap-4 md:w-64">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tag-name">{t('admin.tags.form.name')}</Label>
              <Input
                id="tag-name"
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={20}
                required
                placeholder={t('admin.tags.form.namePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tag-slug">{t('admin.tags.form.slug')}</Label>
              <Input
                id="tag-slug"
                type="text"
                value={draft.slug}
                onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
                maxLength={80}
                placeholder={t('admin.tags.form.slugPlaceholder')}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
              <p className="text-xs text-muted-foreground">{t('admin.tags.form.slugHint')}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-64">
            <CoverInputRow
              label={t('admin.tags.form.og')}
              htmlFor="tag-og-image"
              description={t('admin.tags.form.ogHint')}
              value={draft.ogImage}
              onChange={(value) => setDraft((prev) => ({ ...prev, ogImage: value }))}
              uploadKind={{ kind: 'generic' }}
              fallbackSrc={defaultOgImage}
              thumbnailClassName="aspect-[1200/630] w-full"
            />
          </div>
          {errorMessage ? <p className="text-sm text-destructive md:col-span-2">{errorMessage}</p> : null}
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              <SaveIcon data-icon />{' '}
              {isPending
                ? t('admin.tags.form.saving')
                : isEditing
                  ? t('common.action.save')
                  : t('admin.tags.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
