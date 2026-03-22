/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    target: 'es2022',
  },
  test: {
    globals: true,
  },
})
