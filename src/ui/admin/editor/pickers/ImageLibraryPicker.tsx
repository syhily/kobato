import { useQuery } from '@tanstack/react-query'
import { ImageIcon, SearchIcon, UploadIcon } from 'lucide-react'
import { isValidElement, useState } from 'react'

import type { AdminImageDto } from '@/shared/contracts/images'

import { orpcQuery } from '@/client/api/orpc-query'
import { UploadImageDialog } from '@/ui/admin/shared/UploadImageDialog'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { cn } from '@/ui/lib/cn'

// Customizable trigger; `onPick` passes the full `AdminImageDto` (publicUrl + storagePath).

export interface ImageLibraryPickerProps {
  trigger?: React.ReactNode
  onPick: (image: AdminImageDto) => void
  /** Optional controlled-open pair — drive the dialog imperatively (e.g.
   *  editor slash-command) instead of a `trigger` click; `trigger` becomes optional. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ImageLibraryPicker({ trigger, onPick, open: openProp, onOpenChange }: ImageLibraryPickerProps) {
  const [openInternal, setOpenInternal] = useState(false)
  const open = openProp ?? openInternal
  const setOpen = (next: boolean) => {
    if (openProp === undefined) {
      setOpenInternal(next)
    }
    onOpenChange?.(next)
  }
  const [q, setQ] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)

  const listQuery = useQuery(
    orpcQuery.admin.images.list.queryOptions({
      input: { kind: 'generic', limit: 60, q: q.trim() === '' ? undefined : q.trim() },
      enabled: open,
    }),
  )

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {openProp === undefined ? (
          <DialogTrigger
            render={
              trigger !== undefined && isValidElement(trigger) ? (
                trigger
              ) : (
                <Button variant="outline" type="button">
                  <ImageIcon /> 选择图片
                </Button>
              )
            }
          />
        ) : null}
        <DialogContent className="max-h-dialog-max-h max-w-3xl">
          <DialogHeader>
            <DialogTitle>从图片库选择</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="按文件名 / 备注搜索"
              className="max-w-md"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setOpen(false)
                setUploadOpen(true)
              }}
            >
              <UploadIcon /> 上传图片
            </Button>
          </div>
          <div className="max-h-dialog-max-h-sm overflow-y-auto">
            {listQuery.isPending ? (
              <div className="p-8 text-center text-sm text-muted-foreground">加载中…</div>
            ) : listQuery.data?.images.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">没有匹配的图片</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {listQuery.data?.images.map((image: AdminImageDto) => (
                  <ImageTile
                    key={image.id}
                    image={image}
                    onClick={() => {
                      onPick(image)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <UploadImageDialog
        open={uploadOpen}
        kind={{ kind: 'generic' }}
        onClose={() => setUploadOpen(false)}
        onUploaded={(image) => {
          setUploadOpen(false)
          onPick(image)
        }}
      />
    </>
  )
}

interface ImageTileProps {
  image: AdminImageDto
  onClick: () => void
}

function ImageTile({ image, onClick }: ImageTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl border bg-muted/30',
        'transition hover:ring-2 hover:ring-primary',
      )}
      title={image.storagePath}
    >
      <img
        src={image.publicUrl}
        alt={image.note ?? image.storagePath}
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
      <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-badge text-white opacity-0 transition group-hover:opacity-100">
        {image.width}×{image.height}
      </span>
    </button>
  )
}
