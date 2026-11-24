export const importPinturaModule = (url: string): Promise<unknown> => {
  'use no memo'
  return import(/* @vite-ignore */ url)
}
