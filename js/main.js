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

// Request form: submit via fetch so the visitor stays on the page
const form = document.getElementById('request-form');
if (form) {
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', async (e) => {
    if (form.action.includes('YOUR_FORM_ID')) {
      e.preventDefault();
      status.textContent = 'Η φόρμα δεν έχει συνδεθεί ακόμη. Στείλτε μας μήνυμα στο Instagram @balloona.pop.';
      status.classList.add('show');
      return;
    }
    e.preventDefault();
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      form.reset();
      status.textContent = 'Ευχαριστούμε! Λάβαμε το αίτημά σας και θα επικοινωνήσουμε σύντομα.';
    } catch {
      status.textContent = 'Κάτι πήγε στραβά. Δοκιμάστε ξανά ή στείλτε μας μήνυμα στο Instagram.';
    }
    status.classList.add('show');
  });
}
