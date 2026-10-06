/* =========================================================
   Nos sons — logique de l'appli
   Organisation du fichier :
     1. Réglages & utilitaires
     2. Spotify (lecture des liens, pochettes)
     3. Données (Supabase)
     4. Écrans : connexion, tuto, aujourd'hui, nos jours
     5. Actions (clics, saisie, envoi)
   ========================================================= */
(() => {
  "use strict";

  /* ---------- 1. Réglages & utilitaires ---------- */

  const CFG = window.CONFIG || {};
  const APP_NAME = CFG.APP_NAME || "Nos sons";
  const app = document.getElementById("app");

  // Couleurs proposées dans le tuto (modifiables librement)
  const COLORS = [
    { hex: "#3B5BFF", label: "Bleu" },
    { hex: "#FF4F8B", label: "Rose" },
    { hex: "#F7821B", label: "Orange" },
    { hex: "#10A37F", label: "Vert" },
    { hex: "#8B5CF6", label: "Violet" },
  ];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const fmtLong = (k) => fromKey(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  const colorOf = (p) => (p && p.color) || "#3B5BFF";
  const $ = (sel, root = document) => root.querySelector(sel);

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function frError(e) {
    const m = String((e && e.message) || "").toLowerCase();
    if (m.includes("invalid login")) return "Email ou mot de passe incorrect.";
    if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet email. Connecte-toi.";
    if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("signups are disabled")) return "Les inscriptions sont fermées sur ce site.";
    if (m.includes("email not confirmed")) return "Confirme ton email avec le lien reçu, puis reconnecte-toi.";
    if (m.includes("password")) return "Le mot de passe doit faire au moins 6 caractères.";
    if (m.includes("failed to fetch") || m.includes("network")) return "Connexion impossible. Vérifie ta connexion internet.";
    return (e && e.message) || "Une erreur est survenue.";
  }

  /* ---------- Vérification de la config ---------- */

  const configured =
    CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("XXXX") &&
    CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("XXXX");

  if (!configured || !window.supabase) {
    app.innerHTML = `
      <main class="screen-msg">
        <div class="mark" aria-hidden="true"><span></span><span></span></div>
        <h1>Presque prêt</h1>
        <p class="lead">${!window.supabase
          ? "La bibliothèque Supabase n'a pas pu se charger. Vérifie ta connexion internet."
          : "Ouvre le fichier <code>config.js</code> et colle l'URL et la clé de ton projet Supabase (étape 4 du README)."}</p>
      </main>`;
    return;
  }

  // L'adresse est nettoyée au cas où elle aurait été copiée avec /rest/v1 ou un / final
  const SB_URL = CFG.SUPABASE_URL.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
  const sb = window.supabase.createClient(SB_URL, CFG.SUPABASE_ANON_KEY.trim());

  // Service worker : nécessaire pour recevoir les notifications
  const swPromise = "serviceWorker" in navigator
    ? navigator.serviceWorker.register("sw.js").catch((e) => { console.error(e); return null; })
    : Promise.resolve(null);

  const state = {
    session: null,
    people: [],          // les deux profils, dans l'ordre d'inscription
    me: null,
    partner: null,
    songs: [],
    photos: {},          // chemin de la photo -> URL temporaire
    view: "today",
    month: startOfMonth(new Date()),
    onboard: { step: 0, name: "", color: null, again: false },
    // brouillon du son en cours
    editing: false,
    draft: null,
    draftInput: "",
    draftNote: "",
    photoFile: null,
    photoPreview: null,
    keepPhotoPath: null,
    dirty: false,
    busy: false,
    revealId: null,
    push: "unsupported",  // état des notifications sur cet appareil
  };

  /* ---------- 2. Spotify ---------- */

  function extractSpotifyUrl(text) {
    const s = String(text || "");
    const m = s.match(/https?:\/\/(?:open\.spotify\.com|spotify\.link)\/[^\s"'<>]+/i);
    if (m) return m[0];
    const uri = s.match(/spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)/);
    if (uri) return `https://open.spotify.com/${uri[1]}/${uri[2]}`;
    return null;
  }

  function spotifyParts(url) {
    const m = String(url || "").match(/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/i);
    return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
  }

  const embedUrl = (url) => {
    const p = spotifyParts(url);
    return p ? `https://open.spotify.com/embed/${p.type}/${p.id}` : null;
  };

  // oEmbed : API publique de Spotify, sans clé, qui renvoie titre + pochette
  async function lookupSpotify(url) {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error("oembed");
    const j = await res.json();
    const parts = spotifyParts(url) || spotifyParts(j.iframe_url) || spotifyParts(j.html);
    if (!parts) throw new Error("parse");
    return {
      url: `https://open.spotify.com/${parts.type}/${parts.id}`,
      title: j.title || "Morceau Spotify",
      cover: j.thumbnail_url || null,
    };
  }

  /* ---------- 3. Données ---------- */

  async function loadProfiles() {
    const { data, error } = await sb.from("profiles").select("*").order("created_at");
    if (error) throw error;
    const uid = state.session.user.id;
    state.people = data || [];
    state.me = state.people.find((p) => p.id === uid) || null;
    state.partner = state.people.find((p) => p.id !== uid) || null;
  }

  async function loadSongs() {
    const { data, error } = await sb.from("songs").select("*").order("day", { ascending: false }).limit(3000);
    if (error) throw error;
    state.songs = data || [];
    const paths = state.songs.map((s) => s.photo_path).filter((p) => p && !state.photos[p]);
    if (paths.length) {
      const { data: signed } = await sb.storage.from("photos").createSignedUrls(paths, 60 * 60 * 24);
      (signed || []).forEach((s) => { if (s.signedUrl) state.photos[s.path] = s.signedUrl; });
    }
  }

  const findSong = (uid, day) => state.songs.find((s) => s.user_id === uid && s.day === day);
  const personOf = (uid) => state.people.find((p) => p.id === uid);

  // Le son de l'autre reste caché aujourd'hui tant que tu n'as pas posté le tien
  function canSee(song) {
    if (!song) return false;
    if (song.user_id === state.me.id) return true;
    if (song.day < dayKey()) return true;
    return !!findSong(state.me.id, song.day);
  }

  function sharedDays() {
    const by = {};
    for (const s of state.songs) (by[s.day] = by[s.day] || new Set()).add(s.user_id);
    return new Set(Object.keys(by).filter((k) => by[k].size >= 2));
  }

  function streak() {
    const both = sharedDays();
    let d = new Date();
    if (!both.has(dayKey(d))) d = addDays(d, -1);
    let n = 0;
    while (both.has(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  async function compressImage(file, max = 1400, quality = 0.82) {
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("Cette image ne peut pas être lue. Essaie une autre photo."));
        img.src = URL.createObjectURL(file);
      });
    }
    const s = Math.min(1, max / Math.max(src.width, src.height));
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * s);
    c.height = Math.round(src.height * s);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("Cette image ne peut pas être lue."))), "image/jpeg", quality));
  }

  /* ---------- Notifications ---------- */

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function b64ToBytes(b64) {
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  // "on" | "off" | "denied" | "ios-install" | "unsupported" | "not-configured"
  async function pushStatus() {
    if (!CFG.VAPID_PUBLIC_KEY) return "not-configured";
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return isIOS && !isStandalone ? "ios-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    const reg = await swPromise;
    if (!reg) return "unsupported";
    try {
      const sub = await reg.pushManager.getSubscription();
      return sub ? "on" : "off";
    } catch {
      return "unsupported";
    }
  }

  async function enablePush(btn) {
    if (btn) btn.disabled = true;
    try {
      // Doit être appelé en premier, directement après le toucher (exigence d'iOS)
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast(perm === "denied" ? "Notifications bloquées : autorise-les dans les réglages du téléphone." : "Notifications non activées.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(CFG.VAPID_PUBLIC_KEY.trim()),
        });
      }
      const j = sub.toJSON();
      const { error } = await sb.from("push_subscriptions").upsert(
        { user_id: state.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
        { onConflict: "endpoint" });
      if (error) throw error;
      toast("Notifications activées");
    } catch (e) {
      console.error(e);
      toast(frError(e));
    } finally {
      state.push = await pushStatus();
      refreshAfterPush();
    }
  }

  async function disablePush() {
    try {
      const reg = await swPromise;
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      toast("Notifications désactivées sur cet appareil");
    } catch (e) {
      console.error(e);
      toast(frError(e));
    } finally {
      state.push = await pushStatus();
      refreshAfterPush();
    }
  }

  async function testPush(btn) {
    btn.disabled = true;
    try {
      const { data, error } = await sb.functions.invoke("notify", { body: { type: "test" } });
      if (error) throw error;
      toast(data && data.sent ? "Notif de test envoyée" : "Aucun appareil trouvé : désactive puis réactive les notifications.");
    } catch (e) {
      console.error(e);
      toast("La fonction notify ne répond pas. Vérifie l'étape 3 du README (notifications).");
    } finally {
      btn.disabled = false;
    }
  }

  function refreshAfterPush() {
    const d = document.getElementById("sheet");
    if (d && d.open) d.innerHTML = `<div class="sheet-inner">${menuHtml()}</div>`;
    renderApp();
  }

  const bannerKey = "nos-sons:notif-banner";
  function bannerDismissed() { try { return localStorage.getItem(bannerKey) === "1"; } catch { return false; } }

  function pushBanner() {
    if (bannerDismissed()) return "";
    const other = state.partner ? esc(state.partner.name) : "l'autre";
    if (state.push === "off") {
      return `
        <aside class="banner" style="--c:${colorOf(state.me)}">
          <p>Active les notifications pour savoir quand ${other} poste son son, avec un petit rappel le soir si tu n'as pas encore posté.</p>
          <div class="actions">
            <button class="btn small" data-action="push-on">Activer</button>
            <button class="btn ghost small" data-action="push-dismiss">Plus tard</button>
          </div>
        </aside>`;
    }
    if (state.push === "ios-install") {
      return `
        <aside class="banner" style="--c:${colorOf(state.me)}">
          <p>Sur iPhone, les notifications marchent seulement depuis l'écran d'accueil&nbsp;: dans Safari, touche Partager puis « Sur l'écran d'accueil », et ouvre l'appli depuis là.</p>
          <div class="actions"><button class="btn ghost small" data-action="push-dismiss">Compris</button></div>
        </aside>`;
    }
    return "";
  }

  function menuHtml() {
    const notif = {
      on: `<p class="menu-note">Activées sur cet appareil.</p>
           <button class="btn ghost" data-action="push-test">Envoyer une notif de test</button>
           <button class="btn ghost" data-action="push-off">Désactiver sur cet appareil</button>`,
      off: `<p class="menu-note">Désactivées sur cet appareil.</p>
            <button class="btn ghost" data-action="push-on">Activer les notifications</button>`,
      denied: `<p class="menu-note">Bloquées par le téléphone. Pour les réactiver, autorise les notifications pour ce site dans les réglages du navigateur (sur iPhone : Réglages &gt; Notifications &gt; ${esc(APP_NAME)}).</p>`,
      "ios-install": `<p class="menu-note">Sur iPhone, ajoute d'abord l'appli à l'écran d'accueil, puis ouvre-la depuis là pour pouvoir les activer.</p>`,
      "not-configured": `<p class="menu-note">Pas encore configurées : ajoute VAPID_PUBLIC_KEY dans config.js (voir le README).</p>`,
      unsupported: `<p class="menu-note">Ce navigateur ne gère pas les notifications.</p>`,
    }[state.push] || "";
    return `
      <h2>${esc(state.me.name)}</h2>
      <div class="menu-list">
        <h3>Notifications</h3>
        ${notif}
        <h3>Appli</h3>
        <button class="btn ghost" data-action="tuto">Revoir le tuto</button>
        <button class="btn ghost" data-action="share-site">Partager le lien du site</button>
        <button class="btn ghost danger" data-action="logout">Se déconnecter</button>
        <button class="btn" data-action="close-sheet">Fermer</button>
      </div>`;
  }

  /* ---------- Routage ---------- */

  let routing = false, pending = false;
  async function route() {
    if (routing) { pending = true; return; }
    routing = true;
    try {
      if (!state.session) { renderAuth(); return; }
      await loadProfiles();
      if (!state.me || state.onboard.again) { renderOnboarding(); return; }
      await loadSongs();
      state.push = await pushStatus();
      renderApp();
    } catch (e) {
      console.error(e);
      renderError(e);
    } finally {
      routing = false;
      if (pending) { pending = false; route(); }
    }
  }

  sb.auth.onAuthStateChange((event, session) => {
    state.session = session;
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    setTimeout(route, 0);
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !state.me || state.onboard.again || state.dirty) return;
    try { await loadSongs(); renderApp(); } catch (e) { console.error(e); }
  });

  /* ---------- 4a. Connexion ---------- */

  function renderAuth(msg = "") {
    app.innerHTML = `
      <main class="auth">
        <div class="mark" aria-hidden="true"><span></span><span></span></div>
        <h1>${esc(APP_NAME)}</h1>
        <p class="lead">Un son chacun, chaque jour.</p>
        <form id="auth-form" novalidate>
          <div class="field"><label for="email">Email</label>
            <input id="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="pw">Mot de passe</label>
            <input id="pw" type="password" autocomplete="current-password" minlength="6" required></div>
          <p class="msg" role="alert">${esc(msg)}</p>
          <button class="btn" type="submit" value="login">Se connecter</button>
          <button class="btn ghost" type="submit" value="signup">Créer mon compte</button>
        </form>
      </main>`;

    $("#auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const mode = (e.submitter && e.submitter.value) || "login";
      const email = $("#email").value.trim();
      const password = $("#pw").value;
      const msgEl = $(".msg");
      if (!email || password.length < 6) {
        msgEl.textContent = "Entre ton email et un mot de passe d'au moins 6 caractères.";
        return;
      }
      e.target.querySelectorAll("button").forEach((b) => (b.disabled = true));
      msgEl.textContent = "";
      try {
        if (mode === "signup") {
          const { data, error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          if (!data.session) msgEl.textContent = "Compte créé. Ouvre le lien reçu par email pour le confirmer, puis connecte-toi.";
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (err) {
        msgEl.textContent = frError(err);
      } finally {
        e.target.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    });
  }

  function renderError(e) {
    app.innerHTML = `
      <main class="screen-msg">
        <h1>Oups</h1>
        <p class="lead">${esc(frError(e))}</p>
        <div class="menu-list">
          <button class="btn" data-action="retry">Réessayer</button>
          <button class="btn ghost" data-action="logout">Se déconnecter</button>
        </div>
      </main>`;
  }

  /* ---------- 4b. Tuto de première connexion ---------- */

  const OB_STEPS = 4;

  function renderOnboarding() {
    const o = state.onboard;
    if (!o.color) {
      const taken = state.partner && state.partner.color;
      o.color = (state.me && state.me.color) || COLORS.find((c) => c.hex !== taken).hex;
    }
    if (!o.name && state.me) o.name = state.me.name;
    const other = state.partner ? esc(state.partner.name) : "l'autre";
    const otherColor = state.partner ? colorOf(state.partner) : (o.color === "#FF4F8B" ? "#3B5BFF" : "#FF4F8B");

    const steps = [
      `<h1>Salut ! Comment tu t'appelles&nbsp;?</h1>
       <p class="lead">C'est le nom que ${other} verra à côté de tes sons.</p>
       <div class="field"><label for="ob-name">Prénom</label>
         <input id="ob-name" maxlength="30" autocomplete="given-name" value="${esc(o.name)}"></div>
       <fieldset class="swatches"><legend>Ta couleur</legend>
         ${COLORS.map((c) => `
           <label class="swatch" style="--c:${c.hex}">
             <input type="radio" name="ob-color" value="${c.hex}" ${c.hex === o.color ? "checked" : ""}>
             ${c.label}${state.partner && state.partner.color === c.hex ? ` (celle de ${other})` : ""}
           </label>`).join("")}
       </fieldset>
       <p class="msg" role="alert"></p>`,

      `<div class="demo" aria-hidden="true">
         <div class="mini" style="--c:${o.color};--g:linear-gradient(135deg,#FFB86B,#FF4F8B 60%,#8B5CF6)"><i></i></div>
         <div class="mini blurred" style="--c:${otherColor};--g:linear-gradient(160deg,#5EEAD4,#3B5BFF 55%,#1F1838)"><i></i></div>
       </div>
       <h1>Un son chacun, chaque jour</h1>
       <p class="lead">Le matin, le soir, peu importe le moment&nbsp;: choisis un morceau pour ${other}. Tu peux y ajouter un petit mot et une photo.</p>
       <p class="lead">Son son reste flouté tant que tu n'as pas posté le tien. Pas de triche&nbsp;!</p>`,

      `<h1>Partager un son depuis Spotify</h1>
       <p class="lead">Ça prend dix secondes&nbsp;:</p>
       <ol class="steps">
         <li>Dans Spotify, ouvre le morceau et touche les trois petits points <strong>⋯</strong>.</li>
         <li>Touche <strong>Partager</strong>, puis <strong>Copier le lien</strong>.</li>
         <li>Reviens ici et touche <strong>Coller</strong> dans « Ton son du jour ». La pochette apparaît toute seule.</li>
       </ol>`,

      `<h1>Mets l'appli sur ton écran d'accueil</h1>
       <p class="lead">Elle s'ouvrira comme une vraie appli, sans passer par le navigateur.</p>
       <div class="platform"><strong>Sur iPhone</strong>
         <p>Dans Safari, touche le bouton Partager (le carré avec une flèche), puis « Sur l'écran d'accueil ».</p></div>
       <div class="platform"><strong>Sur Android</strong>
         <p>Dans Chrome, touche le menu ⋮, puis « Ajouter à l'écran d'accueil ».</p></div>`,
    ];

    const last = o.step === OB_STEPS - 1;
    app.innerHTML = `
      <main class="onboard" style="--c:${o.color}">
        <div class="ob-progress" aria-hidden="true">${Array.from({ length: OB_STEPS }, (_, i) => `<span class="${i <= o.step ? "on" : ""}"></span>`).join("")}</div>
        <p class="ob-count">Étape ${o.step + 1} sur ${OB_STEPS}</p>
        ${steps[o.step]}
        <div class="ob-foot">
          ${o.step > 0 ? `<button class="btn ghost" data-action="ob-back">Retour</button>` : ""}
          <button class="btn" data-action="${last ? "ob-finish" : "ob-next"}">${last ? "C'est parti" : "Continuer"}</button>
        </div>
      </main>`;
    const input = $("#ob-name");
    if (input && !o.name) input.focus();
  }

  function readOnboardStep() {
    const o = state.onboard;
    if (o.step !== 0) return true;
    o.name = ($("#ob-name").value || "").trim();
    const checked = $('input[name="ob-color"]:checked');
    if (checked) o.color = checked.value;
    if (!o.name) { $(".msg").textContent = "Écris ton prénom pour continuer."; $("#ob-name").focus(); return false; }
    return true;
  }

  async function finishOnboarding(btn) {
    const o = state.onboard;
    btn.disabled = true;
    try {
      const { error } = await sb.from("profiles").upsert({ id: state.session.user.id, name: o.name, color: o.color });
      if (error) throw error;
      state.onboard = { step: 0, name: "", color: null, again: false };
      await route();
      toast("Bienvenue !");
    } catch (e) {
      btn.disabled = false;
      toast(frError(e));
    }
  }

  /* ---------- 4c. Appli : aujourd'hui ---------- */

  function renderApp() {
    const today = dayKey();
    app.innerHTML = `
      ${state.view === "today" ? viewToday(today) : viewHistory(today)}
      <nav class="tabs" aria-label="Navigation">
        <button class="tab" data-action="view" data-view="today" ${state.view === "today" ? 'aria-current="page"' : ""}>Aujourd'hui</button>
        <button class="tab" data-action="view" data-view="history" ${state.view === "history" ? 'aria-current="page"' : ""}>Nos jours</button>
      </nav>`;
    state.revealId = null;
  }

  function header(title) {
    const me = state.me;
    return `
      <header class="top">
        <h1>${esc(title)}</h1>
        <button class="avatar" style="--c:${colorOf(me)}" data-action="menu" aria-label="Menu de ${esc(me.name)}">${esc(me.name.charAt(0).toUpperCase())}</button>
      </header>`;
  }

  function viewToday(today) {
    const me = state.me, partner = state.partner;
    const mine = findSong(me.id, today);
    const theirs = partner && findSong(partner.id, today);
    const n = streak();

    let mineBlock;
    if (mine && !state.editing) {
      mineBlock = polaroid(mine, me, "mine",
        `<button class="btn ghost small" data-action="edit">Changer mon son</button>`);
    } else {
      mineBlock = composer();
    }

    let theirsBlock;
    if (!partner) {
      theirsBlock = `
        <article class="polaroid theirs empty" style="--c:#FF4F8B">
          <div class="cover"><span class="ph">Envoie le lien de ce site à ta moitié&nbsp;: son son apparaîtra ici dès que son compte sera créé.</span></div>
          <div class="actions"><button class="btn" data-action="share-site">Partager le lien du site</button></div>
        </article>`;
    } else if (!theirs) {
      theirsBlock = `
        <article class="polaroid theirs empty" style="--c:${colorOf(partner)}">
          <div class="p-head"><span class="who">${esc(partner.name)}</span></div>
          <div class="cover"><span class="ph">${esc(partner.name)} n'a pas encore choisi son son aujourd'hui.</span></div>
        </article>`;
    } else if (!canSee(theirs)) {
      theirsBlock = `
        <article class="polaroid theirs" style="--c:${colorOf(partner)}">
          <div class="p-head"><span class="who">${esc(partner.name)}</span><time>posté à ${fmtTime(theirs.created_at)}</time></div>
          <div class="cover blur">
            ${theirs.cover_url ? `<img src="${esc(theirs.cover_url)}" alt="">` : ""}
            <span class="veil">Poste ton son pour découvrir celui de ${esc(partner.name)}</span>
          </div>
        </article>`;
    } else {
      theirsBlock = polaroid(theirs, partner, `theirs ${state.revealId === theirs.id ? "reveal" : ""}`);
    }

    return `
      ${header(fmtLong(today))}
      ${n > 0 ? `<p class="streak"><strong>${n}</strong> ${n > 1 ? "jours" : "jour"} d'affilée tous les deux</p>` : ""}
      ${pushBanner()}
      <section class="board">${mineBlock}${theirsBlock}</section>`;
  }

  function polaroid(song, person, cls = "", extraActions = "") {
    const photo = song.photo_path && state.photos[song.photo_path];
    return `
      <article class="polaroid ${cls}" style="--c:${colorOf(person)}">
        <div class="p-head"><span class="who">${esc(person ? person.name : "?")}</span><time>${fmtTime(song.created_at)}</time></div>
        <div class="cover">${song.cover_url
          ? `<img src="${esc(song.cover_url)}" alt="Pochette : ${esc(song.title || "")}" loading="lazy">`
          : `<span class="ph big-note" aria-hidden="true">♪</span>`}</div>
        <p class="title">${esc(song.title || "Morceau Spotify")}</p>
        ${song.note ? `<p class="note">${esc(song.note)}</p>` : ""}
        ${photo ? `<img class="photo" src="${esc(photo)}" alt="Photo de ${esc(person ? person.name : "")}" loading="lazy">` : ""}
        <div class="player" id="player-${song.id}"></div>
        <div class="actions">
          <button class="btn small" data-action="play" data-id="${song.id}">Écouter ici</button>
          <a class="btn ghost small" href="${esc(song.spotify_url)}" target="_blank" rel="noopener">Ouvrir dans Spotify</a>
          ${extraActions}
        </div>
      </article>`;
  }

  function composer() {
    const d = state.draft;
    const photoSrc = state.photoPreview || (state.keepPhotoPath && state.photos[state.keepPhotoPath]);
    const canPaste = !!(navigator.clipboard && navigator.clipboard.readText);
    return `
      <article class="polaroid mine composer" style="--c:${colorOf(state.me)}">
        <div class="p-head"><span class="who">Ton son du jour</span></div>
        <div class="cover" id="draft-cover">${coverInner(d)}</div>
        <p class="title" id="draft-title">${d ? esc(d.title) : ""}</p>
        <div class="field">
          <label for="link">Lien Spotify</label>
          <div class="row">
            <input id="link" inputmode="url" autocomplete="off" placeholder="https://open.spotify.com/track/…" value="${esc(state.draftInput)}">
            ${canPaste ? `<button class="btn ghost" data-action="paste">Coller</button>` : ""}
          </div>
          <p class="hint" id="link-hint" role="status"></p>
        </div>
        <div class="field">
          <label for="note">Un petit mot (facultatif)</label>
          <textarea id="note" rows="2" maxlength="280" placeholder="Pourquoi ce son aujourd'hui ?">${esc(state.draftNote)}</textarea>
        </div>
        <div class="photo-row">
          ${photoSrc ? `<img class="photo-thumb" src="${esc(photoSrc)}" alt="Photo choisie">
            <button class="btn ghost small" data-action="remove-photo">Retirer la photo</button>` : ""}
          <label class="btn ghost small" for="photo">${photoSrc ? "Changer la photo" : "Ajouter une photo"}</label>
          <input id="photo" type="file" accept="image/*" hidden>
        </div>
        <div class="actions">
          <button class="btn" data-action="send" id="send-btn" ${d ? "" : "disabled"}>Envoyer mon son</button>
          ${state.editing ? `<button class="btn ghost" data-action="cancel-edit">Annuler</button>` : ""}
        </div>
      </article>`;
  }

  function coverInner(d) {
    if (d && d.cover) return `<img src="${esc(d.cover)}" alt="Pochette : ${esc(d.title)}">`;
    if (d) return `<span class="ph big-note" aria-hidden="true">♪</span>`;
    return `<span class="ph">La pochette apparaîtra ici quand tu colleras un lien Spotify.</span>`;
  }

  function updateDraftUI(hint = "") {
    const cover = $("#draft-cover"), title = $("#draft-title"), h = $("#link-hint"), btn = $("#send-btn");
    if (!cover) return;
    cover.innerHTML = coverInner(state.draft);
    title.textContent = state.draft ? state.draft.title : "";
    h.textContent = hint;
    btn.disabled = !state.draft;
  }

  let lookupTimer, lookupSeq = 0;
  async function runLookup() {
    const seq = ++lookupSeq;
    const url = extractSpotifyUrl(state.draftInput);
    if (!url) {
      state.draft = null;
      updateDraftUI(state.draftInput.trim() ? "Ce lien ne ressemble pas à un lien Spotify." : "");
      return;
    }
    state.draft = null;
    updateDraftUI("Recherche du morceau…");
    try {
      const info = await lookupSpotify(url);
      if (seq !== lookupSeq) return;
      state.draft = info;
      updateDraftUI("");
    } catch {
      if (seq !== lookupSeq) return;
      const p = spotifyParts(url);
      if (p) {
        state.draft = { url: `https://open.spotify.com/${p.type}/${p.id}`, title: "Morceau Spotify", cover: null };
        updateDraftUI("La pochette n'a pas pu être chargée, mais le lien fonctionne.");
      } else {
        state.draft = null;
        updateDraftUI("Ce lien n'a pas pu être lu. Dans Spotify, utilise Partager > Copier le lien.");
      }
    }
  }

  function resetDraft() {
    if (state.photoPreview) URL.revokeObjectURL(state.photoPreview);
    Object.assign(state, {
      draft: null, draftInput: "", draftNote: "", photoFile: null,
      photoPreview: null, keepPhotoPath: null, dirty: false,
    });
  }

  /* ---------- 4d. Appli : nos jours ---------- */

  function viewHistory(today) {
    const m = state.month, y = m.getFullYear(), mo = m.getMonth();
    const label = m.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
    const count = new Date(y, mo + 1, 0).getDate();
    const isCurrent = y === new Date().getFullYear() && mo === new Date().getMonth();
    const [pA, pB] = state.people;

    let cells = "";
    for (let i = 0; i < offset; i++) cells += `<span class="cell out" aria-hidden="true"></span>`;
    for (let d = 1; d <= count; d++) {
      const key = `${y}-${pad(mo + 1)}-${pad(d)}`;
      const a = pA && findSong(pA.id, key), b = pB && findSong(pB.id, key);
      const va = canSee(a) ? a : null, vb = canSee(b) ? b : null;
      const cls = ["cell"];
      if (key === today) cls.push("today");
      if (key > today) cls.push("future");
      let inner = "", style = "";
      if (va && vb) {
        cls.push("has", "both");
        inner = `${imgOrTag(va, pA, "a")}${imgOrTag(vb, pB, "b")}`;
      } else if (va || vb) {
        const s = va || vb, p = va ? pA : pB;
        cls.push("has", "solo");
        style = `style="--c:${colorOf(p)}"`;
        inner = imgOrTag(s, p, "");
      }
      const any = !!(a || b);
      const desc = va && vb ? ", vos deux sons" : va || vb ? ", un son" : "";
      cells += `<button class="${cls.join(" ")}" ${style} data-action="day" data-day="${key}" ${any ? "" : "disabled"} aria-label="${fmtLong(key)}${desc}"><span class="n">${d}</span>${inner}</button>`;
    }

    const both = sharedDays().size;
    const total = state.songs.length;

    return `
      ${header("Nos jours")}
      <div class="cal-head">
        <button class="btn ghost" data-action="month" data-delta="-1" aria-label="Mois précédent">‹</button>
        <h2>${esc(label)}</h2>
        <button class="btn ghost" data-action="month" data-delta="1" aria-label="Mois suivant" ${isCurrent ? "disabled" : ""}>›</button>
      </div>
      <div class="cal">
        ${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span class="dow" aria-hidden="true">${d}</span>`).join("")}
        ${cells}
      </div>
      <div class="legend">${state.people.map((p) => `<span style="--c:${colorOf(p)}">${esc(p.name)}</span>`).join("")}</div>
      <div class="stats">
        <div><strong>${streak()}</strong><span>jours d'affilée</span></div>
        <div><strong>${both}</strong><span>jours partagés</span></div>
        <div><strong>${total}</strong><span>sons envoyés</span></div>
      </div>`;
  }

  function imgOrTag(song, person, cls) {
    return song.cover_url
      ? `<img class="${cls}" src="${esc(song.cover_url)}" alt="" loading="lazy">`
      : `<span class="tag ${cls}" style="--c:${colorOf(person)}" aria-hidden="true">♪</span>`;
  }

  function openDay(key) {
    const blocks = state.people.map((p) => {
      const s = findSong(p.id, key);
      if (s && canSee(s)) return polaroid(s, p);
      if (s) return `<article class="polaroid empty" style="--c:${colorOf(p)}"><div class="p-head"><span class="who">${esc(p.name)}</span></div><div class="cover"><span class="ph">Poste ton son du jour pour découvrir celui-ci.</span></div></article>`;
      return `<article class="polaroid empty" style="--c:${colorOf(p)}"><div class="p-head"><span class="who">${esc(p.name)}</span></div><div class="cover"><span class="ph">Pas de son ce jour-là.</span></div></article>`;
    }).join("");
    openSheet(`<h2>${esc(fmtLong(key))}</h2><section class="board">${blocks}</section>
      <div class="actions"><button class="btn ghost" data-action="close-sheet">Fermer</button></div>`);
  }

  function openSheet(html) {
    let d = document.getElementById("sheet");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "sheet";
      d.className = "sheet";
      document.body.appendChild(d);
      d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
      d.addEventListener("click", onClick);
    }
    d.innerHTML = `<div class="sheet-inner">${html}</div>`;
    d.showModal();
  }
  const closeSheet = () => { const d = document.getElementById("sheet"); if (d && d.open) d.close(); };

  /* ---------- 5. Actions ---------- */

  async function send(btn) {
    if (!state.draft || state.busy) return;
    state.busy = true;
    btn.disabled = true;
    btn.textContent = "Envoi…";
    const uid = state.me.id, day = dayKey();
    const existing = findSong(uid, day);
    const partnerSong = state.partner && findSong(state.partner.id, day);
    const wasHidden = partnerSong && !existing;
    try {
      let photo_path = state.keepPhotoPath || null;
      if (state.photoFile) {
        const blob = await compressImage(state.photoFile);
        const path = `${uid}/${day}-${Date.now()}.jpg`;
        const { error } = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        photo_path = path;
      }
      const row = {
        user_id: uid,
        day,
        spotify_url: state.draft.url,
        title: state.draft.title,
        cover_url: state.draft.cover,
        note: state.draftNote.trim() || null,
        photo_path,
      };
      const { error } = await sb.from("songs").upsert(row, { onConflict: "user_id,day" });
      if (error) throw error;
      if (existing && existing.photo_path && existing.photo_path !== photo_path) {
        await sb.storage.from("photos").remove([existing.photo_path]);
      }
      resetDraft();
      state.editing = false;
      await loadSongs();
      if (wasHidden) state.revealId = partnerSong.id;
      renderApp();
      toast(existing ? "Son modifié" : "Son envoyé");
    } catch (e) {
      console.error(e);
      toast(frError(e));
      if (btn.isConnected) { btn.disabled = false; btn.textContent = "Envoyer mon son"; }
    } finally {
      state.busy = false;
    }
  }

  function togglePlayer(btn) {
    const song = state.songs.find((s) => String(s.id) === btn.dataset.id);
    const box = btn.closest(".polaroid").querySelector(".player");
    if (!song || !box) return;
    if (box.firstChild) {
      box.innerHTML = "";
      btn.textContent = "Écouter ici";
      return;
    }
    const src = embedUrl(song.spotify_url);
    if (!src) { window.open(song.spotify_url, "_blank", "noopener"); return; }
    box.innerHTML = `<iframe src="${esc(src)}" title="Lecteur Spotify" loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    btn.textContent = "Fermer le lecteur";
  }

  async function shareSite() {
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) await navigator.share({ title: APP_NAME, url });
      else { await navigator.clipboard.writeText(url); toast("Lien copié"); }
    } catch { /* partage annulé */ }
  }

  async function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case "view":
        state.view = el.dataset.view;
        renderApp();
        window.scrollTo(0, 0);
        break;
      case "month":
        state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(el.dataset.delta), 1);
        renderApp();
        break;
      case "day":
        openDay(el.dataset.day);
        break;
      case "play":
        togglePlayer(el);
        break;
      case "paste":
        try {
          const t = await navigator.clipboard.readText();
          state.draftInput = t.trim();
          state.dirty = true;
          $("#link").value = state.draftInput;
          runLookup();
        } catch {
          toast("Colle le lien directement dans le champ.");
          $("#link").focus();
        }
        break;
      case "send":
        send(el);
        break;
      case "edit": {
        const mine = findSong(state.me.id, dayKey());
        resetDraft();
        state.editing = true;
        state.draftInput = mine.spotify_url;
        state.draft = { url: mine.spotify_url, title: mine.title || "Morceau Spotify", cover: mine.cover_url };
        state.draftNote = mine.note || "";
        state.keepPhotoPath = mine.photo_path;
        renderApp();
        break;
      }
      case "cancel-edit":
        resetDraft();
        state.editing = false;
        renderApp();
        break;
      case "remove-photo":
        if (state.photoPreview) URL.revokeObjectURL(state.photoPreview);
        state.photoFile = null;
        state.photoPreview = null;
        state.keepPhotoPath = null;
        state.dirty = true;
        renderApp();
        break;
      case "share-site":
        shareSite();
        break;
      case "menu":
        openSheet(menuHtml());
        break;
      case "push-on":
        enablePush(el);
        break;
      case "push-off":
        disablePush();
        break;
      case "push-test":
        testPush(el);
        break;
      case "push-dismiss":
        try { localStorage.setItem(bannerKey, "1"); } catch { /* rien */ }
        renderApp();
        break;
      case "close-sheet":
        closeSheet();
        break;
      case "tuto":
        closeSheet();
        state.onboard = { step: 0, name: state.me.name, color: state.me.color, again: true };
        renderOnboarding();
        window.scrollTo(0, 0);
        break;
      case "logout":
        closeSheet();
        resetDraft();
        await sb.auth.signOut();
        break;
      case "retry":
        route();
        break;
      case "ob-next":
        if (readOnboardStep()) { state.onboard.step++; renderOnboarding(); window.scrollTo(0, 0); }
        break;
      case "ob-back":
        readOnboardStep();
        state.onboard.step = Math.max(0, state.onboard.step - 1);
        renderOnboarding();
        break;
      case "ob-finish":
        finishOnboarding(el);
        break;
    }
  }

  app.addEventListener("click", onClick);

  app.addEventListener("input", (e) => {
    if (e.target.id === "link") {
      state.draftInput = e.target.value;
      state.dirty = true;
      clearTimeout(lookupTimer);
      lookupTimer = setTimeout(runLookup, 350);
    } else if (e.target.id === "note") {
      state.draftNote = e.target.value;
      state.dirty = true;
    }
  });

  app.addEventListener("change", (e) => {
    if (e.target.id === "photo" && e.target.files[0]) {
      if (state.photoPreview) URL.revokeObjectURL(state.photoPreview);
      state.photoFile = e.target.files[0];
      state.photoPreview = URL.createObjectURL(state.photoFile);
      state.dirty = true;
      renderApp();
    } else if (e.target.name === "ob-color") {
      state.onboard.color = e.target.value;
      $(".onboard").style.setProperty("--c", e.target.value);
    }
  });
})();
