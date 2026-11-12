(() => {
  // Used only with a server from before editable categories
  const DEFAULT_CATEGORIES = [
    { id: "dora", name: "Προσωποποιημένα δώρα" },
    { id: "genethlia", name: "Γενέθλια" },
    { id: "vaptiseis", name: "Βαπτίσεις & εκδηλώσεις" },
  ];
  const PROTECTED_CATEGORIES = ["dora", "genethlia", "vaptiseis"]; // the home page links to these
  const MAX_CATEGORIES = 20;
  const HOME_SLOTS = [
    { key: "hero", label: "Μεγάλη φωτογραφία στην κορυφή" },
    { key: "gift", label: "Κάρτα «Προσωποποιημένα δώρα»" },
    { key: "birthday", label: "Κάρτα «Γενέθλια»" },
    { key: "baptism", label: "Κάρτα «Βαπτίσεις & εκδηλώσεις»" },
    { key: "about", label: "Φωτογραφία «Λίγα λόγια για εμένα»" },
  ];
  const MAX_SIDE = 1800;
  const JPEG_QUALITY = 0.82;
  const TOKEN_KEY = "balloona-admin-token";
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // keep in sync with admin-server/worker.js
  const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v"];
  const MAX_DESCRIPTION = 1500; // keep in sync with admin-server/worker.js
  const MAX_MEDIA = 12; // photos/videos per creation, cover included; keep in sync with admin-server/worker.js
  const OLD_SERVER = ": ο server χρειάζεται ενημέρωση. Ενημέρωσε τον διαχειριστή του site.";
  const SOCIAL_HOSTS = ["instagram.com", "tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]; // keep in sync with admin-server/worker.js
  const SOCIAL_HELP = "Ο σύνδεσμος πρέπει να είναι ανάρτηση από TikTok ή Instagram (π.χ. https://www.tiktok.com/@balloona.pop/video/…).";

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const API = (window.BALLOONA_ADMIN_API || "").replace(/\/+$/, "");
  let token = store.get(TOKEN_KEY);
  let state = { gallery: [], saved: "", savedData: "[]", home: {}, version: "", rawBase: "", categories: [], savedCategories: [], categoriesVersion: "" };
  let addImage = null; // data URL of the resized photo to add
  let addVideo = null; // { file, ext, poster } of the video to add
  const enOpen = new WeakSet(); // creations whose «Μεταφράσεις» box is open, kept open across redraws
  // Optional translations (title_en, description_de, name_de, …); keep in sync with admin-server/worker.js
  const LANGS = [{ code: "en", tag: "EN", in: "στα αγγλικά" }, { code: "de", tag: "DE", in: "στα γερμανικά" }];
  const TR_FIELDS = LANGS.flatMap((l) => ["title_" + l.code, "description_" + l.code]);
  const DROP_TEXT = "<strong>Πάτα για να διαλέξεις φωτογραφία ή βίντεο</strong><br><small>ή σύρε το αρχείο εδώ</small>";

  /* ---------- API ---------- */
  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Δεν υπάρχει σύνδεση με τον server. Έλεγξε το internet και ξαναδοκίμασε.");
    }
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && path !== "/login") {
      logout();
      throw new Error(data.error || "Η σύνδεση έληξε. Συνδέσου ξανά.");
    }
    // An older server does not know newer actions yet
    if (res.status === 404 && data.error === "Δεν βρέθηκε.") throw new Error("Αυτό χρειάζεται ενημέρωση του server. Ενημέρωσε τον διαχειριστή του site.");
    if (!res.ok) throw new Error(data.error || "Κάτι πήγε στραβά. Δοκίμασε ξανά.");
    return data;
  }

  /* ---------- Views ---------- */
  function show(view) {
    for (const v of ["setup", "login", "app"]) $("view-" + v).hidden = v !== view;
    $("logout").hidden = view !== "app";
  }

  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), isError ? 7000 : 4500);
  }

  function imgUrl(path) {
    if (!path) return "";
    if (/^(data:|blob:|https?:)/.test(path)) return path;
    return state.rawBase + path.replace(/^\//, "");
  }

  // Creations can only use saved categories (a new one needs «Αποθήκευση» first)
  function categoryOptions(selected) {
    return state.savedCategories.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? " selected" : ""}>${esc(c.name)}</option>`).join("");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  /* ---------- Load ---------- */
  async function load({ keepCategories = false } = {}) {
    const data = await api("GET", "/content");
    if (!keepCategories) {
      state.savedCategories = data.categories || DEFAULT_CATEGORIES;
      state.categories = state.savedCategories.map((c) => ({ ...c }));
      state.categoriesVersion = data.categoriesVersion || "";
    }
    state.savedData = JSON.stringify(data.gallery);
    state.gallery = JSON.parse(state.savedData);
    state.saved = canon(data.gallery);
    state.home = data.home;
    state.version = data.version;
    state.rawBase = data.rawBase;
    renderAddCategories();
    renderGallery();
    renderCategories();
    renderHome();
  }

  // Compare lists by content only (key order and empty fields do not count as changes)
  const trim = (s) => String(s || "").trim();
  function canon(list) {
    return JSON.stringify(list.map((p) => [p.title, p.category, trim(p.description), ...TR_FIELDS.map((f) => trim(p[f])), trim(p.social), getMedia(p).map((m) => [m.video || "", m.image || ""])]));
  }

  function galleryDirty() {
    return canon(state.gallery) !== state.saved;
  }

  function catsDirty() {
    const strip = (list) => JSON.stringify(list.map((c) => [c.id || "", c.name.trim(), ...LANGS.map((l) => trim(c["name_" + l.code]))]));
    return strip(state.categories) !== strip(state.savedCategories);
  }

  function dirty() {
    return galleryDirty() || catsDirty();
  }

  /* A creation's photos/videos: the cover (image/video fields of the item) first, then "more" */
  function mediaKey(m) {
    return (m && (m.video || m.image)) || "";
  }

  function getMedia(p) {
    const cover = p.video ? { video: p.video, image: p.image || "" } : { image: p.image };
    return [cover, ...(Array.isArray(p.more) ? p.more : [])];
  }

  function setMedia(p, media) {
    const [cover, ...more] = media;
    delete p.video;
    if (cover.video) p.video = cover.video;
    p.image = cover.image || "";
    if (more.length) p.more = more;
    else delete p.more;
  }

  function mediaThumb(m) {
    return m.image ? `<img src="${esc(imgUrl(m.image))}" alt="" loading="lazy">` : `<span class="noimg">▶</span>`;
  }

  /* ---------- Gallery ---------- */
  function renderGallery() {
    const list = $("list");
    const nVideos = state.gallery.filter((p) => p.video).length;
    const nPhotos = state.gallery.length - nVideos;
    $("count").textContent = [
      nPhotos ? (nPhotos === 1 ? "1 φωτογραφία" : `${nPhotos} φωτογραφίες`) : "",
      nVideos ? `${nVideos} βίντεο` : "",
    ].filter(Boolean).join(", ");
    if (!state.gallery.length) {
      list.innerHTML = `<li class="empty">Δεν υπάρχουν ακόμη φωτογραφίες.</li>`;
    } else {
      list.innerHTML = state.gallery.map((p, i) => {
        const media = getMedia(p);
        return `
        <li class="item" data-i="${i}">
          <div class="thumb">${p.image ? `<img src="${esc(imgUrl(p.image))}" alt="" loading="lazy">` : "▶"}${p.video ? `<span class="badge">▶ Βίντεο</span>` : ""}${media.length > 1 ? `<span class="count" title="${media.length} φωτογραφίες/βίντεο">${media.length}</span>` : ""}</div>
          <div class="item-fields">
            <input data-field="title" value="${esc(p.title)}" maxlength="80" aria-label="Τίτλος">
            <select data-field="category" aria-label="Κατηγορία">${categoryOptions(p.category)}</select>
            <textarea data-field="description" rows="2" maxlength="${MAX_DESCRIPTION}" placeholder="Περιγραφή (προαιρετικό)" aria-label="Περιγραφή">${esc(p.description)}</textarea>
            <label class="link-input" title="Σύνδεσμος βίντεο σε TikTok ή Instagram"><span aria-hidden="true">🔗</span><input data-field="social" value="${esc(p.social)}" inputmode="url" autocomplete="off" maxlength="300" placeholder="TikTok / Instagram (προαιρετικό)" aria-label="Σύνδεσμος βίντεο σε TikTok ή Instagram"></label>
            <details class="en-box" data-en${enOpen.has(p) ? " open" : ""}>
              <summary>Μεταφράσεις ${translated(p).length ? `<span class="en-done">✓ ${translated(p).join(", ")}</span>` : "<small>(προαιρετικό)</small>"}</summary>
              ${LANGS.map((l) => `
              <label class="lang-input"><span>${l.tag}</span><input data-field="title_${l.code}" value="${esc(p["title_" + l.code])}" maxlength="80" lang="${l.code}" placeholder="Τίτλος ${l.in}" aria-label="Τίτλος ${l.in}"></label>
              <textarea data-field="description_${l.code}" rows="2" maxlength="${MAX_DESCRIPTION}" lang="${l.code}" placeholder="Περιγραφή ${l.in}" aria-label="Περιγραφή ${l.in}">${esc(p["description_" + l.code])}</textarea>`).join("")}
            </details>
            <div class="strip" aria-label="Φωτογραφίες και βίντεο της δημιουργίας">
              ${media.map((m, j) => `
              <div class="mthumb${j === 0 ? " cover" : ""}" data-j="${j}">
                <div class="mimg">${mediaThumb(m)}${m.video ? `<span class="mvid">▶</span>` : ""}${j === 0 ? `<span class="mcover">Κύρια</span>` : ""}</div>
                <div class="mtools"${media.length === 1 ? " hidden" : ""}>
                  <button type="button" data-mact="left" title="Πιο μπροστά" aria-label="Πιο μπροστά" ${j === 0 ? "disabled" : ""}>‹</button>
                  <button type="button" data-mact="right" title="Πιο πίσω" aria-label="Πιο πίσω" ${j === media.length - 1 ? "disabled" : ""}>›</button>
                  <button type="button" data-mact="remove" class="danger" title="Αφαίρεση" aria-label="Αφαίρεση" ${media.length === 1 ? "disabled" : ""}>✕</button>
                </div>
              </div>`).join("")}
              ${media.length < MAX_MEDIA ? `<label class="madd" title="Πρόσθεσε κι άλλες φωτογραφίες ή βίντεο αυτής της δημιουργίας"><span>+</span><small>Προσθήκη</small><input type="file" accept="image/*,video/*" multiple data-add-media></label>` : ""}
            </div>
          </div>
          <div class="item-actions">
            <button class="icon-btn" data-act="up" title="Μετακίνηση πάνω" aria-label="Μετακίνηση πάνω" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-btn" data-act="down" title="Μετακίνηση κάτω" aria-label="Μετακίνηση κάτω" ${i === state.gallery.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-btn danger" data-act="delete" title="Διαγραφή" aria-label="Διαγραφή">🗑</button>
          </div>
        </li>`;
      }).join("");
    }
    list.querySelectorAll("textarea").forEach(grow);
    $("savebar").hidden = !dirty();
  }

  // Let a description box grow with its text
  function grow(t) {
    if (!t.offsetParent) return; // not visible (other tab): measured again when shown
    t.style.height = "auto";
    t.style.height = t.scrollHeight + 2 + "px";
  }

  $("list").addEventListener("input", (e) => {
    const li = e.target.closest(".item");
    if (!li) return;
    const item = state.gallery[+li.dataset.i];
    const field = e.target.dataset.field;
    if (!field) return; // e.g. the "add photos" file input
    if (e.target.tagName === "TEXTAREA") grow(e.target);
    if (field === "title" || field === "category") {
      item[field] = e.target.value;
    } else if (e.target.value.trim()) {
      item[field] = e.target.value; // description, social and the translations: optional
    } else {
      delete item[field];
    }
    $("savebar").hidden = !dirty();
  });

  // Remember which «Στα αγγλικά» boxes are open ("toggle" does not bubble, so listen while capturing)
  $("list").addEventListener("toggle", (e) => {
    if (!e.target.matches || !e.target.matches("details[data-en]")) return;
    const p = state.gallery[+e.target.closest(".item").dataset.i];
    if (e.target.open) { enOpen.add(p); e.target.querySelectorAll("textarea").forEach(grow); }
    else enOpen.delete(p);
  }, true);

  // An older server silently drops the texts it does not know: warn instead of pretending they were saved
  function textsLost(sent, saved) {
    const kept = new Map((saved || []).map((p) => [p.video || p.image, p]));
    const lost = (field) => sent.some((p) => trim(p[field]) && !(kept.get(p.video || p.image) || {})[field]);
    if (lost("description")) return "Οι περιγραφές";
    if (TR_FIELDS.some(lost)) return "Οι μεταφράσεις";
    if (lost("social")) return "Οι σύνδεσμοι βίντεο";
    return "";
  }

  // The languages a creation has a title or description in, e.g. ["EN", "DE"]
  function translated(p) {
    return LANGS.filter((l) => trim(p["title_" + l.code]) || trim(p["description_" + l.code])).map((l) => l.tag);
  }

  // Same check as the server: a TikTok or Instagram address (https:// may be left out)
  function socialOk(link) {
    const s = trim(link);
    if (!s) return true;
    try {
      const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : "https://" + s);
      return /^https?:$/.test(u.protocol) && SOCIAL_HOSTS.includes(u.hostname.toLowerCase().replace(/^(www|m)\./, ""));
    } catch {
      return false;
    }
  }

  $("list").addEventListener("click", (e) => {
    const mbtn = e.target.closest("button[data-mact]");
    if (mbtn) {
      const p = state.gallery[+mbtn.closest(".item").dataset.i];
      const j = +mbtn.closest(".mthumb").dataset.j;
      const media = getMedia(p);
      if (mbtn.dataset.mact === "left" && j > 0) [media[j - 1], media[j]] = [media[j], media[j - 1]];
      if (mbtn.dataset.mact === "right" && j < media.length - 1) [media[j + 1], media[j]] = [media[j], media[j + 1]];
      if (mbtn.dataset.mact === "remove" && media.length > 1) media.splice(j, 1);
      setMedia(p, media);
      renderGallery();
      return;
    }
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const i = +btn.closest(".item").dataset.i;
    const g = state.gallery;
    if (btn.dataset.act === "up" && i > 0) [g[i - 1], g[i]] = [g[i], g[i - 1]];
    if (btn.dataset.act === "down" && i < g.length - 1) [g[i + 1], g[i]] = [g[i], g[i + 1]];
    if (btn.dataset.act === "delete") {
      const n = getMedia(g[i]).length;
      const what = n > 1 ? `η δημιουργία «${g[i].title}» με όλες τις ${n} φωτογραφίες/βίντεο της` : `${g[i].video ? "το βίντεο" : "η φωτογραφία"} «${g[i].title}»`;
      if (!confirm(`Να αφαιρεθεί ${what};\n\nΘα σβηστεί από το site όταν πατήσεις «Αποθήκευση».`)) return;
      g.splice(i, 1);
    }
    renderGallery();
  });

  $("save").addEventListener("click", async () => {
    for (const p of state.gallery) {
      if (!p.title.trim()) return toast("Κάθε φωτογραφία και βίντεο χρειάζεται τίτλο.", true);
      if (!socialOk(p.social)) return toast(`«${p.title.trim()}»: ${SOCIAL_HELP}`, true);
    }
    const names = state.categories.map((c) => c.name.trim().toLocaleLowerCase("el"));
    if (names.some((n) => !n)) return toast("Κάθε κατηγορία χρειάζεται όνομα.", true);
    if (new Set(names).size !== names.length) return toast("Δύο κατηγορίες έχουν το ίδιο όνομα.", true);
    const btn = $("save");
    btn.disabled = true;
    btn.textContent = "Αποθήκευση…";
    let gallerySaved = false;
    try {
      // Creations first: a category can only be deleted once nothing in it is left
      let lost = "";
      if (galleryDirty()) {
        const gallery = state.gallery.map((p) => ({ ...p, more: p.more || [] }));
        const res = await api("PUT", "/gallery", { gallery, version: state.version });
        lost = textsLost(state.gallery, res.gallery);
        gallerySaved = true;
      }
      if (catsDirty()) {
        const res = await api("PUT", "/categories", {
          categories: state.categories.map((c) => ({ id: c.id || "", name: c.name, ...Object.fromEntries(LANGS.map((l) => ["name_" + l.code, trim(c["name_" + l.code])])) })),
          version: state.categoriesVersion,
        });
        const names = (list) => list.reduce((n, c) => n + LANGS.filter((l) => trim(c["name_" + l.code])).length, 0);
        if (!lost && names(res.categories || []) < names(state.categories)) lost = "Οι μεταφράσεις των κατηγοριών";
      }
      await load();
      if (lost) toast(lost + " δεν αποθηκεύτηκαν" + OLD_SERVER, true);
      else toast("Αποθηκεύτηκε! Το site θα ενημερωθεί σε 1–2 λεπτά.");
    } catch (err) {
      toast(err.message, true);
      if (gallerySaved) { try { await load({ keepCategories: true }); } catch {} }
    } finally {
      btn.disabled = false;
      btn.textContent = "Αποθήκευση";
    }
  });

  $("discard").addEventListener("click", () => {
    state.gallery = JSON.parse(state.savedData);
    state.categories = state.savedCategories.map((c) => ({ ...c }));
    renderGallery();
    renderCategories();
  });

  /* ---------- Categories ---------- */
  function renderAddCategories() {
    const sel = $("add-category");
    const value = sel.value;
    sel.innerHTML = `<option value="">Διάλεξε…</option>` + categoryOptions(value);
  }

  function renderCategories() {
    const counts = {};
    for (const p of state.gallery) counts[p.category] = (counts[p.category] || 0) + 1;
    const cats = state.categories;
    $("cat-list").innerHTML = cats.map((c, i) => {
      const n = c.id ? counts[c.id] || 0 : 0;
      const locked = PROTECTED_CATEGORIES.includes(c.id);
      const why = locked ? "Η αρχική σελίδα συνδέεται με αυτή την κατηγορία, οπότε δεν σβήνεται" : n ? "Άλλαξε πρώτα την κατηγορία των δημιουργιών της" : "Διαγραφή";
      return `
        <li class="cat-row" data-i="${i}">
          <label class="lang-input"><span>ΕΛ</span><input data-cat-name value="${esc(c.name)}" maxlength="40" aria-label="Όνομα κατηγορίας"></label>
          ${LANGS.map((l) => `<label class="lang-input"><span>${l.tag}</span><input data-cat-lang="${l.code}" value="${esc(c["name_" + l.code])}" maxlength="40" lang="${l.code}" placeholder="${l.in.charAt(0).toUpperCase() + l.in.slice(1)} (προαιρετικό)" aria-label="Όνομα κατηγορίας ${l.in}"></label>`).join("")}
          <span class="cat-count muted">${!c.id ? `<span class="new">Νέα</span>` : n === 0 ? "καμία δημιουργία" : n === 1 ? "1 δημιουργία" : `${n} δημιουργίες`}</span>
          <div class="item-actions">
            <button class="icon-btn" data-cact="up" title="Μετακίνηση πάνω" aria-label="Μετακίνηση πάνω" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-btn" data-cact="down" title="Μετακίνηση κάτω" aria-label="Μετακίνηση κάτω" ${i === cats.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-btn danger" data-cact="delete" title="${why}" aria-label="${why}" ${locked || n ? "disabled" : ""}>🗑</button>
          </div>
        </li>`;
    }).join("");
    $("cat-add").hidden = cats.length >= MAX_CATEGORIES;
    $("savebar").hidden = !dirty();
  }

  $("cat-list").addEventListener("input", (e) => {
    const c = state.categories[+e.target.closest(".cat-row").dataset.i];
    if (e.target.matches("[data-cat-name]")) c.name = e.target.value;
    else if (e.target.matches("[data-cat-lang]")) c["name_" + e.target.dataset.catLang] = e.target.value;
    else return;
    $("savebar").hidden = !dirty();
  });

  $("cat-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cact]");
    if (!btn) return;
    const i = +btn.closest(".cat-row").dataset.i;
    const c = state.categories;
    if (btn.dataset.cact === "up" && i > 0) [c[i - 1], c[i]] = [c[i], c[i - 1]];
    if (btn.dataset.cact === "down" && i < c.length - 1) [c[i + 1], c[i]] = [c[i], c[i + 1]];
    if (btn.dataset.cact === "delete") {
      if (!confirm(`Να σβηστεί η κατηγορία «${c[i].name}»;\n\nΘα σβηστεί όταν πατήσεις «Αποθήκευση».`)) return;
      c.splice(i, 1);
    }
    renderCategories();
  });

  $("cat-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("cat-new").value.replace(/\s+/g, " ").trim();
    if (!name) return toast("Γράψε ένα όνομα για τη νέα κατηγορία.", true);
    if (state.categories.some((c) => c.name.trim().toLocaleLowerCase("el") === name.toLocaleLowerCase("el"))) {
      return toast(`Η κατηγορία «${name}» υπάρχει ήδη.`, true);
    }
    state.categories.push({ id: "", name });
    $("cat-new").value = "";
    renderCategories();
    toast("Πάτα «Αποθήκευση» κάτω για να μπει η κατηγορία. Μετά θα μπορείς να τη διαλέγεις για τις δημιουργίες.");
  });

  /* ---------- More photos/videos of a creation ---------- */
  $("list").addEventListener("change", async (e) => {
    const input = e.target.closest("input[data-add-media]");
    if (!input) return;
    const files = [...input.files];
    input.value = "";
    if (!files.length) return;
    if (dirty()) return toast("Πάτα πρώτα «Αποθήκευση» ή «Ακύρωση» για τις αλλαγές στη λίστα και μετά πρόσθεσε φωτογραφίες.", true);
    const p = state.gallery[+input.closest(".item").dataset.i];
    const key = mediaKey(p);
    const room = MAX_MEDIA - getMedia(p).length;
    if (files.length > room) return toast(`Χωράνε ακόμη ${room} φωτογραφίες ή βίντεο σε αυτή τη δημιουργία (έως ${MAX_MEDIA}).`, true);
    const label = input.closest(".madd");
    const status = label.querySelector("small");
    label.classList.add("busy");
    document.body.classList.add("uploading");
    let added = 0;
    try {
      for (const file of files) {
        const step = files.length > 1 ? ` ${added + 1}/${files.length}` : "";
        status.textContent = "Ανέβασμα" + step + "…";
        if (isVideo(file)) {
          const v = await prepareVideo(file);
          const sha = await uploadVideoBlob(v.file, (pct) => { status.textContent = `${pct}%${step}`; });
          status.textContent = "Αποθήκευση…";
          await api("POST", "/gallery/media", { item: key, blob: sha, ext: v.ext, poster: v.poster });
        } else {
          const image = await resizeImage(file);
          await api("POST", "/gallery/media", { item: key, image });
        }
        added++;
      }
      toast(added === 1 ? "Προστέθηκε! Θα φανεί στο site σε 1–2 λεπτά." : `Προστέθηκαν ${added}! Θα φανούν στο site σε 1–2 λεπτά.`);
    } catch (err) {
      toast((added ? `Προστέθηκαν ${added} από ${files.length}. ` : "") + err.message, true);
    } finally {
      document.body.classList.remove("uploading");
      try { await load(); } catch (err) { toast(err.message, true); }
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty() || document.body.classList.contains("uploading")) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Add photo ---------- */

  function resetAdd() {
    addImage = null;
    addVideo = null;
    const vp = $("add-video-preview");
    if (vp.src) { URL.revokeObjectURL(vp.src); vp.removeAttribute("src"); vp.load(); }
    vp.hidden = true;
    $("add-preview").hidden = true;
    $("drop-text").hidden = false;
    $("drop-text").innerHTML = DROP_TEXT;
  }

  async function pickAddFile(file) {
    if (!file) return;
    resetAdd();
    $("drop-text").innerHTML = "Επεξεργασία…";
    try {
      if (isVideo(file)) {
        addVideo = await prepareVideo(file);
        const vp = $("add-video-preview");
        vp.src = URL.createObjectURL(file);
        vp.hidden = false;
        vp.play().catch(() => {});
      } else {
        addImage = await resizeImage(file);
        $("add-preview").src = addImage;
        $("add-preview").hidden = false;
      }
      $("drop-text").hidden = true;
    } catch (err) {
      resetAdd();
      toast(err.message, true);
    }
  }

  $("add-file").addEventListener("change", (e) => pickAddFile(e.target.files[0]));
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); pickAddFile(e.dataTransfer.files[0]); });

  $("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!addImage && !addVideo) return toast("Διάλεξε πρώτα μια φωτογραφία ή ένα βίντεο.", true);
    if (!socialOk($("add-social").value)) return toast(SOCIAL_HELP, true);
    if (dirty() && !confirm("Έχεις αλλαγές στη λίστα που δεν αποθηκεύτηκαν και θα χαθούν. Συνέχεια;")) return;
    const btn = $("add-btn");
    btn.disabled = true;
    btn.textContent = "Ανέβασμα…";
    const title = $("add-title").value;
    const category = $("add-category").value;
    const description = $("add-description").value;
    const tr = Object.fromEntries(LANGS.flatMap((l) => [["title_" + l.code, $("add-title-" + l.code).value], ["description_" + l.code, $("add-description-" + l.code).value]]));
    const social = $("add-social").value;
    try {
      let res;
      if (addVideo) {
        const sha = await uploadVideoBlob(addVideo.file, (pct) => { btn.textContent = `Ανέβασμα… ${pct}%`; });
        btn.textContent = "Αποθήκευση…";
        res = await api("POST", "/gallery/video", { blob: sha, ext: addVideo.ext, poster: addVideo.poster, title, category, description, ...tr, social });
      } else {
        res = await api("POST", "/gallery/photo", { image: addImage, title, category, description, ...tr, social });
      }
      const wasVideo = !!addVideo;
      const saved = (res.gallery || [])[0] || {};
      const lost = trim(description) && !saved.description ? "η περιγραφή" : TR_FIELDS.some((f) => trim(tr[f]) && !saved[f]) ? "οι μεταφράσεις" : trim(social) && !saved.social ? "ο σύνδεσμος του βίντεο" : "";
      $("add-form").reset();
      $("add-en").open = false;
      resetAdd();
      await load();
      if (lost) toast((wasVideo ? "Το βίντεο ανέβηκε, αλλά " : "Η φωτογραφία ανέβηκε, αλλά ") + lost + (lost === "οι μεταφράσεις" ? " δεν αποθηκεύτηκαν" : " δεν αποθηκεύτηκε") + OLD_SERVER, true);
      else toast(wasVideo ? "Το βίντεο ανέβηκε! Θα φανεί στο site σε 1–2 λεπτά." : "Η φωτογραφία ανέβηκε! Θα φανεί στο site σε 1–2 λεπτά.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Ανέβασμα στο site";
    }
  });

  /* ---------- Videos ---------- */
  async function prepareVideo(file) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error(`Το βίντεο είναι ${Math.ceil(file.size / 1024 / 1024)} MB. Το μέγιστο είναι ${MAX_VIDEO_BYTES / 1024 / 1024} MB: κόψε το σε λιγότερα δευτερόλεπτα από το κινητό σου και ξαναδοκίμασε.`);
    }
    return { file, ext: videoExt(file), poster: await videoPoster(file).catch(() => null) };
  }

  function videoExt(file) {
    const fromName = (file.name.split(".").pop() || "").toLowerCase();
    if (VIDEO_EXTS.includes(fromName)) return fromName;
    if (file.type === "video/quicktime") return "mov";
    if (file.type === "video/webm") return "webm";
    return "mp4";
  }

  function isVideo(file) {
    return file.type.startsWith("video/") || VIDEO_EXTS.includes((file.name.split(".").pop() || "").toLowerCase());
  }

  // Grab a frame near the start of the video to use as its cover image
  async function videoPoster(file) {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    try {
      await new Promise((resolve, reject) => {
        v.onloadeddata = resolve;
        v.onerror = reject;
        setTimeout(reject, 15000);
        v.load();
      });
      const t = Math.min(1, (v.duration || 2) / 3);
      await new Promise((resolve) => { v.onseeked = resolve; setTimeout(resolve, 5000); v.currentTime = t; });
      if (!v.videoWidth) throw new Error("no frame");
      const scale = Math.min(1, 1200 / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(",") + 1));
      r.onerror = () => reject(new Error("Το βίντεο δεν διαβάστηκε. Δοκίμασε ξανά."));
      r.readAsDataURL(file);
    });
  }

  // Step 1: send the video to the server, which passes it to GitHub. Returns the GitHub blob id.
  async function uploadVideoBlob(file, onProgress) {
    const b64 = await readAsBase64(file);
    const body = new Blob(['{"content":"', b64, '","encoding":"base64"}'], { type: "application/json" });
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", API + "/upload/blob");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
      xhr.onerror = () => reject(new Error("Το ανέβασμα διακόπηκε. Έλεγξε το internet και ξαναδοκίμασε."));
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 401) { logout(); return reject(new Error(data.error || "Η σύνδεση έληξε. Συνδέσου ξανά.")); }
        if (xhr.status < 200 || xhr.status >= 300 || !data.sha) return reject(new Error(data.error || "Το ανέβασμα απέτυχε. Δοκίμασε ξανά."));
        resolve(data.sha);
      };
      xhr.send(body);
    });
  }

  /* ---------- Home photos ---------- */
  function renderHome() {
    $("home-grid").innerHTML = HOME_SLOTS.map((s) => `
      <div class="slot">
        <img src="${esc(imgUrl(state.home[s.key]))}" alt="">
        <div class="slot-body">
          <div class="slot-title">${s.label}</div>
          <label class="btn small">Αλλαγή<input type="file" accept="image/*" data-slot="${s.key}"></label>
        </div>
      </div>`).join("");
  }

  $("home-grid").addEventListener("change", async (e) => {
    const input = e.target.closest("input[data-slot]");
    if (!input || !input.files[0]) return;
    const slot = input.dataset.slot;
    const label = input.parentElement;
    label.firstChild.textContent = "Ανέβασμα…";
    try {
      const image = await resizeImage(input.files[0]);
      await api("POST", "/home/photo", { slot, image });
      await load();
      toast("Η φωτογραφία άλλαξε! Θα φανεί στο site σε 1–2 λεπτά.");
    } catch (err) {
      label.firstChild.textContent = "Αλλαγή";
      toast(err.message, true);
    }
  });

  /* ---------- Image resizing (in the browser) ---------- */
  async function resizeImage(file) {
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      throw new Error("Αυτό το αρχείο δεν είναι φωτογραφία.");
    }
    let source;
    try {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Αυτή η μορφή φωτογραφίας δεν υποστηρίζεται. Δοκίμασε μια φωτογραφία JPG."));
        img.src = URL.createObjectURL(file);
      });
    }
    const w = source.width, h = source.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
      $("tab-" + t.dataset.tab).hidden = !on;
    });
    $("list").querySelectorAll("textarea").forEach(grow);
    renderCategories();
  }));

  /* ---------- Login ---------- */
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-error").textContent = "";
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const data = await api("POST", "/login", { password: $("password").value });
      token = data.token;
      store.set(TOKEN_KEY, token);
      $("password").value = "";
      await start();
    } catch (err) {
      $("login-error").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function logout() {
    token = null;
    store.del(TOKEN_KEY);
    show("login");
  }
  $("logout").addEventListener("click", logout);

  async function start() {
    if (!API) return show("setup");
    if (!token) return show("login");
    show("app");
    try {
      await load();
    } catch (err) {
      toast(err.message, true);
    }
  }

  start();
})();
