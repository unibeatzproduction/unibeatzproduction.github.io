// unibeatz-search.js
// Functional UniBeatz site/content search.

const SEARCH_LINKS = [
  { title: "Beat Store", url: "/index.html#beats", text: "beats beat store licenses hip hop trap r&b drill afrobeats purchase stream" },
  { title: "Artist Battles", url: "/index.html#battles", text: "battles freestyle app artist live vote leaderboard" },
  { title: "All Platforms", url: "/index.html#platforms", text: "platforms empire unibeatzworld unipack radio battle merch studio" },
  { title: "Membership", url: "/index.html#membership", text: "membership tiers subscriptions pro customer visitor" },
  { title: "UniBeatz World", url: "/unibeatzworld.html", text: "unibeatzworld beats songs merch unipack soundpacks catalog" },
  { title: "UniPack", url: "/unipack.html", text: "unipack sample pack plugin beat chop wav midi export producer" },
  { title: "Uni Freestyle Battle", url: "/unifreestyle.html", text: "freestyle battle artist dj vote live battle app" },
  { title: "Uni Radio", url: "/radio.html", text: "radio station music submissions approved tracks hip hop r&b podcast" },
  { title: "Legal", url: "/legal.html", text: "legal terms refund license exclusive wav rights contracts" },
  { title: "Admin Radio", url: "/admin-radio.html", text: "admin radio approve submissions review tracks" }
];

function pageResults(term) {
  const q = term.toLowerCase().trim();
  const items = [];
  document.querySelectorAll("section[id], main, article, .platform-card, .coming-card, .plan-card, .beat-slide, .video-slide").forEach((el, idx) => {
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 8) return;
    if (!q || text.toLowerCase().includes(q)) {
      const id = el.id || el.closest("section[id]")?.id || "";
      items.push({
        title: id ? id.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "This Page Result",
        url: id ? `#${id}` : location.pathname,
        text: text.slice(0, 180),
        score: q ? 2 : 1
      });
    }
  });
  return items.slice(0, 12);
}

function globalResults(term) {
  const q = term.toLowerCase().trim();
  if (!q) return SEARCH_LINKS;
  return SEARCH_LINKS.filter(item => `${item.title} ${item.text}`.toLowerCase().includes(q));
}

function openSearch() {
  document.getElementById("ub-search-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "ub-search-modal";
  modal.innerHTML = `
    <style>
      #ub-search-modal{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.78);backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding:88px 18px 18px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #ub-search-modal .ub-card{width:min(760px,100%);background:linear-gradient(135deg,#0d0d18,#070710);border:1px solid rgba(201,168,76,.48);border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.75),0 0 28px rgba(0,170,255,.14);overflow:hidden}
      #ub-search-modal .ub-head{display:flex;gap:10px;align-items:center;padding:14px;border-bottom:1px solid rgba(255,255,255,.08)}
      #ub-search-input{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;padding:13px 14px;font-size:16px;outline:none}
      #ub-search-input:focus{border-color:#C9A84C}
      #ub-search-close{background:transparent;border:0;color:#aaa;font-size:26px;cursor:pointer;padding:5px 8px}
      #ub-search-results{max-height:62vh;overflow:auto;padding:10px}
      .ub-result{display:block;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);border-radius:12px;padding:13px 14px;margin-bottom:10px;transition:.18s}
      .ub-result:hover{border-color:#C9A84C;background:rgba(201,168,76,.08);transform:translateY(-1px)}
      .ub-result-title{font-weight:900;color:#F0C040;margin-bottom:4px;letter-spacing:.2px}
      .ub-result-text{font-size:13px;opacity:.74;line-height:1.35}
      .ub-empty{padding:22px;text-align:center;color:#aaa}
    </style>
    <div class="ub-card">
      <div class="ub-head">
        <input id="ub-search-input" placeholder="Search beats, radio, battle, UniPack, legal, membership..." autofocus>
        <button id="ub-search-close">×</button>
      </div>
      <div id="ub-search-results"></div>
    </div>`;
  document.body.appendChild(modal);
  const input = document.getElementById("ub-search-input");
  const results = document.getElementById("ub-search-results");
  const close = () => modal.remove();
  document.getElementById("ub-search-close").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.addEventListener("keydown", function esc(e){ if(e.key === "Escape"){ close(); document.removeEventListener("keydown", esc); } });

  function render() {
    const q = input.value.trim();
    const combined = [...pageResults(q), ...globalResults(q)];
    const seen = new Set();
    const unique = combined.filter(item => {
      const key = item.url + item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 18);
    if (!unique.length) {
      results.innerHTML = `<div class="ub-empty">No results found for “${q.replace(/[<>]/g, "")}”.</div>`;
      return;
    }
    results.innerHTML = unique.map(item => `<a class="ub-result" href="${item.url}"><div class="ub-result-title">${item.title}</div><div class="ub-result-text">${item.text}</div></a>`).join("");
    results.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setTimeout(close, 50)));
  }
  input.addEventListener("input", render);
  setTimeout(() => input.focus(), 30);
  render();
}

window.UniBeatzSiteSearch = { open: openSearch };

// Upgrade any existing top nav search buttons that still say "coming soon".
function wireSearchButtons() {
  document.querySelectorAll(".nav-icon-btn").forEach(btn => {
    if ((btn.textContent || "").includes("🔍")) btn.onclick = openSearch;
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireSearchButtons);
else wireSearchButtons();
