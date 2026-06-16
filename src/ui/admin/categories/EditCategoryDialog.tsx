import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminCategoryDto, UpsertCategoryInput } from '@/shared/types/categories'

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
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastCategory, setLastCategory] = useState<typeof category>(category)

  const upsertMutation = useMutation({
    ...orpcQuery.admin.categories.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('分类已保存')
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
          <DialogTitle>{isEditing ? '编辑分类' : '新增分类'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '修改分类的展示信息；重命名后所有引用该分类的 MDX 文章 frontmatter 也需同步更新。'
              : '填写新分类的名称、URL slug 与展示封面。'}
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
            <Label htmlFor="category-name">名称</Label>
            <Input
              id="category-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={20}
              required
              placeholder="例：编程"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="category-slug">URL slug</Label>
            <Input
              id="category-slug"
              type="text"
              value={draft.slug}
              onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
              maxLength={80}
              placeholder="留空将从名称推导（拼音）"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
            <p className="text-xs text-muted-foreground">仅允许小写字母、数字、短横线；留空时按拼音从名称自动生成。</p>
          </div>
          <div className="sm:col-span-1">
            <CoverInputRow
              label="封面图"
              htmlFor="category-cover"
              description={
                slugChanged
                  ? '注意：slug 已修改，新封面会写入新 slug 对应的 S3 对象。'
                  : '裁剪、旋转、调整画质后上传到 images/categories/<slug>.jpg。'
              }
              value={draft.cover}
              onChange={(value) => setDraft((prev) => ({ ...prev, cover: value }))}
              uploadKind={slugSafe ? { kind: 'category', slug: slugForOg } : null}
              thumbnailClassName="h-40 w-full"
            />
          </div>
          <div className="sm:col-span-1">
            <CoverInputRow
              label="OG 图"
              htmlFor="category-og"
              description="默认基于封面图自动生成对应的 OG 图"
              value={draft.og}
              onChange={(value) => setDraft((prev) => ({ ...prev, og: value }))}
              uploadKind={slugSafe ? { kind: 'generic' } : null}
              fallbackSrc={ogFallbackSrc}
              thumbnailClassName="h-40 w-full"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="category-description">简介</Label>
            <Textarea
              id="category-description"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={999}
              rows={4}
              placeholder="该分类的简介，将在 /cats/:slug 顶部渲染（支持 Markdown）"
            />
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

function djb2Short(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}
