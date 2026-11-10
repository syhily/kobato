// The Pintura module URL is a runtime config value (CDN or vendored path), so Vite must
// not analyze this dynamic import. The React compiler pass strips comments in files it
// compiles, so the `/* @vite-ignore */` marker only survives on a function the compiler
// leaves untouched — hence the function-level 'use no memo' (a module-level one trips
// rolldown's MODULE_LEVEL_DIRECTIVE warning). This is why the import is extracted from
// usePinturaEditor.ts.
export const importPinturaModule = (url: string): Promise<unknown> => {
  'use no memo'
  return import(/* @vite-ignore */ url)
}
