import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'media/index': 'src/media/index.ts',
    'media/client/index': 'src/media/client/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  target: 'node18',
  platform: 'neutral',
  clean: true,
  sourcemap: false,
  splitting: false,
  external: ['next', 'next/cache', 'sharp'],
})
