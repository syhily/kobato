import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Textarea } from '@/ui/components/textarea'
import { useI18n } from '@/ui/lib/I18nProvider'
import { LazyPopup as Popup } from '@/ui/public/widgets/LazyPopup'

export function FriendApplyForm() {
  const { t } = useI18n()
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
  // `onClose` feeds Popup's focus-management effect, so its identity MUST stay stable: a
  // fresh closure per render tears the effect down, and the teardown focuses
  // `previouslyFocusedRef`, stealing focus mid-session and re-capturing a restore target.
  const handleClose = useCallback(() => {
    setOpen(false)
    // A closed dialog reopens fresh — clear stale success/error state.
    setSubmitted(false)
    setSubmitError(null)
  }, [])

  return (
    <div className="not-typeset mt-10 flex justify-center px-4 md:mt-8 md:px-0">
      <Button variant="dark" size="lg" onClick={handleOpen}>
        {t('public.friends.apply')}
      </Button>
      {open && (
        <Popup open={open} onClose={handleClose} size="md" aria-labelledby="friend-apply-title">
          <div className="text-center">
            <div id="friend-apply-title" className="text-xl leading-tight font-semibold">
              {t('public.friends.apply')}
            </div>
            <p className="mt-1 text-sm text-ink-3">{t('public.friends.applyHint')}</p>
          </div>
          {submitted ? (
            <p role="status" className="mt-6 text-center text-sm text-ink-3">
              {t('public.friends.submitted')}
            </p>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="relative mt-5 flex flex-col gap-3">
              <label htmlFor="friend-apply-website" className="sr-only">
                {t('public.friends.siteName')}
              </label>
              <Input
                id="friend-apply-website"
                className="bg-canvas"
                placeholder={t('public.friends.siteName')}
                name="website"
                type="text"
                autoComplete="organization"
                maxLength={80}
                required
              />
              <label htmlFor="friend-apply-homepage" className="sr-only">
                {t('public.friends.homepage')}
              </label>
              <Input
                id="friend-apply-homepage"
                className="bg-canvas"
                placeholder={t('public.friends.homepage')}
                name="homepage"
                type="url"
                autoComplete="url"
                required
              />
              <label htmlFor="friend-apply-description" className="sr-only">
                {t('public.friends.description')}
              </label>
              <Textarea
                id="friend-apply-description"
                className="bg-canvas"
                placeholder={t('public.friends.descriptionPlaceholder')}
                name="description"
                maxLength={999}
                rows={2}
              />
              <label htmlFor="friend-apply-poster" className="sr-only">
                {t('public.friends.poster')}
              </label>
              <Input
                id="friend-apply-poster"
                className="bg-canvas"
                placeholder={t('public.friends.poster')}
                name="poster"
                type="url"
              />
              <label htmlFor="friend-apply-rss" className="sr-only">
                {t('public.friends.rss')}
              </label>
              <Input
                id="friend-apply-rss"
                className="bg-canvas"
                placeholder={t('public.friends.rss')}
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
                {isPending ? t('public.friends.submitting') : t('public.friends.submit')}
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
