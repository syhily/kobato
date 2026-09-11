export function Loader({ isLazyLoading }: { isLazyLoading?: boolean }) {
  if (isLazyLoading) {
    return (
      <div className="inset-y-0 w-full p-6 text-center">
        <div className="before:bg-grey-800 inline-block size-[50px] animate-spin rounded-full border border-black/10 before:z-10 before:mt-[7px] before:block before:size-[7px] before:rounded-full"></div>
      </div>
    )
  }
  return (
    <div className="absolute inset-y-0 left-0 flex w-full items-center justify-center overflow-hidden">
      <div className="before:bg-grey-800 relative inline-block size-[50px] animate-spin rounded-full border border-black/10 before:z-10 before:mt-[7px] before:block before:size-[7px] before:rounded-full"></div>
    </div>
  )
}
