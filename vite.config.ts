import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const privacyHeaders={'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store'}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true, headers: privacyHeaders },
  preview: { headers: privacyHeaders },
  // Workers are loaded on demand. Pre-bundle their CommonJS dependency so the
  // first Excel operation in development does not trigger a page reload.
  optimizeDeps: { include: ['exceljs', 'libphonenumber-js/max'] },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 20 },
            { name: 'validation', test: /node_modules[\\/]zod[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})

