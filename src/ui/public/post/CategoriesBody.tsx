import { Link } from 'react-router'

import type { ClientCategory } from '@/shared/types/catalog'

import { cn } from '@/ui/lib/cn'
import { postTitleClass } from '@/ui/public/post/postChrome'
import { Image } from '@/ui/public/widgets/Image'

export interface CategoriesBodyProps {
  title: string
  categories: ClientCategory[]
}

export function CategoriesBody({ title, categories }: CategoriesBodyProps) {
  return (
    <div className="py-4 md:py-6 lg:px-2 2xl:px-12 2xl:py-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="mb-4 lg:mb-6">
          <h1 className={cn(postTitleClass, 'font-bold')}>{title}</h1>
        </div>
        <div className="-mx-1 -mt-2 flex flex-wrap md:-mx-3 md:-mt-6">
          {categories.map((category) => (
            <div
              key={category.slug}
              className="mt-2 box-border flex w-full max-w-full shrink-0 px-1 md:mt-6 md:w-1/2 md:px-3"
            >
              <div className="relative m-0 mb-7 flex min-w-0 flex-1 flex-col bg-canvas wrap-break-word shadow-card">
                <div className="relative block aspect-3/1 shrink-0 overflow-hidden">
                  <Link
                    to={category.permalink}
                    className="absolute inset-0 rounded-[inherit] border-0 bg-black/10 bg-cover bg-center bg-no-repeat"
                    prefetch="intent"
                  >
                    <Image
                      src={category.cover}
                      alt={category.name}
                      width={600}
                      height={200}
                      thumbhash={category.coverThumbhash}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="block size-full object-cover"
                    />
                  </Link>
                </div>
                <div className="flex flex-1 flex-col justify-center px-5 py-4">
                  <div className="flex-1">
                    <Link
                      to={category.permalink}
                      className="m-0 block text-base leading-body font-semibold text-inherit hover:text-brand md:text-xl"
                      prefetch="intent"
                    >
                      {category.name}
                    </Link>
                    <div className="mt-2 hidden text-md text-ink-3 md:block">
                      <div className="line-clamp-2">
                        <span>{category.description}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-sm text-ink-4">
                      <span className="inline-block">{`${category.counts} 篇文章`}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
