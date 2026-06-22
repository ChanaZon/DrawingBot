import { defineConfig } from 'vitest/config'

// Test config is kept separate from vite.config.ts so the app build does not
// pull in vitest's bundled vite types (which clash with this project's Vite 8).
// The pipeline/store tests are pure logic and drawEngine uses a stubbed 2D
// context, so no Vite plugins (react/tailwind) are needed here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
