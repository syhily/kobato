import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'
import { Form, useNavigation } from 'react-router'

import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared auth input styling — must match AdminCredentialsForm.
const inputClasses =
  'h-[54px] rounded-lg border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

export function AdminInstallForm() {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Form method="post" id="adminInstallForm" className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="install-title" className="text-[15px] font-semibold">
          站点名称
        </Label>
        <Input
          id="install-title"
          name="title"
          type="text"
          autoComplete="off"
          placeholder="My Blog"
          required
          disabled={isSubmitting}
          className={inputClasses}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="install-name" className="text-[15px] font-semibold">
          昵称
        </Label>
        <Input
          id="install-name"
          name="name"
          type="text"
          autoComplete="nickname"
          placeholder="你的名字"
          required
          disabled={isSubmitting}
          className={inputClasses}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="install-email" className="text-[15px] font-semibold">
          邮箱
        </Label>
        <Input
          id="install-email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="your@email.com"
          required
          disabled={isSubmitting}
          className={inputClasses}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="install-password" className="text-[15px] font-semibold">
          密码
        </Label>
        <div className="relative w-full">
          <Input
            id="install-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="至少 10 个字符"
            required
            minLength={10}
            disabled={isSubmitting}
            className={cn(inputClasses, 'pr-12')}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="px-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-[52px] w-full rounded-lg bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '创建中...'
        ) : (
          <>
            创建账号并开始写作 <span aria-hidden>&rarr;</span>
          </>
        )}
      </Button>
    </Form>
  )
}
