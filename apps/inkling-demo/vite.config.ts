import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss(), svgr()],
  optimizeDeps: {
    noDiscovery: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify('development'),
  },
  server: {
    allowedHosts: true,
    port: 4322,
  },
  preview: {
    allowedHosts: true,
  },
})
