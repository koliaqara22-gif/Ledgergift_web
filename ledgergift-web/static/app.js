const app = document.querySelector('#app');
const authDialog = document.querySelector('#authDialog');
const accountBtn = document.querySelector('#accountBtn');
let me = null;

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Не удалось выполнить действие');
  return data;
}
function escapeHtml(value = '') { const e = document.createElement('div'); e.textContent = value; return e.innerHTML; }
function money(n, currency) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n || 0)) + ' ' + currency; }
function toast(text) { const node = document.querySelector('#toast'); node.textContent = text; node.classList.add('show'); clearTimeout(node.timer); node.timer = setTimeout(() => node.classList.remove('show'), 3200); }
function statusLabel(status) { return ({created:'Ожидает оплаты',paid:'Оплачена',transferred:'Передан подарок',completed:'Завершена',cancelled:'Отменена'})[status] || status; }
function statusClass(status) { return ['created','paid','transferred','completed','cancelled'].includes(status) ? status : 'created'; }
function authRequired() { if (!me) { openAuth(); return true; } return false; }
function dealCard(deal) { return `<a class="deal" href="#deal/${deal.share_code}"><span class="deal-icon">🎁</span><span><b>${escapeHtml(deal.gift_name)}</b><small>${escapeHtml(deal.buyer_contact || 'Покупатель откроет ссылку')} · ${money(deal.price, deal.currency)}</small></span><i class="badge ${statusClass(deal.status)}">${statusLabel(deal.status)}</i></a>`; }

function home() {
  if (me) return dashboard();
  app.innerHTML = `<section class="hero start-hero"><div><div class="eyebrow">✦ LedgerGift</div><h1>Ваши сделки. Ваш баланс.</h1><p>Войдите в LedgerGift, чтобы открыть кошелёк, сделки и профиль.</p><div class="hero-actions"><button class="btn primary" id="startRegister">Регистрация</button><button class="btn secondary" id="startLogin">Войти</button></div></div><div class="hero-art"><div class="gift-card stars-card"><b>LedgerGift</b><small>БАЛАНС STARS</small><strong>20 000 <em>★</em></strong><span class="stars-caption">Telegram Stars</span><i class="chip"></i></div></div></section>`;
  document.querySelector('#startRegister').onclick = () => openAuth('register');
  document.querySelector('#startLogin').onclick = () => openAuth('login');
}

async function dashboard() {
  if (authRequired()) return;
  const { items } = await api('/api/deals');
  const open = items.filter(x => !['completed','cancelled'].includes(x.status));
  app.innerHTML = `<section class="page-head"><div><h1>Добро пожаловать, ${escapeHtml(me.name)}</h1><p>Управляйте сделками и передавайте подарки напрямую покупателям.</p></div><a class="btn primary" href="#create">+ Создать сделку</a></section><section class="dashboard-grid"><div class="panel"><h2>Активные сделки</h2><div class="deal-list">${open.length ? open.map(dealCard).join('') : '<div class="empty">Активных сделок пока нет.<br><br><a class="btn primary" href="#create">Создать первую</a></div>'}</div></div><aside class="panel"><div class="balance-card"><small>БАЛАНС LEDGERGIFT</small><b>${money(me.balance, 'TON')}</b><div>Пополнение подключается отдельно</div></div><h3 style="margin-top:21px">Как проходит сделка</h3><div class="steps"><div class="step done"><i>1</i><span><b>Создание</b><span>Продавец формирует ссылку.</span></span></div><div class="step active"><i>2</i><span><b>Оплата</b><span>Покупатель подтверждает оплату.</span></span></div><div class="step"><i>3</i><span><b>Передача</b><span>Продавец возвращается в чат и передаёт подарок.</span></span></div><div class="step"><i>4</i><span><b>Подтверждение</b><span>Покупатель подтверждает получение.</span></span></div></div></aside></section>`;
}

function createPage() {
  if (authRequired()) return;
  app.innerHTML = `<section class="page-head"><div><h1>Новая сделка</h1><p>Заполните информацию о подарке и покупателе.</p></div><a class="btn ghost" href="#deals">← К сделкам</a></section><section class="panel"><form id="dealForm"><div class="form-grid"><label class="field"><span>Название подарка</span><input required name="gift_name" placeholder="Например, Plush Pepe"></label><label class="field"><span>Стоимость</span><input required name="price" inputmode="decimal" type="number" min="0.01" step="0.01" placeholder="0.00"></label><label class="field"><span>Валюта</span><select name="currency"><option>Stars</option><option>TON</option><option>USDT</option><option>RUB</option><option>USD</option></select></label><label class="field"><span>Username покупателя</span><input name="buyer_contact" placeholder="@username"></label><label class="field full"><span>Описание</span><textarea name="description" placeholder="Добавьте сведения о подарке"></textarea></label></div><button class="btn primary" type="submit">Создать сделку →</button></form></section>`;
  document.querySelector('#dealForm').addEventListener('submit', async event => { event.preventDefault(); const f = new FormData(event.currentTarget); try { const {deal} = await api('/api/deals', {method:'POST', body:JSON.stringify(Object.fromEntries(f))}); toast('Сделка создана — скопируйте ссылку для покупателя'); location.hash = `#deal/${deal.share_code}`; } catch (error) { toast(error.message); } });
}

async function dealsPage() {
  if (authRequired()) return;
  const {items} = await api('/api/deals');
  app.innerHTML = `<section class="page-head"><div><h1>Мои сделки</h1><p>Все сделки, где вы продавец или покупатель.</p></div><a class="btn primary" href="#create">+ Создать сделку</a></section><section class="panel"><div class="deal-list">${items.length ? items.map(dealCard).join('') : '<div class="empty">Список сделок пуст.</div>'}</div></section>`;
}

function nextStep(deal) {
  const role = deal.is_seller ? 'seller' : (deal.is_buyer ? 'buyer' : 'guest');
  if (deal.status === 'created' && role === 'buyer') return {action:'pay',label:'Подтвердить оплату',text:'После подтверждения оплаты продавец получит инструкцию передать подарок.'};
  if (deal.status === 'created') return {label:'Ожидаем оплаты',text:'Покупатель должен открыть ссылку и подтвердить оплату.'};
  if (deal.status === 'paid' && role === 'seller') return {action:'transferred',label:'Я передал подарок',text:'Вернитесь в чат с покупателем, передайте подарок и только после этого нажмите кнопку.'};
  if (deal.status === 'paid') return {label:'Ожидаем подарок',text:'Продавец возвращается в ваш чат и передаёт подарок напрямую.'};
  if (deal.status === 'transferred' && role === 'buyer') return {action:'confirm',label:'Подтвердить получение',text:'Проверьте подарок в Telegram. После подтверждения сделка будет завершена.'};
  if (deal.status === 'transferred') return {label:'Ожидаем подтверждения',text:'Покупатель проверяет подарок и подтверждает его получение.'};
  if (deal.status === 'completed') return {label:'Сделка завершена',text:'Покупатель подтвердил получение подарка.'};
  return {label:'Сделка отменена',text:'Дальнейшие действия недоступны.'};
}

async function dealPage(code) {
  let payload;
  try { payload = await api(`/api/deals/share/${code}`); } catch (error) { app.innerHTML = `<div class="empty">Сделка не найдена.</div>`; return; }
  let deal = payload.deal;
  if (me && !deal.is_participant && !deal.buyer_id) {
    app.innerHTML = `<section class="panel"><h2>Вас пригласили в сделку</h2><p class="muted">Подарок: <b>${escapeHtml(deal.gift_name)}</b> · ${money(deal.price, deal.currency)}</p><button class="btn primary" id="joinDeal">Присоединиться как покупатель</button></section>`;
    document.querySelector('#joinDeal').onclick = async () => { try { await api(`/api/deals/share/${code}/join`, {method:'POST'}); toast('Вы присоединились к сделке'); dealPage(code); } catch(e) { toast(e.message); } }; return;
  }
  const step = nextStep(deal); const share = `${location.origin}${location.pathname}#deal/${deal.share_code}`;
  app.innerHTML = `<section class="deal-hero"><div><div class="eyebrow">Сделка #${deal.id}</div><h1>${escapeHtml(deal.gift_name)}</h1><p>${escapeHtml(deal.description || 'Описание не добавлено')}</p></div><div class="deal-price">${money(deal.price, deal.currency)}<br><i class="badge ${statusClass(deal.status)}">${statusLabel(deal.status)}</i></div></section><section class="detail-grid"><div class="panel"><h2>Следующий шаг</h2><div class="notice"><b>${step.label}</b>${step.text}</div>${step.action ? `<button class="btn primary" id="dealAction" style="margin-top:14px">${step.label}</button>` : ''}<button class="btn ghost" id="copyLink" style="margin:14px 0 0">Скопировать ссылку для покупателя</button></div><aside class="panel"><h3>Детали</h3><div class="steps"><div class="step ${deal.status !== 'created' ? 'done' : 'active'}"><i>1</i><span><b>Сделка создана</b><span>${new Date(deal.created_at).toLocaleString('ru-RU')}</span></span></div><div class="step ${['paid','transferred','completed'].includes(deal.status) ? 'done' : ''}"><i>2</i><span><b>Оплата</b><span>Подтверждается покупателем.</span></span></div><div class="step ${['transferred','completed'].includes(deal.status) ? 'done' : ''}"><i>3</i><span><b>Передача напрямую</b><span>Без менеджера — в чате продавца и покупателя.</span></span></div><div class="step ${deal.status === 'completed' ? 'done' : ''}"><i>4</i><span><b>Получение подтверждено</b><span>Сделка успешно завершена.</span></span></div></div></aside></section>`;
  const copy = document.querySelector('#copyLink'); if (copy) copy.onclick = async () => { await navigator.clipboard.writeText(share); toast('Ссылка скопирована'); };
  const action = document.querySelector('#dealAction'); if (action) action.onclick = async () => { if (step.action === 'transferred' && !confirm('Вы уже передали подарок покупателю в Telegram?')) return; try { await api(`/api/deals/${deal.id}/action`, {method:'POST',body:JSON.stringify({action:step.action})}); toast('Статус сделки обновлён'); dealPage(code); } catch(e) { toast(e.message); } };
}

function wallet() { if (authRequired()) return; app.innerHTML = `<section class="page-head"><div><h1>Кошелёк</h1><p>Баланс и будущие способы оплаты.</p></div></section><section class="dashboard-grid"><div class="balance-card"><small>ДОСТУПНО</small><b>${money(me.balance,'TON')}</b><div>LedgerGift Web</div></div><aside class="panel"><h2>Пополнение</h2><p style="color:var(--muted);line-height:1.5;font-size:13px">Настоящий платёжный провайдер ещё не подключён. Для приёма оплат нужен выбранный сервис и его ключи.</p></aside></section>`; }

function profile() { if (authRequired()) return; app.innerHTML = `<section class="page-head"><div><h1>Профиль</h1><p>Ваш аккаунт LedgerGift.</p></div></section><section class="panel profile-panel"><div class="profile-avatar">${escapeHtml(me.name.charAt(0).toUpperCase())}</div><h2>${escapeHtml(me.name)}</h2><p>LedgerGift • подтверждённый пользователь</p><button class="btn ghost" id="logout">Выйти</button></section>`; document.querySelector('#logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});me=null;syncAccount();location.hash='#home';toast('Вы вышли из аккаунта');}; }

function openAuth(mode='login') { authDialog.showModal(); renderAuth(mode); }
function renderAuth(mode) { document.querySelector('#authContent').innerHTML = `<h2 style="margin:0 0 7px">${mode==='login'?'Вход в LedgerGift':'Регистрация'}</h2><p style="margin:0 0 18px;color:var(--muted);font-size:13px">Введите никнейм и пароль.</p><div class="auth-tabs"><button class="${mode==='login'?'active':''}" data-auth="login">Войти</button><button class="${mode==='register'?'active':''}" data-auth="register">Регистрация</button></div><form id="authForm"><label class="field"><span>Никнейм</span><input name="name" required minlength="2" placeholder="Ваш никнейм"></label><label class="field"><span>Пароль</span><input type="password" name="password" required minlength="6" placeholder="Минимум 6 символов"></label><button class="btn primary" type="submit" style="width:100%">${mode==='login'?'Войти':'Создать аккаунт'}</button></form>`; document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>renderAuth(b.dataset.auth)); document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault(); try{const res=await api(`/api/auth/${mode==='login'?'login':'register'}`, {method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});me=res.user;authDialog.close();syncAccount();toast('Готово');route();}catch(error){toast(error.message)}}; }
function syncAccount() { accountBtn.textContent = me ? me.name : 'Войти'; accountBtn.onclick = () => me ? (location.hash='#profile') : openAuth(); }
async function loadMe() { try { me=(await api('/api/me')).user; } catch { me=null; } syncAccount(); }
function route() { const hash=location.hash.slice(1)||'home'; const [page,param]=hash.split('/'); if (page==='home') home(); else if(page==='dashboard') dashboard(); else if(page==='create')createPage(); else if(page==='deals')dealsPage(); else if(page==='deal')dealPage(param); else if(page==='wallet')wallet(); else if(page==='profile')profile(); else home(); }
document.querySelector('[data-close]').onclick=()=>authDialog.close(); document.querySelector('#themeToggle').onclick=()=>document.body.classList.toggle('dark'); window.addEventListener('hashchange',route);
loadMe().then(route);
