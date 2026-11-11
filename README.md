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
