import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15000,
    // Excluimos web/** — el SPA tiene su propio vitest en web/vitest.config.
    // Sin este exclude, un `vitest run` desde /app recogía .tsx y fallaba
    // por alias @/… no resuelto. Los contract tests del backend viven en tests/.
    exclude: ['**/node_modules/**', '**/web/**', '**/public/**', '**/dist/**'],
  },
});
