import { defineConfig } from 'vite';

// Builds the editor into ./editor. GitHub Pages serves the repository as it is, so the built files
// are committed. Paths are relative because a page lives at <name>.github.io/<repository>/.
export default defineConfig({
  root: 'src/editor',
  base: './',
  publicDir: false,
  build: { outDir: '../../editor', emptyOutDir: true },
});
