'use no memo'

// The Pintura module URL is a runtime config value (CDN or vendored path), so
// Vite must not analyze this dynamic import. The react compiler's babel pass
// strips comments — the `/* @vite-ignore */` marker only survives in a module
// the compiler leaves untouched (hence 'use no memo' here), which is why this
// import is extracted from usePinturaEditor.ts.
export const importPinturaModule = (url: string): Promise<unknown> => import(/* @vite-ignore */ url)
