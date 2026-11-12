# yourlinki

A free, open-source link-in-bio page. Design it in a visual editor, publish it on GitHub, put the link in your bio.

- **Free.** No subscription, no credit card, no paid plan. GitHub Pages hosts it for free.
- **Yours.** Your page lives in your own GitHub account. Nobody else can change it, and it keeps working even if this project disappears.
- **Private.** No accounts on our side, no tracking, no cookies, no ads.

## Make your page (about 10 minutes, once)

You need a free [GitHub](https://github.com/signup) account. A computer makes the steps easiest.

1. **Copy this project.** At the top of this page, press **Use this template → Create a new repository**. Give it a short name, like `links`. Keep it **Public**. Press **Create repository**.
2. **Turn on your website.** In your new project, open **Settings → Pages**. Under **Branch**, choose **main**, keep **/ (root)**, and press **Save**.
3. **Wait about a minute.** Your link is `https://YOUR-GITHUB-NAME.github.io/links/` (with the name you picked in step 1). It shows "Your page is almost ready".
4. **Design your page.** Press **Open the editor** on that page (or add `editor/` to your link). Add your photo, name, links and videos, and pick a template.
5. **Publish.** Press **Publish** in the editor and follow the three steps:
   1. **Download index.html.**
   2. **Open GitHub upload** and drag the file in, then press **Commit changes**.
   3. Wait about a minute and refresh your link.
6. **Put your link in your bio.** Done.

## Change your page later

Open `https://YOUR-GITHUB-NAME.github.io/links/editor/`, make your changes, and press **Publish** again (step 5). Your link never changes.

Good to know:
- The editor keeps your unpublished changes in this browser automatically. On another device, the editor starts from your published page.
- If your computer saves the file as `index (1).html`, rename it to `index.html` before uploading. Otherwise GitHub adds a second file and your page doesn't change.
- **Settings → Export** saves a backup of everything, photos included.

## Questions

**Do I have to pay anything?** No. GitHub Pages is free for public projects, and this project has no paid features.

**Can someone else edit my page?** No. Anyone can open an editor, but changes only go online when they're uploaded to *your* GitHub project, and only you can do that.

**Where are my photos?** Inside your page file. The editor shrinks them so your page stays fast. They're never sent to us or any other server.

**What is public?** Everything in your GitHub project is public, including hidden and scheduled links (someone could find them in the page's code). Don't put anything private there.

**Which outside services are used?** YouTube (only if you add a video: its cover, title and player), cdn.simpleicons.org (social icons), and api.qrserver.com (only when you open the QR code in Settings; it receives your page link).

**Are there click statistics?** Not in this version. A page on GitHub has no server to count clicks.

## Features

- Seven templates (Photo, Classic, Studio, Cover, Gallery, Bold, Minimal) with custom colors, fonts, dark and light mode.
- A live canvas with an iPhone-sized preview: drag items, resize them into full, half or third widths, undo and redo.
- Links, a featured button, hidden and scheduled links (they appear and disappear on time by themselves).
- Social icons, highlights, YouTube videos (tap to play), post preview cards, standalone images.
- Photo framing: drag, zoom, or show a whole logo.

## For developers

The editor is a static site built with [Vite](https://vite.dev). The published page is one self-contained `index.html`: the editor renders it, embeds its configuration (so the editor can reopen it), and embeds uploaded images as data URLs.

```bash
npm install
npm run dev     # editor at http://localhost:5173
npm run check   # type-check
npm run build   # rebuilds ./editor; commit it, because GitHub Pages serves the repository as it is
```

| Change this | In this file |
|---|---|
| How the public page looks | `src/lib/page.css` |
| What the public page contains | `src/lib/render.ts` |
| Appearance options (colors, fonts) | `src/lib/look.ts` |
| Template presets | `src/lib/templates.ts` |
| Starting content for a new page | `yourlinki.config.json` |
| Content order and configuration migration | `src/lib/types.ts` |
| Image framing and drag geometry | `src/lib/image-frame.ts`, `src/scripts/editor/image-editor.ts` |
| Visual canvas and layout history | `src/scripts/editor/canvas.ts`, `src/lib/layout.ts` |
| Drafts and publishing | `src/scripts/editor/state.ts`, `src/scripts/editor/publish.ts` |
| Image resizing | `src/scripts/editor/upload.ts` |
| YouTube URLs, covers and post sources | `src/lib/media.ts`, `src/lib/video-details.ts` |
| Social platforms and icons | `src/lib/platforms.ts`, `src/lib/icons.ts` |
| Editor look | `src/styles/admin.css` |
| Editor screens | `src/scripts/editor/` |
| The page shown before the first publish | `index.html` |

Keep the root `index.html` as the starter page in the template repository. If you publish your own page, do it in a separate copy, so people who use the template don't start with your page.

## Roadmap

- [ ] More templates and Spotify embeds
- [ ] Linktree importer
- [ ] Optional self-hosted version with click statistics

License: [MIT](LICENSE)
