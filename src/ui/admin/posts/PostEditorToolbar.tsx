import {
  ArrowLeftIcon,
  ChartLineIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  UploadIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import type { AdminPostDetailDto, AdminPostDto } from '@/shared/types/posts'
import type { UseEditorShellStateOutput } from '@/ui/admin/editor-shell/editor-shell-types'
import type { PostMetaDraft } from '@/ui/admin/posts/PostMetaSidebar'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

interface PostEditorToolbarProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  state: UseEditorShellStateOutput<PostMetaDraft, AdminPostDto>
}

export function PostEditorToolbar({ mode, detail, state }: PostEditorToolbarProps) {
  const isEditing = mode === 'edit' && detail !== undefined
  const post = isEditing ? detail.post : null
  return (
    <header className="flex flex-wrap items-center gap-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link to="/admin/posts">
              <ArrowLeftIcon />
              <span className="sr-only lg:not-sr-only">返回列表</span>
            </Link>
          }
        />
        {isEditing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link to={`/posts/${post?.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  <span className="sr-only lg:not-sr-only">公开预览</span>
                </Link>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link to={`/editor/post/${post?.id}/analytics`}>
                  <ChartLineIcon />
                  <span className="sr-only lg:not-sr-only">分析</span>
                </Link>
              }
            />
          </>
        ) : null}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Button
          variant={state.previewOpen ? 'default' : 'outline'}
          size="sm"
          onClick={() => state.setPreviewOpen((open) => !open)}
          title={state.previewOpen ? '关闭实时预览，恢复菜单' : '开启实时预览，并折叠左侧菜单'}
          aria-pressed={state.previewOpen}
          className={cn('hidden lg:inline-flex', state.previewOpen && 'border border-transparent')}
        >
          {state.previewOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
          <span className="sr-only sm:not-sr-only">实时预览</span>
        </Button>
        {mode === 'create' ? (
          <Button
            size="sm"
            onClick={() => {
              void state.persistCreate()
            }}
            disabled={state.isPending || !state.canPersistMeta}
            title="保存文章信息并上传当前正文"
          >
            {state.isCreating ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            <span className="sr-only sm:not-sr-only">{state.isCreating ? '创建中…' : '创建文章'}</span>
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={state.persistSave}
              disabled={state.isPending || !state.canPersistMeta}
              title="保存文章信息（立即生效），并在正文与最新版本不一致时另存为新草稿 (Cmd/Ctrl+S)"
            >
              {state.isSavingDraft ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              <span className="sr-only sm:not-sr-only">{state.isSavingDraft ? '保存中…' : '保存草稿'}</span>
            </Button>
            <Button
              size="sm"
              onClick={state.persistPublish}
              disabled={state.isPending || !state.canPublish}
              title={
                state.canPublish
                  ? state.sidebarPublishStatus === 'scheduled'
                    ? '将最新草稿按计划时间上线 (Cmd/Ctrl+Shift+P)'
                    : '将最新草稿发布到线上 (Cmd/Ctrl+Shift+P)'
                  : '当前没有待发布的草稿'
              }
            >
              {state.isPublishing ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              <span className="sr-only sm:not-sr-only">
                {state.isPublishing ? '发布中…' : state.sidebarPublishStatus === 'scheduled' ? '计划发布' : '发布草稿'}
              </span>
            </Button>
            {state.meta.published ? (
              <Button
                variant="destructive-soft"
                size="sm"
                onClick={state.persistUnpublish}
                disabled={state.isPending}
                title="将文章下线，公开访问会返回 404；正文不会丢失，再次发布草稿即可恢复"
              >
                {state.isUnpublishing ? <Loader2Icon className="animate-spin" /> : <EyeOffIcon />}
                <span className="sr-only sm:not-sr-only">{state.isUnpublishing ? '取消中…' : '取消发布'}</span>
              </Button>
            ) : null}
          </>
        )}
        <Button
          variant={state.metaOpen ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => state.setMetaOpen((open) => !open)}
          title={state.metaOpen ? '隐藏文章信息面板' : '展开文章信息面板'}
          aria-pressed={state.metaOpen}
          aria-label="切换文章信息面板"
          className={cn(state.metaOpen && 'border border-transparent')}
        >
          <SlidersHorizontalIcon />
          <span className="sr-only sm:not-sr-only">元数据</span>
        </Button>
      </div>
    </header>
  )
}
