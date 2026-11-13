# Balloona website

Static site (HTML + CSS + a little JS). Open `index.html` in a browser to view it.

## Pages
| Greek | English | German | |
|---|---|---|---|
| `index.html` | `en/index.html` | `de/index.html` | Αρχική / Home / Startseite |
| `dimiourgies.html` | `en/creations.html` | `de/kreationen.html` | Δημιουργίες (gallery with category filters) |
| `stolismoi.html` | `en/decorations.html` | `de/dekorationen.html` | Στολισμοί / Decorations / Dekorationen |
| `gia-emena.html` | `en/about.html` | `de/ueber-mich.html` | Για εμένα / About me / Über mich |
| `epikoinonia.html` | `en/contact.html` | `de/kontakt.html` | Επικοινωνία (request form) |

## Three languages (ΕΛ / EN / DE)
- Every page uses `_layouts/default.html` (head, header with the ΕΛ/EN/DE switch, footer). The page's front
  matter sets `lang` (`el`, `en` or `de`) and `ref` (its key in `_data/pages.yml`, which lists each page's
  Greek, English and German address for the switch and the `hreflang` links).
- Addresses have no `.html` (`/dimiourgies`, `/en/creations`, …): GitHub Pages serves `dimiourgies.html` for
  `/dimiourgies`. All links, canonical/`hreflang` tags and `sitemap.xml` use these clean addresses; the old
  `.html` addresses still open the same pages.
- Shared texts (menu, buttons, form labels, the request-form email subject) are in `_data/i18n.yml`;
  texts of the lightbox and the form messages are at the top of `js/main.js` (`TEXTS`).
- The page bodies are written out in each language; shared blocks live in `_includes/` (`gallery.html`,
  `contact.html`, `cta.html`). The signature is a picture per language (`images/signature.png`,
  `signature-en.png`, `signature-de.png`).
- Gallery items and categories can have translated texts: `title_en`, `description_en`, `title_de`,
  `description_de` (gallery) and `name_en`, `name_de` (categories). They are optional: English pages show
  the Greek text when the English one is empty, and German pages show the English text (or else the Greek
  one) when the German one is empty. The admin page has fields for them («Μεταφράσεις»).
- Requests sent from the English or German contact page arrive with a subject marked «(English)» or
  «(Γερμανικά)» and a «Γλώσσα» line saying which language to reply in.

## Before going live
1. **Photos:** the files in `images/` are crops from the design mockup. Replace them with real photos
   (same file names, roughly 1600px wide for `hero.jpg`/`about.jpg`, 900px for the others).
   Add more photos to the gallery in `dimiourgies.html`.
2. **Signature:** `images/signature.png` is cut from the mockup. For a sharper result, scan Ελισάβετ's real signature and save it with the same name (transparent PNG).
2. **Logo:** replace `images/logo.png` with the real logo (square PNG, at least 256px).
3. **Request form:** requests are emailed through [Web3Forms](https://web3forms.com). The access key is in the
   `access_key` field of `_includes/contact.html` (manage it at web3forms.com).
4. **Domain:** the site is served at https://www.balloona.gr (see `CNAME`; `canonical_url` in `_config.yml` is used for the canonical, `hreflang` and `og:` links). DNS: `www` CNAME → `angeloskatsaliros.github.io`; `balloona.gr` A → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153.
5. **Hosting:** drag the folder into Netlify Drop (app.netlify.com/drop), or push it to GitHub Pages / Vercel.

## Editing photos without code (/admin)
- Photos are listed in `_data/gallery.json` (Δημιουργίες page, in display order) and `_data/home.json`
  (home page and Στολισμοί); the gallery filters come from `_data/categories.json` (a category shows once
  it has a creation). GitHub Pages builds the pages from these lists with Jekyll.
- `admin/` is a Greek admin page at `/admin/`: log in with a password, upload a photo (resized in the
  browser to max 1800px) or a video (max 50 MB, a cover frame is captured automatically), set title and
  category and an optional description (plus optional English and German title/description), add more photos/videos to a creation (other angles, up to 12,
  stored in its `more` list; the first one is the cover shown in the grid), add a link to a TikTok or
  Instagram post about it (`social`, shown as a «Δείτε το βίντεο στο TikTok/Instagram» button in the
  lightbox; only tiktok.com / instagram.com links are accepted), reorder, delete, and swap
  home page photos. The «Κατηγορίες» tab adds, renames (Greek, English and German), reorders and deletes categories (ids stay fixed;
  `dora`, `genethlia`, `vaptiseis` are linked from the home page and cannot be deleted).
- On Δημιουργίες, clicking a card opens a lightbox: the photo can be zoomed (click/tap, mouse wheel, pinch,
  +/− buttons), thumbnails switch between its photos/videos, and the item's `description` shows beside it
  (below on phones), with a «Θέλω κάτι παρόμοιο»
  button that fills in the request form. Gallery videos play muted on a loop and with sound in the lightbox.
- `admin-server/worker.js` is a small Cloudflare Worker that checks the password and commits the changes
  to this repository. Setup steps: `admin-server/SETUP.md`.
- The admin's «Επισκέψεις» tab shows visits, page views, pages, sources (Instagram, Google, TikTok, …),
  countries and devices for the last 7 days, 30 days or 3 months. `js/main.js` sends one small request per
  page view to the worker's `/hit` (address in `stats_url`, `_config.yml`); the worker stores it in a D1
  database bound as `STATS` (see `admin-server/SETUP.md`). No cookies: a visitor is recognised only within
  one day, through a hash with a salt that changes daily. Bots, automated browsers and devices logged in to
  /admin are not counted.
- `.github/workflows/optimize-images.yml` shrinks any oversized photo that reaches `images/uploads/`
  another way (for example uploaded directly on GitHub).
- Preview locally: `jekyll serve` (plain `index.html` in a browser does not show the photos, because the pages are templates).
