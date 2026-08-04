export function NotWordPressView() {
  return (
    <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
      <div className="my-auto">
        <h1 className="font-number text-empty-state-hero">404</h1>
        <div>这里不是 WordPress 网站，请停止扫描。</div>
        <div className="mt-2 text-ink-4">This is not a WordPress site. Please stop probing.</div>
      </div>
    </div>
  )
}
