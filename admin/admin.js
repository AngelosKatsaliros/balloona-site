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
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // keep in sync with admin-server/worker.js
  const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v"];

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
  let addVideo = null; // { file, ext, poster } of the video to add
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
    const nVideos = state.gallery.filter((p) => p.video).length;
    const nPhotos = state.gallery.length - nVideos;
    $("count").textContent = [
      nPhotos ? (nPhotos === 1 ? "1 φωτογραφία" : `${nPhotos} φωτογραφίες`) : "",
      nVideos ? `${nVideos} βίντεο` : "",
    ].filter(Boolean).join(", ");
    if (!state.gallery.length) {
      list.innerHTML = `<li class="empty">Δεν υπάρχουν ακόμη φωτογραφίες.</li>`;
    } else {
      list.innerHTML = state.gallery.map((p, i) => `
        <li class="item" data-i="${i}">
          <div class="thumb">${p.image ? `<img src="${esc(imgUrl(p.image))}" alt="" loading="lazy">` : "▶"}${p.video ? `<span class="badge">▶ Βίντεο</span>` : ""}</div>
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
      const what = g[i].video ? "το βίντεο" : "η φωτογραφία";
      if (!confirm(`Να αφαιρεθεί ${what} «${g[i].title}»;\n\nΘα σβηστεί από το site όταν πατήσεις «Αποθήκευση».`)) return;
      g.splice(i, 1);
    }
    renderGallery();
  });

  $("save").addEventListener("click", async () => {
    for (const p of state.gallery) {
      if (!p.title.trim()) return toast("Κάθε φωτογραφία και βίντεο χρειάζεται τίτλο.", true);
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
        if (file.size > MAX_VIDEO_BYTES) {
          throw new Error(`Το βίντεο είναι ${Math.ceil(file.size / 1024 / 1024)} MB. Το μέγιστο είναι ${MAX_VIDEO_BYTES / 1024 / 1024} MB: κόψε το σε λιγότερα δευτερόλεπτα από το κινητό σου και ξαναδοκίμασε.`);
        }
        const ext = videoExt(file);
        const poster = await videoPoster(file).catch(() => null);
        addVideo = { file, ext, poster };
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
    if (dirty() && !confirm("Έχεις αλλαγές στη λίστα που δεν αποθηκεύτηκαν και θα χαθούν. Συνέχεια;")) return;
    const btn = $("add-btn");
    btn.disabled = true;
    btn.textContent = "Ανέβασμα…";
    const title = $("add-title").value;
    const category = $("add-category").value;
    try {
      if (addVideo) {
        const sha = await uploadVideoBlob(addVideo.file, (pct) => { btn.textContent = `Ανέβασμα… ${pct}%`; });
        btn.textContent = "Αποθήκευση…";
        await api("POST", "/gallery/video", { blob: sha, ext: addVideo.ext, poster: addVideo.poster, title, category });
      } else {
        await api("POST", "/gallery/photo", { image: addImage, title, category });
      }
      const wasVideo = !!addVideo;
      $("add-form").reset();
      resetAdd();
      await load();
      toast(wasVideo ? "Το βίντεο ανέβηκε! Θα φανεί στο site σε 1–2 λεπτά." : "Η φωτογραφία ανέβηκε! Θα φανεί στο site σε 1–2 λεπτά.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Ανέβασμα στο site";
    }
  });

  /* ---------- Videos ---------- */
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
