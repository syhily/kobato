// Ambient declarations for Vite-plugin virtual modules must stay script-scope (no import/export): the same
// declarations inside a module file (env.d.ts) resolve to nothing (TS2307).

declare module 'virtual:route-warmup-script' {
  const script: string
  export default script
}
