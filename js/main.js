// Mobile menu
const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
}

// Footer year
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();

// Gallery filters (also reacts to #dora, #genethlia, #vaptiseis in the URL)
const filters = document.querySelectorAll('.filter');
function applyFilter(cat) {
  filters.forEach(b => b.classList.toggle('active', b.dataset.filter === cat));
  document.querySelectorAll('.gallery figure').forEach(f => {
    f.classList.toggle('hidden', cat !== 'all' && f.dataset.cat !== cat);
  });
}
if (filters.length) {
  filters.forEach(b => b.addEventListener('click', () => applyFilter(b.dataset.filter)));
  const hash = location.hash.slice(1);
  if ([...filters].some(b => b.dataset.filter === hash)) {
    applyFilter(hash);
    window.scrollTo(0, 0);
  }
}

// Gallery videos: play silently while on screen (sound plays in the lightbox)
const gridVideos = document.querySelectorAll('.gallery video');
const onScreen = new Set();
let lightboxOpen = false;
if (gridVideos.length) {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { onScreen.add(e.target); if (!lightboxOpen) e.target.play().catch(() => {}); }
      else { onScreen.delete(e.target); e.target.pause(); }
    }), { threshold: 0.4 });
    gridVideos.forEach((v) => io.observe(v));
  }
}

// Lightbox: click a creation to see it large, zoom in, and read more about it
const lb = document.getElementById('lightbox');
if (lb && typeof lb.showModal === 'function') {
  const stage = document.getElementById('lb-stage');
  const img = document.getElementById('lb-img');
  const video = document.getElementById('lb-video');
  const zoomBar = document.getElementById('lb-zoom');
  const zoomIn = zoomBar.querySelector('[data-zoom="in"]');
  const zoomOut = zoomBar.querySelector('[data-zoom="out"]');
  const prevBtn = lb.querySelector('.lb-prev');
  const nextBtn = lb.querySelector('.lb-next');
  const desc = document.getElementById('lb-desc');
  const cta = document.getElementById('lb-cta');
  const hint = document.getElementById('lb-hint');
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const MAX_ZOOM = 5;
  let items = [];
  let index = 0;
  let opener = null;
  let z = { s: 1, x: 0, y: 0 };

  // --- zoom & pan (image only) ---
  function bounds(s) {
    const r = stage.getBoundingClientRect();
    const w = img.naturalWidth || r.width, h = img.naturalHeight || r.height;
    const fit = Math.min(r.width / w, r.height / h);
    return { r, mx: Math.max(0, (w * fit * s - r.width) / 2), my: Math.max(0, (h * fit * s - r.height) / 2) };
  }
  function apply(animate) {
    const { mx, my } = bounds(z.s);
    z.x = Math.max(-mx, Math.min(mx, z.x));
    z.y = Math.max(-my, Math.min(my, z.y));
    stage.classList.toggle('animate', !!animate);
    stage.classList.toggle('zoomed', z.s > 1.01);
    img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
    zoomOut.disabled = z.s <= 1.01;
    zoomIn.disabled = z.s >= MAX_ZOOM - 0.01;
  }
  // Zoom to scale s, keeping the point (cx, cy) on the screen where it is
  function zoomTo(s, cx, cy, animate) {
    s = Math.max(1, Math.min(MAX_ZOOM, s));
    const r = stage.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
    const py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    const k = s / z.s;
    z = { s, x: px - k * (px - z.x), y: py - k * (py - z.y) };
    if (s === 1) z.x = z.y = 0;
    apply(animate);
  }
  const resetZoom = () => { z = { s: 1, x: 0, y: 0 }; apply(false); };

  zoomIn.addEventListener('click', () => zoomTo(z.s * 1.6, null, null, true));
  zoomOut.addEventListener('click', () => zoomTo(z.s / 1.6, null, null, true));
  stage.addEventListener('wheel', (e) => {
    if (!video.hidden) return;
    e.preventDefault();
    zoomTo(z.s * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY, false);
  }, { passive: false });

  const pointers = new Map();
  let gesture = null;
  img.addEventListener('pointerdown', (e) => {
    try { img.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    if (pts.length === 1) gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: z.x, oy: z.y, moved: false, t: Date.now() };
    else if (pts.length === 2) {
      const [a, b] = pts;
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: z.s, moved: true };
    }
  });
  img.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    if (gesture.type === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const s = gesture.s * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d;
      zoomTo(s, (a.x + b.x) / 2, (a.y + b.y) / 2, false);
    } else if (gesture.type === 'pan') {
      const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) gesture.moved = true;
      if (z.s > 1.01 && gesture.moved) {
        stage.classList.add('panning');
        z.x = gesture.ox + dx;
        z.y = gesture.oy + dy;
        apply(false);
      }
    }
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    stage.classList.remove('panning');
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size === 0) gesture = null;
      else { const [p] = [...pointers.values()]; gesture = { type: 'pan', sx: p.x, sy: p.y, ox: z.x, oy: z.y, moved: true }; }
      return;
    }
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (!gesture.moved && e.type === 'pointerup') {
      // Tap / click: zoom in where tapped, or back out
      if (z.s > 1.01) zoomTo(1, null, null, true);
      else zoomTo(2.5, e.clientX, e.clientY, true);
    } else if (z.s <= 1.01 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1); // swipe to the next/previous creation
    }
    gesture = null;
  }
  img.addEventListener('pointerup', endPointer);
  img.addEventListener('pointercancel', endPointer);
  img.addEventListener('load', () => apply(false));
  window.addEventListener('resize', () => { if (lb.open) apply(false); });

  // --- open / show / close ---
  const thumbs = document.getElementById('lb-thumbs');
  const card = lb.querySelector('.lb-card');
  const itemPrev = lb.querySelector('.lb-item-prev');
  const itemNext = lb.querySelector('.lb-item-next');
  let media = [];
  let mIndex = 0;

  // A creation's photos/videos: the one shown in the gallery first, then the extra angles
  function mediaOf(fig) {
    const v = fig.querySelector('.media video');
    const im = fig.querySelector('.media img');
    const cover = v ? { video: v.getAttribute('src'), image: v.getAttribute('poster') || '' } : { image: im.currentSrc || im.getAttribute('src') };
    const more = [...fig.querySelectorAll('.item-more li')].map((li) => ({ video: li.dataset.video || '', image: li.dataset.image || '' }));
    return [cover, ...more].filter((m) => m.video || m.image);
  }

  function showItem(i, at) {
    index = (i + items.length) % items.length;
    const fig = items[index];
    const title = fig.querySelector('.open-item').textContent.trim();
    const cat = fig.querySelector('figcaption small').textContent.trim();
    const text = ((fig.querySelector('.item-desc') || {}).textContent || '').trim();
    media = mediaOf(fig);

    document.getElementById('lb-cat').textContent = cat;
    document.getElementById('lb-title').textContent = title;
    desc.textContent = text || 'Κάθε δημιουργία φτιάχνεται στο χέρι, στα χρώματα και με το όνομα ή την ευχή που θέλετε εσείς. Στείλτε μας την ιδέα σας!';
    desc.classList.toggle('placeholder', !text);
    cta.href = 'epikoinonia.html?gia=' + encodeURIComponent(title) + '&cat=' + encodeURIComponent(fig.dataset.cat || '');
    document.getElementById('lb-count').textContent = items.length > 1 ? `Δημιουργία ${index + 1}\u00a0από\u00a0${items.length}` : '';
    document.getElementById('lb-items').hidden = items.length < 2;

    thumbs.hidden = media.length < 2;
    card.classList.toggle('lb-has-thumbs', media.length > 1);
    thumbs.innerHTML = '';
    if (media.length > 1) {
      media.forEach((m, j) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.j = j;
        b.setAttribute('aria-label', `${m.video ? 'Βίντεο' : 'Φωτογραφία'} ${j + 1} από ${media.length}`);
        if (m.image) {
          const t = document.createElement('img');
          t.src = m.image;
          t.alt = '';
          t.loading = 'lazy';
          b.append(t);
        }
        if (m.video) {
          const play = document.createElement('span');
          play.className = 'play';
          b.append(play);
        }
        thumbs.append(b);
      });
    }
    prevBtn.hidden = nextBtn.hidden = items.length < 2 && media.length < 2;
    showMedia(at === 'last' ? media.length - 1 : at || 0);
  }

  function showMedia(j) {
    mIndex = j;
    const m = media[j];
    const title = document.getElementById('lb-title').textContent;
    resetZoom();
    video.pause();
    if (m.video) {
      img.hidden = true;
      img.removeAttribute('src');
      zoomBar.hidden = true;
      video.hidden = false;
      video.poster = m.image || '';
      video.src = m.video;
      video.muted = false;
      video.play().catch(() => {});
    } else {
      video.hidden = true;
      video.removeAttribute('src');
      video.load();
      zoomBar.hidden = false;
      img.hidden = false;
      img.alt = media.length > 1 ? `${title} (${j + 1} από ${media.length})` : title;
      img.src = m.image;
    }
    thumbs.querySelectorAll('button').forEach((b) => {
      const on = +b.dataset.j === j;
      b.setAttribute('aria-current', on);
      if (on && !thumbs.hidden) { // keep the current thumbnail in view, centred
        const r = b.getBoundingClientRect(), t = thumbs.getBoundingClientRect();
        thumbs.scrollLeft += (r.left + r.width / 2) - (t.left + t.width / 2);
      }
    });
    hint.textContent = [
      media.length > 1 ? `${m.video ? 'Βίντεο' : 'Φωτογραφία'} ${j + 1} από ${media.length}.` : '',
      m.video ? '' : (touch ? 'Πάτα ή άνοιξε με δύο δάχτυλα για μεγέθυνση.' : 'Πάτα στη φωτογραφία ή γύρνα τη ροδέλα για μεγέθυνση.'),
    ].filter(Boolean).join(' ');
  }

  // Arrows, swipes and keys go through every photo of a creation, then on to the next creation
  function go(step) {
    const j = mIndex + step;
    if (j >= 0 && j < media.length) showMedia(j);
    else if (items.length > 1) showItem(index + step, step < 0 ? 'last' : 0);
    else if (media.length > 1) showMedia((j + media.length) % media.length);
  }

  thumbs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-j]');
    if (b) showMedia(+b.dataset.j);
  });
  itemPrev.addEventListener('click', () => showItem(index - 1));
  itemNext.addEventListener('click', () => showItem(index + 1));

  function open(fig) {
    items = [...document.querySelectorAll('.gallery figure')].filter((f) => !f.classList.contains('hidden'));
    opener = fig.querySelector('.open-item');
    lightboxOpen = true;
    gridVideos.forEach((v) => v.pause());
    document.body.classList.add('lb-open');
    lb.showModal();
    showItem(items.indexOf(fig));
    lb.querySelector('.lb-close').focus();
  }
  lb.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    lightboxOpen = false;
    document.body.classList.remove('lb-open');
    onScreen.forEach((v) => v.play().catch(() => {}));
    if (opener) opener.focus({ preventScroll: true });
  });

  document.querySelector('.gallery').addEventListener('click', (e) => {
    const fig = e.target.closest('figure');
    if (fig) open(fig);
  });
  lb.querySelector('.lb-close').addEventListener('click', () => lb.close());
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); }); // click on the dark backdrop
  document.addEventListener('keydown', (e) => {
    if (!lb.open || e.target === video) return; // let the video controls use the arrow keys
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if ((e.key === '+' || e.key === '=') && video.hidden) zoomTo(z.s * 1.6, null, null, true);
    else if (e.key === '-' && video.hidden) zoomTo(z.s / 1.6, null, null, true);
  });
}

// Contact page: "Θέλω κάτι παρόμοιο" from the gallery fills in the request
const params = new URLSearchParams(location.search);
const wanted = params.get('gia');
const msgField = document.getElementById('message');
if (wanted && msgField && !msgField.value) {
  msgField.value = `Ενδιαφέρομαι για κάτι σαν «${wanted.slice(0, 120)}» από τις Δημιουργίες.\n`;
  const typeIndex = { dora: 0, genethlia: 1, vaptiseis: 2 }[params.get('cat')];
  const typeField = document.getElementById('type');
  if (typeField && typeIndex != null) typeField.selectedIndex = typeIndex;
}

// Request form: submit via fetch so the visitor stays on the page
const form = document.getElementById('request-form');
if (form) {
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', async (e) => {
    if (form.querySelector('[name="access_key"]').value === 'YOUR_ACCESS_KEY') {
      e.preventDefault();
      status.textContent = 'Η φόρμα δεν έχει συνδεθεί ακόμη. Στείλτε μας μήνυμα στο Instagram @balloona.pop.';
      status.classList.add('show');
      return;
    }
    e.preventDefault();
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error();
      form.reset();
      status.textContent = 'Ευχαριστούμε! Λάβαμε το αίτημά σας και θα επικοινωνήσουμε σύντομα.';
    } catch {
      status.textContent = 'Κάτι πήγε στραβά. Δοκιμάστε ξανά ή στείλτε μας μήνυμα στο Instagram.';
    }
    status.classList.add('show');
  });
}
