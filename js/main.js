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

// Gallery videos: play silently while on screen, tap for sound
const videos = document.querySelectorAll('.gallery video');
if (videos.length) {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = !reduceMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.play().catch(() => {});
        else e.target.pause();
      }), { threshold: 0.4 })
    : null;
  videos.forEach((v) => {
    if (io) io.observe(v);
    v.addEventListener('click', () => {
      const turnOn = v.muted || v.paused;
      videos.forEach((o) => { if (o !== v) { o.muted = true; o.closest('figure').classList.remove('sound'); } });
      v.muted = !turnOn;
      v.closest('figure').classList.toggle('sound', turnOn);
      if (turnOn) v.play().catch(() => {});
    });
  });
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
