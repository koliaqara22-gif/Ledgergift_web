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

  const ICONS = {
    gift: '<svg viewBox="0 0 24 24"><path d="M4 10h16v10H4zM12 10v10M3 6h18v4H3zM8 6a2.5 2.5 0 1 1 4 0v0H8zm4 0a2.5 2.5 0 1 1 4 0h-4z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 4h16M16 14h2"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zm0 2H4v2a3 3 0 0 0 3 3m10-5h3v2a3 3 0 0 1-3 3"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
    withdraw: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-3.4-.8L4 20l1.5-3.5A7.2 7.2 0 0 1 4 12a7.5 7.5 0 0 1 8-7.5 7.5 7.5 0 0 1 8 7z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    nft: '<svg viewBox="0 0 24 24"><path d="m12 3 7 4v10l-7 4-7-4V7zM5 7l7 4 7-4M12 11v10"/><path d="m8 9 4 2 4-2"/></svg>',
    stars: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    username: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M18 5l2 2-2 2"/></svg>',
    crypto: '<svg viewBox="0 0 24 24"><path d="m12 3 7 9-7 9-7-9zM5 12h14M12 3v18"/></svg>',
    premium: '<svg viewBox="0 0 24 24"><path d="m4 8 4 4 4-7 4 7 4-4-2 10H6zM6 21h12"/></svg>',
    team: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 5a3 3 0 0 1 0 6M20 20a5 5 0 0 0-3-4.6"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.8v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5.6v-2.8h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h2.8v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="m21 3-8.5 18-2.3-7.2L3 11.5zM10.2 13.8 21 3"/></svg>'
  };
  function icon(name) { return '<span class="app-icon">' + (ICONS[name] || ICONS.shield) + '</span>'; }

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
    const dealParam = new URLSearchParams(window.location.search).get("deal") || "";
    const hashParam = (window.location.hash || "").replace(/^#deal_?/, "");
    return telegramParam || urlParam || (dealParam ? "deal_" + dealParam : "") || (hashParam ? "deal_" + hashParam : "");
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
  function celebrate() {
    document.body.classList.remove("success-flash");
    void document.body.offsetWidth;
    document.body.classList.add("success-flash");
    const sparks = document.createElement("div");
    sparks.className = "success-sparkles";
    sparks.setAttribute("aria-hidden", "true");
    sparks.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
    document.body.appendChild(sparks);
    setTimeout(function () { sparks.remove(); }, 820);
    setTimeout(function () { document.body.classList.remove("success-flash"); }, 720);
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
      card_number_invalid: t("card_number_invalid"),
      username_invalid: t("username_invalid"),
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
    const savedTheme = localStorage.getItem("lg-theme") || "light";
    const selected = savedTheme === "dark" ? "dark" : "light";
    if (savedTheme !== selected) localStorage.setItem("lg-theme", selected);
    const light = selected === "light";
    document.body.classList.toggle("light-theme", light);
    document.body.classList.remove("theme-dark", "theme-aurora", "theme-sunset", "theme-midnight");
    if (!light) document.body.classList.add("theme-dark");
    const lightButton = document.getElementById("themeLight");
    const darkButton = document.getElementById("themeDark");
    if (lightButton) lightButton.classList.toggle("active", light);
    if (darkButton) darkButton.classList.toggle("active", !light);
    try {
      tg && tg.setHeaderColor && tg.setHeaderColor(light ? "#f8f9ff" : "#090d18");
      tg && tg.setBackgroundColor && tg.setBackgroundColor(light ? "#f2f3f8" : "#090d18");
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
  routes.home = async function () {
    const me = state.boot.me;
    const isAdmin = me.is_admin;
    const card = function (route, icon, label, cls) {
      return '<button class="grid-card ' + (cls || "") + '" data-go="' + route + '">' +
        '<span class="gc-ic">' + icon + '</span><span class="gc-lbl">' + esc(label) + '</span></button>';
    };
    let grid = "";
    grid += card("create", icon("gift"), t("a_create"), "accent span2");
    grid += card("how", icon("shield"), t("how_title"), "how-card span2");
    grid += card("security", icon("shield"), t("a_security"), "span2");
    grid += card("language", icon("globe"), t("a_language"), "span2");
    if (isAdmin) grid += card("admin", icon("shield"), t("a_admin"), "admin-card span2");

    view.innerHTML =
      '<section class="pad fade">' +
        '<div class="hero">' +
          '<img src="assets/logo.png" class="hero-logo" alt=""/>' +
          '<h1 class="hero-title">' + esc(t("welcome_title")) + '</h1>' +
          '<p class="hero-sub">' + esc(t("welcome_sub")) + '</p>' +
        '</div>' +
        '<div class="home-overview skeleton-block" aria-hidden="true"></div><div class="grid">' + grid + '</div>' +
      '</section>';

    view.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { haptic(); go(b.getAttribute("data-go")); });
    });
    try {
      const data = await api("/api/deals/history");
      const profile = await api("/api/profile");
      const active = (data.deals || []).filter(function (deal) { return deal.status !== "completed"; }).slice(0, 3);
      const levelLabel = String((profile.level || {}).label || t("level")).replace(/^[^A-Za-zА-Яа-я0-9]+\s*/, "");
      const overview = '<div class="home-overview">' +
        '<div><small>' + esc(t("level")) + '</small><b>' + esc(levelLabel) + '</b></div>' +
        '<div><small>' + esc(t("volume")) + '</small><b>' + esc(profile.volume_label || "0") + '</b></div>' +
        '<div><small>' + esc(t("home_active")) + '</small><b>' + active.length + '</b></div></div>';
      const activeHtml = active.length ? '<section class="home-active"><h3>' + esc(t("home_active")) + '</h3><div class="deal-history">' + active.map(function (deal) {
        return '<button class="deal-history-row status-' + esc(deal.status) + '" data-home-deal="' + esc(deal.tag) + '"><span><b>#' + esc(deal.tag) + '</b><small>' + esc(deal.item_type_label) + '</small></span><span><b>' + esc(deal.amount_label) + ' ' + esc(deal.currency) + '</b><small>' + esc(statusLabel(deal.status)) + '</small></span></button>';
      }).join("") + '</div></section>' : '';
      const placeholder = view.querySelector(".home-overview");
      if (placeholder) placeholder.outerHTML = overview + activeHtml;
      view.querySelectorAll("[data-home-deal]").forEach(function (button) { button.addEventListener("click", function () { go("deal", button.getAttribute("data-home-deal")); }); });
    } catch (e) {
      const placeholder = view.querySelector(".home-overview");
      if (placeholder) placeholder.remove();
    }
  };

  // =======================================================================
  // SECURITY
  // =======================================================================
  routes.security = function () {
    const li = function (n) { return '<li>' + esc(t("sec_" + n)) + '</li>'; };
    view.innerHTML =
      '<section class="pad fade">' +
        header(t("security_title"), icon("shield")) +
        '<ul class="rules">' + li(1) + li(2) + li(3) + li(4) + '</ul>' +
      '</section>';
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
      '<section class="pad fade">' + header(t("language_title"), icon("globe")) +
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

  function transactionList(history) {
    if (!history || !history.length) return '<p class="muted">' + esc(t("history_empty")) + '</p>';
    const labels = {
      manual_topup: t("tx_topup"), deal_payment: t("tx_payment"), deal_release: t("tx_release"), withdrawal_request: t("tx_withdraw_request")
    };
    return '<div class="transaction-list">' + history.map(function (h) {
      const pending = h.reason === "withdrawal_request";
      const positive = h.amount >= 0;
      const title = pending ? t("withdraw_" + (h.withdrawal_stage || "created")) : (labels[h.reason] || h.reason);
      const detail = h.deal_tag ? t("deal_title") + ' #' + h.deal_tag : (h.created_at || "");
      const shownAmount = pending ? Math.abs(Number(h.amount)) : h.amount;
      return '<div class="transaction-row"><span class="transaction-icon ' + (pending ? 'pending' : (positive ? 'income' : 'expense')) + '">' + icon(pending ? "withdraw" : (positive ? "wallet" : "chart")) + '</span><span class="transaction-copy"><b>' + esc(title) + '</b><small>' + esc(detail) + '</small></span><b class="' + (pending ? 'pending-text' : (positive ? 'pos' : 'neg')) + '">' + (pending ? '' : (positive ? '+' : '−')) + esc(fmt(shownAmount)) + ' ' + esc(h.currency) + '</b></div>';
    }).join("") + '</div>';
  }

  function renderCurrencyBalance(data, selectedCurrency, motion) {
    const currencies = state.boot.currencies || [];
    const selected = currencies.indexOf(selectedCurrency) >= 0 ? selectedCurrency : (currencies[0] || "Stars");
    const selectedIndex = Math.max(0, currencies.indexOf(selected));
    const nextCurrency = currencies[(selectedIndex + 1) % currencies.length] || selected;
    const amount = Number((data.balances || {})[selected] || 0);
    const cardClass = String(selected).toLowerCase();
    const tabs = currencies.map(function (currency) {
      return '<button class="currency-tab' + (currency === selected ? ' active' : '') + '" data-currency-card="' + esc(currency) + '">' + currencyIcon(currency) + '<span>' + esc(currencyLabel(currency)) + '</span></button>';
    }).join("");
    view.innerHTML =
      '<section class="pad fade">' + header(t("balance_title"), icon("wallet")) +
        '<div class="currency-tabs" role="tablist">' + tabs + '</div>' +
        '<div class="currency-deck"><div class="currency-deck-underlay currency-' + esc(String(nextCurrency).toLowerCase()) + '" aria-hidden="true"></div><article class="currency-showcase currency-' + esc(cardClass) + (motion ? ' currency-enter-' + esc(motion) : '') + '">' +
          '<i class="currency-orbit orbit-one"></i><i class="currency-orbit orbit-two"></i>' +
          '<div class="currency-showcase-head"><span class="currency-showcase-name">' + currencyIcon(selected) + '<b>' + esc(currencyLabel(selected)) + '</b></span><span>LedgerGift</span></div>' +
          '<div class="currency-balance-label">' + esc(t("balance_title")) + '</div>' +
          '<strong>' + esc(fmt(amount)) + '<small>' + esc(selected) + '</small></strong>' +
          '<div class="currency-showcase-foot"><span>LEDGERGIFT • SECURE WALLET</span><i class="card-chip" aria-hidden="true"></i></div>' +
        '</article></div>' + currencyDots(currencies, selected, "currency-dot") +
        '<div class="wallet-actions currency-actions">' +
          '<button class="btn primary" data-act="topup">' + icon("wallet") + esc(t("b_topup")) + '</button>' +
          '<button class="btn ghost" data-act="withdraw">' + icon("withdraw") + esc(t("b_withdraw")) + '</button>' +
        '</div>' +
        '<button class="transactions-btn" data-act="transactions">' + icon("clock") + '<span>' + esc(t("transactions")) + '</span><i>›</i></button>' +
      '</section>';
    view.querySelectorAll("[data-currency-card]").forEach(function (button) {
      button.addEventListener("click", function () { const currency = button.getAttribute("data-currency-card"); localStorage.setItem("lg-currency-card", currency); renderCurrencyBalance(data, currency); });
    });
    view.querySelectorAll("[data-currency-dot]").forEach(function (button) { button.addEventListener("click", function () { const currency = button.getAttribute("data-currency-dot"); localStorage.setItem("lg-currency-card", currency); renderCurrencyBalance(data, currency); }); });
    const card = view.querySelector(".currency-showcase");
    if (motion && card) requestAnimationFrame(function () { card.classList.remove("currency-enter-" + motion); });
    bindCardSwipe(card, currencies, selected, function (currency, direction) { localStorage.setItem("lg-currency-card", currency); renderCurrencyBalance(data, currency, direction); });
    bindCurrencyRail(view.querySelector(".currency-tabs"));
    view.querySelector('[data-act="withdraw"]').addEventListener("click", function () { withdrawSheet(data.balances, selected); });
    view.querySelector('[data-act="topup"]').addEventListener("click", function () { go("wallets"); });
    view.querySelector('[data-act="transactions"]').addEventListener("click", function () { transactionsSheet(data.history); });
  }

  function bindCurrencyRail(rail) {
    if (!rail) return;
    rail.addEventListener("wheel", function (event) {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        rail.scrollLeft += event.deltaY;
      }
    }, { passive: false });
  }

  function currencyDots(currencies, selected, attrName) {
    return '<div class="currency-dots" aria-label="currency pages">' + currencies.map(function (currency) {
      return '<button class="currency-dot' + (currency === selected ? ' active' : '') + '" data-' + attrName + '="' + esc(currency) + '" aria-label="' + esc(currencyLabel(currency)) + '"></button>';
    }).join("") + '</div>';
  }

  function bindCardSwipe(card, currencies, selected, onSelect) {
    if (!card) return;
    let startX = null, delta = 0, dragging = false, locked = false;
    const move = function (x) {
      if (!dragging || locked) return;
      delta = x - startX;
      const bounded = Math.max(-150, Math.min(150, delta));
      card.classList.add("currency-dragging");
      card.style.transform = "perspective(820px) translateX(" + bounded + "px) rotateY(" + (-bounded / 12) + "deg) scale(" + (1 - Math.min(Math.abs(bounded) / 1800, .07)) + ")";
    };
    const finish = function () {
      if (!dragging || locked) return;
      dragging = false;
      card.classList.remove("currency-dragging");
      card.style.transform = "";
      if (Math.abs(delta) < 45) return;
      const current = Math.max(0, currencies.indexOf(selected));
      const next = delta < 0 ? Math.min(currencies.length - 1, current + 1) : Math.max(0, current - 1);
      if (next !== current) {
        locked = true;
        const direction = delta < 0 ? "left" : "right";
        card.classList.add("currency-leave-" + direction);
        setTimeout(function () { onSelect(currencies[next], direction); }, 165);
      }
    };
    card.addEventListener("pointerdown", function (event) { if (event.pointerType === "mouse" && event.button !== 0) return; startX = event.clientX; delta = 0; dragging = true; try { card.setPointerCapture(event.pointerId); } catch (e) {} });
    card.addEventListener("pointermove", function (event) { move(event.clientX); });
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);
  }

  routes.balance = async function () {
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const d = await api("/api/balances");
      renderCurrencyBalance(d, localStorage.getItem("lg-currency-card") || "Stars");
    } catch (e) { toast(errText(e)); }
  };

  function transactionsSheet(history) {
    showSheet('<button class="sheet-close" data-close>×</button><h2>' + esc(t("transactions")) + '</h2><p class="sheet-sub">' + esc(t("transactions_hint")) + '</p>' + transactionList(history));
  }

  async function withdrawSheet(balances, initialCurrency) {
    let requisites = {};
    try { const data = await api("/api/requisites"); requisites = data.items || {}; } catch (e) {}
    const currencies = state.boot.currencies || [];
    const draw = function (selectedCurrency) {
      const currency = currencies.indexOf(selectedCurrency) >= 0 ? selectedCurrency : (currencies[0] || "TON");
      const item = requisites[currency] || null;
      const available = Number(balances[currency] || 0);
      const crypto = ["TON", "USDT"].includes(currency), stars = currency === "Stars", fiat = !crypto && !stars;
      const kind = crypto ? t("requisites_wallet") : (stars ? t("requisites_username") : t("requisites_card"));
      const raw = item ? item.value : "";
      const digits = String(raw).replace(/\D/g, "");
      const preview = fiat ? (digits ? digits.replace(/(.{4})/g, "$1 ").trim() : "0000 0000 0000 0000") : (raw || (stars ? "@username" : "UQ…"));
      const tabs = currencies.map(function (c) { return '<button class="currency-tab' + (c === currency ? ' active' : '') + '" data-withdraw-currency="' + esc(c) + '">' + currencyIcon(c) + '<span>' + esc(currencyLabel(c)) + '</span></button>'; }).join("");
      const old = document.getElementById("sheet"); if (old) old.remove();
      const receiver = stars ? "" : (item ? item.value : "");
      showSheet('<button class="sheet-close" data-close>×</button><div class="withdraw-screen"><div class="currency-tabs" role="tablist">' + tabs + '</div><article class="withdraw-hero currency-' + esc(String(currency).toLowerCase()) + '"><i class="currency-orbit orbit-one"></i><i class="currency-orbit orbit-two"></i><div class="withdraw-hero-head">' + currencyIcon(currency) + '<span><small>' + esc(t("b_withdraw")) + '</small><b>' + esc(currencyLabel(currency)) + '</b></span></div><small>' + esc(t("withdraw_available")) + '</small><strong>' + esc(fmt(available)) + ' <em>' + esc(currency) + '</em></strong></article><section class="withdraw-recipient">' + (stars ? '<b>Telegram username получателя</b><label class="fld recipient-field"><span>Кому отправить Stars</span><input class="field" id="withdrawRecipient" value="" placeholder="@username" autocomplete="off"></label>' : '<b>' + esc(kind) + '</b><div class="withdraw-preview currency-' + esc(String(currency).toLowerCase()) + '" id="withdrawCardPreview"><span>LedgerGift</span><i class="card-chip" aria-hidden="true"></i><strong id="withdrawPreview">' + esc(preview) + '</strong><i class="card-valid-check" aria-hidden="true">✓</i></div><label class="fld card-requisite-field" id="withdrawRequisiteField"><span>' + esc(kind) + '</span><input class="field" id="withdrawRequisite" value="' + esc(fiat ? String(raw).replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim() : raw) + '" placeholder="' + esc(crypto ? "UQ..." : "0000 0000 0000 0000") + '"' + (fiat ? ' inputmode="numeric" maxlength="24"' : '') + '><i class="field-valid-check" aria-hidden="true">✓</i></label>') + '</section><label class="fld withdraw-amount"><span>' + esc(t("amount")) + '</span><div class="withdraw-input"><input id="withdrawAmount" type="number" inputmode="decimal" placeholder="0"><b>' + esc(currency) + '</b></div></label><div class="withdraw-percent"><button data-percent="25">25%</button><button data-percent="50">50%</button><button data-percent="75">75%</button><button data-percent="100">Max</button></div><div class="withdraw-summary"><span>' + esc(t("amount")) + '</span><b id="withdrawSummary">—</b><span>' + esc(t("withdraw_to")) + '</span><b id="withdrawTarget">' + esc(stars ? "—" : preview) + '</b></div><button class="btn primary block" id="withdrawSubmit">' + esc(t("withdraw_request")) + '</button></div>');
      document.getElementById("sheet").classList.add("withdraw-sheet");
      document.querySelectorAll("[data-withdraw-currency]").forEach(function (button) { button.addEventListener("click", function () { draw(button.getAttribute("data-withdraw-currency")); }); });
      const req = document.getElementById("withdrawRequisite"), recipient = document.getElementById("withdrawRecipient"), amountField = document.getElementById("withdrawAmount");
      const sync = function () { const value = req ? req.value.trim() : (recipient ? recipient.value.trim() : ""); const num = value.replace(/\D/g, ""); const shown = stars ? (value || "—") : (fiat ? (num ? num.replace(/(.{4})/g, "$1 ").trim() : "0000 0000 0000 0000") : (value || "UQ…")); const validCard = fiat && num.length >= 16; if (document.getElementById("withdrawPreview")) document.getElementById("withdrawPreview").textContent = shown; const cardPreview = document.getElementById("withdrawCardPreview"), cardField = document.getElementById("withdrawRequisiteField"); if (cardPreview) cardPreview.classList.toggle("is-valid", validCard); if (cardField) cardField.classList.toggle("is-valid", validCard); document.getElementById("withdrawTarget").textContent = shown; const amount = Number(amountField.value || 0); document.getElementById("withdrawSummary").textContent = amount > 0 ? fmt(amount) + " " + currency : "—"; };
      if (req) { if (fiat) req.addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 20).replace(/(.{4})/g, "$1 ").trim(); sync(); }); else req.addEventListener("input", sync); }
      if (recipient) recipient.addEventListener("input", sync);
      [req, recipient, amountField].filter(Boolean).forEach(function (input) { input.addEventListener("focus", function () { setTimeout(function () { input.scrollIntoView({ block: "center", behavior: "smooth" }); }, 260); }); });
      amountField.addEventListener("input", sync); sync();
      document.querySelectorAll("[data-percent]").forEach(function (button) { button.addEventListener("click", function () { amountField.value = String(Math.floor(available * Number(button.getAttribute("data-percent")) / 100 * 100) / 100); sync(); }); });
      document.getElementById("withdrawSubmit").addEventListener("click", async function () {
        const amount = parseFloat(amountField.value.replace(",", ".")); const value = req ? req.value.trim() : (recipient ? recipient.value.trim() : "");
        if (!(amount > 0) || amount > available) return toast(t("withdraw_invalid"));
        if (!value) return toast(t("withdraw_no_requisites"));
        if (fiat && (value.replace(/\D/g, "").length < 16 || value.replace(/\D/g, "").length > 20)) return toast(t("card_number_invalid"));
        if (stars && !/^@[A-Za-z0-9_]+$/.test(value)) return toast(t("username_invalid"));
        try { await api("/api/requisites", { method: "PUT", body: { currency: currency, kind: crypto ? "wallet" : (stars ? "username" : "card"), label: item ? item.label : "", value: value } }); requisites[currency] = { value: value, label: item ? item.label : "" }; await api("/api/balance/withdraw", { method: "POST", body: { currency: currency, amount: amount } }); document.getElementById("sheet").remove(); routes.balance(); }
        catch (e) { toast(errText(e)); }
      });
    };
    draw(initialCurrency || localStorage.getItem("lg-currency-card") || "TON");
  }

  // =======================================================================
  // WALLETS / REQUISITES
  // =======================================================================
  routes.wallets = async function () {
    view.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const data = await api("/api/requisites");
      const balances = await api("/api/balances");
      const renderWalletDeck = function (selectedCurrency, motion) {
        const currencies = state.boot.currencies || [];
        const selected = currencies.indexOf(selectedCurrency) >= 0 ? selectedCurrency : (currencies[0] || "TON");
        const selectedIndex = Math.max(0, currencies.indexOf(selected));
        const nextCurrency = currencies[(selectedIndex + 1) % currencies.length] || selected;
        const item = data.items[selected];
        const amount = Number((balances.balances || {})[selected] || 0);
        const tabs = currencies.map(function (currency) { return '<button class="currency-tab' + (currency === selected ? ' active' : '') + '" data-wallet-currency="' + esc(currency) + '">' + currencyIcon(currency) + '<span>' + esc(currencyLabel(currency)) + '</span></button>'; }).join("");
        view.innerHTML = '<section class="pad fade">' + header(t("wallets"), icon("wallet")) +
          (data.enabled ? '<div class="wallet-intro">' + esc(t("wallets_hint")) + '</div>' : '<div class="card neg">' + esc(t("requisites_unavailable")) + '</div>') +
          '<div class="currency-tabs" role="tablist">' + tabs + '</div>' +
          '<div class="currency-deck"><div class="currency-deck-underlay currency-' + esc(String(nextCurrency).toLowerCase()) + '" aria-hidden="true"></div><article class="currency-showcase currency-' + esc(String(selected).toLowerCase()) + (motion ? ' currency-enter-' + esc(motion) : '') + '"><i class="currency-orbit orbit-one"></i><i class="currency-orbit orbit-two"></i><div class="currency-showcase-head"><span class="currency-showcase-name">' + currencyIcon(selected) + '<b>' + esc(currencyLabel(selected)) + '</b></span><span>LedgerGift</span></div><div class="currency-balance-label">' + esc(t("current_balance")) + '</div><strong>' + esc(fmt(amount)) + '<small>' + esc(selected) + '</small></strong><div class="currency-showcase-foot"><span>' + esc(item ? t("requisites_saved") : t("requisites_empty")) + '</span><i class="card-chip" aria-hidden="true"></i></div></article></div>' + currencyDots(currencies, selected, "wallet-dot") +
          (data.enabled ? '<button class="btn primary block wallet-requisite-btn" data-add-requisites>' + esc(item ? t("wallets") : t("how_requisites")) + '</button>' : '') +
          '</section>';
        bindCurrencyRail(view.querySelector(".currency-tabs"));
        view.querySelectorAll("[data-wallet-currency]").forEach(function (button) { button.addEventListener("click", function () { const currency = button.getAttribute("data-wallet-currency"); localStorage.setItem("lg-wallet-card", currency); renderWalletDeck(currency); }); });
        view.querySelectorAll("[data-wallet-dot]").forEach(function (button) { button.addEventListener("click", function () { const currency = button.getAttribute("data-wallet-dot"); localStorage.setItem("lg-wallet-card", currency); renderWalletDeck(currency); }); });
        const card = view.querySelector(".currency-showcase");
        if (motion && card) requestAnimationFrame(function () { card.classList.remove("currency-enter-" + motion); });
        bindCardSwipe(card, currencies, selected, function (currency, direction) { localStorage.setItem("lg-wallet-card", currency); renderWalletDeck(currency, direction); });
        const add = view.querySelector("[data-add-requisites]");
        if (add) add.addEventListener("click", function () { requisitesSheet(selected, item || null, amount); });
      };
      renderWalletDeck(localStorage.getItem("lg-wallet-card") || "Stars");
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
    document.getElementById("sheetWithdraw").addEventListener("click", function () {
      document.getElementById("sheet").remove();
      api("/api/balances").then(function (data) { withdrawSheet(data.balances); }).catch(function (e) { toast(errText(e)); });
    });
  }

  function requisitesSheet(currency, item, amount) {
    const crypto = ["TON", "USDT"].includes(currency);
    const stars = currency === "Stars";
    const kind = crypto ? t("requisites_wallet") : (stars ? t("requisites_username") : t("requisites_card"));
    const fiat = !crypto && !stars;
    const savedValue = item && fiat ? String(item.value || "").replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim() : (item ? item.value : "");
    showSheet('<button class="sheet-close" data-close>×</button><h2>' + esc(currencyLabel(currency)) + '</h2><p class="sheet-sub">' + esc(t("requisites_for") + " " + kind) + '</p><label class="fld"><span>' + esc(t("requisites_name")) + '</span><input class="field" id="reqLabel" value="' + esc(item ? item.label : "") + '" placeholder="' + esc(t("requisites_name_hint")) + '"></label><label class="fld"><span>' + esc(kind) + '</span><input class="field" id="reqValue" value="' + esc(savedValue) + '" placeholder="' + esc(stars ? "@username" : (crypto ? "UQ..." : "0000 0000 0000 0000")) + '"' + (fiat ? ' inputmode="numeric" maxlength="24"' : '') + '></label>' + (fiat ? '<p class="field-hint">' + esc(t("card_number_hint")) + '</p>' : '') + '<button class="btn primary block" id="reqSave">' + esc(t("save")) + '</button>' + (item ? '<button class="btn danger block" id="reqDelete">' + esc(t("delete")) + '</button>' : ''));
    const reqValue = document.getElementById("reqValue");
    if (fiat) reqValue.addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 20).replace(/(.{4})/g, "$1 ").trim(); });
    document.getElementById("reqSave").addEventListener("click", async function () {
      const value = reqValue.value.trim();
      const cardDigits = value.replace(/\D/g, "");
      if (fiat && (cardDigits.length < 16 || cardDigits.length > 20)) return toast(t("card_number_invalid"));
      if (stars && !/^@[A-Za-z0-9_]+$/.test(value)) return toast(t("username_invalid"));
      try { await api("/api/requisites", { method: "PUT", body: { currency: currency, kind: crypto ? "wallet" : (stars ? "username" : "card"), label: document.getElementById("reqLabel").value.trim(), value: value } }); celebrate(); toast(t("saved")); document.getElementById("sheet").remove(); routes.wallets(); } catch (e) { toast(errText(e)); }
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
      const nextOrderTarget = p.orders < 10 ? 10 : (p.orders < 30 ? 30 : (p.orders < 100 ? 100 : p.orders));
      const levelProgress = nextOrderTarget === p.orders ? 100 : Math.min(100, Math.round((p.orders / nextOrderTarget) * 100));
      const cardTheme = localStorage.getItem("lg-card-theme") || "gold";
      const dealRow = function (d) { return '<button class="deal-history-row status-' + esc(d.status) + '" data-deal="' + esc(d.tag) + '"><span><b>#' + esc(d.tag) + '</b><small>' + esc(d.item_type_label) + '</small></span><span><b>' + esc(d.amount_label) + ' ' + esc(d.currency) + '</b><small>' + esc(statusLabel(d.status)) + '</small></span></button>'; };
      const dealRows = deals.deals.length ? deals.deals.map(dealRow).join("") : '<p class="muted">' + esc(t("history_empty")) + '</p>';
      const stats = p.deal_stats || { total: p.orders || 0, completed: p.orders || 0, cancelled: 0 };
      view.innerHTML =
        '<section class="pad fade">' + header(t("profile_title"), icon("user")) +
          '<div class="flip-wrap profile-flip-wrap"><div class="flip-card">' +
            '<div class="flip-face flip-front profile-card theme-' + esc(cardTheme) + '"><div class="card-brand">LedgerGift</div><button class="card-palette" id="cardPalette" aria-label="card color"><span></span></button><i class="profile-chip" aria-hidden="true"></i><div class="pf-person"><div class="pf-avatar" id="profileAvatar">' + esc((p.username || "?").charAt(0).toUpperCase()) + '</div><div><div class="pf-name">' + esc(displayName) + '</div><div class="pf-user">' + esc(uname) + '</div></div></div><small>' + esc(t("volume")) + '</small><strong>' + esc(fmt(p.volume || 0)) + '</strong></div>' +
          '</div></div>' +
          '<div class="profile-actions"><button class="profile-action active" id="profileWallets">' + icon("wallet") + esc(t("wallets")) + '</button><button class="profile-action" id="profileLang">' + icon("globe") + esc(t("a_language")) + '</button></div>' +
          '<section class="level-progress"><div><span>' + esc(t("level_progress")) + '</span><b>' + esc((p.level || {}).label || "") + '</b></div><div class="level-track"><i style="width:' + levelProgress + '%"></i></div><small>' + esc(p.orders || 0) + ' / ' + esc(nextOrderTarget) + ' ' + esc(t("orders_word")) + '</small></section>' +
          '<h3 class="subhead">' + esc(t("deal_title")) + '</h3><div class="deal-history" id="profileDeals">' + dealRows + '</div>' +
        '</section>';
      document.getElementById("cardPalette").addEventListener("click", function (e) { e.stopPropagation(); cardThemeSheet(); });
      document.getElementById("profileWallets").addEventListener("click", function () { go("wallets"); });
      document.getElementById("profileLang").addEventListener("click", function () { go("language"); });
      view.querySelectorAll("[data-deal]").forEach(function (b) { b.addEventListener("click", function () { go("deal", b.getAttribute("data-deal")); }); });
      loadProfileAvatar();
    } catch (e) { toast(errText(e)); }
  };

  async function loadProfileAvatar() {
    const holder = document.getElementById("profileAvatar");
    if (!holder) return;
    try {
      const response = await fetch("/api/profile/photo", { headers: { "X-Telegram-Init-Data": initData() } });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      const image = new Image();
      image.alt = "";
      image.src = url;
      image.onload = function () { if (holder.isConnected) { holder.textContent = ""; holder.appendChild(image); } else { URL.revokeObjectURL(url); } };
      image.onerror = function () { URL.revokeObjectURL(url); };
    } catch (e) {}
  }

  function cardThemeSheet() {
    const themes = [["classic", t("card_classic")], ["midnight", t("card_midnight")], ["shine", t("card_shine")], ["sunset", t("card_sunset")], ["neon", t("card_neon")], ["emerald", t("card_emerald")], ["gold", t("card_gold")], ["rose", t("card_rose")], ["lava", t("card_lava")], ["hologram", t("card_hologram")], ["space", t("card_space")], ["titan", t("card_titan")]];
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
        '<section class="pad fade">' + header(t("top_title"), icon("chart")) +
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
    view.innerHTML = '<section class="pad fade">' + header(t("create_title"), icon("gift")) + inner + '</section>';
  }
  function backBtn(handler) {
    const b = el('<button class="btn ghost">' + esc(t("back")) + '</button>');
    b.addEventListener("click", handler);
    return b;
  }

  routes.create = function () { state.draft = {}; stepType(); };

  function stepType() {
    const types = state.boot.deal_types;
    const icons = { nft: "nft", stars: "stars", username: "username", crypto: "crypto", premium: "premium" };
    let cards = "";
    Object.keys(types).forEach(function (k) {
      const label = types[k][state.lang === "ru" ? "ru" : "en"] || types[k].en;
      cards += '<button class="type-card type-' + esc(k) + '" data-type="' + k + '"><span class="tc-ic">' + icon(icons[k] || "gift") + '</span><span>' + esc(label) + '</span></button>';
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
      '<section class="pad fade">' + header(t("deal_created"), icon("shield")) +
        '<div class="card">' +
          row(t("item"), deal.item_type_label) +
          row(t("amount"), deal.amount_label + " " + deal.currency) +
          row(t("buyer"), "@" + deal.buyer_username) +
          row(t("deal_title"), "#" + deal.tag) +
        '</div>' +
        '<p class="step-label">' + esc(t("share_link")) + '</p>' +
        '<div class="link-box"><a id="shareLink" href="' + esc(link) + '">' + esc(link) + '</a></div>' +
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
  function dealTimeline(status) {
    const steps = ["created", "paid", "transferred", "completed"];
    // A paid deal is already in the hand-over phase. It is not necessary to
    // wait for an admin click before the buyer can confirm receipt.
    const current = status === "paid" ? 2 : Math.max(0, steps.indexOf(status));
    return '<div class="deal-timeline">' + steps.map(function (step, index) {
      const cls = index < current ? "done" : (index === current ? "current" : "");
      return '<div class="timeline-step ' + cls + '"><span>' + icon(index < current || status === "completed" ? "check" : "clock") + '</span><small>' + esc(t("timeline_" + step)) + '</small></div>';
    }).join("") + '</div>';
  }

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
                 '<button class="btn block" id="noBtn">' + esc(t("seller_refused")) + '</button>';
    }
    if (role.is_seller && deal.status === "paid") {
      actions += '<div class="card" style="margin:0 0 10px"><b>Передайте подарок покупателю</b><p class="muted" style="margin:6px 0 0">Вернитесь в чат с покупателем, передайте подарок и подтвердите это здесь.</p></div>' +
                 '<button class="btn primary block" id="transferredBtn">Я передал подарок</button>';
    }
    if (role.is_buyer && (deal.status === "paid" || deal.status === "transferred")) {
      actions += '<button class="btn ghost block" id="notifySellerBtn">' + icon("send") + esc(t("notify_seller_paid")) + '</button>';
    }
    if (!role.can_pay && !role.can_confirm && !role.is_seller && !role.is_staff) {
      actions += '<p class="muted">' + esc(t("not_your_deal")) + '</p>';
    }
    if (deal.transfer_seconds_left !== null && deal.transfer_seconds_left !== undefined) actions = '<div class="transfer-timer" id="transferTimer" data-left="' + deal.transfer_seconds_left + '">' + esc(t("transfer_deadline")) + ' <b></b></div>' + actions;

    view.innerHTML =
      '<section class="pad fade">' + header(t("deal_title") + " #" + deal.tag, icon("shield")) +
        '<div class="card">' +
          row(t("status"), statusLabel(deal.status)) +
          row(t("item"), deal.item_type_label) +
          row(t("link"), deal.item_link) +
          row(t("amount"), deal.amount_label + " " + deal.currency) +
          row(t("seller"), "@" + deal.seller_username) +
          row(t("buyer"), "@" + deal.buyer_username) +
        '</div>' +
        dealTimeline(deal.status) +
        '<div class="deal-actions">' + actions + '</div>' +
      '</section>';

    const pay = document.getElementById("payBtn");
    if (pay) pay.addEventListener("click", function () { paymentCheckSheet(deal); });
    const yes = document.getElementById("yesBtn");
    if (yes) yes.addEventListener("click", async function () {
      try { await api("/api/deal/" + deal.tag + "/receipt", { method: "POST", body: { received: true } }); celebrate(); toast(t("completed_ok")); routes.deal(deal.tag); }
      catch (e) { toast(errText(e)); }
    });
    const no = document.getElementById("noBtn");
    if (no) no.addEventListener("click", async function () { if (!confirm(t("cancel_confirm"))) return; try { await api("/api/deal/" + deal.tag + "/cancel", { method: "POST" }); celebrate(); toast(t("cancelled_ok")); routes.deal(deal.tag); } catch (e) { toast(errText(e)); } });
    const transferred = document.getElementById("transferredBtn");
    if (transferred) transferred.addEventListener("click", async function () {
      try { await api("/api/deal/" + deal.tag + "/transferred", { method: "POST" }); toast("Ожидаем подтверждение покупателя"); routes.deal(deal.tag); }
      catch (e) { toast(errText(e)); }
    });
    const notifySeller = document.getElementById("notifySellerBtn");
    if (notifySeller) notifySeller.addEventListener("click", async function () {
      try { await api("/api/deal/" + deal.tag + "/notify-seller", { method: "POST" }); toast(t("seller_paid_sent")); }
      catch (e) { toast(errText(e)); }
    });
    startTransferTimer();
  }

  function startTransferTimer() { const node = document.getElementById("transferTimer"); if (!node) return; let seconds = Number(node.getAttribute("data-left")); const label = node.querySelector("b"); const tick = function () { const minutes = Math.floor(seconds / 60); const rest = String(seconds % 60).padStart(2, "0"); label.textContent = minutes + ":" + rest; if (seconds-- > 0) setTimeout(tick, 1000); else node.classList.add("expired"); }; tick(); }

  routes.how = function () { view.innerHTML = '<section class="pad fade">' + header(t("how_title"), icon("shield")) + '<div class="how-steps"><div><span>1</span><b>' + esc(t("how_requisites")) + '</b><small>' + esc(t("how_requisites_hint")) + '</small></div><div><span>2</span><b>' + esc(t("how_order")) + '</b><small>' + esc(t("how_order_hint")) + '</small></div><div><span>3</span><b>' + esc(t("how_transfer")) + '</b><small>' + esc(t("how_transfer_hint")) + '</small></div></div><button class="btn primary block" id="howWallets">' + esc(t("wallets")) + '</button></section>'; document.getElementById("howWallets").addEventListener("click", function () { go("wallets"); }); };

  function paymentCheckSheet(deal) {
    showSheet('<button class="sheet-close" data-close>×</button><div class="payment-check"><span>' + icon("shield") + '</span><h2>' + esc(t("payment_check_title")) + '</h2><p>' + esc(t("payment_check_hint")) + '</p><div class="payment-check-card">' + row(t("item"), deal.item_type_label) + row(t("seller"), "@" + deal.seller_username) + row(t("amount"), deal.amount_label + " " + deal.currency) + '</div><div class="payment-safe">' + icon("shield") + '<span>' + esc(t("payment_safe_rule")) + '</span></div><button class="btn primary block" id="confirmPay">' + esc(t("payment_confirm")) + '</button></div>');
    document.getElementById("confirmPay").addEventListener("click", async function () { try { await api("/api/deal/" + deal.tag + "/pay", { method: "POST" }); document.getElementById("sheet").remove(); celebrate(); toast(t("paid_ok")); routes.deal(deal.tag); } catch (e) { toast(errText(e)); } });
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
    items += item("addbalance", icon("wallet"), t("adm_addbalance"));
    items += item("user", icon("user"), t("adm_user"));
    items += item("deal", icon("gift"), t("adm_deal"));
    items += item("active", icon("chart"), t("adm_active"));
    items += item("stats", icon("chart"), t("adm_stats"));
    items += item("paylink", icon("settings"), t("adm_paylink"));
    items += item("myhistory", icon("wallet"), t("adm_myhistory"));
    items += item("audit", icon("clock"), t("adm_audit"));
    if (isOwner) {
      items += item("team", icon("team"), t("adm_team"));
      items += item("addadmin", icon("team"), t("adm_addadmin"));
    }
    view.innerHTML = '<section class="pad fade">' + header(t("admin_title"), icon("shield")) +
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
    } else if (act === "audit") {
      panel.innerHTML = '<div class="loader"><div class="spin"></div></div>';
      api("/api/admin/audit").then(function (d) { panel.innerHTML = '<div class="audit-list">' + (d.items.length ? d.items.map(function (item) { return '<div><b>' + esc(item.action) + '</b><small>ID ' + esc(item.actor_id) + ' · ' + esc(item.target || "—") + '<br>' + esc(item.created_at) + '</small></div>'; }).join("") : '<p class="muted">' + esc(t("history_empty")) + '</p>') + '</div>'; }).catch(function (e) { toast(errText(e)); });
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
        '<button class="active-stat paid" data-active-filter="paid"><b>' + data.summary.paid + '</b><small>' + esc(t("adm_wait_item")) + '</small></button>' +
        '<button class="active-stat transferred" data-active-filter="transferred"><b>' + data.summary.transferred + '</b><small>' + esc(t("adm_wait_confirm")) + '</small></button></div>' +
        '<div class="active-filter"><button class="seg active" data-active-filter="all">' + esc(t("adm_all_active")) + '</button><button class="seg" data-active-filter="created">' + esc(t("adm_wait_payment")) + '</button><button class="seg" data-active-filter="paid">' + esc(t("adm_wait_item")) + '</button><button class="seg" data-active-filter="transferred">' + esc(t("adm_wait_confirm")) + '</button></div><div id="activeRows"></div>';
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
        (deal.status === "paid" ? '<button class="btn primary block" id="markTransferred">' + icon("check") + esc(t("adm_mark_transferred")) + '</button>' : '') +
        ((deal.status === "paid" || deal.status === "transferred") ? '<button class="btn ghost block" id="sendPaidNotice">' + icon("send") + esc(t("adm_send_paid_notice")) + '</button>' : '') +
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
          celebrate(); toast(t("done")); showDealWorkspace(deal.tag);
        } catch (e) { toast(errText(e)); }
      });
      const transferred = document.getElementById("markTransferred");
      if (transferred) transferred.addEventListener("click", async function () {
        try { await api("/api/admin/deal/" + encodeURIComponent(deal.tag) + "/transferred", { method: "POST" }); celebrate(); toast(t("adm_transferred_ok")); showDealWorkspace(deal.tag); }
        catch (e) { toast(errText(e)); }
      });
      const notice = document.getElementById("sendPaidNotice");
      if (notice) notice.addEventListener("click", async function () {
        try { await api("/api/admin/deal/" + encodeURIComponent(deal.tag) + "/notify-paid", { method: "POST" }); toast(t("adm_paid_notice_sent")); }
        catch (e) { toast(errText(e)); }
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

  // Compact web administration panel.  Roles are checked again by the API;
  // this client only renders the controls after a successful unlock.
  routes.admin = function () {
    if (!state.boot.me.is_admin) { go("home"); return; }
    view.innerHTML = '<section class="pad fade admin-web">' + header("Админка", icon("shield")) +
      '<div id="adminUnlock" class="card"><p class="muted">Введите пароль панели управления.</p>' +
      '<input class="field" id="adminPassword" type="password" placeholder="Пароль админки" />' +
      '<button class="btn primary block" id="adminUnlockBtn">Открыть админку</button></div><div id="adminContent"></div></section>';
    document.getElementById("adminUnlockBtn").addEventListener("click", async function () {
      try {
        await api("/api/admin/unlock", { method: "POST", body: { password: document.getElementById("adminPassword").value } });
        renderWebAdmin();
      } catch (e) { toast(errText(e)); }
    });
  };

  async function renderWebAdmin() {
    const unlock = document.getElementById("adminUnlock");
    const holder = document.getElementById("adminContent");
    if (unlock) unlock.remove();
    holder.innerHTML = '<div class="loader"><div class="spin"></div></div>';
    try {
      const d = await api("/api/admin/overview");
      const admins = d.admins.length ? d.admins.map(function (a) { return '<li>@' + esc(a.name) + '</li>'; }).join("") : '<li class="muted">Пока нет назначенных администраторов</li>';
      holder.innerHTML = '<div class="card"><b>Активных сделок: ' + esc(d.active_deals) + '</b><p class="muted">Баланс можно пополнить только из админки. Автоматических пополнений здесь нет.</p></div>' +
        (d.owner ? '<div class="card"><h3>Выдать админку</h3><label class="fld"><span>Ник пользователя</span><input class="field" id="grantNick" placeholder="@username" /></label><button class="btn primary block" id="grantAdmin">Выдать доступ</button><h3>Администраторы</h3><ul class="admin-names">' + admins + '</ul></div>' : '') +
        '<div class="card"><h3>Изменить баланс</h3><label class="fld"><span>Ник пользователя</span><input class="field" id="balanceNick" placeholder="@username" /></label><label class="fld"><span>Сумма (можно с минусом)</span><input class="field" id="balanceAmount" inputmode="decimal" placeholder="100" /></label><label class="fld"><span>Валюта</span><select class="field" id="balanceCurrency">' + state.boot.currencies.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("") + '</select></label><button class="btn primary block" id="balanceSave">Сохранить баланс</button></div>' +
        '<div class="card"><h3>Журнал</h3><div class="audit-list">' + (d.logs.length ? d.logs.map(function (log) { return '<div><b>' + esc(log.action) + '</b><small>' + esc(log.target || "—") + ' · ' + esc(log.created_at) + '</small></div>'; }).join("") : '<p class="muted">Записей ещё нет.</p>') + '</div></div>';
      const grant = document.getElementById("grantAdmin");
      if (grant) grant.addEventListener("click", async function () { try { await api("/api/admin/admins", { method: "POST", body: { nickname: document.getElementById("grantNick").value } }); toast("Админка выдана"); renderWebAdmin(); } catch (e) { toast(errText(e)); } });
      document.getElementById("balanceSave").addEventListener("click", async function () { try { await api("/api/admin/balance", { method: "POST", body: { nickname: document.getElementById("balanceNick").value, amount: document.getElementById("balanceAmount").value, currency: document.getElementById("balanceCurrency").value } }); toast("Баланс обновлён"); } catch (e) { toast(errText(e)); } });
    } catch (e) { holder.innerHTML = '<p class="neg">' + esc(errText(e)) + '</p>'; }
  }

  // ---- wiring -----------------------------------------------------------
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { haptic(); go(b.getAttribute("data-route")); });
  });
  document.getElementById("themeLight").addEventListener("click", function () { localStorage.setItem("lg-theme", "light"); applyTheme(); haptic(); });
  document.getElementById("themeDark").addEventListener("click", function () { localStorage.setItem("lg-theme", "dark"); applyTheme(); haptic(); });
  document.getElementById("homeBtn").addEventListener("click", function () { haptic(); go("home"); });

  boot();
})();
