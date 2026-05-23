import { SendIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Controller } from 'react-hook-form'

import { orpc } from '@/client/api/client'
import { useMutation } from '@/client/api/query'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { Switch } from '@/ui/components/switch'
import { useSiteIdentity } from '@/ui/lib/blog-config-context'

export interface MailLoaderShape {
  enabled: boolean
  host: string
  sender: string
  apiKeyMask: string | null
}

interface MailFormProps {
  mail: MailLoaderShape
}

interface TestStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  message: string | null
}

const idleTestStatus: TestStatus = { state: 'idle', message: null }

function MailToggleCard({ mail }: { mail: MailLoaderShape }) {
  const { isEditing, form, settingGroupProps } = useSettingsCard<MailLoaderShape, { enabled: boolean }>({
    section: 'mail',
    source: mail,
    toState: (source) => ({ enabled: source.enabled }),
    fromState: (state) => ({
      enabled: state.enabled,
    }),
  })

  return (
    <SettingGroup
      title="邮件发送总开关"
      description="关闭后，所有评论通知 / 回复通知 / 审核通过通知都不会再发送（不会报错，仅记录 debug 日志）。"
      {...settingGroupProps}
    >
      {isEditing ? (
        <SettingGroupContent>
          <SettingsRow label="启用邮件发送" hint="生产环境推荐先用「测试发送」确认连接，再打开此开关。">
            <div className="flex items-center gap-3">
              <Controller
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <Switch id="mail-enabled" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <FieldLabel htmlFor="mail-enabled" className="font-normal">
                发送通知邮件
              </FieldLabel>
            </div>
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="邮件发送" value={mail.enabled ? '已开启' : '已关闭'} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function MailConfigCard({ mail }: { mail: MailLoaderShape }) {
  const apiKeyConfigured = mail.apiKeyMask !== null
  const { isEditing, form, settingGroupProps } = useSettingsCard<
    MailLoaderShape,
    { host: string; sender: string; apiKey: string }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      host: source.host,
      sender: source.sender,
      apiKey: '',
    }),
    fromState: (state) => {
      const trimmedKey = state.apiKey.trim()
      return {
        host: state.host.trim(),
        sender: state.sender.trim(),
        ...(trimmedKey ? { apiKey: trimmedKey } : {}),
      }
    },
  })

  return (
    <SettingGroup
      title="Zeabur ZSend 配置"
      description="配置 Zeabur ZSend 的接入地址、API Key 和发件人邮箱。修改后立即生效。"
      {...settingGroupProps}
    >
      {isEditing ? (
        <SettingGroupContent>
          <SettingsRow label="接入域名" htmlFor="mail-host" hint="不带协议，例如 api.zeabur.com。">
            <Input id="mail-host" placeholder="api.zeabur.com" maxLength={253} {...form.register('host')} />
          </SettingsRow>
          <SettingsRow
            label="API Key"
            htmlFor="mail-api-key"
            hint={
              apiKeyConfigured
                ? `当前已配置（结尾 …${mail.apiKeyMask}）。留空保存表示保留现有 Key。`
                : '尚未配置。在 Zeabur 控制台 ZSend 服务页面生成的密钥。'
            }
          >
            <Input
              id="mail-api-key"
              type="password"
              {...form.register('apiKey')}
              placeholder={apiKeyConfigured ? '保留现有 Key' : '粘贴 Zeabur ZSend API Key'}
              maxLength={512}
              autoComplete="new-password"
            />
          </SettingsRow>
          <SettingsRow label="发件人邮箱" htmlFor="mail-sender" hint="必须是 Zeabur 已验证过的发件域。">
            <Input
              id="mail-sender"
              type="email"
              placeholder="noreply@send.example.com"
              maxLength={253}
              {...form.register('sender')}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="接入域名" value={mail.host} />
          <SettingValue label="API Key" value={apiKeyConfigured ? `已配置（结尾 …${mail.apiKeyMask}）` : '未配置'} />
          <SettingValue label="发件人邮箱" value={mail.sender} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function MailTestCard({ mail }: { mail: MailLoaderShape }) {
  const { author } = useSiteIdentity()
  const [testTo, setTestTo] = useState<string>(author.email)
  const [testStatus, setTestStatus] = useState<TestStatus>(idleTestStatus)

  const testMutation = useMutation({
    mutationFn: ({ to }: { to: string }) => orpc.admin.mail.sendTest({ to }),
    onSuccess: () =>
      setTestStatus({
        state: 'success',
        message: '测试邮件已通过 Zeabur ZSend 发送，请到收件箱确认。',
      }),
    onError: (error) => setTestStatus({ state: 'error', message: error.message ?? '测试发送失败' }),
  })

  const submitTest = useCallback(() => {
    setTestStatus({ state: 'pending', message: null })
    testMutation.mutate({ to: testTo.trim() })
  }, [testMutation, testTo])

  const isTestPending = testMutation.isPending
  const apiKeyConfigured = mail.apiKeyMask !== null
  const canSendTest =
    !isTestPending && mail.host.trim() !== '' && mail.sender.trim() !== '' && apiKeyConfigured && isLikelyEmail(testTo)

  return (
    <SettingGroup title="测试发送" description="不依赖「启用邮件发送」开关，可在配置完成后立即验证连接。">
      <SettingGroupContent>
        <SettingsRow label="收件人" htmlFor="mail-test-to" hint="默认填站点作者邮箱，可以改成任意能收信的地址来验证。">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="mail-test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="someone@example.com"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!canSendTest}
              onClick={submitTest}
              title={
                !apiKeyConfigured
                  ? '请先填入并保存 API Key'
                  : !isLikelyEmail(testTo)
                    ? '请填写一个合法的邮箱地址'
                    : undefined
              }
            >
              <SendIcon data-icon /> {isTestPending ? '发送中…' : '测试发送'}
            </Button>
          </div>
        </SettingsRow>
        {testStatus.state === 'success' && testStatus.message ? (
          <p className="text-sm text-muted-foreground">{testStatus.message}</p>
        ) : null}
        {testStatus.state === 'error' && testStatus.message ? (
          <p className="text-sm break-all text-destructive">{testStatus.message}</p>
        ) : null}
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function MailForm({ mail }: MailFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <MailToggleCard mail={mail} />
      <MailConfigCard mail={mail} />
      <MailTestCard mail={mail} />
    </div>
  )
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
