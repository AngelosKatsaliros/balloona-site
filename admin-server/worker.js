/**
 * Balloona admin server (Cloudflare Worker)
 *
 * Lets the /admin page of the site log in with a password and save photos
 * straight into the GitHub repository. GitHub Pages then rebuilds the site.
 *
 * Secrets to set in Cloudflare (Worker → Settings → Variables and Secrets):
 *   ADMIN_PASSWORD  the password the editor types on the /admin page
 *   GITHUB_TOKEN    fine-grained GitHub token with "Contents: Read and write"
 *                   on the balloona-site repository only
 *
 * Optional plain variables (defaults below):
 *   GITHUB_REPO      owner/name of the repository
 *   GITHUB_BRANCH    branch the site is published from
 *   ALLOWED_ORIGINS  comma-separated site origins allowed to call this server
 */

const DEFAULTS = {
  GITHUB_REPO: "AngelosKatsaliros/balloona-site",
  GITHUB_BRANCH: "main",
  ALLOWED_ORIGINS: "https://angeloskatsaliros.github.io,https://balloona.gr,https://www.balloona.gr",
};

const GALLERY_PATH = "_data/gallery.json";
const HOME_PATH = "_data/home.json";
const CATEGORIES_PATH = "_data/categories.json";
const UPLOAD_DIR = "images/uploads";
// Used until _data/categories.json exists
const DEFAULT_CATEGORIES = [
  { id: "dora", name: "Προσωποποιημένα δώρα" },
  { id: "genethlia", name: "Γενέθλια" },
  { id: "vaptiseis", name: "Βαπτίσεις & εκδηλώσεις" },
];
// The home page links to these, so they can be renamed but not deleted
const PROTECTED_CATEGORIES = ["dora", "genethlia", "vaptiseis"];
// Ids that are already used on the Δημιουργίες page or by the filters
const RESERVED_IDS = ["all", "nav", "year", "lightbox", "main", "message", "type"];
const MAX_CATEGORIES = 20;
const MAX_CATEGORY_NAME = 40;
const HOME_SLOTS = ["hero", "gift", "birthday", "baptism", "about"];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // keep in sync with admin/admin.js
const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v"];
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 1500; // keep in sync with admin/admin.js
const MAX_MEDIA = 12; // photos/videos per creation, cover included; keep in sync with admin/admin.js
const MAX_LINK = 300;
// Optional translations of titles, descriptions and category names (title_en, title_de, …); keep in sync with admin/admin.js
const LANGS = { en: { title: "αγγλικός", name: "αγγλικό", text: "αγγλική" }, de: { title: "γερμανικός", name: "γερμανικό", text: "γερμανική" } };
// A creation can link to a post about it (the «Δείτε το βίντεο» button); keep in sync with js/main.js
const SOCIAL_HOSTS = ["instagram.com", "tiktok.com", "vm.tiktok.com", "vt.tiktok.com"];
const SESSION_DAYS = 30;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const cfg = { ...DEFAULTS, ...pick(env, Object.keys(DEFAULTS)) };
    const origin = request.headers.get("Origin") || "";
    const allowed = cfg.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) {
        throw new HttpError(500, "Ο server δεν έχει ρυθμιστεί ακόμη (λείπει ADMIN_PASSWORD ή GITHUB_TOKEN).");
      }
      if (origin && !allowed.includes(origin)) throw new HttpError(403, "Μη επιτρεπτή προέλευση.");

      const url = new URL(request.url);
      const route = `${request.method} ${url.pathname.replace(/\/+$/, "") || "/"}`;
      const gh = new GitHub(env.GITHUB_TOKEN, cfg.GITHUB_REPO, cfg.GITHUB_BRANCH);
      let result;

      if (route === "GET /") result = { ok: true, service: "balloona-admin" };
      else if (route === "POST /login") result = await login(request, env);
      else {
        await requireSession(request, env);
        if (route === "GET /content") result = await getContent(gh, cfg);
        else if (route === "POST /gallery/photo") result = await addGalleryPhoto(request, gh);
        else if (route === "POST /upload/blob") result = await uploadBlob(request, gh);
        else if (route === "POST /gallery/video") result = await addGalleryVideo(request, gh);
        else if (route === "POST /gallery/media") result = await addItemMedia(request, gh);
        else if (route === "PUT /gallery") result = await saveGallery(request, gh);
        else if (route === "PUT /categories") result = await saveCategories(request, gh);
        else if (route === "POST /home/photo") result = await replaceHomePhoto(request, gh);
        else throw new HttpError(404, "Δεν βρέθηκε.");
      }
      return json(result, 200, cors);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : "Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο.";
      if (!(err instanceof HttpError)) console.error(err && err.stack ? err.stack : err);
      return json({ error: message }, status, cors);
    }
  },
};

/* ---------------- Routes ---------------- */

async function login(request, env) {
  const body = await readJson(request);
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await safeEqual(password, env.ADMIN_PASSWORD))) {
    await sleep(800); // slow down guessing
    throw new HttpError(401, "Λάθος κωδικός.");
  }
  const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ exp })));
  const sig = await hmac(env.ADMIN_PASSWORD, payload);
  return { token: `${payload}.${sig}`, expires: exp };
}

async function requireSession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new HttpError(401, "Χρειάζεται σύνδεση.");
  const expected = await hmac(env.ADMIN_PASSWORD, payload);
  if (!(await safeEqual(sig, expected))) throw new HttpError(401, "Η σύνδεση έληξε. Συνδέσου ξανά.");
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  } catch {
    throw new HttpError(401, "Χρειάζεται σύνδεση.");
  }
  if (!data.exp || data.exp < Date.now()) throw new HttpError(401, "Η σύνδεση έληξε. Συνδέσου ξανά.");
}

async function getContent(gh, cfg) {
  const [gallery, home, categories] = await Promise.all([gh.readJson(GALLERY_PATH), gh.readJson(HOME_PATH), readCategories(gh)]);
  return {
    gallery: gallery.data,
    home: home.data,
    categories: categories.data,
    categoriesVersion: categories.sha,
    version: versionOf(gallery.sha, home.sha),
    rawBase: `https://raw.githubusercontent.com/${cfg.GITHUB_REPO}/${cfg.GITHUB_BRANCH}/`,
  };
}

/** Add a new photo at the top of the gallery. Body: { image (base64), title, category, description, title_en/_de, description_en/_de, social } */
async function addGalleryPhoto(request, gh) {
  const body = await readJson(request);
  const texts = itemTexts(body, (await readCategories(gh)).data);
  const title = texts.title;
  const image = decodeImage(body.image);

  return gh.withRetry(async () => {
    const gallery = await gh.readJson(GALLERY_PATH);
    const path = newImagePath(image.ext);
    const list = [{ image: "/" + path, ...texts }, ...asList(gallery.data)];
    await gh.commit(`Προσθήκη φωτογραφίας: ${title}`, [
      { path, base64: image.base64 },
      { path: GALLERY_PATH, text: toJson(list) },
    ]);
    return { ok: true, gallery: list };
  });
}

/**
 * Step 1 of a video upload: pass a large file straight through to GitHub as a blob.
 * The body is GitHub's own blob JSON: {"content":"<base64>","encoding":"base64"}.
 * It is streamed, not parsed, so big videos fit in the Worker's limits.
 */
async function uploadBlob(request, gh) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (!length) throw new HttpError(411, "Λείπει το μέγεθος του αρχείου.");
  if (length > Math.ceil((MAX_VIDEO_BYTES * 4) / 3) + 1024) {
    throw new HttpError(413, `Το βίντεο είναι πολύ μεγάλο (μέγιστο ${MAX_VIDEO_BYTES / 1024 / 1024} MB).`);
  }
  const blob = await gh.api("/git/blobs", { method: "POST", body: request.body, headers: { "Content-Length": String(length) } });
  return { sha: blob.sha };
}

/** Step 2 of a video upload: add it at the top of the gallery. Body: { blob, ext, poster (base64 jpg), title, category, description, title_en/_de, description_en/_de, social } */
async function addGalleryVideo(request, gh) {
  const body = await readJson(request);
  const texts = itemTexts(body, (await readCategories(gh)).data);
  const title = texts.title;
  const blob = String(body.blob || "");
  if (!/^[0-9a-f]{40}$/.test(blob)) throw new HttpError(400, "Το βίντεο δεν ανέβηκε σωστά. Δοκίμασε ξανά.");
  const ext = String(body.ext || "").toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) throw new HttpError(400, "Υποστηρίζονται βίντεο MP4, MOV ή WEBM.");
  const poster = body.poster ? decodeImage(body.poster) : null;

  return gh.withRetry(async () => {
    const gallery = await gh.readJson(GALLERY_PATH);
    const videoPath = newImagePath(ext);
    const posterPath = poster ? videoPath.replace(/\.[a-z0-9]+$/, "-poster." + poster.ext) : null;
    const item = { video: "/" + videoPath, image: posterPath ? "/" + posterPath : "", ...texts };
    const list = [item, ...asList(gallery.data)];
    const files = [{ path: videoPath, sha: blob }, { path: GALLERY_PATH, text: toJson(list) }];
    if (poster) files.push({ path: posterPath, base64: poster.base64 });
    await gh.commit(`Προσθήκη βίντεο: ${title}`, files);
    return { ok: true, gallery: list };
  });
}

/**
 * Add another photo or video (another angle) to an existing creation.
 * Body: { item (path of the creation's cover), image (base64) } or { item, blob, ext, poster } for a video
 * (upload the video with /upload/blob first).
 */
async function addItemMedia(request, gh) {
  const body = await readJson(request);
  const key = String(body.item || "");
  let photo = null;
  let video = null;
  if (body.blob) {
    const blob = String(body.blob);
    if (!/^[0-9a-f]{40}$/.test(blob)) throw new HttpError(400, "Το βίντεο δεν ανέβηκε σωστά. Δοκίμασε ξανά.");
    const ext = String(body.ext || "").toLowerCase();
    if (!VIDEO_EXTS.includes(ext)) throw new HttpError(400, "Υποστηρίζονται βίντεο MP4, MOV ή WEBM.");
    video = { blob, ext, poster: body.poster ? decodeImage(body.poster) : null };
  } else {
    photo = decodeImage(body.image);
  }

  return gh.withRetry(async () => {
    const gallery = await gh.readJson(GALLERY_PATH);
    const list = asList(gallery.data).map((p) => ({ ...p }));
    const item = list.find((p) => itemKey(p) === key);
    if (!key || !item) throw new HttpError(404, "Η δημιουργία δεν βρέθηκε. Ανανέωσε τη σελίδα.");
    const more = Array.isArray(item.more) ? item.more : [];
    if (more.length + 1 >= MAX_MEDIA) throw new HttpError(400, `Έως ${MAX_MEDIA} φωτογραφίες και βίντεο ανά δημιουργία.`);

    const files = [];
    let media;
    if (video) {
      const videoPath = newImagePath(video.ext);
      const posterPath = video.poster ? videoPath.replace(/\.[a-z0-9]+$/, "-poster." + video.poster.ext) : null;
      media = { video: "/" + videoPath, image: posterPath ? "/" + posterPath : "" };
      files.push({ path: videoPath, sha: video.blob });
      if (posterPath) files.push({ path: posterPath, base64: video.poster.base64 });
    } else {
      const path = newImagePath(photo.ext);
      media = { image: "/" + path };
      files.push({ path, base64: photo.base64 });
    }
    item.more = [...more, media];
    files.push({ path: GALLERY_PATH, text: toJson(list) });
    await gh.commit(`${video ? "Νέο βίντεο" : "Νέα φωτογραφία"} για: ${item.title}`, files);
    return { ok: true, gallery: list };
  });
}

/**
 * Save the whole gallery list (edit titles/categories/descriptions, reorder, delete, and reorder or
 * remove the photos/videos inside a creation). Body: { gallery, version }
 * Each item names its media by path: the cover in image/video, the rest in more: [{image} | {video, image}].
 */
async function saveGallery(request, gh) {
  const body = await readJson(request);
  if (!Array.isArray(body.gallery)) throw new HttpError(400, "Λάθος δεδομένα.");

  const [gallery, home, categories] = await Promise.all([gh.readJson(GALLERY_PATH), gh.readJson(HOME_PATH), readCategories(gh)]);
  if (body.version && body.version !== versionOf(gallery.sha, home.sha)) {
    throw new HttpError(409, "Έγιναν αλλαγές από άλλη συσκευή. Ανανέωσε τη σελίδα και ξαναδοκίμασε.");
  }
  const current = asList(gallery.data);
  const unknown = () => new HttpError(400, "Άγνωστη φωτογραφία στη λίστα. Ανανέωσε τη σελίδα.");
  // Every photo/video already saved, by its path. Items can only use these.
  const known = new Map();
  const ownMore = new Map();
  for (const p of current) {
    for (const m of mediaOf(p)) known.set(itemKey(m), cleanMedia(m));
    ownMore.set(itemKey(p), Array.isArray(p.more) ? p.more : []);
  }
  const list = body.gallery.map((p) => {
    if (!p || typeof p !== "object") throw unknown();
    // An admin page from before multi-photo items sends no "more": keep what the item has
    const more = Array.isArray(p.more) ? p.more : p.more == null ? ownMore.get(itemKey(p)) || [] : null;
    if (!more) throw unknown();
    const keys = [itemKey(p), ...more.map(itemKey)];
    if (keys.length > MAX_MEDIA) throw new HttpError(400, `Έως ${MAX_MEDIA} φωτογραφίες και βίντεο ανά δημιουργία.`);
    const media = keys.map((k) => {
      if (!k || !known.has(k)) throw unknown();
      return known.get(k);
    });
    const [cover, ...rest] = media;
    const item = { ...(cover.video ? { video: cover.video } : {}), image: cover.image || "", ...itemTexts(p, categories.data) };
    if (rest.length) item.more = rest;
    return item;
  });

  // Delete photo/video files that nothing uses any more
  const filesOf = (p) => mediaOf(p).flatMap((m) => [m.image, m.video]).filter(Boolean);
  const stillUsed = new Set([...list.flatMap(filesOf), ...Object.values(home.data || {})]);
  const removed = [...new Set(current.flatMap(filesOf))].filter((f) => !stillUsed.has(f) && isUpload(f));

  const files = [{ path: GALLERY_PATH, text: toJson(list) }, ...removed.map((f) => ({ path: f.slice(1), remove: true }))];
  await gh.commit("Ενημέρωση Δημιουργιών", files);
  return { ok: true, gallery: list };
}

/**
 * Save the list of categories (add, rename, reorder, delete). Body: { categories: [{ id?, name, name_en?, name_de? }], version }
 * Existing ids never change, so links keep working after a rename. New ones get an id made from the name.
 */
async function saveCategories(request, gh) {
  const body = await readJson(request);
  if (!Array.isArray(body.categories)) throw new HttpError(400, "Λάθος δεδομένα.");
  const [current, gallery] = await Promise.all([readCategories(gh), gh.readJson(GALLERY_PATH)]);
  if (body.version && current.sha && body.version !== current.sha) {
    throw new HttpError(409, "Έγιναν αλλαγές από άλλη συσκευή. Ανανέωσε τη σελίδα και ξαναδοκίμασε.");
  }
  if (!body.categories.length) throw new HttpError(400, "Χρειάζεται τουλάχιστον μία κατηγορία.");
  if (body.categories.length > MAX_CATEGORIES) throw new HttpError(400, `Έως ${MAX_CATEGORIES} κατηγορίες.`);

  const existing = new Map(current.data.map((c) => [c.id, c]));
  const names = new Set();
  const ids = new Set();
  const list = body.categories.map((c) => {
    const name = String((c && c.name) || "").replace(/\s+/g, " ").trim();
    if (!name) throw new HttpError(400, "Κάθε κατηγορία χρειάζεται όνομα.");
    if (name.length > MAX_CATEGORY_NAME) throw new HttpError(400, `Το όνομα «${name.slice(0, 20)}…» είναι πολύ μεγάλο (έως ${MAX_CATEGORY_NAME} χαρακτήρες).`);
    const lower = name.toLocaleLowerCase("el");
    if (names.has(lower)) throw new HttpError(400, `Η κατηγορία «${name}» υπάρχει δύο φορές.`);
    names.add(lower);
    const id = c && existing.has(c.id) && !ids.has(c.id) ? c.id : null;
    if (id) ids.add(id);
    const out = { id, name };
    for (const [lang, word] of Object.entries(LANGS)) {
      const n = String((c && c["name_" + lang]) || "").replace(/\s+/g, " ").trim();
      if (n.length > MAX_CATEGORY_NAME) throw new HttpError(400, `Το ${word.name} όνομα «${n.slice(0, 20)}…» είναι πολύ μεγάλο (έως ${MAX_CATEGORY_NAME} χαρακτήρες).`);
      if (n) out["name_" + lang] = n;
    }
    return out;
  });
  // New categories get an id after the existing ones are known, so they never take an existing id
  for (const c of list) {
    if (c.id) continue;
    const base = slugify(c.name) || "katigoria";
    let id = base;
    for (let n = 2; ids.has(id) || existing.has(id) || RESERVED_IDS.includes(id) || id.startsWith("lb-"); n++) id = `${base}-${n}`;
    ids.add(id);
    c.id = id;
  }

  // Deleted categories must be empty, and the ones the home page links to stay
  for (const old of current.data) {
    if (ids.has(old.id)) continue;
    if (PROTECTED_CATEGORIES.includes(old.id)) {
      throw new HttpError(400, `Η κατηγορία «${old.name}» συνδέεται με την αρχική σελίδα και δεν σβήνεται. Μπορείς να της αλλάξεις όνομα.`);
    }
    const n = asList(gallery.data).filter((p) => p.category === old.id).length;
    if (n) throw new HttpError(400, `Η κατηγορία «${old.name}» έχει ${n === 1 ? "1 δημιουργία" : `${n} δημιουργίες`}. Άλλαξε πρώτα την κατηγορία τους.`);
  }

  await gh.commit("Ενημέρωση κατηγοριών", [{ path: CATEGORIES_PATH, text: toJson(list) }]);
  const saved = await readCategories(gh);
  return { ok: true, categories: saved.data, categoriesVersion: saved.sha };
}

/** Replace one of the home page photos. Body: { slot, image (base64) } */
async function replaceHomePhoto(request, gh) {
  const body = await readJson(request);
  const slot = String(body.slot || "");
  if (!HOME_SLOTS.includes(slot)) throw new HttpError(400, "Άγνωστη θέση φωτογραφίας.");
  const image = decodeImage(body.image);

  return gh.withRetry(async () => {
    const [gallery, home] = await Promise.all([gh.readJson(GALLERY_PATH), gh.readJson(HOME_PATH)]);
    const path = newImagePath(image.ext);
    const old = home.data[slot];
    const next = { ...home.data, [slot]: "/" + path };
    const stillUsed = new Set([...asList(gallery.data).flatMap(mediaOf).flatMap((m) => [m.image, m.video]), ...Object.values(next)]);
    const files = [
      { path, base64: image.base64 },
      { path: HOME_PATH, text: toJson(next) },
    ];
    if (old && !stillUsed.has(old) && isUpload(old)) files.push({ path: old.slice(1), remove: true });
    await gh.commit("Αλλαγή φωτογραφίας αρχικής σελίδας", files);
    return { ok: true, home: next };
  });
}

/* ---------------- GitHub ---------------- */

class GitHub {
  constructor(token, repo, branch) {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
  }

  async api(path, init = {}) {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "balloona-admin",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new HttpError(
        res.status === 401 || res.status === 403 ? 502 : res.status === 422 || res.status === 409 ? 409 : 502,
        res.status === 401 || res.status === 403
          ? "Ο server δεν έχει πρόσβαση στο GitHub (έλεγξε το GITHUB_TOKEN)."
          : "Το GitHub δεν απάντησε σωστά. Δοκίμασε ξανά σε λίγο."
      );
      err.github = { status: res.status, path, text: text.slice(0, 300) };
      console.error("GitHub API error", err.github);
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async readJson(path) {
    const file = await this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    const text = new TextDecoder().decode(b64decode(file.content.replace(/\n/g, "")));
    return { data: JSON.parse(text), sha: file.sha };
  }

  /** One commit with several files. files: [{path, text} | {path, base64} | {path, sha} | {path, remove: true}] */
  async commit(message, files) {
    const ref = await this.api(`/git/ref/heads/${this.branch}`);
    const parentSha = ref.object.sha;
    const parent = await this.api(`/git/commits/${parentSha}`);
    const tree = [];
    for (const f of files) {
      if (f.remove) {
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      } else if (f.sha) {
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: f.sha });
      } else {
        const blob = await this.api("/git/blobs", {
          method: "POST",
          body: JSON.stringify(f.base64 != null ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" }),
        });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
    }
    const newTree = await this.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
    const newCommit = await this.api("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: `${message}\n\nΑπό τη σελίδα διαχείρισης /admin`, tree: newTree.sha, parents: [parentSha] }),
    });
    await this.api(`/git/refs/heads/${this.branch}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha, force: false }) });
    return newCommit.sha;
  }

  /** Re-run an operation once if the branch moved while we were writing. */
  async withRetry(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        await sleep(500);
        return fn();
      }
      throw err;
    }
  }
}

/** The categories file, or the original three if it does not exist yet */
async function readCategories(gh) {
  try {
    const file = await gh.readJson(CATEGORIES_PATH);
    const data = asList(file.data).filter((c) => c && typeof c.id === "string" && typeof c.name === "string");
    return { data: data.length ? data : DEFAULT_CATEGORIES, sha: file.sha };
  } catch (err) {
    if (err.github && err.github.status === 404) return { data: DEFAULT_CATEGORIES, sha: "" };
    throw err;
  }
}

/* ---------------- Helpers ---------------- */

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Λάθος δεδομένα.");
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && typeof obj[k] === "string" && obj[k]) out[k] = obj[k];
  return out;
}

function cleanTitle(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) throw new HttpError(400, "Γράψε έναν τίτλο.");
  if (t.length > MAX_TITLE) throw new HttpError(400, `Ο τίτλος είναι πολύ μεγάλος (έως ${MAX_TITLE} χαρακτήρες).`);
  return t;
}

function cleanDescription(description, what = "Η περιγραφή") {
  const d = String(description ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (d.length > MAX_DESCRIPTION) throw new HttpError(400, `${what} είναι πολύ μεγάλη (έως ${MAX_DESCRIPTION} χαρακτήρες).`);
  return d;
}

/** An optional link to the creation's TikTok or Instagram post. Returns "" when empty. */
function cleanSocial(link) {
  let s = String(link ?? "").trim();
  if (!s) return "";
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { u = null; }
  const host = u ? u.hostname.toLowerCase().replace(/^(www|m)\./, "") : "";
  if (!u || !/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !SOCIAL_HOSTS.includes(host)) {
    throw new HttpError(400, "Ο σύνδεσμος πρέπει να είναι ανάρτηση από TikTok ή Instagram (π.χ. https://www.tiktok.com/@balloona.pop/video/…).");
  }
  u.protocol = "https:";
  u.hash = "";
  const out = u.href;
  if (out.length > MAX_LINK) throw new HttpError(400, "Ο σύνδεσμος είναι πολύ μεγάλος.");
  return out;
}

/** Title, category and description of a creation; the translations are optional and left out when empty */
function itemTexts(src, categories) {
  const out = { title: cleanTitle(src.title) };
  for (const [lang, word] of Object.entries(LANGS)) {
    const t = String(src["title_" + lang] || "").replace(/\s+/g, " ").trim();
    if (t.length > MAX_TITLE) throw new HttpError(400, `Ο ${word.title} τίτλος είναι πολύ μεγάλος (έως ${MAX_TITLE} χαρακτήρες).`);
    if (t) out["title_" + lang] = t;
  }
  out.category = cleanCategory(src.category, categories);
  const description = cleanDescription(src.description);
  if (description) out.description = description;
  for (const [lang, word] of Object.entries(LANGS)) {
    const d = cleanDescription(src["description_" + lang], `Η ${word.text} περιγραφή`);
    if (d) out["description_" + lang] = d;
  }
  const social = cleanSocial(src.social);
  if (social) out.social = social;
  return out;
}

function cleanCategory(category, categories) {
  const c = String(category || "");
  if (!categories.some((x) => x.id === c)) throw new HttpError(400, "Διάλεξε κατηγορία.");
  return c;
}

/** Latin letters for a web address, e.g. "Γενέθλια" -> "genethlia" */
function slugify(name) {
  const GREEK = {
    α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x",
    ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
  };
  return String(name)
    .toLocaleLowerCase("el")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ου/g, "ou")
    .replace(/[α-ω]/g, (ch) => GREEK[ch] || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

function decodeImage(dataUrlOrBase64) {
  const s = String(dataUrlOrBase64 || "");
  const base64 = s.includes(",") ? s.slice(s.indexOf(",") + 1) : s;
  if (!base64) throw new HttpError(400, "Διάλεξε μια φωτογραφία.");
  if ((base64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(400, "Η φωτογραφία είναι πολύ μεγάλη.");
  // Only decode the first bytes to check the file type (keeps CPU time low on the free plan)
  let bytes;
  try {
    bytes = b64decode(base64.slice(0, 24));
  } catch {
    throw new HttpError(400, "Η φωτογραφία δεν διαβάστηκε.");
  }
  let ext = null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) ext = "jpg";
  else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ext = "png";
  else if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") ext = "webp";
  if (!ext) throw new HttpError(400, "Υποστηρίζονται μόνο φωτογραφίες JPG, PNG ή WEBP.");
  return { base64, ext };
}

function newImagePath(ext) {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${UPLOAD_DIR}/${stamp}-${rand}.${ext}`;
}

function isUpload(img) {
  return typeof img === "string" && img.startsWith(`/${UPLOAD_DIR}/`) && !img.includes("..");
}

/** The path that identifies a creation (its cover) or one of its photos/videos */
function itemKey(p) {
  return (p && typeof p === "object" && (p.video || p.image)) || "";
}

/** All photos/videos of a creation: the cover first, then the extra angles */
function mediaOf(p) {
  return [p, ...(Array.isArray(p.more) ? p.more : [])].filter((m) => m && typeof m === "object");
}

function cleanMedia(m) {
  return m.video ? { video: m.video, image: m.image || "" } : { image: m.image };
}

function asList(data) {
  return Array.isArray(data) ? data : [];
}

function toJson(data) {
  return JSON.stringify(data, null, 2) + "\n";
}

function versionOf(...shas) {
  return shas.join(":");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hmac(key, message) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return b64urlEncode(new Uint8Array(sig));
}

async function safeEqual(a, b) {
  // Compare hashes so the comparison time does not depend on where strings differ
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(String(a))), crypto.subtle.digest("SHA-256", enc.encode(String(b)))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function b64decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s) {
  return b64decode(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
}
