## Pokémon Sky Blue website
The official site for Pokémon Sky Blue, hosted on GitHub Pages. Players can patch their own clean Pokémon Emerald ROM in the browser; no ROM is ever uploaded or hosted here.

The site is built with [Jekyll](https://jekyllrb.com/), the static site generator GitHub Pages runs for you. You edit Markdown, HTML and YAML files, push them, and GitHub rebuilds the site automatically.

### Layout

| Path | What it is |
| --- | --- |
| `_config.yml` | Site title, description, URLs and languages. Restart the local server after editing it. |
| `_data/releases.yml` | **Every released version.** The download page and changelog are generated from this. |
| `_data/credits.yml` | People shown on the Credits page. |
| `_data/faq/<lang>.yml` | FAQ questions and answers, one file per language. |
| `_data/navigation.yml` | Order of the links in the top menu. |
| `_data/i18n/<lang>.yml` | Every interface string (menus, buttons, patcher messages) for one language. |
| `_posts/` | Devlog posts (create the folder with your first post). |
| `patches/` | BPS patch files for each release (create the folder with your first release). |
| `_layouts/` | Page templates: `default.html` (every page) and `post.html` (devlog posts). |
| `_includes/` | Pieces shared by layouts: header, footer, language helpers. |
| `assets/css/style.css` | All styling. Colours are variables at the top of the file. |
| `assets/js/` | The in-browser patcher: `crc32.js`, `bps.js` (BPS format) and `patcher.js` (the download page form). |
| `index.html`, `download/`, `devlog/`, `changelog/`, `faq/`, `about/`, `credits/`, `404.html` | The pages themselves. |
| `tests/` | Automated tests for the patcher. |
| `scripts/serve.sh` | Runs the site on your computer. |

Pages show a friendly "nothing here yet" message until their data file has entries, so nothing needs a placeholder.

#### Writing a devlog post
Create `_posts/YYYY-MM-DD-short-title.md`, for example `_posts/2027-01-15-new-region-map.md`:

```markdown
---
title: A new region map
author: Your Name        # optional
---
Your post, in Markdown. The first paragraph is used as the excerpt on the devlog page.
```

Posts appear newest first on the Devlog page, and the three newest are shown on the home page.

#### Adding images later
Put them under `assets/images/` and reference them with the `relative_url` filter so they work under the `/sky-blue-website/` path:

```html
<img src="{{ '/assets/images/title-screen.png' | relative_url }}" alt="The Sky Blue title screen">
```

### Publishing a release
1. Build the patch from a **clean Pokémon Emerald (USA)** ROM (CRC32 `1F1C08FB`) and your finished Sky Blue ROM, using a BPS creator such as [Floating IPS (Flips)](https://github.com/Alcaro/Flips): *Create Patch*, choose BPS, pick the clean ROM, then your ROM.
2. Save the patch as `patches/sky-blue-<version>.bps`.
3. Add an entry to `_data/releases.yml` (the file has an example):
   ```yaml
   - version: "1.0.0"
     date: 2027-01-01
     patch: /patches/sky-blue-1.0.0.bps
     notes:
       - First public release.
   ```
4. Preview it locally (below) and patch your own ROM on the Download page to check the patch.
5. Commit and push to `main`. The Download page always offers the release with the newest `date`; older releases stay downloadable from the changelog.

The patcher checks the player's ROM and the patch output with the checksums stored inside the BPS file, so a wrong ROM produces a clear error instead of a broken game.

#### Turning on GitHub Pages (once)
In the repository on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then choose `main` and `/ (root)`. The site appears at <https://pkmn-sky-blue-team.github.io/sky-blue-website/> a minute or two after each push.

### Testing locally
You need Ruby (with Bundler) to run Jekyll on your computer. This is a one-time setup.

**1. Install Ruby and build tools.** Pick your distribution:

Debian / Ubuntu / Linux Mint / Pop!_OS:
```bash
sudo apt update && sudo apt install ruby-full build-essential zlib1g-dev
```

Fedora:
```bash
sudo dnf install ruby ruby-devel gcc gcc-c++ make redhat-rpm-config zlib-devel
```

Arch / Manjaro:
```bash
sudo pacman -S --needed ruby base-devel
```

**2. Check that Bundler is available** (it comes with Ruby 2.6 and newer):
```bash
bundle --version
```
If that says "command not found", install it for your user only (no `sudo` needed):
```bash
gem install --user-install bundler
```
then add Ruby's user bin folder to your `PATH` by appending this line to `~/.bashrc` and opening a new terminal:
```bash
export PATH="$(ruby -e 'print Gem.user_dir')/bin:$PATH"
```

**3. Run the site.** From the repository folder:
```bash
./scripts/serve.sh
```
The first run downloads the gems into `vendor/bundle` inside the project (ignored by git, so nothing is installed system-wide). Then open <http://127.0.0.1:4000/sky-blue-website/>. The site rebuilds and the browser reloads whenever you save a file; press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop. Edits to `_config.yml` need a restart.

`scripts/serve.sh` uses the `github-pages` gem, so what you see locally matches what GitHub builds. To pick up GitHub's newer versions occasionally, run `bundle update github-pages` and commit the updated `Gemfile.lock`.

#### Testing the patcher
The BPS patcher has unit tests that use small generated patches, so no ROM is needed. With [Node.js](https://nodejs.org/) 18 or newer, from the repository folder:
```bash
node --test
```

### Accessibility
The site is built to work with screen readers and keyboards: a "skip to main content" link, labelled navigation landmarks, live announcements for every patcher step and error, visible focus outlines, colours that meet WCAG AA contrast, and support for browser zoom and reduced-motion settings. When adding content, please:

- Give every image meaningful `alt` text (or `alt=""` if it is purely decorative).
- Keep headings in order: one title per page, then `##`, then `###`, without skipping levels.
- Write link text that makes sense on its own ("Download the 1.0 patch", not "click here").
- Don't rely on colour alone to convey meaning.
- Caption or transcribe any videos or audio.

### Translations
Interface text lives in `_data/i18n/<lang>.yml` and page content lives in the pages themselves, so the site can be translated without touching templates. Only English exists right now. To add a language (Spanish, `es`, in this example):

1. Copy `_data/i18n/en.yml` to `_data/i18n/es.yml` and translate the **values** (leave the keys and the `%name%` placeholders as they are). Set `language_name: Español`.
2. In `_config.yml`, uncomment the example `defaults` scope for `es` near the bottom, so every page in the `es/` folder is marked as Spanish.
3. Translate pages by copying them into an `es/` folder that mirrors the English layout, e.g. `download/index.html` → `es/download/index.html`. Keep the same `ref:` in the front matter and translate the `title`. Pages that aren't translated yet fall back to English in the menu.
4. Optionally add `_data/faq/es.yml`. Without it, the Spanish FAQ page shows the English questions.
5. Devlog posts can be translated by adding `lang: es` to a post's front matter; each language's devlog lists only its own posts.

Once a page exists in more than one language, a language switcher appears in the header automatically, and search engines are told about the alternatives.
