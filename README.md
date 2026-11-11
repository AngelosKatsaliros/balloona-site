# Balloona website

Static site (HTML + CSS + a little JS). Open `index.html` in a browser to view it.

## Pages
- `index.html` – Αρχική
- `dimiourgies.html` – Δημιουργίες (gallery with category filters)
- `stolismoi.html` – Στολισμοί
- `gia-emena.html` – Για εμένα
- `epikoinonia.html` – Επικοινωνία (request form)

## Before going live
1. **Photos:** the files in `images/` are crops from the design mockup. Replace them with real photos
   (same file names, roughly 1600px wide for `hero.jpg`/`about.jpg`, 900px for the others).
   Add more photos to the gallery in `dimiourgies.html`.
2. **Signature:** `images/signature.png` is cut from the mockup. For a sharper result, scan Ελισάβετ's real signature and save it with the same name (transparent PNG).
2. **Logo:** replace `images/logo.png` with the real logo (square PNG, at least 256px).
3. **Request form:** create a free form at https://formspree.io and replace `YOUR_FORM_ID`
   in `epikoinonia.html`. Until then the form shows a message pointing visitors to Instagram.
4. **Domain:** if the domain is not `balloona.gr`, update the `canonical`/`og:` URLs at the top of each page.
5. **Hosting:** drag the folder into Netlify Drop (app.netlify.com/drop), or push it to GitHub Pages / Vercel.

## Editing photos without code (/admin)
- Photos are listed in `_data/gallery.json` (Δημιουργίες page, in display order) and `_data/home.json`
  (home page and Στολισμοί). GitHub Pages builds the pages from these lists with Jekyll.
- `admin/` is a Greek admin page at `/admin/`: log in with a password, upload a photo (resized in the
  browser to max 1800px), set title and category, reorder, delete, and swap home page photos.
- `admin-server/worker.js` is a small Cloudflare Worker that checks the password and commits the changes
  to this repository. Setup steps: `admin-server/SETUP.md`.
- `.github/workflows/optimize-images.yml` shrinks any oversized photo that reaches `images/uploads/`
  another way (for example uploaded directly on GitHub).
- Preview locally: `jekyll serve` (plain `index.html` in a browser does not show the photos, because the pages are templates).
