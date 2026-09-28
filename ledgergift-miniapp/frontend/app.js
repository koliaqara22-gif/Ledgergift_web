/* LedgerGift Mini App front-end */
(function () {
  "use strict";

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }

  const state = {
    boot: null,
    lang: "ru",
    draft: {},        // create-order wizard draft
  };

  // ---- i18n -------------------------------------------------------------
  function t(key) {
    const pack = window.I18N[state.lang] || window.I18N.en;
    return pack[key] || (window.I18N.en[key] || key);
  }

  // ---- helpers ----------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function initData() { return tg && tg.initData ? tg.initData : ""; }
  function startParam() {
    const telegramParam = tg && tg.initDataUnsafe ? tg.initDataUnsafe.start_param : "";
    const urlParam = new URLSearchParams(window.location.search).get("tgWebAppStartParam") || "";
    return telegramParam || urlParam;
  }
  function haptic(type) {
    try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(type || "light"); } catch (e) {}
  }
  function toast(msg) {
    const box = document.getElementById("toast");
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove("show"); }, 2600);
  }

  // ---- API --------------------------------------------------------------
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ "Content-Type": "application/json", "X-Telegram-Init-Data": initData() }, opts.headers || {});
    const res = await fetch(path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const detail = (data && data.detail) ? data.detail : ("HTTP " + res.status);
      throw new Error(detail);
    }
    return data;
  }

  function errText(e) {
    const map = {
      insufficient_funds: t("insufficient_funds"),
      already_paid: t("already_paid"),
      deal_not_found: t("deal_not_found"),
      requisites_required: t("requisites_required"),
    };
    const key = (e && e.message) || "";
    return map[key] || key || t("error");
  }

  // ---- routing ----------------------------------------------------------
  const view = document.getElementById("view");
  function setActiveTab(route) {
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-route") === route);
    });
  }
  const routes = {};
  function go(route, param) {
    if (routes[route]) { routes[route](param); if (route !== "deal") setActiveTab(route); }
  }
  window.LG = { go: go }; // debug hook

  // ---- boot -------------------------------------------------------------
  async function boot() {
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const b = await api("/api/bootstrap");
      state.boot = b;
      state.lang = (b.me && b.me.lang) || "ru";
      applyStaticI18n();
      applyTheme();
      renderAdminTab();
      if (b.start_deal) { go("deal", b.start_deal); }
      else {
        // Regular /start links are forwarded by bot.py in this query parameter.
        // This works without registering a separate BotFather /newapp short name.
        const forwarded = startParam();
        if (forwarded.startsWith("deal_")) go("deal", forwarded.slice(5));
        else go("home");
      }
    } catch (e) {
      view.innerHTML = '<div class="pad center muted">' + esc(errText(e)) +
        '<br><br>\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 Telegram.</div>';
    }
  }

  function applyStaticI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (n) {
      n.textContent = t(n.getAttribute("data-i18n"));
    });
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  }

  function applyTheme() {
    const light = localStorage.getItem("lg-theme") === "light";
    document.body.classList.toggle("light-theme", light);
    const themeButton = document.getElementById("themeBtn");
    if (themeButton) themeButton.textContent = light ? "🌙" : "☀️";
    if (!tg) return;
    try {
      tg.setHeaderColor && tg.setHeaderColor("#000000");
      tg.setBackgroundColor && tg.setBackgroundColor("#0a0a0c");
    } catch (e) {}
  }

  function renderAdminTab() {
    // The Admin entry only exists in the DOM for admins.
    const isAdmin = state.boot && state.boot.me && state.boot.me.is_admin;
    document.body.classList.toggle("is-admin", !!isAdmin);
  }

  function header(title, icon) {
    return '<div class="vhead"><span class="vhead-ic">' + (icon || "") + '</span><h2>' + esc(title) + '</h2></div>';
  }

  // =======================================================================
  // HOME
  // =======================================================================
  routes.home = function () {
    const me = state.boot.me;
    const isAdmin = me.is_admin;
    const card = function (route, icon, label, cls) {
      return '<button class="grid-card ' + (cls || "") + '" data-go="' + route + '">' +
        '<span class="gc-ic">' + icon + '</span><span class="gc-lbl">' + esc(label) + '</span></button>';
    };
    let grid = "";
    grid += card("create", "\ud83c\udf81", t("a_create"), "accent span2");
    grid += card("balance", "\ud83d\udc8e", t("a_balance"));
    grid += card("security", "\ud83d\udee1", t("a_security"));
    grid += card("top", "\ud83d\udcca", t("a_top"));
    grid += card("profile", "\ud83d\udc64", t("a_profile"));
    grid += '<button class="grid-card" data-manager><span class="gc-ic">\ud83d\udcac</span><span class="gc-lbl">' + esc(t("a_manager")) + '</span></button>';
    grid += card("language", "\ud83c\udf10", t("a_language"));
    if (isAdmin) grid += card("admin", "\ud83d\udee1", t("a_admin"), "admin-card span2");

    view.innerHTML =
      '<section class="pad fade">' +
        '<div class="hero">' +
          '<img src="assets/logo.png" class="hero-logo" alt=""/>' +
          '<h1 class="hero-title">' + esc(t("welcome_title")) + '</h1>' +
          '<p class="hero-sub">' + esc(t("welcome_sub")) + '</p>' +
        '</div>' +
        '<div class="grid">' + grid + '</div>' +
      '</section>';

    view.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { haptic(); go(b.getAttribute("data-go")); });
    });
    const mgr = view.querySelector("[data-manager]");
    if (mgr) mgr.addEventListener("click", function () { openManager(); });
  };

  function openManager() {
    const u = state.boot.support_username;
    const url = "https://t.me/" + u;
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank");
  }

  // =======================================================================
  // SECURITY
  // =======================================================================
  routes.security = function () {
    const li = function (n) { return '<li>' + esc(t("sec_" + n)) + '</li>'; };
    view.innerHTML =
      '<section class="pad fade">' +
        header(t("security_title"), "\ud83d\udee1") +
        '<ul class="rules">' + li(1) + li(2) + li(3) + li(4) + '</ul>' +
        '<button class="btn primary block" id="securityManager">@' + esc(state.boot.support_username) + '</button>' +
      '</section>';
    document.getElementById("securityManager").addEventListener("click", openManager);
  };

  // =======================================================================
  // LANGUAGE
  // =======================================================================
  routes.language = function () {
    const langs = state.boot.languages;
    let rows = "";
    Object.keys(langs).forEach(function (code) {
      const active = code === state.lang ? " active" : "";
      rows += '<button class="lang-row' + active + '" data-lang="' + code + '">' + esc(langs[code]) + '</button>';
    });
    view.innerHTML =
      '<section class="pad fade">' + header(t("language_title"), "\ud83c\udf10") +
      '<div class="lang-list">' + rows + '</div></section>';
    view.querySelectorAll("[data-lang]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const code = b.getAttribute("data-lang");
        try {
          await api("/api/language", { method: "POST", body: { lang: code } });
          state.lang = code;
          state.boot.me.lang = code;
          applyStaticI18n();
          toast(t("saved"));
          go("home");
        } catch (e) { toast(errText(e)); }
      });
    });
  };

  // =======================================================================
  // BALANCE
  // =======================================================================
  const CURRENCY_META = {
    Stars: { label: "Stars", asset: "stars.svg" }, TON: { label: "TON", asset: "ton.svg" },
    USDT: { label: "USDT", asset: "usdt.svg" }, RUB: { label: "RUB", asset: "rub.svg" },
    UAH: { label: "UAH", asset: "uah.svg" }, USD: { label: "USD", asset: "usd.svg" },
    BYN: { label: "BYN", asset: "byn.svg" }, KZT: { label: "KZT", asset: "kzt.svg" },
    UZS: { label: "UZS", asset: "uzs.svg" }
  };
  function currencyLabel(c) { return (CURRENCY_META[c] || {}).label || c; }
  function currencyIcon(c, cls) {
    const meta = CURRENCY_META[c];
    return meta ? '<img class="currency-icon ' + (cls || "") + '" src="assets/currency/' + meta.asset + '" alt=""/>' : "";
  }
  function balanceRows(balances) {
    return state.boot.currencies.map(function (c) {
      return '<button class="wallet-row" data-wallet="' + esc(c) + '"><span class="currency-name">' + currencyIcon(c) + esc(currencyLabel(c)) + '</span><b>' + esc(fmt(balances[c] || 0)) + ' <i>›</i></b></button>';
    }).join("");
  }
  function fmt(v) { return Number.isInteger(v) ? String(v) : Number(v).toFixed(2); }

  function historyList(history) {
    if (!history || !history.length) return '<p class="muted">' + esc(t("history_empty")) + '</p>';
    const labels = { manual_topup: t("b_topup"), deal_payment: t("a_create"), deal_release: t("deal_title") };
    return '<div class="hist">' + history.map(function (h) {
      const sign = h.amount > 0 ? "+" : "";
      const cls = h.amount > 0 ? "pos" : "neg";
      const tag = h.deal_tag ? ' #' + esc(h.deal_tag) : "";
      return '<div class="hist-row"><span>' + esc(labels[h.reason] || h.reason) + tag + '</span>' +
        '<b class="' + cls + '">' + sign + esc(fmt(h.amount)) + ' ' + esc(h.currency) + '</b></div>';
    }).join("") + '</div>';
  }

  routes.balance = async function () {
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const d = await api("/api/balances");
      view.innerHTML =
        '<section class="pad fade">' + header(t("balance_title"), "\ud83d\udc8e") +
          '<div class="balance-card"><div class="balance-card-head"><b>' + esc(t("balance_title")) + '</b><span>' + esc(t("wallets")) + '</span></div>' + balanceRows(d.balances) + '</div>' +
          '<div class="btn-row">' +
            '<button class="btn" data-act="withdraw">' + esc(t("b_withdraw")) + '</button>' +
            '<button class="btn primary" data-act="topup">' + esc(t("b_topup")) + '</button>' +
          '</div>' +
          '<h3 class="subhead">' + esc(t("b_history")) + '</h3>' + historyList(d.history) +
        '</section>';
      view.querySelector('[data-act="withdraw"]').addEventListener("click", async function () {
        try { await api("/api/balance/withdraw", { method: "POST" }); toast(t("withdraw_done")); } catch (e) { toast(errText(e)); }
      });
      view.querySelector('[data-act="topup"]').addEventListener("click", function () {
        go("wallets");
      });
      view.querySelectorAll("[data-wallet]").forEach(function (b) { b.addEventListener("click", function () { walletSheet(b.getAttribute("data-wallet"), d.balances[b.getAttribute("data-wallet")] || 0); }); });
    } catch (e) { toast(errText(e)); }
  };

  // =======================================================================
  // WALLETS / REQUISITES
  // =======================================================================
  routes.wallets = async function () {
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const data = await api("/api/requisites");
      const balances = await api("/api/balances");
      const rows = state.boot.currencies.map(function (c) {
        const item = data.items[c];
        return '<button class="wallet-row" data-wallet="' + esc(c) + '"><span class="currency-name">' + currencyIcon(c) + esc(currencyLabel(c)) + '</span><b>' + (item ? '✓ ' + esc(t("requisites_saved")) : esc(t("requisites_empty"))) + ' <i>›</i></b></button>';
      }).join("");
      view.innerHTML = '<section class="pad fade">' + header(t("wallets"), "◈") +
        (data.enabled ? '<div class="wallet-intro">' + esc(t("wallets_hint")) + '</div>' : '<div class="card neg">' + esc(t("requisites_unavailable")) + '</div>') +
        '<div class="balance-card">' + rows + '</div></section>';
      if (data.enabled) view.querySelectorAll("[data-wallet]").forEach(function (b) { b.addEventListener("click", function () { requisitesSheet(b.getAttribute("data-wallet"), data.items[b.getAttribute("data-wallet")] || null, balances.balances[b.getAttribute("data-wallet")] || 0); }); });
    } catch (e) { toast(errText(e)); }
  };

  function showSheet(html) {
    const old = document.getElementById("sheet"); if (old) old.remove();
    document.body.insertAdjacentHTML("beforeend", '<div class="sheet-back" id="sheet"><div class="sheet">' + html + '</div></div>');
    document.getElementById("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") e.currentTarget.remove(); });
    document.querySelector("#sheet [data-close]").addEventListener("click", function () { document.getElementById("sheet").remove(); });
  }

  function walletSheet(currency, amount) {
    showSheet('<button class="sheet-close" data-close>×</button><h2>' + esc(currencyLabel(currency)) + '</h2><div class="wallet-amount"><small>' + esc(t("current_balance")) + '</small><b>' + esc(fmt(amount)) + ' ' + esc(currency) + '</b></div><button class="btn primary block" id="sheetWallet">' + esc(t("wallets")) + '</button><button class="btn ghost block" id="sheetWithdraw">' + esc(t("b_withdraw")) + '</button>');
    document.getElementById("sheetWallet").addEventListener("click", function () { document.getElementById("sheet").remove(); routes.wallets(); });
    document.getElementById("sheetWithdraw").addEventListener("click", function () { toast(t("withdraw_done")); document.getElementById("sheet").remove(); openManager(); });
  }

  function requisitesSheet(currency, item, amount) {
    const crypto = ["TON", "USDT"].includes(currency);
    const stars = currency === "Stars";
    const kind = crypto ? t("requisites_wallet") : (stars ? t("requisites_username") : t("requisites_card"));
    showSheet('<button class="sheet-close" data-close>×</button><h2>' + esc(currencyLabel(currency)) + '</h2><p class="sheet-sub">' + esc(t("requisites_for") + " " + kind) + '</p><label class="fld"><span>' + esc(t("requisites_name")) + '</span><input class="field" id="reqLabel" value="' + esc(item ? item.label : "") + '" placeholder="' + esc(t("requisites_name_hint")) + '"></label><label class="fld"><span>' + esc(kind) + '</span><input class="field" id="reqValue" value="' + esc(item ? item.value : "") + '" placeholder="' + esc(stars ? "@username" : (crypto ? "UQ..." : "0000 0000 0000 0000")) + '"></label><button class="btn primary block" id="reqSave">' + esc(t("save")) + '</button>' + (item ? '<button class="btn danger block" id="reqDelete">' + esc(t("delete")) + '</button>' : ''));
    document.getElementById("reqSave").addEventListener("click", async function () {
      try { await api("/api/requisites", { method: "PUT", body: { currency: currency, kind: crypto ? "wallet" : (stars ? "username" : "card"), label: document.getElementById("reqLabel").value.trim(), value: document.getElementById("reqValue").value.trim() } }); toast(t("saved")); document.getElementById("sheet").remove(); routes.wallets(); } catch (e) { toast(errText(e)); }
    });
    const del = document.getElementById("reqDelete"); if (del) del.addEventListener("click", async function () { try { await api("/api/requisites/" + encodeURIComponent(currency), { method: "DELETE" }); document.getElementById("sheet").remove(); routes.wallets(); } catch (e) { toast(errText(e)); } });
  }

  // =======================================================================
  // PROFILE
  // =======================================================================
  routes.profile = async function () {
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const p = await api("/api/profile");
      const balanceData = await api("/api/balances");
      const deals = await api("/api/deals/history");
      const uname = p.username ? "@" + p.username : "\u2014";
      const displayName = state.boot.me.first_name || uname;
      const total = state.boot.currencies.reduce(function (sum, currency) { return sum + Number(balanceData.balances[currency] || 0); }, 0);
      const cardTheme = localStorage.getItem("lg-card-theme") || "gold";
      const dealRows = deals.deals.length ? deals.deals.map(function (d) { return '<button class="deal-history-row" data-deal="' + esc(d.tag) + '"><span><b>#' + esc(d.tag) + '</b><small>' + esc(d.item_type_label) + '</small></span><span><b>' + esc(d.amount_label) + ' ' + esc(d.currency) + '</b><small>' + esc(statusLabel(d.status)) + '</small></span></button>'; }).join("") : '<p class="muted">' + esc(t("history_empty")) + '</p>';
      view.innerHTML =
        '<section class="pad fade">' + header(t("profile_title"), "\ud83d\udc64") +
          '<div class="flip-wrap theme-' + esc(cardTheme) + '" id="flipCard"><div class="flip-card"><div class="flip-face flip-front"><span class="card-brand">LedgerGift</span><button class="card-palette" id="cardPalette" aria-label="card color">◉</button><div class="pf-avatar">' + esc((p.username || "?").charAt(0).toUpperCase()) + '</div><div class="pf-name">' + esc(displayName) + '</div><div class="pf-user">' + esc(uname) + '</div><small>' + esc(t("total_balance")) + '</small><strong>' + esc(fmt(total)) + '</strong><em>' + esc(t("flip_card")) + ' ↻</em></div><div class="flip-face flip-back"><span class="card-brand">LedgerGift</span><div class="card-line"></div><div class="card-sign">' + esc(displayName) + '</div><div class="card-meta"><small>TELEGRAM ID</small><b>' + esc(String(p.id)) + '</b></div><div class="pf-stats"><div><b>' + esc(String(p.orders)) + '</b><span>' + esc(t("all_deals")) + '</span></div><div><b>' + esc(String(p.orders)) + '</b><span>' + esc(t("success_orders")) + '</span></div><div><b>0</b><span>' + esc(t("st_completed")) + '</span></div><div><b>0</b><span>' + esc(t("cancelled")) + '</span></div></div><em>' + esc(t("flip_card")) + ' ↻</em></div></div></div>' +
          '<div class="profile-actions"><button class="profile-action active" id="profileWallets">◈ ' + esc(t("wallets")) + '</button><button class="profile-action" id="profileLang">◎ ' + esc(t("a_language")) + '</button></div>' +
          '<h3 class="subhead">' + esc(t("deal_title")) + '</h3><div class="deal-history">' + dealRows + '</div>' +
        '</section>';
      document.getElementById("flipCard").addEventListener("click", function () { this.classList.toggle("flipped"); haptic(); });
      document.getElementById("cardPalette").addEventListener("click", function (e) { e.stopPropagation(); cardThemeSheet(); });
      document.getElementById("profileWallets").addEventListener("click", function () { go("wallets"); });
      document.getElementById("profileLang").addEventListener("click", function () { go("language"); });
      view.querySelectorAll("[data-deal]").forEach(function (b) { b.addEventListener("click", function () { go("deal", b.getAttribute("data-deal")); }); });
    } catch (e) { toast(errText(e)); }
  };

  function cardThemeSheet() {
    const themes = [["gold", t("card_gold")], ["ocean", t("card_ocean")], ["emerald", t("card_emerald")], ["violet", t("card_violet")], ["rose", t("card_rose")]];
    showSheet('<button class="sheet-close" data-close>×</button><h2>' + esc(t("card_color")) + '</h2><div class="theme-grid">' + themes.map(function (item) { return '<button class="theme-choice theme-' + item[0] + '" data-card-theme="' + item[0] + '"><span></span><b>' + esc(item[1]) + '</b></button>'; }).join("") + '</div>');
    document.querySelectorAll("[data-card-theme]").forEach(function (button) { button.addEventListener("click", function () { localStorage.setItem("lg-card-theme", button.getAttribute("data-card-theme")); document.getElementById("sheet").remove(); routes.profile(); }); });
  }

  // =======================================================================
  // TOP
  // =======================================================================
  routes.top = async function (mode) {
    mode = mode || "orders";
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const d = await api("/api/top?mode=" + encodeURIComponent(mode));
      let list = "";
      if (!d.items.length) list = '<p class="muted">' + esc(t("top_empty")) + '</p>';
      else list = d.items.map(function (it, i) {
        const metric = mode === "volume" ? (it.volume_label + " Stars") : (it.orders + " " + t("orders_word"));
        return '<div class="top-row"><span class="top-rank">' + (i + 1) + '</span>' +
          '<div class="top-main"><b>' + esc(it.name) + '</b><span class="muted">' + esc(it.level.label) + ' \u00b7 ' + esc(t("rating")) + ' ' + esc(it.rating.toFixed(1)) + '</span></div>' +
          '<span class="top-metric">' + esc(metric) + '</span></div>';
      }).join("");
      const seg = function (m, label) {
        return '<button class="seg' + (m === mode ? " active" : "") + '" data-mode="' + m + '">' + esc(label) + '</button>';
      };
      view.innerHTML =
        '<section class="pad fade">' + header(t("top_title"), "\ud83d\udcca") +
          '<div class="segment">' + seg("orders", t("by_orders")) + seg("volume", t("by_volume")) + '</div>' +
          '<div class="top-list">' + list + '</div></section>';
      view.querySelectorAll("[data-mode]").forEach(function (b) {
        b.addEventListener("click", function () { routes.top(b.getAttribute("data-mode")); });
      });
    } catch (e) { toast(errText(e)); }
  };

  // =======================================================================
  // CREATE ORDER (wizard)
  // =======================================================================
  function wizardShell(inner) {
    view.innerHTML = '<section class="pad fade">' + header(t("create_title"), "\ud83c\udf81") + inner + '</section>';
  }
  function backBtn(handler) {
    const b = el('<button class="btn ghost">' + esc(t("back")) + '</button>');
    b.addEventListener("click", handler);
    return b;
  }

  routes.create = function () { state.draft = {}; stepType(); };

  function stepType() {
    const types = state.boot.deal_types;
    const icons = { nft: "\ud83d\uddbc", stars: "\u2b50", username: "\ud83d\udc64", crypto: "\ud83d\udca0", premium: "\ud83d\udc51" };
    let cards = "";
    Object.keys(types).forEach(function (k) {
      const label = types[k][state.lang === "ru" ? "ru" : "en"] || types[k].en;
      cards += '<button class="type-card" data-type="' + k + '"><span class="tc-ic">' + (icons[k] || "") + '</span>' + esc(label) + '</button>';
    });
    wizardShell('<p class="step-label">' + esc(t("step_type")) + '</p><div class="type-grid">' + cards + '</div>');
    view.querySelectorAll("[data-type]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.draft.item_type = b.getAttribute("data-type");
        haptic();
        if (state.draft.item_type === "stars") stepStars(); else stepLink();
      });
    });
  }

  function inputStep(labelKey, placeholder, prevFn, nextFn, opts) {
    opts = opts || {};
    wizardShell(
      '<p class="step-label">' + esc(t(labelKey)) + '</p>' +
      '<input class="field" id="stepInput" type="' + (opts.type || "text") + '" placeholder="' + esc(placeholder) + '" ' +
      (opts.inputmode ? 'inputmode="' + opts.inputmode + '" ' : "") + '/>' +
      '<div id="stepErr" class="field-err"></div>' +
      '<div class="btn-row" id="stepBtns"></div>'
    );
    const input = document.getElementById("stepInput");
    if (opts.value) input.value = opts.value;
    const nextB = el('<button class="btn primary">' + esc(opts.last ? t("create_btn") : t("next")) + '</button>');
    nextB.addEventListener("click", function () { nextFn(input.value.trim()); });
    const btns = document.getElementById("stepBtns");
    btns.appendChild(backBtn(prevFn));
    btns.appendChild(nextB);
    input.focus();
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") nextB.click(); });
  }

  function showStepErr(msg) { const e = document.getElementById("stepErr"); if (e) e.textContent = msg; }

  function stepStars() {
    inputStep("step_stars", "500", stepType, function (v) {
      if (!/^\d+$/.test(v)) return showStepErr("\u21063\u2026");
      state.draft.stars_count = parseInt(v, 10);
      stepLink();
    }, { type: "number", inputmode: "numeric", value: state.draft.stars_count || "" });
  }

  function stepLink() {
    inputStep("step_link", "https://t.me/nft/example", state.draft.item_type === "stars" ? stepStars : stepType, function (v) {
      if (state.draft.item_type !== "stars" && !/^https?:\/\/t\.me\//.test(v)) return showStepErr("t.me/\u2026");
      state.draft.item_link = v || "Telegram Stars";
      stepCurrency();
    }, { value: state.draft.item_link || "" });
  }

  function stepCurrency() {
    let btns = "";
    state.boot.currencies.forEach(function (c) {
      btns += '<button class="cur-card" data-cur="' + c + '">' + currencyIcon(c, "currency-icon-lg") + '<span>' + esc(currencyLabel(c)) + '</span></button>';
    });
    wizardShell('<p class="step-label">' + esc(t("step_currency")) + '</p><div class="cur-grid">' + btns + '</div><div class="btn-row" id="cb"></div>');
    document.getElementById("cb").appendChild(backBtn(stepLink));
    view.querySelectorAll("[data-cur]").forEach(function (b) {
      b.addEventListener("click", function () { state.draft.currency = b.getAttribute("data-cur"); haptic(); stepAmount(); });
    });
  }

  function stepAmount() {
    inputStep("step_amount", "100", stepCurrency, function (v) {
      const num = parseFloat(v.replace(",", "."));
      if (!(num > 0)) return showStepErr("> 0");
      state.draft.amount = num;
      stepBuyer();
    }, { type: "number", inputmode: "decimal", value: state.draft.amount || "" });
  }

  function stepBuyer() {
    inputStep("step_buyer", "@username", stepAmount, async function (v) {
      const u = v.replace(/^@/, "");
      if (u.length < 2) return showStepErr("@username");
      state.draft.buyer_username = u;
      await submitDeal();
    }, { value: state.draft.buyer_username ? "@" + state.draft.buyer_username : "", last: true });
  }

  async function submitDeal() {
    try {
      const d = state.draft;
      const res = await api("/api/deal/create", { method: "POST", body: {
        item_type: d.item_type, item_link: d.item_link || "", stars_count: d.stars_count || null,
        currency: d.currency, amount: d.amount, buyer_username: d.buyer_username
      }});
      dealCreated(res.deal, res.share_link);
    } catch (e) { showStepErr(errText(e)); }
  }

  function dealCreated(deal, link) {
    view.innerHTML =
      '<section class="pad fade">' + header(t("deal_created"), "\u2705") +
        '<div class="card">' +
          row(t("item"), deal.item_type_label) +
          row(t("amount"), deal.amount_label + " " + deal.currency) +
          row(t("buyer"), "@" + deal.buyer_username) +
          row(t("deal_title"), "#" + deal.tag) +
        '</div>' +
        '<p class="step-label">' + esc(t("share_link")) + '</p>' +
        '<div class="link-box"><code id="shareLink">' + esc(link) + '</code></div>' +
        '<div class="btn-row">' +
          '<button class="btn" id="copyBtn">' + esc(t("copy")) + '</button>' +
          '<button class="btn primary" id="shareBtn">' + esc(t("sharetg")) + '</button>' +
        '</div></section>';
    document.getElementById("copyBtn").addEventListener("click", function () {
      copyText(link); toast(t("copied"));
    });
    document.getElementById("shareBtn").addEventListener("click", function () {
      const share = "https://t.me/share/url?url=" + encodeURIComponent(link);
      if (tg && tg.openTelegramLink) tg.openTelegramLink(share); else window.open(share, "_blank");
    });
  }

  function row(k, v) { return '<div class="bal-row"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }

  function copyText(txt) {
    try { navigator.clipboard.writeText(txt); } catch (e) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) {} document.body.removeChild(ta);
    }
  }

  // =======================================================================
  // DEAL VIEW (buyer pays / confirms)
  // =======================================================================
  function statusLabel(s) { return t("st_" + s) || s; }

  routes.deal = async function (tag) {
    setActiveTab("");
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const d = await api("/api/deal/" + encodeURIComponent(tag));
      renderDeal(d);
    } catch (e) { view.innerHTML = '<div class="pad center muted">' + esc(errText(e)) + '</div>'; }
  };

  function renderDeal(d) {
    const deal = d.deal, role = d.role;
    let actions = "";
    if (role.can_pay) actions += '<button class="btn primary block" id="payBtn">' + esc(t("pay_from_balance")) + '</button>';
    if (role.can_confirm) {
      actions += '<button class="btn primary block" id="yesBtn">' + esc(t("yes_received")) + '</button>' +
                 '<button class="btn block" id="noBtn">' + esc(t("no")) + '</button>';
    }
    if (!role.can_pay && !role.can_confirm && !role.is_seller && !role.is_staff) {
      actions += '<p class="muted">' + esc(t("not_your_deal")) + '</p>';
    }
    actions += '<button class="btn ghost block" id="supBtn">' + esc(t("support")) + '</button>';

    view.innerHTML =
      '<section class="pad fade">' + header(t("deal_title") + " #" + deal.tag, "\ud83d\udee1") +
        '<div class="card">' +
          row(t("status"), statusLabel(deal.status)) +
          row(t("item"), deal.item_type_label) +
          row(t("link"), deal.item_link) +
          row(t("amount"), deal.amount_label + " " + deal.currency) +
          row(t("seller"), "@" + deal.seller_username) +
          row(t("buyer"), "@" + deal.buyer_username) +
        '</div>' +
        '<div class="deal-actions">' + actions + '</div>' +
      '</section>';

    const pay = document.getElementById("payBtn");
    if (pay) pay.addEventListener("click", async function () {
      try { await api("/api/deal/" + deal.tag + "/pay", { method: "POST" }); toast(t("paid_ok")); routes.deal(deal.tag); }
      catch (e) { toast(errText(e)); }
    });
    const yes = document.getElementById("yesBtn");
    if (yes) yes.addEventListener("click", async function () {
      try { await api("/api/deal/" + deal.tag + "/receipt", { method: "POST", body: { received: true } }); toast(t("completed_ok")); routes.deal(deal.tag); }
      catch (e) { toast(errText(e)); }
    });
    const no = document.getElementById("noBtn");
    if (no) no.addEventListener("click", function () { openManager(); });
    document.getElementById("supBtn").addEventListener("click", openManager);
  }

  // =======================================================================
  // ADMIN PANEL (only reachable for admins; server also enforces this)
  // =======================================================================
  routes.admin = function () {
    if (!state.boot.me.is_admin) { go("home"); return; }
    const isOwner = state.boot.me.is_owner;
    const item = function (act, icon, label) {
      return '<button class="adm-item" data-adm="' + act + '"><span>' + icon + '</span>' + esc(label) + '</button>';
    };
    let items = "";
    items += item("addbalance", "\ud83d\udcb3", t("adm_addbalance"));
    items += item("user", "\ud83d\udc64", t("adm_user"));
    items += item("deal", "\ud83d\udce6", t("adm_deal"));
    items += item("active", "\u26a1", t("adm_active"));
    items += item("stats", "\ud83d\udcca", t("adm_stats"));
    items += item("paylink", "\u2699\ufe0f", t("adm_paylink"));
    items += item("myhistory", "\ud83e\uddfe", t("adm_myhistory"));
    if (isOwner) {
      items += item("team", "\ud83d\udc65", t("adm_team"));
      items += item("addadmin", "\u2795", t("adm_addadmin"));
    }
    view.innerHTML = '<section class="pad fade">' + header(t("admin_title"), "\ud83d\udee1") +
      '<div class="adm-list">' + items + '</div><div id="admPanel"></div></section>';
    view.querySelectorAll("[data-adm]").forEach(function (b) {
      b.addEventListener("click", function () { admAction(b.getAttribute("data-adm")); });
    });
  };

  function admField(id, label, opts) {
    opts = opts || {};
    return '<label class="fld"><span>' + esc(label) + '</span>' +
      '<input class="field" id="' + id + '" type="' + (opts.type || "text") + '" ' +
      (opts.inputmode ? 'inputmode="' + opts.inputmode + '" ' : "") +
      (opts.value !== undefined ? 'value="' + esc(opts.value) + '" ' : "") +
      'placeholder="' + esc(opts.ph || "") + '"/></label>';
  }

  function admAction(act) {
    const panel = document.getElementById("admPanel");
    const cur = state.boot.currencies.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("");
    let form = "";
    if (act === "team") {
      showTeam();
      return;
    } else if (act === "active") {
      showActiveDeals();
      return;
    } else if (act === "addbalance") {
      form = admField("a_uid", t("user_id"), { type: "number", inputmode: "numeric", ph: "123456789" }) +
        admField("a_amt", t("amount"), { type: "number", inputmode: "decimal", ph: "1000" }) +
        '<label class="fld"><span>Currency</span><select class="field" id="a_cur">' + cur + '</select></label>';
    } else if (act === "user") {
      form = admField("a_uid", t("user_id"), { type: "number", inputmode: "numeric", ph: "123456789" });
    } else if (act === "deal") {
      form = admField("a_tag", t("deal_title"), { ph: "LGABC123" });
    } else if (act === "stats") {
      form = admField("a_uid", t("user_id"), { type: "number", inputmode: "numeric" }) +
        admField("a_ord", t("success_orders"), { type: "number", inputmode: "numeric", ph: "25" }) +
        admField("a_rat", t("rating"), { type: "number", inputmode: "decimal", ph: "4.9" }) +
        admField("a_vol", t("volume"), { type: "number", inputmode: "decimal", ph: "15000" });
    } else if (act === "paylink") {
      form = admField("a_url", "URL", { ph: "https://t.me/..." });
    } else if (act === "addadmin") {
      form = admField("a_uid", t("user_id"), { type: "number", inputmode: "numeric" }) +
        admField("a_name", t("adm_staff_name"), { ph: t("adm_staff_name_hint") });
    } else if (act === "myhistory") {
      panel.innerHTML = '<div class="loader"><div class="spin"></div></div>';
      api("/api/admin/history").then(function (d) {
        panel.innerHTML = '<div class="card">' + historyList(d.history) + '</div>';
      }).catch(function (e) { toast(errText(e)); });
      return;
    }
    panel.innerHTML = '<div class="card">' + form +
      '<button class="btn primary block" id="admSubmit">' + esc(t("submit")) + '</button>' +
      '<div id="admResult" class="adm-result"></div></div>';
    document.getElementById("admSubmit").addEventListener("click", function () { admSubmit(act); });
  }

  function teamName(member) {
    if (member.display_name) return member.display_name;
    if (member.username) return "@" + member.username;
    return member.first_name || "ID " + member.id;
  }

  async function showTeam() {
    const panel = document.getElementById("admPanel");
    panel.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const data = await api("/api/admin/team");
      panel.innerHTML = '<div class="team-head"><p>' + esc(t("adm_team_hint")) + '</p></div><div class="team-list">' +
        data.members.map(function (m) {
          return '<button class="team-row" data-member="' + m.id + '"><span class="team-avatar">' + (m.role === "owner" ? "✦" : "♜") +
            '</span><span><b>' + esc(teamName(m)) + '</b><small>' + esc(m.role === "owner" ? t("adm_owner") : t("adm_admin")) + (m.display_name && m.username ? ' · @' + esc(m.username) : '') + ' · ID ' + m.id + '</small></span><i>›</i></button>';
        }).join("") + '</div>';
      panel.querySelectorAll("[data-member]").forEach(function (button) {
        button.addEventListener("click", function () { showMember(parseInt(button.getAttribute("data-member"), 10)); });
      });
    } catch (e) { panel.innerHTML = '<p class="neg">' + esc(errText(e)) + '</p>'; }
  }

  async function showMember(memberId) {
    const panel = document.getElementById("admPanel");
    panel.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const d = await api("/api/admin/user/" + memberId);
      const team = await api("/api/admin/team");
      const member = team.members.find(function (item) { return item.id === memberId; });
      const title = member ? teamName(member) : (d.username ? "@" + d.username : "ID " + d.id);
      const deals = d.deals.length ? '<div class="deal-history">' + d.deals.map(function (deal) {
        return '<button class="deal-history-row" data-team-deal="' + esc(deal.tag) + '"><span><b>#' + esc(deal.tag) + '</b><small>' + esc(deal.item_type_label) + '</small></span><span><b>' + esc(deal.amount_label) + ' ' + esc(deal.currency) + '</b><small>' + esc(statusLabel(deal.status)) + '</small></span></button>';
      }).join("") + '</div>' : '<p class="muted">' + esc(t("adm_no_deals")) + '</p>';
      const cur = state.boot.currencies.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("");
      panel.innerHTML = '<div class="member-title"><b>' + esc(title) + '</b><small>ID ' + d.id + '</small></div>' +
        (member && member.removable ? '<div class="card member-name">' + admField("m_name", t("adm_staff_name"), { value: member.display_name || "", ph: t("adm_staff_name_hint") }) + '<button class="btn ghost block" id="memberNameSave">' + esc(t("adm_save_name")) + '</button></div>' : '') +
        '<div class="card">' + balanceRows(d.balances) + '</div>' +
        '<div class="card member-topup">' + admField("m_amt", t("amount"), { type: "number", inputmode: "decimal", ph: "1000" }) +
        '<label class="fld"><span>Currency</span><select class="field" id="m_cur">' + cur + '</select></label>' +
        '<button class="btn primary block" id="memberTopup">' + esc(t("adm_topup_member")) + '</button></div>' +
        '<h3 class="subhead">' + esc(t("adm_deals")) + '</h3>' + deals +
        (member && member.removable ? '<button class="btn danger block" id="memberRemove">' + esc(t("adm_remove")) + '</button>' : '<p class="muted protected">' + esc(t("adm_protected")) + '</p>');
      document.getElementById("memberTopup").addEventListener("click", async function () {
        try {
          await api("/api/admin/addbalance", { method: "POST", body: { user_id: d.id, amount: parseFloat(num("m_amt")), currency: document.getElementById("m_cur").value } });
          toast(t("done")); showMember(d.id);
        } catch (e) { toast(errText(e)); }
      });
      const saveName = document.getElementById("memberNameSave");
      if (saveName) saveName.addEventListener("click", async function () {
        try {
          await api("/api/admin/team/" + d.id, { method: "PATCH", body: { display_name: document.getElementById("m_name").value.trim() } });
          toast(t("done")); showMember(d.id);
        } catch (e) { toast(errText(e)); }
      });
      panel.querySelectorAll("[data-team-deal]").forEach(function (button) { button.addEventListener("click", function () { go("deal", button.getAttribute("data-team-deal")); }); });
      const remove = document.getElementById("memberRemove");
      if (remove) remove.addEventListener("click", async function () {
        if (!confirm(t("adm_remove") + " — " + title + "?")) return;
        try { await api("/api/admin/team/" + d.id, { method: "DELETE" }); toast(t("done")); showTeam(); } catch (e) { toast(errText(e)); }
      });
    } catch (e) { panel.innerHTML = '<p class="neg">' + esc(errText(e)) + '</p>'; }
  }

  async function showActiveDeals() {
    const panel = document.getElementById("admPanel");
    panel.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const data = await api("/api/admin/active-deals");
      const render = function (filter) {
        const visible = data.deals.filter(function (deal) { return filter === "all" || deal.status === filter; });
        const rows = visible.length ? '<div class="deal-history">' + visible.map(function (deal) {
          const workspace = data.workspaces[deal.tag] || {};
          const manager = data.team.find(function (member) { return member.id === workspace.assigned_admin_id; });
          const owner = manager ? teamName(manager) : t("adm_unassigned");
          return '<button class="deal-history-row" data-active-deal="' + esc(deal.tag) + '"><span><b>#' + esc(deal.tag) + '</b><small>@' + esc(deal.seller_username) + ' → @' + esc(deal.buyer_username) + '</small></span><span><b>' + esc(deal.amount_label) + ' ' + esc(deal.currency) + '</b><small class="deal-owner">♜ ' + esc(owner) + ' · ' + esc(statusLabel(deal.status)) + '</small></span></button>';
        }).join("") + '</div>' : '<p class="muted">' + esc(t("adm_no_active")) + '</p>';
        panel.querySelector("#activeRows").innerHTML = rows;
        panel.querySelectorAll("[data-active-deal]").forEach(function (button) { button.addEventListener("click", function () { showDealWorkspace(button.getAttribute("data-active-deal")); }); });
      };
      panel.innerHTML = '<div class="active-summary"><button class="active-stat" data-active-filter="created"><b>' + data.summary.created + '</b><small>' + esc(t("adm_wait_payment")) + '</small></button>' +
        '<button class="active-stat paid" data-active-filter="paid"><b>' + data.summary.paid + '</b><small>' + esc(t("adm_wait_item")) + '</small></button></div>' +
        '<div class="active-filter"><button class="seg active" data-active-filter="all">' + esc(t("adm_all_active")) + '</button><button class="seg" data-active-filter="created">' + esc(t("adm_wait_payment")) + '</button><button class="seg" data-active-filter="paid">' + esc(t("adm_wait_item")) + '</button></div><div id="activeRows"></div>';
      panel.querySelectorAll("[data-active-filter]").forEach(function (button) { button.addEventListener("click", function () { render(button.getAttribute("data-active-filter")); }); });
      render("all");
    } catch (e) { panel.innerHTML = '<p class="neg">' + esc(errText(e)) + '</p>'; }
  }

  async function showDealWorkspace(tag) {
    const panel = document.getElementById("admPanel");
    panel.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const data = await api("/api/admin/deal/" + encodeURIComponent(tag));
      const deal = data.deal, workspace = data.workspace || {};
      const options = '<option value="">' + esc(t("adm_unassigned")) + '</option>' + data.team.map(function (member) {
        return '<option value="' + member.id + '"' + (member.id === workspace.assigned_admin_id ? ' selected' : '') + '>' + esc(teamName(member)) + '</option>';
      }).join("");
      panel.innerHTML = '<button class="back-link" id="backToDeals">‹ ' + esc(t("adm_active")) + '</button>' +
        '<div class="workspace-title"><b>#' + esc(deal.tag) + '</b><small>' + esc(deal.amount_label) + ' ' + esc(deal.currency) + ' · ' + esc(statusLabel(deal.status)) + '</small></div>' +
        '<div class="card workspace-card">' +
          '<label class="fld"><span>' + esc(t("adm_assign")) + '</span><select class="field" id="workspaceMember">' + options + '</select></label>' +
          '<label class="fld"><span>' + esc(t("adm_note")) + '</span><textarea class="field workspace-note" id="workspaceNote" maxlength="300" placeholder="' + esc(t("adm_note_hint")) + '">' + esc(workspace.note || "") + '</textarea></label>' +
          '<button class="btn primary block" id="workspaceSave">' + esc(t("adm_save_workspace")) + '</button></div>' +
        '<button class="btn ghost block" id="openDeal">' + esc(t("adm_open_deal")) + '</button>';
      document.getElementById("backToDeals").addEventListener("click", showActiveDeals);
      document.getElementById("openDeal").addEventListener("click", function () { go("deal", deal.tag); });
      document.getElementById("workspaceSave").addEventListener("click", async function () {
        const selected = document.getElementById("workspaceMember").value;
        try {
          await api("/api/admin/deal/" + encodeURIComponent(deal.tag) + "/workspace", { method: "PATCH", body: {
            assigned_admin_id: selected ? parseInt(selected, 10) : null,
            note: document.getElementById("workspaceNote").value.trim()
          } });
          toast(t("done")); showDealWorkspace(deal.tag);
        } catch (e) { toast(errText(e)); }
      });
    } catch (e) { panel.innerHTML = '<p class="neg">' + esc(errText(e)) + '</p>'; }
  }

  function num(id) { const v = document.getElementById(id).value.trim().replace(",", "."); return v; }

  async function admSubmit(act) {
    const out = document.getElementById("admResult");
    try {
      if (act === "addbalance") {
        const d = await api("/api/admin/addbalance", { method: "POST", body: {
          user_id: parseInt(num("a_uid"), 10), amount: parseFloat(num("a_amt")), currency: document.getElementById("a_cur").value } });
        out.innerHTML = '<p class="pos">' + esc(t("done")) + '</p>' + balanceRows(d.balances);
      } else if (act === "user") {
        const d = await api("/api/admin/user/" + parseInt(num("a_uid"), 10));
        out.innerHTML = row("ID", d.id) + row(t("a_profile"), (d.username ? "@" + d.username : "\u2014")) +
          row(t("level"), d.profile.level.label) + row(t("success_orders"), d.profile.orders) +
          '<div class="sep"></div>' + balanceRows(d.balances) + historyList(d.history);
      } else if (act === "deal") {
        const d = await api("/api/admin/deal/" + encodeURIComponent(document.getElementById("a_tag").value.trim()));
        const deal = d.deal;
        out.innerHTML = row(t("status"), statusLabel(deal.status)) + row(t("item"), deal.item_type_label) +
          row(t("amount"), deal.amount_label + " " + deal.currency) + row(t("seller"), "@" + deal.seller_username) +
          row(t("buyer"), "@" + deal.buyer_username);
      } else if (act === "stats") {
        await api("/api/admin/setstats", { method: "POST", body: {
          user_id: parseInt(num("a_uid"), 10), orders: parseInt(num("a_ord"), 10),
          rating: parseFloat(num("a_rat")), volume: parseFloat(num("a_vol") || "0") } });
        out.innerHTML = '<p class="pos">' + esc(t("done")) + '</p>';
      } else if (act === "paylink") {
        const d = await api("/api/admin/setpaylink", { method: "POST", body: { url: document.getElementById("a_url").value.trim() } });
        state.boot.payment_url = d.payment_url;
        out.innerHTML = '<p class="pos">' + esc(t("done")) + '</p>';
      } else if (act === "addadmin") {
        await api("/api/admin/addadmin", { method: "POST", body: { user_id: parseInt(num("a_uid"), 10), display_name: document.getElementById("a_name").value.trim() } });
        out.innerHTML = '<p class="pos">' + esc(t("done")) + '</p>';
      }
      haptic("medium");
    } catch (e) { out.innerHTML = '<p class="neg">' + esc(errText(e)) + '</p>'; }
  }

  // ---- wiring -----------------------------------------------------------
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { haptic(); go(b.getAttribute("data-route")); });
  });
  document.getElementById("langBtn").addEventListener("click", function () { go("language"); });
  document.getElementById("themeBtn").addEventListener("click", function () { localStorage.setItem("lg-theme", localStorage.getItem("lg-theme") === "light" ? "dark" : "light"); applyTheme(); haptic(); });
  document.getElementById("homeBtn").addEventListener("click", function () { haptic(); go("home"); });

  boot();
})();
