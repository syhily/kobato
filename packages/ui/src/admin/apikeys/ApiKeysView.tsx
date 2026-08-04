import { orpcQuery } from '@kobato/client/api/orpc-query'
import { toastApiError } from '@kobato/client/lib/toast-api-error'
import { Badge } from '@kobato/ui/components/badge'
import { Button } from '@kobato/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kobato/ui/components/dialog'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { cn } from '@kobato/ui/lib/cn'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRoundIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Headless front-end key management (phase 0.6): register named Ed25519
 * public keys the frontend programs sign their JWTs with. Core stores
 * only public keys — the private key is generated here (browser
 * WebCrypto), downloaded once by the operator, and never transmitted.
 */

export function ApiKeysView() {
  const queryClient = useQueryClient()
  const list = useQuery(
    orpcQuery.admin.apikey.list.queryOptions({
      refetchOnWindowFocus: true,
    }),
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [publicKeyPem, setPublicKeyPem] = useState('')

  const wrapPem = (label: 'PUBLIC KEY' | 'PRIVATE KEY', bytes: ArrayBuffer) =>
    `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .match(/.{1,64}/g)
      ?.join('\n')}\n-----END ${label}-----\n`

  const generateKeyPair = async () => {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
    const publicKey = await crypto.subtle.exportKey('spki', pair.publicKey)
    const privatePem = wrapPem('PRIVATE KEY', privateKey)
    const publicPem = wrapPem('PUBLIC KEY', publicKey)
    setPublicKeyPem(publicPem)
    // Download the private key once — it never leaves the operator's hands.
    const blob = new Blob([privatePem], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.trim() || 'kobato-frontend'}-private.pem`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('密钥对已生成', { description: '私钥已下载,请妥善保管;页面仅保留公钥。' })
  }

  const register = useMutation({
    ...orpcQuery.admin.apikey.register.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.apikey.list.key() })
        setDialogOpen(false)
        setName('')
        setPublicKeyPem('')
      },
      onError: (err) => toastApiError(err, '注册失败'),
    }),
  })

  const revoke = useMutation({
    ...orpcQuery.admin.apikey.revoke.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.apikey.list.key() })
      },
      onError: (err) => toastApiError(err, '吊销失败'),
    }),
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">前端密钥</h1>
          <p className="text-sm text-muted-foreground">
            头less 前端(官方前端/第三方)以 Ed25519 公钥注册,私钥只留在前端程序手里;写交互经代理 + JWT。
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PlusIcon data-icon />
          注册密钥
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {(list.data?.keys ?? []).map((key) => (
          <div key={key.id} className="flex items-center justify-between rounded-xl border bg-card p-3">
            <div className="flex min-w-0 items-center gap-3">
              <KeyRoundIcon className="shrink-0 text-muted-foreground" data-icon />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{key.name}</span>
                  {key.revokedAt !== null ? (
                    <Badge variant="destructive">已吊销</Badge>
                  ) : (
                    <Badge variant="secondary">生效中</Badge>
                  )}
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">{key.id}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {key.lastUsedAt !== null ? `最近使用 ${key.lastUsedAt.slice(0, 10)}` : '从未使用'}
              {key.revokedAt === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: key.id })}
                >
                  <Trash2Icon data-icon />
                  吊销
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {list.data?.keys.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            还没有注册任何前端密钥。点击右上角"注册密钥"开始。
          </div>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>注册前端密钥</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-name">名称</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="official-frontend"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-pem">Ed25519 公钥(SPKI PEM)</Label>
              <Input
                id="key-pem"
                value={publicKeyPem}
                onChange={(e) => setPublicKeyPem(e.target.value)}
                placeholder="-----BEGIN PUBLIC KEY-----"
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void generateKeyPair()}
              >
                <RotateCcwIcon data-icon />
                生成密钥对并下载私钥
              </Button>
            </div>
            <Button
              className={cn('mt-2 self-end')}
              disabled={name.trim() === '' || publicKeyPem.trim() === '' || register.isPending}
              onClick={() => register.mutate({ name: name.trim(), publicKeyPem: publicKeyPem.trim() })}
            >
              注册
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
