import { mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, {
  test: {
    include: ['src/**/*.bench.ts'],
    testTimeout: 120_000
  }
});
