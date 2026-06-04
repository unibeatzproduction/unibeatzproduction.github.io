// unipack-producer-profiles.js
// Producer Profiles + Browse Producers for UniBeatz Pack Studio
// v2 — collapsed sidebar section, nav dropdown, clean workflow

(function () {
  'use strict';

  var CONNECT_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/createConnectAccount';
  var CHECK_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/checkConnectStatus';
  var STRIPE_STANDARD = 'https://buy.stripe.com/5kQbIUfDI2OGamo3T093y0f';
  var STRIPE_PREMIUM = 'https://buy.stripe.com/9B614ggHMblc0LOexE93y0g';

  function isUniPack() { return location.pathname.toLowerCase().includes('unipack.html'); }
  function getFb() { return window.UB_FIREBASE; }
  function getCurrentUser() {
    try { var r = localStorage.getItem('ub_current_user') || localStorage.getItem('ub_user'); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function showToast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.className = 'toast show'; setTimeout(function () { t.classList.remove('show'); }, 3500); }
  }

  // ─────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ub-profiles-style')) return;
    var s = document.createElement('style');
    s.id = 'ub-profiles-style';
    s.textContent = `
      /* NAV DROPDOWN */
      .ub-nav-profile-wrap { position: relative; display: inline-block; }
      .ub-nav-dropdown { display: none; position: absolute; top: calc(100% + 8px); right: 0; width: 280px; background: linear-gradient(135deg,#0d0d1a,#070710); border: 1px solid rgba(201,168,76,.35); border-radius: 10px; padding: 16px; z-index: 9999; box-shadow: 0 12px 40px rgba(0,0,0,.7); }
      .ub-nav-dropdown.open { display: block; }
      .ub-nav-dropdown-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,.07); }
      .ub-nav-dd-photo { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #C9A84C; flex-shrink: 0; background: rgba(201,168,76,.15); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; overflow: hidden; }
      .ub-nav-dd-photo img { width: 100%; height: 100%; object-fit: cover; }
      .ub-nav-dd-info { flex: 1; min-width: 0; }
      .ub-nav-dd-name { font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; letter-spacing: 2px; color: #F0C040; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ub-nav-dd-tag { font-family: 'Orbitron', sans-serif; font-size: .42rem; letter-spacing: 2px; color: #40D0FF; margin-top: 2px; }
      .ub-nav-dd-bio { font-size: .82rem; color: rgba(240,237,232,.65); line-height: 1.4; margin-bottom: 12px; }
      .ub-nav-dd-btn { display: block; width: 100%; padding: 9px; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: .46rem; letter-spacing: 2px; font-weight: 700; cursor: pointer; border: none; text-align: center; margin-bottom: 6px; transition: all .2s; }
      .ub-nav-dd-btn-edit { background: rgba(255,255,255,.06); color: #F0EDE8; border: 1px solid rgba(201,168,76,.25) !important; }
      .ub-nav-dd-btn-edit:hover { background: rgba(201,168,76,.1); }
      .ub-nav-dd-btn-browse { background: linear-gradient(135deg,#003a5f,#00AAFF); color: #fff; }
      .ub-nav-dd-btn-browse:hover { box-shadow: 0 0 12px rgba(0,170,255,.4); }
      .ub-nav-dd-connect { font-family: 'Orbitron', sans-serif; font-size: .42rem; letter-spacing: 1.5px; padding: 7px 10px; border-radius: 6px; text-align: center; margin-top: 8px; }
      .ub-nav-dd-connect.connected { background: rgba(0,204,102,.1); border: 1px solid rgba(0,204,102,.3); color: #00CC66; }
      .ub-nav-dd-connect.pending { background: rgba(255,136,0,.1); border: 1px solid rgba(255,136,0,.3); color: #FF8800; cursor: pointer; }
      .ub-nav-dd-connect.not-connected { background: rgba(0,170,255,.08); border: 1px solid rgba(0,170,255,.2); color: #40D0FF; cursor: pointer; }

      /* PROFILE EDIT MODAL */
      .ub-profile-edit-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.88); z-index: 3000; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(6px); }
      .ub-profile-edit-overlay.open { display: flex; }
      .ub-profile-edit-modal { background: linear-gradient(135deg,#0d0d1a,#070710); border: 1px solid rgba(201,168,76,.3); border-radius: 12px; padding: 24px; max-width: 420px; width: 100%; }
      .ub-profile-edit-title { font-family: 'Bebas Neue', sans-serif; font-size: 1.6rem; letter-spacing: 3px; color: #F0C040; margin-bottom: 16px; }
      .ub-profile-photo-circle { width: 80px; height: 80px; border-radius: 50%; border: 3px dashed rgba(201,168,76,.4); display: flex; align-items: center; justify-content: center; cursor: pointer; margin: 0 auto 14px; overflow: hidden; background: rgba(0,0,0,.3); transition: all .2s; }
      .ub-profile-photo-circle:hover { border-color: #C9A84C; }
      .ub-profile-photo-circle img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
      .ub-pf { margin-bottom: 12px; }
      .ub-pf label { display: block; font-family: 'Orbitron', sans-serif; font-size: .46rem; letter-spacing: 2px; color: #C9A84C; margin-bottom: 5px; }
      .ub-pf input, .ub-pf textarea { width: 100%; background: rgba(255,255,255,.04); border: 1px solid rgba(201,168,76,.2); color: #F0EDE8; padding: 10px 12px; font-family: 'Rajdhani', sans-serif; font-size: .9rem; border-radius: 5px; outline: none; }
      .ub-pf textarea { resize: vertical; min-height: 70px; }
      .ub-profile-edit-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
      .ub-profile-edit-save { padding: 11px; background: linear-gradient(135deg,#003a5f,#00AAFF); color: #fff; border: none; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: .5rem; letter-spacing: 2px; font-weight: 700; cursor: pointer; }
      .ub-profile-edit-cancel { padding: 11px; background: transparent; border: 1px solid rgba(255,255,255,.1); color: rgba(240,237,232,.6); border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: .5rem; letter-spacing: 2px; cursor: pointer; }

      /* BROWSE PAGE */
      #page-browse { padding-top: 60px; background: #020207; min-height: 100vh; }
      .browse-header { padding: 28px 20px 16px; text-align: center; border-bottom: 1px solid rgba(201,168,76,.15); }
      .browse-title { font-family: 'Bebas Neue', sans-serif; font-size: 2.4rem; letter-spacing: 3px; color: #F0C040; margin-bottom: 4px; }
      .browse-sub { font-family: 'Orbitron', sans-serif; font-size: .48rem; letter-spacing: 3px; color: rgba(240,237,232,.55); margin-bottom: 16px; }
      .browse-search-wrap { max-width: 560px; margin: 0 auto; position: relative; }
      .browse-search { width: 100%; padding: 13px 18px 13px 44px; background: rgba(255,255,255,.05); border: 1px solid rgba(201,168,76,.3); color: #F0EDE8; font-family: 'Rajdhani', sans-serif; font-size: 1rem; border-radius: 8px; outline: none; }
      .browse-search:focus { border-color: #C9A84C; }
      .browse-search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #C9A84C; font-size: 1.1rem; pointer-events: none; }
      .browse-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; padding: 24px 20px; max-width: 1100px; margin: 0 auto; }
      .producer-card { background: linear-gradient(135deg,#0a0a14,#060610); border: 1px solid rgba(201,168,76,.18); border-radius: 12px; padding: 20px; cursor: pointer; transition: all .2s; text-align: center; }
      .producer-card:hover { border-color: rgba(201,168,76,.5); transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,.4); }
      .producer-card-photo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 3px solid #C9A84C; margin: 0 auto 10px; display: block; }
      .producer-card-photo-ph { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg,rgba(0,170,255,.2),rgba(201,168,76,.2)); border: 3px solid rgba(201,168,76,.4); margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; }
      .producer-card-name { font-family: 'Bebas Neue', sans-serif; font-size: 1.3rem; letter-spacing: 2px; color: #F0C040; margin-bottom: 2px; }
      .producer-card-tag { font-family: 'Orbitron', sans-serif; font-size: .42rem; letter-spacing: 2px; color: #40D0FF; margin-bottom: 7px; }
      .producer-card-bio { font-size: .8rem; color: rgba(240,237,232,.6); line-height: 1.4; margin-bottom: 10px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .producer-card-packs { font-family: 'Orbitron', sans-serif; font-size: .42rem; letter-spacing: 2px; color: rgba(240,237,232,.45); }

      /* PROFILE PAGE */
      #page-profile { padding-top: 60px; background: #020207; min-height: 100vh; }
      .profile-back { padding: 14px 20px; }
      .profile-back-btn { background: none; border: 1px solid rgba(201,168,76,.3); color: #C9A84C; font-family: 'Orbitron', sans-serif; font-size: .48rem; letter-spacing: 2px; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
      .profile-hero { padding: 20px 20px 28px; text-align: center; border-bottom: 1px solid rgba(201,168,76,.12); max-width: 700px; margin: 0 auto; }
      .profile-photo { width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 4px solid #C9A84C; margin: 0 auto 14px; display: block; box-shadow: 0 0 24px rgba(201,168,76,.3); }
      .profile-photo-ph { width: 110px; height: 110px; border-radius: 50%; background: linear-gradient(135deg,rgba(0,170,255,.2),rgba(201,168,76,.2)); border: 4px solid rgba(201,168,76,.4); margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; font-size: 2.8rem; }
      .profile-name { font-family: 'Bebas Neue', sans-serif; font-size: 2.2rem; letter-spacing: 3px; color: #F0C040; margin-bottom: 3px; }
      .profile-tag { font-family: 'Orbitron', sans-serif; font-size: .5rem; letter-spacing: 3px; color: #40D0FF; margin-bottom: 10px; }
      .profile-bio { font-size: .92rem; color: rgba(240,237,232,.72); line-height: 1.6; max-width: 480px; margin: 0 auto 14px; }
      .profile-stats { display: flex; gap: 24px; justify-content: center; }
      .profile-stat-num { font-family: 'Orbitron', sans-serif; font-size: 1.3rem; font-weight: 900; color: #F0C040; }
      .profile-stat-lbl { font-family: 'Orbitron', sans-serif; font-size: .4rem; letter-spacing: 2px; color: rgba(240,237,232,.45); margin-top: 2px; }
      .profile-packs-section { padding: 24px 20px; max-width: 1100px; margin: 0 auto; }
      .profile-packs-title { font-family: 'Orbitron', sans-serif; font-size: .55rem; letter-spacing: 4px; color: #C9A84C; margin-bottom: 16px; }
      .profile-packs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
      .pack-listing-card { background: linear-gradient(135deg,#0a0a14,#060610); border: 1px solid rgba(201,168,76,.18); border-radius: 10px; overflow: hidden; transition: all .2s; }
      .pack-listing-card:hover { border-color: rgba(201,168,76,.4); transform: translateY(-2px); }
      .pack-listing-cover { width: 100%; height: 180px; object-fit: cover; background: linear-gradient(135deg,rgba(0,170,255,.08),rgba(201,168,76,.08)); display: flex; align-items: center; justify-content: center; font-size: 3rem; overflow: hidden; }
      .pack-listing-cover img { width: 100%; height: 100%; object-fit: cover; }
      .pack-listing-info { padding: 12px; }
      .pack-listing-name { font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; letter-spacing: 2px; color: #fff; margin-bottom: 2px; }
      .pack-listing-meta { font-family: 'Orbitron', sans-serif; font-size: .42rem; letter-spacing: 1.5px; color: rgba(240,237,232,.5); margin-bottom: 10px; }
      .pack-listing-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .pack-price-btn { padding: 9px 4px; border: none; border-radius: 6px; cursor: pointer; font-family: 'Orbitron', sans-serif; font-size: .44rem; letter-spacing: 1.5px; font-weight: 700; transition: all .2s; text-align: center; }
      .pack-price-btn-std { background: linear-gradient(135deg,#003a5f,#00AAFF); color: #fff; }
      .pack-price-btn-prem { background: linear-gradient(135deg,#8B6914,#C9A84C,#F0C040); color: #000; }
      .pack-license-note { font-size: .68rem; color: rgba(240,237,232,.35); margin-top: 7px; text-align: center; }

      /* LICENSE MODAL */
      .license-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.92); z-index: 4000; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(8px); }
      .license-modal-overlay.active { display: flex; }
      .license-modal { background: linear-gradient(135deg,#0d0d1a,#070710); border: 1px solid rgba(201,168,76,.3); border-radius: 10px; padding: 24px; max-width: 520px; width: 100%; max-height: 85vh; overflow-y: auto; }
      .license-modal-title { font-family: 'Bebas Neue', sans-serif; font-size: 1.5rem; letter-spacing: 3px; color: #F0C040; margin-bottom: 10px; }
      .license-modal-text { font-size: .8rem; color: rgba(240,237,232,.7); line-height: 1.7; margin-bottom: 16px; max-height: 260px; overflow-y: auto; background: rgba(0,0,0,.3); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,.06); }
      .license-checkbox-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; cursor: pointer; }
      .license-checkbox { width: 20px; height: 20px; min-width: 20px; border: 2px solid rgba(201,168,76,.5); border-radius: 4px; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: .9rem; margin-top: 2px; }
      .license-checkbox.checked { background: #C9A84C; border-color: #C9A84C; color: #000; }
      .license-checkbox-label { font-size: .85rem; color: rgba(240,237,232,.78); line-height: 1.4; }
      .license-proceed-btn { width: 100%; padding: 12px; background: linear-gradient(135deg,#8B6914,#C9A84C,#F0C040); color: #000; border: none; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: .58rem; letter-spacing: 3px; font-weight: 700; cursor: pointer; opacity: .4; pointer-events: none; transition: all .2s; }
      .license-proceed-btn.enabled { opacity: 1; pointer-events: all; }
      .license-cancel-btn { width: 100%; padding: 9px; background: transparent; border: 1px solid rgba(255,255,255,.1); color: rgba(240,237,232,.55); border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: .48rem; letter-spacing: 2px; cursor: pointer; margin-top: 7px; }

      @media(max-width:600px) {
        .browse-grid { grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px; }
        .profile-packs-grid { grid-template-columns: 1fr; }
        .pack-listing-btns { grid-template-columns: 1fr; }
        .ub-nav-dropdown { width: 260px; }
      }
    `;
    document.head.appendChild(s);
  }

  var LICENSE_TEXT = `UNIBEATZ PRODUCTION — SAMPLE PACK LICENSE AGREEMENT

Upon purchase you receive a non-exclusive, worldwide, royalty-free license to use these audio samples for music production, commercial releases, sync licensing, and live performance.

YOU MAY NOT: Resell or redistribute raw samples as part of another sample pack or sound library. Share pack files for free or paid download on any platform in raw/unprocessed form. Claim ownership of the original sample content.

OWNERSHIP: The Producer retains full copyright. This is a license to use, not a transfer of ownership.

REVENUE SPLIT: 95% goes to the Producer. 5% platform fee retained by UniBeatz Production LLC. Payouts processed quarterly via Stripe Connect.

REFUND POLICY: All sales are final due to the digital nature of the product.

By completing this purchase you agree to all terms of this license agreement.`;

  // ─────────────────────────────────────────────
  // INJECT PAGES
  // ─────────────────────────────────────────────
  function injectPages() {
    if (document.getElementById('page-browse')) return;

    var browsePage = document.createElement('div');
    browsePage.className = 'page';
    browsePage.id = 'page-browse';
    browsePage.innerHTML = `
      <div class="browse-header">
        <div class="browse-title">Browse Producers</div>
        <div class="browse-sub">Find producers · Buy their sample packs</div>
        <div class="browse-search-wrap">
          <span class="browse-search-icon">🔍</span>
          <input class="browse-search" id="browseSearchInput" type="text" placeholder="Search producer name..." oninput="window.ubBrowseSearch(this.value)"/>
        </div>
      </div>
      <div class="browse-grid" id="browseGrid">
        <div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(240,237,232,.4);font-family:Orbitron,sans-serif;font-size:.6rem;letter-spacing:3px;">Loading producers...</div>
      </div>
    `;
    document.body.appendChild(browsePage);

    var profilePage = document.createElement('div');
    profilePage.className = 'page';
    profilePage.id = 'page-profile';
    profilePage.innerHTML = `
      <div class="profile-back">
        <button class="profile-back-btn" onclick="window.ubGoPage('browse')">← Back to Browse</button>
      </div>
      <div class="profile-hero" id="profileHero">
        <div style="color:rgba(240,237,232,.4);font-family:Orbitron,sans-serif;font-size:.6rem;letter-spacing:3px;padding:40px;">Loading...</div>
      </div>
      <div class="profile-packs-section">
        <div class="profile-packs-title">📦 Sample Packs</div>
        <div class="profile-packs-grid" id="profilePacksGrid"></div>
      </div>
    `;
    document.body.appendChild(profilePage);

    var licenseModal = document.createElement('div');
    licenseModal.className = 'license-modal-overlay';
    licenseModal.id = 'licenseModal';
    licenseModal.innerHTML = `
      <div class="license-modal">
        <div class="license-modal-title">📋 License Agreement</div>
        <div class="license-modal-text">${LICENSE_TEXT}</div>
        <div class="license-checkbox-row" onclick="window.ubToggleLicenseCheck()">
          <div class="license-checkbox" id="licenseCheckbox"></div>
          <div class="license-checkbox-label">I have read and agree to the Sample Pack License Agreement. I understand this is a digital product and all sales are final.</div>
        </div>
        <button class="license-proceed-btn" id="licenseProceedBtn" onclick="window.ubProceedToCheckout()">PROCEED TO CHECKOUT</button>
        <button class="license-cancel-btn" onclick="window.ubCloseLicense()">Cancel</button>
      </div>
    `;
    document.body.appendChild(licenseModal);

    var editModal = document.createElement('div');
    editModal.className = 'ub-profile-edit-overlay';
    editModal.id = 'ubProfileEditModal';
    editModal.innerHTML = `
      <div class="ub-profile-edit-modal">
        <div class="ub-profile-edit-title">🎤 Edit Profile</div>
        <input type="file" id="profilePhotoInput" accept="image/*" style="display:none" onchange="window.ubHandleProfilePhoto(this)"/>
        <div class="ub-profile-photo-circle" onclick="document.getElementById('profilePhotoInput').click()" id="profilePhotoCircle">
          <span style="font-size:1.8rem;opacity:.5;">📷</span>
        </div>
        <div class="ub-pf">
          <label>Producer Tag</label>
          <input type="text" id="profileTagInput" placeholder="e.g. Trap · Hip-Hop · R&B"/>
        </div>
        <div class="ub-pf">
          <label>Bio</label>
          <textarea id="profileBioInput" placeholder="Tell producers about your sound..."></textarea>
        </div>
        <div class="ub-profile-edit-btns">
          <button class="ub-profile-edit-save" onclick="window.ubSaveProfile()">💾 Save</button>
          <button class="ub-profile-edit-cancel" onclick="window.ubCloseProfileEdit()">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(editModal);
  }

  // ─────────────────────────────────────────────
  // NAV CHIP → DROPDOWN
  // ─────────────────────────────────────────────
  function injectNavDropdown() {
    if (document.getElementById('ubNavProfileWrap')) return;
    var navRight = document.getElementById('navRight');
    if (!navRight) return;

    var user = getCurrentUser();
    if (!user) return;

    var tier = (user.unipackTier || 'starter').toLowerCase();
    var tierColors = { starter: '#888', pro: '#00AAFF', elite: '#C9A84C', master: '#9B30FF' };
    var tierIcons = { starter: '🆓', pro: '💎', elite: '🥇', master: '👑' };
    var tierColor = tierColors[tier] || '#888';
    var tierIcon = tierIcons[tier] || '🆓';
    var tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

    // Remove existing chip if any and replace with dropdown version
    var existingChip = navRight.querySelector('.user-chip');
    if (existingChip) existingChip.remove();

    var wrap = document.createElement('div');
    wrap.className = 'ub-nav-profile-wrap';
    wrap.id = 'ubNavProfileWrap';

    var photoHtml = user.photo
      ? '<img src="' + user.photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>'
      : (user.avatar || '🎤');

    wrap.innerHTML = `
      <div class="user-chip" id="ubNavChip" style="cursor:pointer;" onclick="window.ubToggleNavDropdown(event)">
        <div class="user-chip-ava">${photoHtml}</div>
        <span class="user-chip-name">${user.username || user.name || 'Producer'}</span>
        <span class="tier-pill tier-pill-${tier}">${tierIcon} ${tierName.toUpperCase()}</span>
      </div>
      <div class="ub-nav-dropdown" id="ubNavDropdown">
        <div class="ub-nav-dropdown-header">
          <div class="ub-nav-dd-photo" id="ubDdPhoto">${photoHtml}</div>
          <div class="ub-nav-dd-info">
            <div class="ub-nav-dd-name">${user.name || user.username || 'Producer'}</div>
            <div class="ub-nav-dd-tag" id="ubDdTag">Loading...</div>
          </div>
        </div>
        <div class="ub-nav-dd-bio" id="ubDdBio"></div>
        <button class="ub-nav-dd-btn ub-nav-dd-btn-edit" onclick="window.ubOpenProfileEdit()">✏️ Edit Profile</button>
        <button class="ub-nav-dd-btn ub-nav-dd-btn-browse" onclick="window.ubGoPage('browse');window.ubCloseNavDropdown();">👥 Browse Producers</button>
        <div class="ub-nav-dd-connect not-connected" id="ubDdConnectStatus" onclick="window.ubConnectStripe()">
          💳 Connect Stripe Payouts
        </div>
      </div>
    `;
    navRight.appendChild(wrap);

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) window.ubCloseNavDropdown();
    });

    loadDropdownData();
    checkConnectStatus();
  }

  window.ubToggleNavDropdown = function (e) {
    e.stopPropagation();
    var dd = document.getElementById('ubNavDropdown');
    if (dd) dd.classList.toggle('open');
  };
  window.ubCloseNavDropdown = function () {
    var dd = document.getElementById('ubNavDropdown');
    if (dd) dd.classList.remove('open');
  };

  async function loadDropdownData() {
    var fb = getFb();
    var user = getCurrentUser();
    if (!fb || !user) return;
    var uid = fb.auth && fb.auth.currentUser ? fb.auth.currentUser.uid : user.username;
    try {
      var snap = await fb.getDoc(fb.doc(fb.db, 'producer_profiles', uid));
      if (!snap.exists()) return;
      var d = snap.data();
      var tagEl = document.getElementById('ubDdTag');
      var bioEl = document.getElementById('ubDdBio');
      var photoEl = document.getElementById('ubDdPhoto');
      var chipAva = document.querySelector('#ubNavChip .user-chip-ava');
      if (tagEl) tagEl.textContent = d.tag || 'Producer';
      if (bioEl) bioEl.textContent = d.bio || '';
      if (d.photoUrl) {
        if (photoEl) photoEl.innerHTML = '<img src="' + d.photoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
        if (chipAva) chipAva.innerHTML = '<img src="' + d.photoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
      }
    } catch (e) {}
  }

  // ─────────────────────────────────────────────
  // PROFILE EDIT MODAL
  // ─────────────────────────────────────────────
  var _profilePhotoData = null;

  window.ubOpenProfileEdit = function () {
    window.ubCloseNavDropdown();
    var modal = document.getElementById('ubProfileEditModal');
    if (modal) modal.classList.add('open');
    loadProfileIntoEdit();
  };
  window.ubCloseProfileEdit = function () {
    var modal = document.getElementById('ubProfileEditModal');
    if (modal) modal.classList.remove('open');
  };

  function loadProfileIntoEdit() {
    var fb = getFb();
    var user = getCurrentUser();
    if (!fb || !user) return;
    var uid = fb.auth && fb.auth.currentUser ? fb.auth.currentUser.uid : user.username;
    fb.getDoc(fb.doc(fb.db, 'producer_profiles', uid)).then(function (snap) {
      if (!snap.exists()) return;
      var d = snap.data();
      var tagInput = document.getElementById('profileTagInput');
      var bioInput = document.getElementById('profileBioInput');
      var circle = document.getElementById('profilePhotoCircle');
      if (tagInput && d.tag) tagInput.value = d.tag;
      if (bioInput && d.bio) bioInput.value = d.bio;
      if (circle && d.photoUrl) {
        circle.innerHTML = '<img src="' + d.photoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
        _profilePhotoData = d.photoUrl;
      }
    }).catch(function () {});
  }

  window.ubHandleProfilePhoto = function (input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (file.size > 3 * 1024 * 1024) { showToast('Photo must be under 3MB'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      _profilePhotoData = e.target.result;
      var circle = document.getElementById('profilePhotoCircle');
      if (circle) circle.innerHTML = '<img src="' + _profilePhotoData + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
    };
    reader.readAsDataURL(file);
  };

  window.ubSaveProfile = async function () {
    var fb = getFb();
    var user = getCurrentUser();
    if (!user) { showToast('Log in first'); return; }
    if (!fb || !fb.ready) { showToast('Firebase not ready'); return; }
    var uid = fb.auth && fb.auth.currentUser ? fb.auth.currentUser.uid : user.username;
    var tag = (document.getElementById('profileTagInput') || {}).value || '';
    var bio = (document.getElementById('profileBioInput') || {}).value || '';
    showToast('Saving...');
    try {
      var photoUrl = _profilePhotoData || null;
      if (photoUrl && photoUrl.startsWith('data:') && fb.storage) {
        var blob = await fetch(photoUrl).then(function (r) { return r.blob(); });
        var ext = photoUrl.includes('jpeg') ? 'jpg' : 'png';
        var storageRef = fb.ref(fb.storage, 'producer_profiles/' + uid + '/photo.' + ext);
        await fb.uploadBytes(storageRef, blob, { contentType: blob.type });
        photoUrl = await fb.getDownloadURL(storageRef);
      }
      var data = { uid: uid, displayName: user.name || user.username || '', username: user.username || '', email: user.email || '', tag: tag, bio: bio, updatedAt: fb.serverTimestamp() };
      if (photoUrl) data.photoUrl = photoUrl;
      await fb.setDoc(fb.doc(fb.db, 'producer_profiles', uid), data, { merge: true });
      showToast('✅ Profile saved!');
      window.ubCloseProfileEdit();
      loadDropdownData();
    } catch (e) { showToast('Save failed: ' + e.message); }
  };

  // ─────────────────────────────────────────────
  // STRIPE CONNECT
  // ─────────────────────────────────────────────
  async function checkConnectStatus() {
    var fb = getFb();
    var user = getCurrentUser();
    if (!fb || !user) return;
    var uid = fb.auth && fb.auth.currentUser ? fb.auth.currentUser.uid : user.username;
    var box = document.getElementById('ubDdConnectStatus');
    if (!box) return;
    try {
      var resp = await fetch(CHECK_FN + '?uid=' + encodeURIComponent(uid));
      var data = await resp.json();
      if (data.connected) {
        box.className = 'ub-nav-dd-connect connected';
        box.textContent = '✅ Stripe payouts connected';
        box.onclick = null;
      } else if (data.accountId) {
        box.className = 'ub-nav-dd-connect pending';
        box.textContent = '⏳ Finish Stripe onboarding';
        box.onclick = function () { window.ubConnectStripe(); };
      } else {
        box.className = 'ub-nav-dd-connect not-connected';
        box.textContent = '💳 Connect Stripe Payouts';
        box.onclick = function () { window.ubConnectStripe(); };
      }
    } catch (e) {}
  }

  window.ubConnectStripe = async function () {
    var fb = getFb();
    var user = getCurrentUser();
    if (!user) { showToast('Log in first'); return; }
    var uid = fb && fb.auth && fb.auth.currentUser ? fb.auth.currentUser.uid : user.username;
    showToast('Opening Stripe Connect...');
    try {
      var resp = await fetch(CONNECT_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, uid: uid, returnUrl: 'https://unibeatzproduction.com/unipack.html', refreshUrl: 'https://unibeatzproduction.com/unipack.html' }),
      });
      var data = await resp.json();
      if (data.url) window.open(data.url, '_blank');
      else showToast('Could not get onboarding link');
    } catch (e) { showToast('Connect failed: ' + e.message); }
  };

  // ─────────────────────────────────────────────
  // PAGE NAVIGATION
  // ─────────────────────────────────────────────
  window.ubGoPage = function (page) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var el = document.getElementById('page-' + page);
    if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
    if (page === 'browse') loadBrowsePage();
  };

  // ─────────────────────────────────────────────
  // BROWSE
  // ─────────────────────────────────────────────
  async function loadBrowsePage() {
    var grid = document.getElementById('browseGrid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(240,237,232,.4);font-family:Orbitron,sans-serif;font-size:.6rem;letter-spacing:3px;">Loading producers...</div>';
    var fb = getFb();
    if (!fb || !fb.ready) return;
    try {
      var snap = await fb.getDocs(fb.collection(fb.db, 'producer_profiles'));
      var producers = [];
      snap.forEach(function (doc) { var d = doc.data(); if (d.displayName || d.username) producers.push(Object.assign({ uid: doc.id }, d)); });
      window._ubAllProducers = producers;
      renderProducerGrid(producers);
    } catch (e) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(240,237,232,.4);">Could not load producers.</div>'; }
  }

  function renderProducerGrid(producers) {
    var grid = document.getElementById('browseGrid');
    if (!grid) return;
    if (!producers || !producers.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(240,237,232,.4);font-family:Orbitron,sans-serif;font-size:.6rem;letter-spacing:3px;">No producers yet. Be the first!</div>';
      return;
    }
    grid.innerHTML = producers.map(function (p) {
      var photoHtml = p.photoUrl
        ? '<img class="producer-card-photo" src="' + p.photoUrl + '" alt="' + (p.displayName || '') + '"/>'
        : '<div class="producer-card-photo-ph">🎤</div>';
      return `<div class="producer-card" onclick="window.ubOpenProfile('${p.uid}')">
        ${photoHtml}
        <div class="producer-card-name">${p.displayName || p.username || 'Producer'}</div>
        <div class="producer-card-tag">${p.tag || 'Producer'}</div>
        <div class="producer-card-bio">${p.bio || 'No bio yet.'}</div>
        <div class="producer-card-packs">${p.packCount || 0} pack${(p.packCount || 0) !== 1 ? 's' : ''}</div>
      </div>`;
    }).join('');
  }

  window.ubBrowseSearch = function (query) {
    var all = window._ubAllProducers || [];
    if (!query) { renderProducerGrid(all); return; }
    var q = query.toLowerCase();
    renderProducerGrid(all.filter(function (p) { return ((p.displayName || '') + ' ' + (p.username || '') + ' ' + (p.tag || '')).toLowerCase().includes(q); }));
  };

  // ─────────────────────────────────────────────
  // PRODUCER PROFILE PAGE
  // ─────────────────────────────────────────────
  window.ubOpenProfile = async function (uid) {
    window.ubGoPage('profile');
    var hero = document.getElementById('profileHero');
    var packsGrid = document.getElementById('profilePacksGrid');
    hero.innerHTML = '<div style="color:rgba(240,237,232,.4);font-family:Orbitron,sans-serif;font-size:.6rem;letter-spacing:3px;padding:40px;">Loading...</div>';
    packsGrid.innerHTML = '';
    var fb = getFb();
    if (!fb) return;
    try {
      var profileSnap = await fb.getDoc(fb.doc(fb.db, 'producer_profiles', uid));
      if (!profileSnap.exists()) { hero.innerHTML = '<div style="color:rgba(240,237,232,.4);padding:40px;">Profile not found.</div>'; return; }
      var p = profileSnap.data();
      var photoHtml = p.photoUrl ? '<img class="profile-photo" src="' + p.photoUrl + '"/>' : '<div class="profile-photo-ph">🎤</div>';
      hero.innerHTML = `${photoHtml}<div class="profile-name">${p.displayName || p.username || 'Producer'}</div><div class="profile-tag">${p.tag || 'Producer'}</div><div class="profile-bio">${p.bio || ''}</div><div class="profile-stats"><div class="profile-stat"><div class="profile-stat-num">${p.packCount || 0}</div><div class="profile-stat-lbl">Packs</div></div><div class="profile-stat"><div class="profile-stat-num">${p.totalSales || 0}</div><div class="profile-stat-lbl">Sales</div></div></div>`;

      var packsSnap = await fb.getDocs(fb.query(fb.collection(fb.db, 'marketplace_packs'), fb.where('createdBy', '==', uid)));
      var packs = [];
      packsSnap.forEach(function (doc) { packs.push(Object.assign({ id: doc.id }, doc.data())); });
      if (!packs.length) { packsGrid.innerHTML = '<div style="color:rgba(240,237,232,.4);font-family:Rajdhani,sans-serif;padding:20px;">No packs published yet.</div>'; return; }
      packsGrid.innerHTML = packs.map(function (pack) {
        var coverHtml = pack.coverUrl ? '<img src="' + pack.coverUrl + '" style="width:100%;height:100%;object-fit:cover;"/>' : '<div style="font-size:3rem;display:flex;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,rgba(0,170,255,.1),rgba(201,168,76,.1));">📦</div>';
        return `<div class="pack-listing-card"><div class="pack-listing-cover">${coverHtml}</div><div class="pack-listing-info"><div class="pack-listing-name">${pack.name || 'Untitled Pack'}</div><div class="pack-listing-meta">${pack.genre || ''}${pack.bpm ? ' · ' + pack.bpm + ' BPM' : ''}${pack.key ? ' · ' + pack.key : ''}</div><div class="pack-listing-btns"><button class="pack-price-btn pack-price-btn-std" onclick="window.ubOpenLicense('${pack.id}','standard','${(pack.name||'').replace(/'/g,'')}')">$15.99<br/><span style="font-size:.36rem;opacity:.8;">Standard</span></button><button class="pack-price-btn pack-price-btn-prem" onclick="window.ubOpenLicense('${pack.id}','premium','${(pack.name||'').replace(/'/g,'')}')">$29.99<br/><span style="font-size:.36rem;opacity:.8;">Premium</span></button></div><div class="pack-license-note">🔒 License included</div></div></div>`;
      }).join('');
    } catch (e) { hero.innerHTML = '<div style="color:rgba(240,237,232,.4);padding:40px;">Error loading profile.</div>'; }
  };

  // ─────────────────────────────────────────────
  // LICENSE MODAL
  // ─────────────────────────────────────────────
  var _pendingCheckout = null;
  var _licenseChecked = false;

  window.ubOpenLicense = function (packId, tier, packName) {
    _pendingCheckout = { packId: packId, tier: tier, packName: packName };
    _licenseChecked = false;
    var cb = document.getElementById('licenseCheckbox');
    var btn = document.getElementById('licenseProceedBtn');
    if (cb) { cb.classList.remove('checked'); cb.textContent = ''; }
    if (btn) { btn.classList.remove('enabled'); btn.textContent = tier === 'premium' ? 'PROCEED — $29.99 PREMIUM' : 'PROCEED — $15.99 STANDARD'; }
    var modal = document.getElementById('licenseModal');
    if (modal) modal.classList.add('active');
  };
  window.ubToggleLicenseCheck = function () {
    _licenseChecked = !_licenseChecked;
    var cb = document.getElementById('licenseCheckbox');
    var btn = document.getElementById('licenseProceedBtn');
    if (cb) { cb.classList.toggle('checked', _licenseChecked); cb.textContent = _licenseChecked ? '✓' : ''; }
    if (btn) btn.classList.toggle('enabled', _licenseChecked);
  };
  window.ubProceedToCheckout = function () {
    if (!_licenseChecked || !_pendingCheckout) return;
    var url = _pendingCheckout.tier === 'premium' ? STRIPE_PREMIUM : STRIPE_STANDARD;
    window.ubCloseLicense();
    window.open(url, '_blank');
  };
  window.ubCloseLicense = function () {
    var modal = document.getElementById('licenseModal');
    if (modal) modal.classList.remove('active');
    _pendingCheckout = null;
    _licenseChecked = false;
  };

  // ─────────────────────────────────────────────
  // HOOK PUSH TO WORLD TO UPDATE PACK COUNT
  // ─────────────────────────────────────────────
  function hookPushToWorld() {
    var orig = window.pushToWorld;
    if (!orig || window._ubPushHooked) return;
    window._ubPushHooked = true;
    window.pushToWorld = async function () {
      await orig.apply(this, arguments);
      var fb = getFb();
      var user = getCurrentUser();
      if (!fb || !user) return;
      var uid = fb.auth && fb.auth.currentUser ? fb.auth.currentUser.uid : user.username;
      try {
        var snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'marketplace_packs'), fb.where('createdBy', '==', uid)));
        await fb.setDoc(fb.doc(fb.db, 'producer_profiles', uid), { packCount: snap.size }, { merge: true });
      } catch (e) {}
    };
  }

  // ─────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────
  function boot() {
    if (!isUniPack()) return;
    injectStyles();
    injectPages();

    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      var navRight = document.getElementById('navRight');
      if (navRight && getCurrentUser()) {
        clearInterval(timer);
        injectNavDropdown();
        hookPushToWorld();
      }
      if (attempts > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 800);
  setTimeout(boot, 2000);

})();
