## Development

This is a static Vite site published with GitHub Pages. There is no server.

```
npm run dev     # editor at http://localhost:5173
npm run check   # type-check
npm run build   # rebuilds ./editor (committed: GitHub Pages serves the repository as it is)
```

- The editor (`src/editor/index.html`, `src/scripts/editor/`) renders the public page with `src/lib/render.ts` and the creator uploads it to their repository as `index.html`.
- The published page must stay one self-contained file: images are data URLs and its config is embedded (`CONFIG_ID` in `render.ts`) so the editor can reopen it.
- All paths must be relative: pages live at `<name>.github.io/<repository>/`.
- Optional stats: `stats/` is a Cloudflare Worker + D1 (`cd stats && npx wrangler deploy`). The page pings it only when `config.stats` is set; the editor's Insights tab reads it with a password kept in localStorage.
- The previous Cloudflare version (server, D1 database, click stats) is kept locally in `.backup/v2-cloudflare/`.
