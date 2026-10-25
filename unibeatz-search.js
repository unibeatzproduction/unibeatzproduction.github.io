// unibeatz-search.js — real site-wide search for UniBeatz Production
// Classic script (no module needed): drop <script src="/unibeatz-search.js">
// on a page plus a button with id="ubSearchBtn" and the search panel appears.
// No new backend. Searches:
//   1. A small client-side index of the site's pages + sections.
//   2. Firestore `profiles` (public read) — producer display names / usernames.
//   3. Firestore `marketplace_beats` titles/artists (best effort; on the
//      homepage it reuses window._firestoreBeats when already loaded).
// Firestore reads are cached after the first load and failures are ignored
// silently — search still works over the page index when offline or denied.

(function(){
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
    authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
    projectId: "unibeatzproduction-7ae31",
    storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
    messagingSenderId: "70667820609",
    appId: "1:70667820609:web:57762df5510e6b4000b0c0"
  };

  // ── Static page/section index ──────────────────────────────────────
  var PAGES = [
    { title: "UniBeatz Home — The Empire", url: "index.html#hero", desc: "The UniBeatz Production homepage.", keys: "home empire beats battles membership" },
    { title: "Beats — Marketplace", url: "index.html#beats", desc: "Beats for sale on the homepage marketplace.", keys: "beats marketplace buy lease" },
    { title: "Battle Highlights", url: "index.html#battles", desc: "Battle videos and highlights.", keys: "battle highlights videos freestyle" },
    { title: "Platforms", url: "index.html#platforms", desc: "Radio, Battle, UniPack and World.", keys: "platforms radio battle unipack world" },
    { title: "Membership", url: "index.html#membership", desc: "Membership plans and pricing.", keys: "membership plans pricing join" },
    { title: "UniFreestyle Battle App", url: "unifreestyle.html", desc: "Live battles, ranks, AI DJ and Browse Producers.", keys: "battle freestyle live ranks aidj producers cypher" },
    { title: "Browse Producers", url: "unifreestyle.html", desc: "Find and follow producers on the Battle app.", keys: "producers browse follow artists", producerPage: true },
    { title: "UniBeatz Radio", url: "radio.html", desc: "24/7 indie-first station, DJ sets and talk.", keys: "radio live365 station dj sets talk" },
    { title: "Apply To DJ", url: "radio-dj-apply.html", desc: "Apply to DJ on UniBeatz Radio.", keys: "dj apply radio host" },
    { title: "Advertise On Radio", url: "radio-advertise.html", desc: "Radio ad packages.", keys: "advertise radio ads promo" },
    { title: "UniPack — Pack Studio", url: "unipack.html", desc: "Turn a beat into a sample pack.", keys: "unipack pack studio samples slices stems" },
    { title: "UniBeatz World", url: "unibeatzworld.html", desc: "The UniBeatz World experience.", keys: "world" },
    { title: "Donny The Donut Merch", url: "https://xdkdud-a0.myshopify.com", desc: "Donny The Donut merch store (Shopify).", keys: "merch shop donny donut shirt hoodie mug", external: true },
    { title: "Legal", url: "legal.html", desc: "Legal pages.", keys: "legal terms privacy" }
  ];

  var fsProducers = [];   // { name, username, bio }
  var fsBeats = [];       // { title, artist }
  var fsLoaded = false;
  var fsLoading = false;

  function norm(s){ return String(s || "").toLowerCase().trim(); }
  function esc(s){ return String(s || "").replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clean(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, ""); }
  function niceName(s){ return String(s || "").replace(/_/g, " ").replace(/\b\w/g, function(c){ return c.toUpperCase(); }); }

  // ── Firestore (best effort, cached) ────────────────────────────────
  function loadFirestore(){
    if(fsLoaded || fsLoading) return;
    fsLoading = true;

    // Homepage already loads marketplace_beats into window._firestoreBeats.
    if(Array.isArray(window._firestoreBeats)){
      fsBeats = window._firestoreBeats.map(function(b){
        return { title: b.title || b.name || "", artist: b.artist || b.producer || "" };
      }).filter(function(b){ return b.title; });
    }

    // Dynamic import keeps this file a classic script while still using
    // the Firebase CDN. Any failure just leaves page-index search working.
    Promise.all([
      import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js")
    ]).then(function(mods){
      var appMod = mods[0], fs = mods[1];
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
      var db = fs.getFirestore(app);
      var jobs = [];
      jobs.push(fs.getDocs(fs.collection(db, "profiles")).then(function(snap){
        snap.forEach(function(doc){
          var d = doc.data() || {};
          var username = clean(doc.id || d.username || "");
          if(!username) return;
          fsProducers.push({
            username: username,
            name: d.displayName || d.name || niceName(username),
            bio: d.bio || ""
          });
        });
      }).catch(function(){ /* public read may be denied — page index still works */ }));
      jobs.push(fs.getDocs(fs.collection(db, "marketplace_beats")).then(function(snap){
        snap.forEach(function(doc){
          var d = doc.data() || {};
          if(d.title || d.name) fsBeats.push({ title: d.title || d.name, artist: d.artist || d.producer || "" });
        });
      }).catch(function(){ /* same as above */ }));
      return Promise.all(jobs);
    }).catch(function(){
      // Firebase CDN unreachable — page index search still works.
    }).then(function(){
      fsLoading = false;
      fsLoaded = true;
      var input = document.getElementById("ubSearchInput");
      if(input && input.value) runSearch(input.value);
    });
  }

  // ── Scoring ────────────────────────────────────────────────────────
  function scoreText(haystack, tokens){
    var score = 0;
    tokens.forEach(function(t){
      if(!t) return;
      if(haystack.indexOf(t) === 0) score += 3;
      else if(haystack.indexOf(t) > -1) score += 1;
    });
    return score;
  }

  function searchAll(q){
    var query = norm(q);
    if(!query) return [];
    var tokens = query.split(/\s+/);
    var out = [];

    PAGES.forEach(function(p){
      var hay = norm(p.title + " " + p.desc + " " + p.keys);
      var s = scoreText(hay, tokens);
      if(s > 0) out.push({ kind: "page", title: p.title, desc: p.desc, url: p.url, external: !!p.external, producerPage: !!p.producerPage, score: s + 1 });
    });

    fsProducers.forEach(function(p){
      var hay = norm(p.name + " @" + p.username + " " + p.bio);
      var s = scoreText(hay, tokens);
      if(s > 0) out.push({ kind: "producer", title: p.name, desc: "@" + p.username + (p.bio ? " · " + p.bio : ""), username: p.username, score: s + 2 });
    });

    fsBeats.forEach(function(b){
      var hay = norm(b.title + " " + b.artist);
      var s = scoreText(hay, tokens);
      if(s > 0) out.push({ kind: "beat", title: b.title, desc: b.artist ? "Beat by " + b.artist : "Beat", url: "index.html#beats", score: s });
    });

    out.sort(function(a, b){ return b.score - a.score; });
    return out.slice(0, 12);
  }

  // ── UI ─────────────────────────────────────────────────────────────
  function injectCss(){
    if(document.getElementById("ubSearchCss")) return;
    var s = document.createElement("style");
    s.id = "ubSearchCss";
    s.textContent = [
      "#ubSearchPanel{position:fixed;top:64px;right:12px;z-index:9998;width:min(380px,92vw);border:1px solid rgba(201,168,76,.55);border-radius:12px;background:linear-gradient(135deg,#0d0d18,#050508);color:#F0EDE8;box-shadow:0 0 24px rgba(201,168,76,.22);padding:12px;font-family:Rajdhani,sans-serif;}",
      "#ubSearchPanel input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.4);background:rgba(0,0,0,.3);color:#F0EDE8;font-family:Rajdhani,sans-serif;}",
      "#ubSearchHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}",
      "#ubSearchHead button{background:none;border:none;color:#F0EDE8;cursor:pointer;font-size:1rem;}",
      ".ub-search-item{display:block;width:100%;text-align:left;background:none;border:none;border-top:1px solid rgba(201,168,76,.22);color:#F0EDE8;cursor:pointer;padding:10px 2px;font-family:Rajdhani,sans-serif;}",
      ".ub-search-item:first-child{border-top:none;}",
      ".ub-search-item b{color:#F0C040;display:block;}",
      ".ub-search-item span{font-size:.8rem;color:rgba(240,237,232,.65);}",
      ".ub-search-empty{padding:12px;color:rgba(240,237,232,.65);}"
    ].join("");
    document.head.appendChild(s);
  }

  function ensurePanel(){
    var panel = document.getElementById("ubSearchPanel");
    if(panel) return panel;
    panel = document.createElement("div");
    panel.id = "ubSearchPanel";
    panel.style.display = "none";
    panel.innerHTML =
      '<div id="ubSearchHead"><strong>Search UniBeatz</strong>' +
      '<button type="button" onclick="document.getElementById(\'ubSearchPanel\').style.display=\'none\'">✕</button></div>' +
      '<input id="ubSearchInput" type="search" placeholder="Pages, producers, beats…" autocomplete="off"/>' +
      '<div id="ubSearchResults"></div>';
    document.body.appendChild(panel);
    var input = document.getElementById("ubSearchInput");
    var t = null;
    input.addEventListener("input", function(){
      clearTimeout(t);
      t = setTimeout(function(){ runSearch(input.value); }, 150);
    });
    input.addEventListener("keydown", function(e){
      if(e.key === "Enter"){
        var first = document.querySelector("#ubSearchResults .ub-search-item");
        if(first) first.click();
      }
      if(e.key === "Escape") panel.style.display = "none";
    });
    return panel;
  }

  function goToProducer(username){
    // On the Battle app itself, jump straight into Browse Producers with
    // the name pre-filled instead of reloading the page.
    if(window.ubUI && window.goToPage){
      ensurePanel().style.display = "none";
      window.goToPage("browseproducer");
      setTimeout(function(){
        var input = document.getElementById("ubProducerSearchInput");
        if(input){ input.value = username; }
        if(window.ubUI.renderProducers) window.ubUI.renderProducers();
      }, 100);
      return;
    }
    window.location.href = "unifreestyle.html";
  }

  function runSearch(q){
    var resultsEl = document.getElementById("ubSearchResults");
    if(!resultsEl) return;
    var results = searchAll(q);
    if(!norm(q)){
      resultsEl.innerHTML = '<div class="ub-search-empty">Type to search pages, producers, and beats.</div>';
      return;
    }
    if(!results.length){
      resultsEl.innerHTML = '<div class="ub-search-empty">No results yet' +
        (fsLoaded ? "." : " — cloud producers and beats are still loading, try again in a moment.") + "</div>";
      return;
    }
    resultsEl.innerHTML = results.map(function(r){
      var tag = r.kind === "producer" ? "Producer" : r.kind === "beat" ? "Beat" : "Page";
      var label = esc(r.title) + " · " + tag;
      var desc = esc(r.desc || "");
      if(r.kind === "producer"){
        return '<button type="button" class="ub-search-item" data-producer="' + esc(r.username) + '"><b>' + label + "</b><span>" + desc + "</span></button>";
      }
      var target = r.external ? ' target="_blank" rel="noopener"' : "";
      return '<a class="ub-search-item" href="' + esc(r.url) + '"' + target + "><b>" + label + "</b><span>" + desc + "</span></a>";
    }).join("");
    resultsEl.querySelectorAll("[data-producer]").forEach(function(btn){
      btn.addEventListener("click", function(){ goToProducer(btn.getAttribute("data-producer")); });
    });
  }

  function boot(){
    injectCss();
    var btn = document.getElementById("ubSearchBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var panel = ensurePanel();
      var open = panel.style.display === "block";
      panel.style.display = open ? "none" : "block";
      if(!open){
        loadFirestore();
        var input = document.getElementById("ubSearchInput");
        if(input){ input.focus(); runSearch(input.value); }
      }
    });
    // Warm the Firestore cache quietly so first search is fast.
    if(document.readyState === "complete") loadFirestore();
    else window.addEventListener("load", loadFirestore);
  }

  window.UniBeatzSearch = {
    search: searchAll,
    run: runSearch,
    reloadCloud: function(){ fsLoaded = false; loadFirestore(); }
  };

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
