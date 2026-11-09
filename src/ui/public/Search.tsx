import { SearchIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Form, useNavigate, type NavigateFunction } from 'react-router'

import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { Input } from '@/ui/components/input'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { LazyPopup as Popup } from '@/ui/public/widgets/LazyPopup'

const sidebarSearchInputClass = cn(
  'relative block w-full',
  'rounded-sm border-0 px-4 py-2',
  'bg-surface',
  'transition-colors',
  'hover:border-line-muted focus:border-line-muted',
  'focus:shadow-none focus:outline-0',
)

/** Read `q` off the submitted form and route to the keyword search page.
 *  Returns false (no navigation) for blank queries. */
function navigateToSearch(navigate: NavigateFunction, form: HTMLFormElement): boolean {
  const qEntry = new FormData(form).get('q')
  const q = typeof qEntry === 'string' ? qEntry.trim() : ''
  if (!q) {
    return false
  }
  void navigate(`/search/${encodeURIComponent(q)}`)
  return true
}

export function SearchBar() {
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <div id="search" className="mb-10">
      <Form
        method="get"
        action="/search"
        onSubmit={(e) => {
          e.preventDefault()
          navigateToSearch(navigate, e.currentTarget)
        }}
      >
        <label htmlFor="sidebar-search-input" className="sr-only">
          {t('public.search.label')}
        </label>
        <input
          id="sidebar-search-input"
          type="search"
          className={sidebarSearchInputClass}
          placeholder={t('public.search.placeholder')}
          name="q"
          required
          enterKeyHint="search"
          aria-label={t('public.search.label')}
        />
      </Form>
    </div>
  )
}

export function SearchIconButton() {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()
  const handleClose = useCallback(() => setOpen(false), [])

  return (
    <>
      <Button
        variant="dark"
        size="iconSm"
        shape="circle"
        title={t('public.search.title')}
        aria-label={t('public.search.open')}
        onClick={() => setOpen(true)}
      >
        <IconButtonContent>
          <SearchIcon size="1em" aria-hidden className="m-icon-inset" />
        </IconButtonContent>
      </Button>
      <SearchPopup open={open} onClose={handleClose} />
    </>
  )
}

interface SearchPopupProps {
  open: boolean
  onClose: () => void
}

function SearchPopup({ open, onClose }: SearchPopupProps) {
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <Popup open={open} onClose={onClose} size="md" initialFocus="dialog" aria-label={t('public.search.popupTitle')}>
      <Form
        className="text-center"
        method="get"
        action="/search"
        onSubmit={(e) => {
          e.preventDefault()
          if (navigateToSearch(navigate, e.currentTarget)) {
            onClose()
          }
        }}
      >
        <div className="px-4 py-4 md:px-12 md:py-8">
          <div className="mx-auto max-w-sm">
            <div className="mb-4 md:mb-6">
              <Input
                type="search"
                name="q"
                required
                enterKeyHint="search"
                size="lg"
                className="bg-canvas text-center"
                placeholder={t('public.search.inputPlaceholder')}
                aria-label={t('public.search.popupTitle')}
              />
            </div>
            <Button type="submit" variant="default" size="lg" block>
              {t('public.search.title')}
            </Button>
          </div>
        </div>
      </Form>
    </Popup>
  )
}
