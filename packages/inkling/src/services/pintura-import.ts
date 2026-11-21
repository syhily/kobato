// compiles, so the `/* @vite-ignore */` marker only survives on a function the compiler
export const importPinturaModule = (url: string): Promise<unknown> => {
  'use no memo'
  return import(/* @vite-ignore */ url)
}
