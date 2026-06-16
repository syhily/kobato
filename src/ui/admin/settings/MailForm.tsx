import { useMutation } from '@tanstack/react-query'
import { SendIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Controller } from 'react-hook-form'

import { orpc } from '@/client/api/client'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { Input } from '@/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Switch } from '@/ui/components/switch'

// Mirrors `MailSettings` but with `apiKeyMask` / `smtpPassMask` swapped in
// for the encrypted secrets so the form never receives ciphertext. The
// outer `mail:` wrapper matches `mailSchema` so the patches produced by
// `useSettingsCard` validate on the server without translation.
export interface MailLoaderShape {
  mail: {
    enabled: boolean
    host: string
    sender: string
    apiKeyMask: string | null
    transport: 'zeabur' | 'smtp' | 'mailgun'
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPassMask: string | null
    smtpSecure: boolean
    smtpRequireTls?: boolean
    smtpRejectUnauthorized?: boolean
    mailgunDomain: string
    mailgunApiKeyMask: string | null
  }
}

interface MailFormProps {
  mail: MailLoaderShape
}

interface TestStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  message: string | null
}

const idleTestStatus: TestStatus = { state: 'idle', message: null }

const TRANSPORT_OPTIONS: { value: MailLoaderShape['mail']['transport']; label: string }[] = [
  { value: 'zeabur', label: 'Zeabur ZSend' },
  { value: 'smtp', label: 'SMTP' },
  { value: 'mailgun', label: 'Mailgun' },
]

function MailToggleCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps, save } = useSettingsCard<MailLoaderShape, { enabled: boolean }>({
    section: 'mail',
    source: mail,
    toState: (source) => ({ enabled: source.mail.enabled }),
    fromState: (state) => ({
      mail: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title="邮件发送总开关"
      description="关闭后，所有评论通知 / 回复通知 / 审核通过通知都不会再发送（不会报错，仅记录 debug 日志）。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="启用邮件发送" hint="生产环境推荐先用「测试发送」确认连接，再打开此开关。">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <Switch
                  id="mail-enabled"
                  checked={field.value}
                  onCheckedChange={(val) => {
                    field.onChange(val)
                    save()
                  }}
                />
              )}
            />
            <FieldLabel htmlFor="mail-enabled" className="font-normal">
              发送通知邮件
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function ProviderSelectCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps, save } = useSettingsCard<
    MailLoaderShape,
    { transport: MailLoaderShape['mail']['transport'] }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({ transport: source.mail.transport }),
    fromState: (state) => ({
      mail: { transport: state.transport },
    }),
  })

  return (
    <SettingGroup
      title="邮件服务提供商"
      description="选择发送邮件所用的服务商。切换后下方的配置项会相应变化。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="提供商"
          htmlFor="mail-transport"
          hint="Zeabur ZSend 适合 Zeabur 部署，SMTP 适合自有邮件服务器。"
        >
          <Controller
            control={form.control}
            name="transport"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (value === 'zeabur' || value === 'smtp' || value === 'mailgun') {
                    field.onChange(value)
                    save()
                  }
                }}
              >
                <SelectTrigger id="mail-transport" className="w-full sm:w-56">
                  <SelectValue placeholder="选择提供商">
                    {(value: MailLoaderShape['mail']['transport'] | null) =>
                      TRANSPORT_OPTIONS.find((option) => option.value === value)?.label ?? value ?? ''
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function ZeaburConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps, display } = useSettingsCard<MailLoaderShape, { host: string; apiKey: string }>({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      host: source.mail.host,
      apiKey: '',
    }),
    fromState: (state) => {
      const trimmedKey = state.apiKey.trim()
      return {
        mail: {
          host: state.host.trim(),
          ...(trimmedKey ? { apiKey: trimmedKey } : {}),
        },
      }
    },
  })

  const apiKeyConfigured = display.mail.apiKeyMask !== null
  return (
    <SettingGroup
      title="Zeabur ZSend 配置"
      description="配置 Zeabur ZSend 的接入地址和 API Key。修改后立即生效。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="接入域名" htmlFor="mail-host" hint="不带协议，例如 api.zeabur.com。">
          <Input id="mail-host" placeholder="api.zeabur.com" maxLength={253} {...form.register('host')} />
        </SettingsRow>
        <SettingsRow
          label="API Key"
          htmlFor="mail-api-key"
          hint={
            apiKeyConfigured
              ? `当前已配置（结尾 …${display.mail.apiKeyMask}）。留空保存表示保留现有 Key。`
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
      </SettingGroupContent>
    </SettingGroup>
  )
}

function MailgunConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps, display } = useSettingsCard<
    MailLoaderShape,
    { mailgunDomain: string; mailgunApiKey: string }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      mailgunDomain: source.mail.mailgunDomain,
      mailgunApiKey: '',
    }),
    fromState: (state) => {
      const trimmedKey = state.mailgunApiKey.trim()
      return {
        mail: {
          mailgunDomain: state.mailgunDomain.trim(),
          ...(trimmedKey ? { mailgunApiKey: trimmedKey } : {}),
        },
      }
    },
  })

  const apiKeyConfigured = display.mail.mailgunApiKeyMask !== null
  return (
    <SettingGroup
      title="Mailgun 配置"
      description="配置 Mailgun 的发送域名和 API Key。修改后立即生效。仅支持美国（US）区域。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="发送域名"
          htmlFor="mail-mailgun-domain"
          hint="在 Mailgun 控制台已验证的域名，例如 mg.example.com。"
        >
          <Input
            id="mail-mailgun-domain"
            placeholder="mg.example.com"
            maxLength={253}
            {...form.register('mailgunDomain')}
          />
        </SettingsRow>
        <SettingsRow
          label="API Key"
          htmlFor="mail-mailgun-api-key"
          hint={
            apiKeyConfigured
              ? `当前已配置（结尾 …${display.mail.mailgunApiKeyMask}）。留空保存表示保留现有 Key。`
              : '尚未配置。在 Mailgun 控制台「Settings → API Keys」页面生成的私钥（key-... 或 MG_... 形式）。'
          }
        >
          <Input
            id="mail-mailgun-api-key"
            type="password"
            {...form.register('mailgunApiKey')}
            placeholder={apiKeyConfigured ? '保留现有 Key' : '粘贴 Mailgun Private API Key'}
            maxLength={512}
            autoComplete="new-password"
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function SmtpConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps, display, save } = useSettingsCard<
    MailLoaderShape,
    {
      smtpHost: string
      smtpPort: number
      smtpUser: string
      smtpPass: string
      smtpSecure: boolean
      smtpRequireTls: boolean
      smtpRejectUnauthorized: boolean
    }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      smtpHost: source.mail.smtpHost,
      smtpPort: source.mail.smtpPort,
      smtpUser: source.mail.smtpUser,
      smtpPass: '',
      smtpSecure: source.mail.smtpSecure,
      smtpRequireTls: source.mail.smtpRequireTls ?? true,
      smtpRejectUnauthorized: source.mail.smtpRejectUnauthorized ?? true,
    }),
    fromState: (state) => {
      const trimmedPass = state.smtpPass.trim()
      return {
        mail: {
          smtpHost: state.smtpHost.trim(),
          smtpPort: Number.isFinite(state.smtpPort) ? state.smtpPort : 587,
          smtpUser: state.smtpUser.trim(),
          smtpSecure: state.smtpSecure,
          smtpRequireTls: state.smtpRequireTls,
          smtpRejectUnauthorized: state.smtpRejectUnauthorized,
          ...(trimmedPass ? { smtpPass: trimmedPass } : {}),
        },
      }
    },
  })

  const passConfigured = display.mail.smtpPassMask !== null
  return (
    <SettingGroup
      title="SMTP 配置"
      description="配置 SMTP 服务器地址、端口和认证信息。修改后立即生效。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="服务器地址" htmlFor="mail-smtp-host" hint="例如 smtp.example.com。">
          <Input id="mail-smtp-host" placeholder="smtp.example.com" maxLength={253} {...form.register('smtpHost')} />
        </SettingsRow>
        <SettingsRow label="端口" htmlFor="mail-smtp-port" hint="常见端口：25、587、465。">
          <Input
            id="mail-smtp-port"
            type="number"
            min={1}
            max={65535}
            {...form.register('smtpPort', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="用户名" htmlFor="mail-smtp-user" hint="SMTP 登录账号，通常是一个邮箱地址。">
          <Input
            id="mail-smtp-user"
            type="text"
            placeholder="postmaster@example.com"
            maxLength={512}
            {...form.register('smtpUser')}
          />
        </SettingsRow>
        <SettingsRow
          label="密码"
          htmlFor="mail-smtp-pass"
          hint={
            passConfigured
              ? `当前已配置（结尾 …${display.mail.smtpPassMask}）。留空保存表示保留现有密码。`
              : '尚未配置。'
          }
        >
          <Input
            id="mail-smtp-pass"
            type="password"
            {...form.register('smtpPass')}
            placeholder={passConfigured ? '保留现有密码' : '输入 SMTP 密码'}
            maxLength={512}
            autoComplete="new-password"
          />
        </SettingsRow>
        <SettingsRow label="使用 TLS" hint="465 端口通常需要开启，587 端口视服务器配置而定。">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpSecure"
              render={({ field }) => (
                <Switch
                  id="mail-smtp-secure"
                  checked={field.value}
                  onCheckedChange={(val) => {
                    field.onChange(val)
                    save()
                  }}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-secure" className="font-normal">
              启用 TLS（SSL）
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow label="要求 TLS" hint="强制 STARTTLS，拒绝明文发送。建议保持开启。">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpRequireTls"
              render={({ field }) => (
                <Switch
                  id="mail-smtp-require-tls"
                  checked={field.value}
                  onCheckedChange={(val) => {
                    field.onChange(val)
                    save()
                  }}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-require-tls" className="font-normal">
              强制 TLS（requireTLS）
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label="验证证书"
          hint="验证 SMTP 服务器 TLS 证书。关闭后可能遭受中间人攻击，仅用于自签名证书调试。"
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpRejectUnauthorized"
              render={({ field }) => (
                <Switch
                  id="mail-smtp-reject-unauthorized"
                  checked={field.value}
                  onCheckedChange={(val) => {
                    field.onChange(val)
                    save()
                  }}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-reject-unauthorized" className="font-normal">
              验证 TLS 证书
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function SenderFieldCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps } = useSettingsCard<MailLoaderShape, { sender: string }>({
    section: 'mail',
    source: mail,
    toState: (source) => ({ sender: source.mail.sender }),
    fromState: (state) => ({
      mail: { sender: state.sender.trim() },
    }),
  })

  return (
    <SettingGroup
      title="发件人邮箱"
      description="收件人看到的 From 地址。对所有服务商通用，独立保存，不会因切换提供商而丢失。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="发件人邮箱" htmlFor="mail-sender" hint="必须是当前服务商已验证过的发件域。">
          <Input
            id="mail-sender"
            type="email"
            placeholder="noreply@example.com"
            maxLength={253}
            {...form.register('sender')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function MailTestCard({ mail }: { mail: MailLoaderShape }) {
  const { author } = useSiteIdentity()
  const [testTo, setTestTo] = useState<string>(author?.email ?? '')
  const [testStatus, setTestStatus] = useState<TestStatus>(idleTestStatus)

  const testMutation = useMutation({
    mutationFn: ({ to }: { to: string }) => orpc.admin.mail.sendTest({ to }),
    onSuccess: () =>
      setTestStatus({
        state: 'success',
        message: '测试邮件已发送，请到收件箱确认。',
      }),
    onError: (error) => setTestStatus({ state: 'error', message: error.message ?? '测试发送失败' }),
  })

  const submitTest = useCallback(() => {
    setTestStatus({ state: 'pending', message: null })
    testMutation.mutate({ to: testTo.trim() })
  }, [testMutation, testTo])

  const inner = mail.mail
  const isTestPending = testMutation.isPending
  const isZeabur = inner.transport === 'zeabur'
  const isMailgun = inner.transport === 'mailgun'
  const zeaburReady = inner.host.trim() !== '' && inner.sender.trim() !== '' && inner.apiKeyMask !== null
  const smtpReady =
    inner.smtpHost.trim() !== '' &&
    inner.smtpUser.trim() !== '' &&
    inner.smtpPassMask !== null &&
    inner.sender.trim() !== ''
  const mailgunReady =
    inner.mailgunDomain.trim() !== '' && inner.mailgunApiKeyMask !== null && inner.sender.trim() !== ''
  const configured = isZeabur ? zeaburReady : isMailgun ? mailgunReady : smtpReady
  const canSendTest = !isTestPending && configured && isLikelyEmail(testTo)

  const missingHint = isZeabur
    ? '请先填入并保存 Zeabur 接入域名、API Key 和发件人邮箱'
    : isMailgun
      ? '请先填入并保存 Mailgun 发送域名、API Key 和发件人邮箱'
      : '请先填入并保存 SMTP 服务器地址、用户名、密码和发件人邮箱'

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
              title={!configured ? missingHint : !isLikelyEmail(testTo) ? '请填写一个合法的邮箱地址' : undefined}
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
  const transport = mail.mail.transport
  return (
    <div className="flex flex-col gap-5">
      <MailToggleCard mail={mail} />
      <ProviderSelectCard mail={mail} />
      <SenderFieldCard mail={mail} />
      {transport === 'smtp' ? (
        <SmtpConfigCard mail={mail} />
      ) : transport === 'mailgun' ? (
        <MailgunConfigCard mail={mail} />
      ) : (
        <ZeaburConfigCard mail={mail} />
      )}
      <MailTestCard mail={mail} />
    </div>
  )
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
