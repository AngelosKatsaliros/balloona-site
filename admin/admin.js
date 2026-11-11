(() => {
  const CATEGORIES = [
    { value: "dora", label: "Προσωποποιημένα δώρα" },
    { value: "genethlia", label: "Γενέθλια" },
    { value: "vaptiseis", label: "Βαπτίσεις & εκδηλώσεις" },
  ];
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

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const API = (window.BALLOONA_ADMIN_API || "").replace(/\/+$/, "");
  let token = store.get(TOKEN_KEY);
  let state = { gallery: [], saved: [], home: {}, version: "", rawBase: "" };
  let addImage = null; // data URL of the resized photo to add

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

  function categoryOptions(selected) {
    return CATEGORIES.map((c) => `<option value="${c.value}"${c.value === selected ? " selected" : ""}>${c.label}</option>`).join("");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  /* ---------- Load ---------- */
  async function load() {
    const data = await api("GET", "/content");
    state.gallery = data.gallery.map((p) => ({ ...p }));
    state.saved = JSON.stringify(data.gallery);
    state.home = data.home;
    state.version = data.version;
    state.rawBase = data.rawBase;
    renderGallery();
    renderHome();
  }

  function dirty() {
    return JSON.stringify(state.gallery) !== state.saved;
  }

  /* ---------- Gallery ---------- */
  function renderGallery() {
    const list = $("list");
    $("count").textContent = state.gallery.length === 1 ? "1 φωτογραφία" : `${state.gallery.length} φωτογραφίες`;
    if (!state.gallery.length) {
      list.innerHTML = `<li class="empty">Δεν υπάρχουν ακόμη φωτογραφίες.</li>`;
    } else {
      list.innerHTML = state.gallery.map((p, i) => `
        <li class="item" data-i="${i}">
          <img src="${esc(imgUrl(p.image))}" alt="" loading="lazy">
          <div class="item-fields">
            <input data-field="title" value="${esc(p.title)}" maxlength="80" aria-label="Τίτλος">
            <select data-field="category" aria-label="Κατηγορία">${categoryOptions(p.category)}</select>
          </div>
          <div class="item-actions">
            <button class="icon-btn" data-act="up" title="Μετακίνηση πάνω" aria-label="Μετακίνηση πάνω" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-btn" data-act="down" title="Μετακίνηση κάτω" aria-label="Μετακίνηση κάτω" ${i === state.gallery.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-btn danger" data-act="delete" title="Διαγραφή" aria-label="Διαγραφή">🗑</button>
          </div>
        </li>`).join("");
    }
    $("savebar").hidden = !dirty();
  }

  $("list").addEventListener("input", (e) => {
    const li = e.target.closest(".item");
    if (!li) return;
    state.gallery[+li.dataset.i][e.target.dataset.field] = e.target.value;
    $("savebar").hidden = !dirty();
  });

  $("list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const i = +btn.closest(".item").dataset.i;
    const g = state.gallery;
    if (btn.dataset.act === "up" && i > 0) [g[i - 1], g[i]] = [g[i], g[i - 1]];
    if (btn.dataset.act === "down" && i < g.length - 1) [g[i + 1], g[i]] = [g[i], g[i + 1]];
    if (btn.dataset.act === "delete") {
      if (!confirm(`Να αφαιρεθεί η φωτογραφία «${g[i].title}»;\n\nΘα σβηστεί από το site όταν πατήσεις «Αποθήκευση».`)) return;
      g.splice(i, 1);
    }
    renderGallery();
  });

  $("save").addEventListener("click", async () => {
    for (const p of state.gallery) {
      if (!p.title.trim()) return toast("Κάθε φωτογραφία χρειάζεται τίτλο.", true);
    }
    const btn = $("save");
    btn.disabled = true;
    btn.textContent = "Αποθήκευση…";
    try {
      await api("PUT", "/gallery", { gallery: state.gallery, version: state.version });
      await load();
      toast("Αποθηκεύτηκε! Το site θα ενημερωθεί σε 1–2 λεπτά.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Αποθήκευση";
    }
  });

  $("discard").addEventListener("click", () => {
    state.gallery = JSON.parse(state.saved);
    renderGallery();
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Add photo ---------- */
  $("add-category").insertAdjacentHTML("beforeend", categoryOptions(""));

  async function pickAddFile(file) {
    if (!file) return;
    $("drop-text").innerHTML = "Επεξεργασία φωτογραφίας…";
    try {
      addImage = await resizeImage(file);
      $("add-preview").src = addImage;
      $("add-preview").hidden = false;
      $("drop-text").hidden = true;
    } catch (err) {
      addImage = null;
      $("add-preview").hidden = true;
      $("drop-text").hidden = false;
      $("drop-text").innerHTML = "<strong>Πάτα για να διαλέξεις φωτογραφία</strong><br><small>ή σύρε την εδώ</small>";
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
    if (!addImage) return toast("Διάλεξε πρώτα μια φωτογραφία.", true);
    if (dirty() && !confirm("Έχεις αλλαγές στη λίστα που δεν αποθηκεύτηκαν και θα χαθούν. Συνέχεια;")) return;
    const btn = $("add-btn");
    btn.disabled = true;
    btn.textContent = "Ανέβασμα…";
    try {
      await api("POST", "/gallery/photo", {
        image: addImage,
        title: $("add-title").value,
        category: $("add-category").value,
      });
      $("add-form").reset();
      addImage = null;
      $("add-preview").hidden = true;
      $("drop-text").hidden = false;
      $("drop-text").innerHTML = "<strong>Πάτα για να διαλέξεις φωτογραφία</strong><br><small>ή σύρε την εδώ</small>";
      await load();
      toast("Η φωτογραφία ανέβηκε! Θα φανεί στο site σε 1–2 λεπτά.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Ανέβασμα στο site";
    }
  });

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
