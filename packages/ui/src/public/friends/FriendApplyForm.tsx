import { orpcQuery } from '@kobato/client/api/orpc-query'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { Textarea } from '@kobato/ui/components/textarea'
import { LazyPopup as Popup } from '@kobato/ui/public/widgets/LazyPopup'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

// Public friend-link application below the friend grid: a signup button opens a
// Popup holding the form, an off-screen honeypot (`contact`), and a success state.
export function FriendApplyForm() {
  const [open, setOpen] = useState(false)
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

  const handleOpen = () => setOpen(true)
  const handleClose = () => {
    setOpen(false)
    // A closed dialog reopens fresh — clear stale success/error state.
    setSubmitted(false)
    setSubmitError(null)
  }

  return (
    <div className="not-prose mt-10 flex justify-center px-4 md:mt-8 md:px-0">
      <Button variant="dark" size="lg" onClick={handleOpen}>
        申请友链
      </Button>
      {open && (
        <Popup open={open} onClose={handleClose} size="md" aria-labelledby="friend-apply-title">
          <div className="text-center">
            <div id="friend-apply-title" className="text-xl leading-tight font-semibold">
              申请友链
            </div>
            <p className="mt-1 text-sm text-ink-3">留下你的站点信息，审核通过后展示</p>
          </div>
          {submitted ? (
            <p role="status" className="mt-6 text-center text-sm text-ink-3">
              申请已提交，等待博主审核
            </p>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="relative mt-5 flex flex-col gap-3">
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
              <label htmlFor="friend-apply-rss" className="sr-only">
                RSS URL（可选）
              </label>
              <Input
                id="friend-apply-rss"
                className="bg-canvas"
                placeholder="RSS URL（可选）"
                name="rssUrl"
                type="url"
              />
              <FriendApplyHoneypot />
              {!!submitError && (
                <div className="text-xs text-alert" role="alert" aria-live="assertive">
                  {submitError}
                </div>
              )}
              <Button name="submit" type="submit" variant="dark" size="lg" block disabled={isPending}>
                {isPending ? '提交中…' : '提交申请'}
              </Button>
            </form>
          )}
        </Popup>
      )}
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
