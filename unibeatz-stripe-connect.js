// unibeatz-stripe-connect.js
// Shared Stripe Connect layer ONLY for:
//   1) UniPack Sound Pack Store creators
//   2) UniFreestyle artists / DJs
// It does not attach to Radio, Beat Store, Merch, or any other page.
(function(){
  "use strict";

  var path = (location.pathname || "").toLowerCase();
  var pageMeta = document.querySelector('meta[name="ub-platform"]');
  var platformMeta = pageMeta ? String(pageMeta.content || "").toLowerCase() : "";

  var IS_UNIPACK =
    path.indexOf("unipack") !== -1 ||
    platformMeta === "unipack";

  var IS_UNIFREESTYLE =
    path.indexOf("unifreestyle") !== -1 ||
    platformMeta === "battle" ||
    platformMeta === "unifreestyle";

  // Hard scope lock: do nothing on Radio, Beat Store, or any unrelated page.
  if (!IS_UNIPACK && !IS_UNIFREESTYLE) return;

  var PLATFORM = IS_UNIPACK ? "unipack_soundpack_store" : "unifreestyle";
  var FUNCTIONS_BASE =
    window.UB_STRIPE_CONNECT_FUNCTIONS_BASE ||
    "https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net";

  var state = {
    loading: false,
    accountId: null,
    detailsSubmitted: false,
    chargesEnabled: false,
    payoutsEnabled: false
  };

  function toast(msg, type) {
    if (typeof window.showToast === "function") window.showToast(msg, type);
    else console.log("[UB Stripe Connect]", msg);
  }

  function authApi() {
    return window.UB_FIREBASE && window.UB_FIREBASE.auth
      ? window.UB_FIREBASE
      : null;
  }

  async function getToken() {
    var fb = authApi();
    var user = fb && fb.auth && fb.auth.currentUser;
    if (!user) throw new Error("Sign in before connecting Stripe");
    return user.getIdToken(true);
  }

  async function callFunction(name, body) {
    var token = await getToken();
    var response = await fetch(FUNCTIONS_BASE + "/" + name, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(Object.assign({ platform: PLATFORM }, body || {}))
    });

    var data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || ("Request failed: " + response.status));
    return data;
  }

  function connected() {
    return !!(state.chargesEnabled && state.payoutsEnabled);
  }

  function buttonLabel() {
    if (state.loading) return "CONNECTING…";
    if (connected()) return "STRIPE CONNECTED";
    if (state.accountId) return "CONTINUE STRIPE SETUP";
    return "CONNECT STRIPE";
  }

  function description() {
    if (connected()) {
      return IS_UNIPACK
        ? "Connected. You can receive Sound Pack Store creator payouts."
        : "Connected. You can receive UniFreestyle artist or DJ payouts.";
    }
    if (state.detailsSubmitted) {
      return "Stripe has your information, but payouts are not fully enabled yet.";
    }
    return IS_UNIPACK
      ? "Connect Stripe to receive creator payouts from Sound Pack Store sales."
      : "Connect Stripe to receive UniFreestyle artist or DJ payouts.";
  }

  function render() {
    document.querySelectorAll("[data-ub-connect-stripe]").forEach(function(btn) {
      btn.textContent = buttonLabel();
      btn.disabled = state.loading;
      btn.setAttribute("aria-busy", state.loading ? "true" : "false");
    });

    document.querySelectorAll("[data-ub-stripe-status]").forEach(function(el) {
      el.textContent = description();
    });

    document.querySelectorAll("[data-ub-stripe-dashboard]").forEach(function(btn) {
      btn.style.display = state.accountId ? "" : "none";
    });
  }

  async function refresh(silent) {
    try {
      var data = await callFunction("stripeConnectStatus", {});
      state.accountId = data.accountId || null;
      state.detailsSubmitted = !!data.detailsSubmitted;
      state.chargesEnabled = !!data.chargesEnabled;
      state.payoutsEnabled = !!data.payoutsEnabled;
      render();
      return data;
    } catch (err) {
      if (!silent) toast("Stripe status failed: " + err.message, "error");
      return null;
    }
  }

  async function connectStripe() {
    if (state.loading) return;
    state.loading = true;
    render();

    try {
      var base = location.origin + location.pathname;
      var data = await callFunction("createStripeConnectOnboarding", {
        returnUrl: base + "?stripe_connect=return",
        refreshUrl: base + "?stripe_connect=refresh"
      });
      if (!data.url) throw new Error("No Stripe onboarding link returned");
      location.href = data.url;
    } catch (err) {
      state.loading = false;
      render();
      toast("Stripe Connect failed: " + err.message, "error");
    }
  }

  async function openDashboard() {
    try {
      var data = await callFunction("createStripeExpressDashboardLink", {});
      if (!data.url) throw new Error("No Stripe dashboard link returned");
      location.href = data.url;
    } catch (err) {
      toast("Stripe dashboard failed: " + err.message, "error");
    }
  }

  function card() {
    var title = IS_UNIPACK ? "SOUND PACK CREATOR PAYOUTS" : "ARTIST & DJ PAYOUTS";
    var section = document.createElement("section");
    section.className = "ub-stripe-connect-card";
    section.innerHTML =
      '<div class="ub-stripe-connect-title">' + title + '</div>' +
      '<div class="ub-stripe-connect-copy" data-ub-stripe-status></div>' +
      '<div class="ub-stripe-connect-actions">' +
        '<button type="button" class="ub-connect-primary" data-ub-connect-stripe>CONNECT STRIPE</button>' +
        '<button type="button" class="ub-connect-secondary" data-ub-stripe-dashboard>MANAGE STRIPE</button>' +
      '</div>';

    section.querySelector("[data-ub-connect-stripe]").addEventListener("click", connectStripe);
    section.querySelector("[data-ub-stripe-dashboard]").addEventListener("click", openDashboard);
    return section;
  }

  function addStyles() {
    if (document.getElementById("ub-stripe-connect-styles")) return;
    var style = document.createElement("style");
    style.id = "ub-stripe-connect-styles";
    style.textContent =
      ".ub-stripe-connect-card{margin:16px 0;padding:17px;border:1px solid rgba(201,168,76,.45);" +
      "border-radius:14px;background:linear-gradient(135deg,rgba(201,168,76,.09),rgba(0,170,255,.07));}" +
      ".ub-stripe-connect-title{font-family:'Bebas Neue','Orbitron',sans-serif;font-size:1.25rem;" +
      "letter-spacing:2px;color:#F0C040;margin-bottom:7px;}" +
      ".ub-stripe-connect-copy{font-size:.82rem;line-height:1.45;color:rgba(240,237,232,.72);margin-bottom:12px;}" +
      ".ub-stripe-connect-actions{display:flex;gap:9px;flex-wrap:wrap;}" +
      ".ub-connect-primary,.ub-connect-secondary{border-radius:9px;padding:10px 14px;cursor:pointer;" +
      "font-family:'Orbitron',sans-serif;font-size:.5rem;font-weight:900;letter-spacing:1.2px;}" +
      ".ub-connect-primary{border:0;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}" +
      ".ub-connect-secondary{border:1px solid rgba(64,208,255,.6);background:rgba(64,208,255,.08);color:#40D0FF;}" +
      ".ub-connect-primary:disabled{opacity:.58;cursor:wait;}";
    document.head.appendChild(style);
  }

  function findTarget() {
    if (IS_UNIPACK) {
      return (
        document.querySelector("#page-profile .page-body") ||
        document.querySelector("#page-settings .page-body") ||
        document.querySelector(".profile-page") ||
        document.querySelector(".settings-page") ||
        document.querySelector("main")
      );
    }

    return (
      document.querySelector("#page-settings .page-body") ||
      document.querySelector("#page-profile .page-body") ||
      document.querySelector(".settings-page") ||
      document.querySelector(".profile-page") ||
      document.querySelector("main")
    );
  }

  function inject() {
    if (document.querySelector(".ub-stripe-connect-card")) return;
    var target = findTarget();
    if (!target) return;
    target.appendChild(card());
    render();
  }

  function handleReturn() {
    var params = new URLSearchParams(location.search);
    var result = params.get("stripe_connect");
    if (!result) return;

    if (result === "return") {
      toast("Checking your Stripe account…", "info");
      setTimeout(function() {
        refresh(false).then(function(data) {
          if (data && data.payoutsEnabled && data.chargesEnabled) {
            toast("Stripe connected. Payouts are enabled.", "success");
          } else {
            toast("Stripe setup saved. Finish any remaining Stripe requirements.", "info");
          }
        });
      }, 700);
    } else if (result === "refresh") {
      toast("Stripe setup link expired. Tap Connect Stripe again.", "info");
    }

    params.delete("stripe_connect");
    history.replaceState({}, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
  }

  function boot() {
    addStyles();
    inject();
    handleReturn();

    var fb = authApi();
    if (fb && fb.onAuthStateChanged) {
      fb.onAuthStateChanged(fb.auth, function(user) {
        if (user) refresh(true);
        else {
          state = {
            loading: false,
            accountId: null,
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false
          };
          render();
        }
      });
    }

    // Both apps switch sections dynamically. This only adds the card when its target exists.
    setInterval(inject, 1200);
  }

  window.ubStripeConnect = {
    connect: connectStripe,
    dashboard: openDashboard,
    refresh: refresh,
    state: function() { return Object.assign({}, state); },
    platform: PLATFORM
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
