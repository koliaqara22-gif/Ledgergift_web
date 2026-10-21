(function () {
  function startBannerPreview() {
    const cards = Array.from(document.querySelectorAll("[data-promo-card]"));
    const dots = Array.from(document.querySelectorAll(".promo-dots i"));
    if (!cards.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let front = 0;
    const poses = [
      { transform: "perspective(1100px) translate3d(0,24px,34px) rotate(-5deg) scale(1)", z: 3, opacity: 1 },
      { transform: "perspective(1100px) translate3d(100px,-4px,0) rotate(4deg) scale(.95)", z: 2, opacity: .9 },
      { transform: "perspective(1100px) translate3d(174px,48px,-24px) rotate(9deg) scale(.9)", z: 1, opacity: .78 }
    ];
    function amount(card) {
      const value = card.querySelector(".promo-value");
      const max = Number(card.dataset.promoMax);
      const target = Math.round((max * (.42 + Math.random() * .52)) / (max > 1000 ? 100 : 1)) * (max > 1000 ? 100 : 1);
      const began = performance.now(), duration = 1850;
      function tick(now) { const progress = Math.min(1, (now - began) / duration); value.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3))).toLocaleString("ru-RU"); if (progress < 1) requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    }
    function draw() {
      cards.forEach(function (card, index) {
        const place = (index - front + cards.length) % cards.length;
        const pose = poses[place];
        card.style.transform = pose.transform;
        card.style.zIndex = pose.z;
        card.style.opacity = pose.opacity;
      });
      dots.forEach(function (dot, index) { dot.classList.toggle("active", index === front); });
      amount(cards[front]);
    }
    draw();
    window.setInterval(function () { front = (front + 1) % cards.length; draw(); }, 6200);
  }
  startBannerPreview();
  const gate = document.getElementById("webAuth");
  const form = document.getElementById("webAuthForm");
  let mode = "login";
  async function request(path, options) {
    const response = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.detail || "Не удалось выполнить действие");
    return data;
  }
  function setMode(next) {
    mode = next;
    document.querySelectorAll("[data-auth-mode]").forEach(function (button) { button.classList.toggle("active", button.dataset.authMode === mode); });
    document.getElementById("webAuthTitle").textContent = mode === "login" ? "Войдите в LedgerGift" : "Создайте аккаунт";
    document.getElementById("webAuthHint").textContent = mode === "login" ? "Ваш баланс, сделки и кошельки — в одном месте." : "Придумайте никнейм и пароль.";
    document.getElementById("webAuthSubmit").textContent = mode === "login" ? "Войти" : "Создать аккаунт";
  }
  document.querySelectorAll("[data-auth-mode]").forEach(function (button) { button.addEventListener("click", function () { setMode(button.dataset.authMode); }); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const submit = document.getElementById("webAuthSubmit"); submit.disabled = true;
    try { await request("/api/auth/" + (mode === "login" ? "login" : "register"), { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); window.location.reload(); }
    catch (error) { document.getElementById("webAuthHint").textContent = error.message === "nickname_exists" ? "Этот никнейм уже занят." : (error.message === "invalid_credentials" ? "Проверьте никнейм и пароль." : "Сервер сайта не запущен. Откройте сайт по ссылке после деплоя."); }
    finally { submit.disabled = false; }
  });
  request("/api/me").then(function () { gate.remove(); const script = document.createElement("script"); script.src = "miniapp.js"; document.body.appendChild(script); }).catch(function () { gate.classList.add("show"); });
}());
