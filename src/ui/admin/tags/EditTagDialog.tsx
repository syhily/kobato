import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { AdminTagDto, UpsertTagInput } from '@/shared/types/tags'

import { orpcQuery } from '@/client/api/orpc-query'
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
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastTag, setLastTag] = useState<typeof tag>(tag)

  const upsertMutation = useMutation({
    ...orpcQuery.admin.tags.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('标签已保存')
      setErrorMessage(null)
      // The list lives in the TanStack cache (useInfiniteQuery in TagsView);
      // invalidate the namespace instead of patching a local mirror.
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
          <DialogTitle>{isEditing ? '编辑标签' : '新增标签'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '修改标签的展示信息；文章通过 id 关联标签，重命名后所有引用自动生效。'
              : '填写新标签的名称、URL slug 与 OG 图。'}
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
              <Label htmlFor="tag-name">名称</Label>
              <Input
                id="tag-name"
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={20}
                required
                placeholder="例：编程"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tag-slug">URL slug</Label>
              <Input
                id="tag-slug"
                type="text"
                value={draft.slug}
                onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
                maxLength={80}
                placeholder="留空将从名称推导（拼音）"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
              <p className="text-xs text-muted-foreground">
                仅允许小写字母、数字、短横线；留空时按拼音从名称自动生成。
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-64">
            <CoverInputRow
              label="OG 图"
              htmlFor="tag-og-image"
              description="留空则使用站点默认 OG 图。"
              value={draft.ogImage}
              onChange={(value) => setDraft((prev) => ({ ...prev, ogImage: value }))}
              uploadKind={{ kind: 'generic' }}
              fallbackSrc="/images/open-graph.png"
              thumbnailClassName="aspect-[1200/630] w-full"
            />
          </div>
          {errorMessage ? <p className="text-sm text-destructive md:col-span-2">{errorMessage}</p> : null}
          <DialogFooter className="md:col-span-2">
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
