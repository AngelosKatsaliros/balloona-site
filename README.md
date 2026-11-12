# Balloona website

Static site (HTML + CSS + a little JS). Open `index.html` in a browser to view it.

## Pages
| Greek | English | |
|---|---|---|
| `index.html` | `en/index.html` | Αρχική / Home |
| `dimiourgies.html` | `en/creations.html` | Δημιουργίες (gallery with category filters) |
| `stolismoi.html` | `en/decorations.html` | Στολισμοί / Decorations |
| `gia-emena.html` | `en/about.html` | Για εμένα / About me |
| `epikoinonia.html` | `en/contact.html` | Επικοινωνία (request form) |

## Two languages (ΕΛ / EN)
- Every page uses `_layouts/default.html` (head, header with the ΕΛ/EN switch, footer). The page's front
  matter sets `lang` (`el` or `en`) and `ref` (its key in `_data/pages.yml`, which pairs each Greek page
  with its English one for the switch and the `hreflang` links).
- Shared texts (menu, buttons, form labels, the request-form email subject) are in `_data/i18n.yml`;
  texts of the lightbox and the form messages are at the top of `js/main.js` (`T`).
- The page bodies are written out in each language; shared blocks live in `_includes/` (`gallery.html`,
  `contact.html`, `cta.html`).
- Gallery items and categories can have English texts: `title_en`, `description_en` (gallery) and
  `name_en` (categories). They are optional; English pages show the Greek text when they are empty.
  The admin page has fields for them («Στα αγγλικά»).
- Requests sent from the English contact page arrive with an English subject and a «Γλώσσα: English» line.

## Before going live
1. **Photos:** the files in `images/` are crops from the design mockup. Replace them with real photos
   (same file names, roughly 1600px wide for `hero.jpg`/`about.jpg`, 900px for the others).
   Add more photos to the gallery in `dimiourgies.html`.
2. **Signature:** `images/signature.png` is cut from the mockup. For a sharper result, scan Ελισάβετ's real signature and save it with the same name (transparent PNG).
2. **Logo:** replace `images/logo.png` with the real logo (square PNG, at least 256px).
3. **Request form:** requests are emailed through [Web3Forms](https://web3forms.com). The access key is in the
   `access_key` field of `_includes/contact.html` (manage it at web3forms.com).
4. **Domain:** set `canonical_url` in `_config.yml` (used for the canonical, `hreflang` and `og:` links).
5. **Hosting:** drag the folder into Netlify Drop (app.netlify.com/drop), or push it to GitHub Pages / Vercel.

## Editing photos without code (/admin)
- Photos are listed in `_data/gallery.json` (Δημιουργίες page, in display order) and `_data/home.json`
  (home page and Στολισμοί); the gallery filters come from `_data/categories.json` (a category shows once
  it has a creation). GitHub Pages builds the pages from these lists with Jekyll.
- `admin/` is a Greek admin page at `/admin/`: log in with a password, upload a photo (resized in the
  browser to max 1800px) or a video (max 50 MB, a cover frame is captured automatically), set title and
  category and an optional description (plus optional English title/description), add more photos/videos to a creation (other angles, up to 12,
  stored in its `more` list; the first one is the cover shown in the grid), add a link to a TikTok or
  Instagram post about it (`social`, shown as a «Δείτε το βίντεο στο TikTok/Instagram» button in the
  lightbox; only tiktok.com / instagram.com links are accepted), reorder, delete, and swap
  home page photos. The «Κατηγορίες» tab adds, renames (Greek and English), reorders and deletes categories (ids stay fixed;
  `dora`, `genethlia`, `vaptiseis` are linked from the home page and cannot be deleted).
- On Δημιουργίες, clicking a card opens a lightbox: the photo can be zoomed (click/tap, mouse wheel, pinch,
  +/− buttons), thumbnails switch between its photos/videos, and the item's `description` shows beside it
  (below on phones), with a «Θέλω κάτι παρόμοιο»
  button that fills in the request form. Gallery videos play muted on a loop and with sound in the lightbox.
- `admin-server/worker.js` is a small Cloudflare Worker that checks the password and commits the changes
  to this repository. Setup steps: `admin-server/SETUP.md`.
- `.github/workflows/optimize-images.yml` shrinks any oversized photo that reaches `images/uploads/`
  another way (for example uploaded directly on GitHub).
- Preview locally: `jekyll serve` (plain `index.html` in a browser does not show the photos, because the pages are templates).
