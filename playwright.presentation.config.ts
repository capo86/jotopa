import {defineConfig} from '@playwright/test'
const compiled=process.env.JOTOPA_PRESENTATION_PREVIEW==='1',url=compiled?'http://localhost:5176':'http://localhost:5174'
export default defineConfig({
  testDir:'./tests/isolated',outputDir:'./test-results/presentation',workers:1,retries:0,timeout:90000,reporter:'list',
  use:{baseURL:url,browserName:'chromium',channel:'chrome',trace:'off',screenshot:'off',video:'off'},
  webServer:{command:compiled?'npm run preview -- --host localhost --port 5176 --strictPort':'npm run dev -- --host localhost',url,reuseExistingServer:!compiled,timeout:30000},
})
