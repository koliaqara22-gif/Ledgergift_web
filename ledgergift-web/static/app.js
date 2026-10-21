(function () {
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
