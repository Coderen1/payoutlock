import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// @stellar/stellar-sdk has no browser-specific build and does not self-
// polyfill Buffer/process/global (confirmed: no "browser" field, no buffer
// dependency in its package.json) — required for it to work in a browser
// bundle at all, not an optional nicety.
export default defineConfig({
  plugins: [react(), tailwindcss(), nodePolyfills({ globals: { Buffer: true, global: true, process: true } })],
})
