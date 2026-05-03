import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;

          if (id.includes('/node_modules/@codemirror/')) {
            const codemirrorPackage = id.split('/node_modules/@codemirror/')[1]?.split('/')[0] ?? '';

            if (
              codemirrorPackage === 'language-data' ||
              codemirrorPackage === 'legacy-modes' ||
              codemirrorPackage.startsWith('lang-')
            ) {
              return undefined;
            }

            return 'codemirror-core';
          }

          if (id.includes('/node_modules/svelte/')) {
            return 'svelte';
          }

          if (id.includes('/node_modules/@lucide/')) {
            return 'icons';
          }

          if (id.includes('/node_modules/katex/') || id.includes('/node_modules/@fontsource/')) {
            return 'math-fonts';
          }

          return undefined;
        }
      }
    }
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  },
  server: { strictPort: true }
});
