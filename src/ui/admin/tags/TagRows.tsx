import { EditIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type SubmitEventHandler, memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { AdminTagDto, UpsertTagInput } from '@/shared/types/tags'

import { useMutation, orpcQuery } from '@/client/api/query'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@/shared/slug'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Skeleton } from '@/ui/components/skeleton'
import { TableCell, TableRow } from '@/ui/components/table'

export interface TagDraft {
  name: string
  slug: string
}

export function draftFromTag(tag: AdminTagDto): TagDraft {
  return { name: tag.name, slug: tag.slug }
}

export const EMPTY_TAG_DRAFT: TagDraft = { name: '', slug: '' }

interface TagDisplayRowProps {
  tag: AdminTagDto
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}

// Read-only row in the tags table. Memoized so the parent can rotate
// `editingId` without reconciling unrelated rows; the matching
// `disabled` prop is `false` for every row in the same render except
// the one currently being edited (which never renders as a display
// row at all), so the diff stays trivial.
export const TagDisplayRow = memo(function TagDisplayRow({ tag, disabled, onEdit, onDelete }: TagDisplayRowProps) {
  return (
    <TableRow>
      <TableCell className="py-5">
        <span>{tag.name}</span>
      </TableCell>
      <TableCell className="py-5">
        <span className="text-sm text-muted-foreground">{tag.slug}</span>
      </TableCell>
      <TableCell className="py-5">
        <Link
          to={`/admin/posts?tag=${encodeURIComponent(tag.name)}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {tag.postCount} 篇
        </Link>
      </TableCell>
      <TableCell className="py-5 pr-4 text-right">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onEdit}
            disabled={disabled}
            aria-label={`编辑标签 ${tag.name}`}
          >
            <EditIcon />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
            aria-label={`删除标签 ${tag.name}`}
          >
            <Trash2Icon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
})

interface TagEditorRowProps {
  /** Present for an existing row; absent for the "new tag" row. */
  tagId?: string
  initialDraft: TagDraft
  submitLabel: string
  onCancel: () => void
  onSaved: (tag: AdminTagDto) => void
  onDelete?: () => void
}

// Inline editor row, mounted at most twice per page (one row in
// "edit existing" mode + the always-on "create new" row at the top).
// Each editor mounts its own fetcher so concurrent edits across rows
// can't collide on a shared submit channel — the same per-card
// pattern that `BucketCard` follows in the cache settings page.
export function TagEditorRow({ tagId, initialDraft, submitLabel, onCancel, onSaved, onDelete }: TagEditorRowProps) {
  const [draft, setDraft] = useState<TagDraft>(initialDraft)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Move focus into the name input on mount so the editor is ready
  // for typing immediately. Using an effect (rather than `autoFocus`)
  // keeps `jsx-a11y/no-autofocus` happy while preserving the UX —
  // the row is rendered only as a deliberate user action (click on
  // 编辑 / 新增标签), so a focus jump here is expected.
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const upsertApi = useMutation({
    ...orpcQuery.admin.tags.upsert.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('标签已保存')
      setErrorMessage(null)
      onSaved(payload.tag)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: submit, isPending } = upsertApi

  const trimmedName = draft.name.trim()
  const trimmedSlug = draft.slug.trim()
  const localError = (() => {
    if (trimmedName.length === 0) {
      return '名称不能为空'
    }
    if (trimmedName.length > 20) {
      return '名称不能超过 20 个字符'
    }
    if (trimmedSlug !== '' && !DERIVED_SLUG_PATTERN.test(trimmedSlug)) {
      return 'slug 仅允许小写字母、数字、短横线'
    }
    if (trimmedSlug.length > SLUG_MAX) {
      return `slug 不能超过 ${SLUG_MAX} 个字符`
    }
    return null
  })()

  const onSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (localError) {
      setErrorMessage(localError)
      return
    }
    const payload: UpsertTagInput = {
      ...(tagId ? { id: tagId } : {}),
      name: trimmedName,
    }
    if (trimmedSlug !== '') {
      payload.slug = trimmedSlug
    }
    submit(payload)
  }

  return (
    <TableRow>
      <TableCell colSpan={4} className="bg-muted/30">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 py-1 lg:grid lg:grid-cols-[28%_1fr_auto] lg:items-start lg:gap-4"
        >
          <div className="flex flex-col gap-1">
            <Input
              ref={nameInputRef}
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={20}
              placeholder="例：编程"
              required
              aria-label="名称"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Input
              type="text"
              value={draft.slug}
              onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value }))}
              maxLength={80}
              placeholder="留空则使用拼音自动生成"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              aria-label="URL slug"
            />
            <p className="text-xs text-muted-foreground">仅允许小写字母、数字、短横线；用于 /tags/:slug。</p>
          </div>
          <div className="flex items-center justify-end gap-2 lg:pt-px">
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
              <XIcon data-icon /> 取消
            </Button>
            {onDelete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
                disabled={isPending}
              >
                <Trash2Icon data-icon /> 删除
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={isPending || localError !== null}>
              <SaveIcon data-icon /> {isPending ? '保存中…' : submitLabel}
            </Button>
          </div>
          {errorMessage ? <p className="text-sm text-destructive lg:col-span-3">{errorMessage}</p> : null}
        </form>
      </TableCell>
    </TableRow>
  )
}

export function TagsSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        // Skeleton rows — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <TableRow key={i}>
          <TableCell className="py-5" colSpan={4}>
            <Skeleton className="h-4 w-1/3" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
