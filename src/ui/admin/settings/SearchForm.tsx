import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'

import type { SearchLoaderShape } from '@/shared/config/settings'

import { orpc } from '@/client/api/client'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { RadioGroup, RadioGroupItem } from '@/ui/components/radio-group'
import { Switch } from '@/ui/components/switch'

export type { SearchLoaderShape }

interface SearchFormProps {
  search: SearchLoaderShape
}

type ReindexPhase = 'idle' | 'running' | 'success'

interface ReindexProgress {
  phase: ReindexPhase
  total: number
  processed: number
  failed: number
}

function SearchModeCard({ search }: { search: SearchLoaderShape }) {
  const { mode, form, settingGroupProps, optimisticSource } = useSettingsCard<
    SearchLoaderShape,
    { enabled: boolean; mode: 'vector' | 'like' }
  >({
    section: 'search',
    source: search,
    toState: (source) => ({
      enabled: source.search.enabled,
      mode: source.search.mode,
    }),
    fromState: (state) => ({
      enabled: state.enabled,
      mode: state.mode,
    }),
  })

  const display = optimisticSource ?? search
  return (
    <SettingGroup
      title="搜索模式"
      description="选择文章搜索的底层实现。LIKE 模式仅依赖 Postgres，无需外部 API；向量模式需要 OpenAI API Key。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="启用 AI 向量搜索" hint="关闭时所有搜索请求都会降级为 Postgres LIKE 查询。">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch id="search-enabled" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="search-enabled" className="font-normal">
                    {field.value ? '已开启' : '已关闭'}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
          <SettingsRow label="搜索模式" htmlFor="search-mode">
            <Controller
              control={form.control}
              name="mode"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="like" id="search-mode-like" />
                    <FieldLabel htmlFor="search-mode-like" className="font-normal">
                      LIKE（纯 Postgres）
                    </FieldLabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="vector" id="search-mode-vector" />
                    <FieldLabel htmlFor="search-mode-vector" className="font-normal">
                      向量（OpenAI + pgvector）
                    </FieldLabel>
                  </div>
                </RadioGroup>
              )}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="AI 向量搜索" value={display.search.enabled ? '已开启' : '已关闭'} />
          <SettingValue
            label="搜索模式"
            value={display.search.mode === 'vector' ? '向量（OpenAI + pgvector）' : 'LIKE（纯 Postgres）'}
          />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function SearchOpenAiCard({ search }: { search: SearchLoaderShape }) {
  const { mode, form, settingGroupProps, optimisticSource } = useSettingsCard<
    SearchLoaderShape,
    { endpoint: string; apiKey: string; model: string; similarityThreshold: number }
  >({
    section: 'search',
    source: search,
    toState: (source) => ({
      endpoint: source.search.endpoint ?? '',
      apiKey: '',
      model: source.search.model,
      similarityThreshold: source.search.similarityThreshold,
    }),
    fromState: (state) => {
      const trimmedKey = state.apiKey.trim()
      return {
        endpoint: state.endpoint.trim(),
        model: state.model.trim(),
        similarityThreshold: state.similarityThreshold,
        ...(trimmedKey ? { apiKey: trimmedKey } : {}),
      }
    },
  })

  const display = optimisticSource ?? search
  const apiKeyConfigured = display.apiKeyMask !== null
  return (
    <SettingGroup title="OpenAI 配置" description="向量搜索需要调用 OpenAI Embedding API。" {...settingGroupProps}>
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow
            label="API Endpoint"
            htmlFor="search-endpoint"
            hint="留空表示使用官方 OpenAI 接口。支持任意兼容 OpenAI API 规范的第三方服务。"
          >
            <Input
              id="search-endpoint"
              type="url"
              placeholder="https://api.openai.com/v1"
              maxLength={253}
              {...form.register('endpoint')}
            />
          </SettingsRow>
          <SettingsRow
            label="API Key"
            htmlFor="search-api-key"
            hint={
              apiKeyConfigured ? `当前已配置（结尾 …${display.apiKeyMask}）。留空保存表示保留现有 Key。` : '尚未配置。'
            }
          >
            <Input
              id="search-api-key"
              type="password"
              {...form.register('apiKey')}
              placeholder={apiKeyConfigured ? '保留现有 Key' : '粘贴 OpenAI API Key'}
              maxLength={512}
              autoComplete="new-password"
            />
          </SettingsRow>
          <SettingsRow label="模型" htmlFor="search-model" hint="默认 text-embedding-3-small，性价比最高。">
            <Input id="search-model" placeholder="text-embedding-3-small" maxLength={80} {...form.register('model')} />
          </SettingsRow>
          <SettingsRow
            label="相似度阈值"
            htmlFor="search-threshold"
            hint="0–1 之间。越高结果越精准，但可能漏掉部分内容。建议 0.5–0.7。"
          >
            <Input
              id="search-threshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              {...form.register('similarityThreshold', { valueAsNumber: true })}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="API Endpoint" value={display.search.endpoint || 'https://api.openai.com/v1（默认）'} />
          <SettingValue label="API Key" value={apiKeyConfigured ? `已配置（结尾 …${display.apiKeyMask}）` : '未配置'} />
          <SettingValue label="模型" value={display.search.model} />
          <SettingValue label="相似度阈值" value={`${display.search.similarityThreshold}`} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function SearchReindexCard() {
  const [reindex, setReindex] = useState<ReindexProgress>({
    phase: 'idle',
    total: 0,
    processed: 0,
    failed: 0,
  })

  useEffect(() => {
    if (reindex.phase === 'success') {
      const timer = setTimeout(() => {
        setReindex({ phase: 'idle', total: 0, processed: 0, failed: 0 })
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [reindex.phase])

  async function handleReindex() {
    setReindex({ phase: 'running', total: 0, processed: 0, failed: 0 })
    let offset = 0
    let total = 0
    let processed = 0
    let failed = 0

    try {
      while (true) {
        const data = (await orpc.admin.renders.reindexSearch({ batchSize: 5, offset })) as {
          processed: number
          failed: number
          total: number
          nextOffset: number | null
        }
        total = data.total
        processed += data.processed
        failed += data.failed
        offset = data.nextOffset ?? total
        setReindex({ phase: 'running', total, processed, failed })
        if (data.nextOffset === null) {
          break
        }
      }
      setReindex({ phase: 'success', total, processed, failed })
    } catch (err) {
      setReindex({ phase: 'idle', total: 0, processed: 0, failed: 0 })
      toast.error(err instanceof Error ? err.message : '索引重建失败')
    }
  }

  return (
    <SettingGroup title="索引管理" description="首次启用向量搜索或批量更新文章后，需要重建搜索索引。">
      <SettingGroupContent>
        <SettingsRow label="重建搜索索引">
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={reindex.phase === 'running'}
              onClick={() => {
                void handleReindex()
              }}
            >
              {reindex.phase === 'running' && <Loader2Icon className="animate-spin" />}
              {reindex.phase === 'success' && <CheckIcon className="text-status-success-fg" />}
              {reindex.phase === 'idle' && '重建索引'}
              {reindex.phase === 'running' && '索引中...'}
              {reindex.phase === 'success' && '完成'}
            </Button>
            {reindex.phase === 'running' && (
              <span className="text-sm text-muted-foreground">
                等待 {Math.max(0, reindex.total - reindex.processed - reindex.failed)} / 成功 {reindex.processed} / 失败{' '}
                {reindex.failed}（共 {reindex.total}）
              </span>
            )}
            {reindex.phase === 'success' && (
              <span className="text-sm text-status-success-fg">
                索引重建完成：成功 {reindex.processed} / 失败 {reindex.failed}（共 {reindex.total}）
              </span>
            )}
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function SearchForm({ search }: SearchFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <SearchModeCard search={search} />
      <SearchOpenAiCard search={search} />
      <SearchReindexCard />
    </div>
  )
}
