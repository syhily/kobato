import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Textarea } from '@/ui/components/textarea'

// Public friend-link application form, mounted on pages with
// `showFriends` below the friend grid. UX mirrors the comment form:
// placeholder-driven fields, an off-screen honeypot (`contact` —
// deliberately not the comment form's `subtitle`), an inline error
// line, and a success state replacing the form.
export function FriendApplyForm() {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  const apply = useMutation({
    ...orpcQuery.friends.apply.mutationOptions(),
    onSuccess: () => {
      setSubmitError(null)
      setSubmitted(true)
      formRef.current?.reset()
    },
    onError: (error) => {
      setSubmitError(error.message)
    },
  })
  const isPending = apply.isPending

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const website = readFormString(data, 'website') ?? ''
    const homepage = readFormString(data, 'homepage') ?? ''
    const description = readFormString(data, 'description') ?? ''
    const poster = readFormString(data, 'poster') ?? ''
    const rssUrl = readFormString(data, 'rssUrl') ?? ''
    const contact = readFormString(data, 'contact') ?? ''
    setSubmitError(null)
    apply.mutate({
      website: website.trim(),
      homepage: homepage.trim(),
      description: description.trim() !== '' ? description.trim() : undefined,
      poster: poster.trim() !== '' ? poster.trim() : undefined,
      rssUrl: rssUrl.trim() !== '' ? rssUrl.trim() : undefined,
      contact: contact === '' ? undefined : contact,
    })
  }

  if (submitted) {
    return (
      <div className="not-prose mt-10 px-4 md:mt-8 md:px-0">
        <h2 className="mb-6 text-xl text-ink-4 md:mb-4 md:text-2xl">申请友链</h2>
        <p role="status" className="text-sm text-ink-3">
          申请已提交，等待博主审核
        </p>
      </div>
    )
  }

  return (
    <div className="not-prose mt-10 px-4 md:mt-8 md:px-0">
      <h2 className="mb-6 text-xl text-ink-4 md:mb-4 md:text-2xl">申请友链</h2>
      <form ref={formRef} onSubmit={handleSubmit}>
        <div className="relative -mx-1 -mt-2 flex flex-wrap md:-mx-2 md:-mt-4">
          <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:w-1/2 md:px-2">
            <label htmlFor="friend-apply-website" className="sr-only">
              站名
            </label>
            <Input
              id="friend-apply-website"
              className="bg-canvas"
              placeholder="站名"
              name="website"
              type="text"
              autoComplete="organization"
              maxLength={80}
              required
            />
          </div>
          <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:w-1/2 md:px-2">
            <label htmlFor="friend-apply-homepage" className="sr-only">
              主页 URL
            </label>
            <Input
              id="friend-apply-homepage"
              className="bg-canvas"
              placeholder="主页 URL"
              name="homepage"
              type="url"
              autoComplete="url"
              required
            />
          </div>
          <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:px-2">
            <label htmlFor="friend-apply-description" className="sr-only">
              简介（可选）
            </label>
            <Textarea
              id="friend-apply-description"
              className="bg-canvas"
              placeholder="一句话介绍你的博客（可选）"
              name="description"
              maxLength={999}
              rows={2}
            />
          </div>
          <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:w-1/2 md:px-2">
            <label htmlFor="friend-apply-poster" className="sr-only">
              封面图 URL（可选）
            </label>
            <Input
              id="friend-apply-poster"
              className="bg-canvas"
              placeholder="封面图 URL（可选）"
              name="poster"
              type="url"
            />
          </div>
          <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:w-1/2 md:px-2">
            <label htmlFor="friend-apply-rss" className="sr-only">
              RSS URL（可选）
            </label>
            <Input id="friend-apply-rss" className="bg-canvas" placeholder="RSS URL（可选）" name="rssUrl" type="url" />
          </div>
          <FriendApplyHoneypot />
        </div>
        {!!submitError && (
          <div className="mt-2 text-xs text-alert" role="alert" aria-live="assertive">
            {submitError}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button name="submit" type="submit" variant="default" disabled={isPending}>
            {isPending ? '提交中…' : '提交申请'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function readFormString(data: FormData, name: string): string | undefined {
  const value = data.get(name)
  return typeof value === 'string' ? value : undefined
}

/** Off-screen honeypot: humans never see it; bots that fill every input trip schema validation. */
function FriendApplyHoneypot() {
  return (
    <div className="absolute left-[-10000px] size-px overflow-hidden" aria-hidden="true">
      <label htmlFor="friend-apply-contact">Contact</label>
      <input
        id="friend-apply-contact"
        name="contact"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
        aria-label="Honeypot"
      />
    </div>
  )
}
