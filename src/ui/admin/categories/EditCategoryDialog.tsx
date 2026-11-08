import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminCategoryDto } from '@/shared/contracts/categories'
import type { UpsertCategoryInput } from '@/shared/types/categories'

import { orpcQuery } from '@/client/api/orpc-query'
import { isSafeImageSegment } from '@/shared/types/images'
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
import { Textarea } from '@/ui/components/textarea'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface EditCategoryDialogProps {
  category: AdminCategoryDto | null | undefined
  onClose: () => void
  onSaved: (category: AdminCategoryDto) => void
}

const EMPTY_DRAFT = {
  name: '',
  slug: '',
  cover: '',
  og: '',
  description: '',
}

export function EditCategoryDialog({ category, onClose, onSaved }: EditCategoryDialogProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastCategory, setLastCategory] = useState<typeof category>(category)

  const upsertMutation = useMutation({
    ...orpcQuery.admin.categories.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success(t('admin.categories.form.saved'))
      setErrorMessage(null)
      onSaved(payload.category)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: submit, isPending } = upsertMutation

  if (category !== lastCategory) {
    setLastCategory(category)
    if (category === undefined) {
      // closed — leave current draft for animation continuity
    } else if (category === null) {
      setErrorMessage(null)
      setDraft(EMPTY_DRAFT)
    } else {
      setErrorMessage(null)
      setDraft({
        name: category.name,
        slug: category.slug,
        cover: category.cover,
        og: category.og ?? '',
        description: category.description,
      })
    }
  }

  const open = category !== undefined
  const isEditing = category !== null && category !== undefined

  const slugSafe = useMemo(() => isSafeImageSegment(draft.slug), [draft.slug])

  const slugChanged = isEditing && category && category.slug !== draft.slug.trim()
  const slugForOg = draft.slug.trim().toLowerCase()
  const ogFallbackSrc = useMemo(() => {
    if (!slugSafe || slugForOg === '') {
      return undefined
    }
    const buster = djb2Short(`${draft.name}\u0001${draft.description}\u0001${draft.cover}`)
    return `/images/og/cats/${encodeURIComponent(slugForOg)}.png?_= ${buster}`
  }, [slugSafe, slugForOg, draft.name, draft.description, draft.cover])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('admin.categories.form.editTitle') : t('admin.categories.form.newTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t('admin.categories.form.editDescription') : t('admin.categories.form.newDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmedSlug = draft.slug.trim()
            const payload: UpsertCategoryInput = {
              ...(isEditing && category ? { id: category.id } : {}),
              name: draft.name.trim(),
              ...(trimmedSlug !== '' ? { slug: trimmedSlug } : {}),
              cover: draft.cover.trim(),
              ...(draft.og.trim() !== '' ? { og: draft.og.trim() } : {}),
              description: draft.description,
            }
            submit(payload)
          }}
          className="grid items-start gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="category-name">{t('admin.categories.form.name')}</Label>
            <Input
              id="category-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={20}
              required
              placeholder={t('admin.categories.form.namePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="category-slug">{t('admin.categories.form.slug')}</Label>
            <Input
              id="category-slug"
              type="text"
              value={draft.slug}
              onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
              maxLength={80}
              placeholder={t('admin.categories.form.slugPlaceholder')}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
            <p className="text-xs text-muted-foreground">{t('admin.categories.form.slugHint')}</p>
          </div>
          <div className="sm:col-span-1">
            <CoverInputRow
              label={t('admin.categories.form.cover')}
              htmlFor="category-cover"
              description={slugChanged ? t('admin.categories.form.coverChanged') : t('admin.categories.form.coverHint')}
              value={draft.cover}
              onChange={(value) => setDraft((prev) => ({ ...prev, cover: value }))}
              uploadKind={slugSafe ? { kind: 'category', slug: slugForOg } : null}
              thumbnailClassName="h-40 w-full"
            />
          </div>
          <div className="sm:col-span-1">
            <CoverInputRow
              label={t('admin.categories.form.og')}
              htmlFor="category-og"
              description={t('admin.categories.form.ogHint')}
              value={draft.og}
              onChange={(value) => setDraft((prev) => ({ ...prev, og: value }))}
              uploadKind={slugSafe ? { kind: 'generic' } : null}
              fallbackSrc={ogFallbackSrc}
              thumbnailClassName="h-40 w-full"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="category-description">{t('admin.categories.form.description')}</Label>
            <Textarea
              id="category-description"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={999}
              rows={4}
              placeholder={t('admin.categories.form.descriptionPlaceholder')}
            />
          </div>
          {errorMessage ? <p className="text-sm text-destructive sm:col-span-2">{errorMessage}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              <SaveIcon data-icon />{' '}
              {isPending
                ? t('admin.categories.form.saving')
                : isEditing
                  ? t('common.action.save')
                  : t('admin.categories.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function djb2Short(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}
