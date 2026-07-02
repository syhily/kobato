import { type ChangeEvent, type FunctionComponent, type ReactNode } from 'react'

import UnsplashIcon from '@/ui/inkling-editor/unsplash/assets/inkling-card-type-unsplash.svg?react'
import CloseIcon from '@/ui/inkling-editor/unsplash/assets/inkling-close.svg?react'
import SearchIcon from '@/ui/inkling-editor/unsplash/assets/inkling-search.svg?react'

interface UnsplashSelectorProps {
  closeModal: () => void
  handleSearch: (e: ChangeEvent<HTMLInputElement>) => void
  children: ReactNode
}

const UnsplashSelector: FunctionComponent<UnsplashSelectorProps> = ({ closeModal, handleSearch, children }) => {
  return (
    <>
      <div className="fixed inset-0 z-40 h-[100vh] bg-black opacity-60"></div>
      <div
        className="not-inkling-prose fixed inset-8 z-50 overflow-hidden rounded bg-white shadow-xl"
        data-inkling-modal="unsplash"
      >
        <button className="absolute top-6 right-6 cursor-pointer" type="button">
          <CloseIcon
            className="size-4 stroke-2 text-grey-400"
            data-inkling-modal-close-button
            onClick={() => closeModal()}
          />
        </button>
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 items-center justify-between px-20 py-10">
            <h1 className="flex items-center gap-2 font-sans text-3xl font-bold text-black">
              <UnsplashIcon className="mb-1" />
              Unsplash
            </h1>
            <div className="relative w-full max-w-sm">
              <SearchIcon className="absolute top-1/2 left-4 size-4 -translate-y-2 text-grey-700" />
              <input
                className="h-10 w-full rounded-full border border-solid border-grey-300 pr-8 pl-10 font-sans text-md font-normal text-black focus:border-grey-400 focus-visible:outline-none"
                placeholder="Search free high-resolution photos"
                autoFocus
                data-inkling-unsplash-search
                onChange={handleSearch}
              />
            </div>
          </header>
          {children}
        </div>
      </div>
    </>
  )
}

export default UnsplashSelector
