const CURRENCIES = ["Stars", "TON", "USDT", "RUB", "UAH", "USD", "BYN", "KZT", "UZS"];
const schema = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS balances (user_id INTEGER NOT NULL,currency TEXT NOT NULL,amount REAL NOT NULL DEFAULT 0,PRIMARY KEY(user_id,currency));
CREATE TABLE IF NOT EXISTS balance_history (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,currency TEXT NOT NULL,amount REAL NOT NULL,reason TEXT NOT NULL,deal_tag TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requisites (user_id INTEGER NOT NULL,currency TEXT NOT NULL,kind TEXT,label TEXT,value TEXT NOT NULL,PRIMARY KEY(user_id,currency));
CREATE TABLE IF NOT EXISTS deals (id INTEGER PRIMARY KEY AUTOINCREMENT,share_code TEXT UNIQUE NOT NULL,seller_id INTEGER NOT NULL,buyer_id INTEGER,buyer_contact TEXT NOT NULL,gift_name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',price REAL NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'created',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (user_id INTEGER PRIMARY KEY,granted_by INTEGER NOT NULL,granted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS withdrawals (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,currency TEXT NOT NULL,amount REAL NOT NULL,destination TEXT NOT NULL,destination_kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'created',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`;

let schemaReady;
const now = () => new Date().toISOString();
const normalized = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json;charset=utf-8", ...headers } });
const error = (detail, status = 400) => json({ detail }, status);
const cookie = (request, name) => Object.fromEntries((request.headers.get("cookie") || "").split(";").map(x => x.trim().split("=")).filter(x => x.length === 2))[name];
const random = () => crypto.getRandomValues(new Uint8Array(24)).reduce((a, x) => a + x.toString(16).padStart(2, "0"), "");
const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const from64 = (text) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function ensure(env) { if (!schemaReady) schemaReady = env.DB.exec(schema); return schemaReady; }
// Cloudflare Pages on the free plan has a tight CPU limit. This remains a
// salted PBKDF2 hash while allowing registration to complete at the edge.
const PASSWORD_ITERATIONS = 10000;
async function hash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256);
  return `${base64(salt)}.${base64(bits)}`;
}
async function matches(password, stored) { const [salt] = stored.split("."); return stored === await hash(password, from64(salt)); }
async function body(request) { try { return await request.json(); } catch { return {}; } }
async function one(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).first(); }
async function all(env, sql, ...args) { return (await env.DB.prepare(sql).bind(...args).all()).results; }
async function run(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).run(); }
async function current(env, request) {
  const token = cookie(request, "lg_session"); if (!token) throw ["auth_required", 401];
  const user = await one(env, "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?", token, now());
  if (!user) throw ["auth_required", 401]; return user;
}
const owner = (env, user) => !!env.OWNER_NICKNAME && normalized(env.OWNER_NICKNAME) === normalized(user.name);
async function admin(env, user) { return owner(env, user) || !!await one(env, "SELECT 1 FROM admins WHERE user_id=?", user.id); }
async function requireAdmin(env, request) { const user = await current(env, request); if (!await admin(env, user)) throw ["admin_required", 403]; return user; }
async function balances(env, uid) { const rows = await all(env, "SELECT currency,amount FROM balances WHERE user_id=?", uid); const out = Object.fromEntries(CURRENCIES.map(c => [c, 0])); rows.forEach(x => out[x.currency] = x.amount); return out; }
async function changeBalance(env, uid, currency, delta, reason, tag = null) {
  const row = await one(env, "SELECT amount FROM balances WHERE user_id=? AND currency=?", uid, currency); const next = Number(row?.amount || 0) + Number(delta);
  if (next < -0.000001) throw ["insufficient_balance", 409];
  await run(env, "INSERT INTO balances(user_id,currency,amount) VALUES(?,?,?) ON CONFLICT(user_id,currency) DO UPDATE SET amount=excluded.amount", uid, currency, next);
  await run(env, "INSERT INTO balance_history(user_id,currency,amount,reason,deal_tag,created_at) VALUES(?,?,?,?,?,?)", uid, currency, delta, reason, tag, now());
}
async function dealView(env, row) { const seller = await one(env, "SELECT name FROM users WHERE id=?", row.seller_id); return { tag: row.share_code, status: row.status, item_type: "nft", item_type_label: "NFT-подарок", item_link: row.description || "Telegram Gift", amount: row.price, amount_label: String(row.price), currency: row.currency, seller_id: row.seller_id, seller_username: seller?.name || "seller", buyer_username: String(row.buyer_contact || "").replace(/^@/, ""), created_at: row.created_at, transfer_seconds_left: null }; }
const findDeal = (env, tag) => one(env, "SELECT * FROM deals WHERE upper(share_code)=?", String(tag).replace(/^#/, "").toUpperCase());
async function audit(env, actor, action, target = "") { await run(env, "INSERT INTO audit_log(actor_id,action,target,created_at) VALUES(?,?,?,?)", actor, action, target, now()); }

async function api(env, request, path, method) {
  await ensure(env); const parts = path.split("/").filter(Boolean); const input = method === "GET" ? {} : await body(request);
  if (path === "/api/auth/register" && method === "POST") {
    const name = String(input.name || "").trim(), password = String(input.password || ""); if (name.length < 2 || password.length < 6) return error("invalid_credentials");
    if (await one(env, "SELECT 1 FROM users WHERE lower(name)=?", normalized(name))) return error("nickname_exists", 409);
    const result = await run(env, "INSERT INTO users(name,password_hash,created_at) VALUES(?,?,?)", name, await hash(password), now()); const token = random();
    await run(env, "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)", token, result.meta.last_row_id, new Date(Date.now() + 2592e6).toISOString());
    return json({ user: { id: result.meta.last_row_id, name, balance: 0 } }, 200, { "set-cookie": `lg_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` });
  }
  if (path === "/api/auth/login" && method === "POST") {
    const user = await one(env, "SELECT * FROM users WHERE lower(name)=?", normalized(input.name)); if (!user || !await matches(String(input.password || ""), user.password_hash)) return error("invalid_credentials", 401);
    const token = random(); await run(env, "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)", token, user.id, new Date(Date.now() + 2592e6).toISOString());
    return json({ user: { id: user.id, name: user.name, balance: 0 } }, 200, { "set-cookie": `lg_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` });
  }
  if (path === "/api/auth/logout" && method === "POST") { const token = cookie(request, "lg_session"); if (token) await run(env, "DELETE FROM sessions WHERE token=?", token); return json({ ok: true }, 200, { "set-cookie": "lg_session=; Path=/; Max-Age=0" }); }
  const user = await current(env, request);
  if (path === "/api/me") return json({ user: { id: user.id, name: user.name } });
  if (path === "/api/bootstrap") return json({ brand:"LedgerGift",bot_username:"",miniapp_short_name:"",support_username:"",payment_url:"",currencies:CURRENCIES,deal_types:{nft:{ru:"NFT-подарок",en:"NFT Gift"},stars:{ru:"Звёзды",en:"Telegram Stars"},username:{ru:"NFT-username",en:"NFT Username"},crypto:{ru:"Крипта",en:"Crypto"},premium:{ru:"Telegram Premium",en:"Telegram Premium"}},languages:{ru:"🇷🇺 Русский",en:"🇬🇧 English"},me:{id:user.id,username:user.name,first_name:user.name,lang:"ru",is_admin:await admin(env,user),is_owner:owner(env,user)},balances:await balances(env,user.id),requisites_enabled:true,profile:{id:user.id,username:user.name,orders:0,rating:0,volume:0,volume_label:"0",level:{label:"Новичок"},deal_stats:{total:0,completed:0,cancelled:0}} });
  if (path === "/api/profile") return json({ id:user.id,username:user.name,orders:0,rating:0,volume:0,volume_label:"0",level:{label:"Новичок"},deal_stats:{total:0,completed:0,cancelled:0} });
  if (path === "/api/balances") { const history = await all(env,"SELECT currency,amount,reason,deal_tag,created_at FROM balance_history WHERE user_id=? ORDER BY id DESC LIMIT 50",user.id); return json({ balances:await balances(env,user.id),history }); }
  if (path === "/api/requisites" && method === "GET") { const rows=await all(env,"SELECT currency,kind,label,value FROM requisites WHERE user_id=?",user.id); return json({enabled:true,items:Object.fromEntries(rows.map(x=>[x.currency,x]))}); }
  if (path === "/api/requisites" && method === "PUT") { if (!CURRENCIES.includes(input.currency)) return error("bad_currency"); await run(env,"INSERT INTO requisites(user_id,currency,kind,label,value) VALUES(?,?,?,?,?) ON CONFLICT(user_id,currency) DO UPDATE SET kind=excluded.kind,label=excluded.label,value=excluded.value",user.id,input.currency,input.kind||"",input.label||"",input.value||""); return json({ok:true}); }
  if (parts[0] === "api" && parts[1] === "requisites" && method === "DELETE") { await run(env,"DELETE FROM requisites WHERE user_id=? AND currency=?",user.id,parts[2]); return json({ok:true}); }
  if (path === "/api/deals/history") { const rows=await all(env,"SELECT * FROM deals WHERE seller_id=? OR buyer_id=? OR lower(replace(buyer_contact,'@',''))=? ORDER BY id DESC",user.id,user.id,normalized(user.name)); return json({deals:await Promise.all(rows.map(r=>dealView(env,r)))}); }
  if (path === "/api/top") return json({items:[]});
  if (path === "/api/language") return json({ok:true});
  if (path === "/api/balance/withdraw" && method === "POST") { const amount=Number(input.amount), currency=input.currency, req=await one(env,"SELECT * FROM requisites WHERE user_id=? AND currency=?",user.id,currency); if (!CURRENCIES.includes(currency)||!(amount>0)||!req) return error("invalid_withdrawal"); await changeBalance(env,user.id,currency,-amount,"withdrawal_request"); const result=await run(env,"INSERT INTO withdrawals(user_id,currency,amount,destination,destination_kind,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",user.id,currency,amount,req.value,req.kind,"created",now(),now()); await run(env,"UPDATE balance_history SET deal_tag=? WHERE id=(SELECT id FROM balance_history WHERE user_id=? ORDER BY id DESC LIMIT 1)","withdrawal:"+result.meta.last_row_id,user.id); return json({ok:true,withdrawal_id:result.meta.last_row_id}); }
  if (path === "/api/deal/create" && method === "POST") { const buyer=normalized(input.buyer_username), amount=Number(input.amount), currency=input.currency; if (buyer.length<2||!(amount>0)||!CURRENCIES.includes(currency)) return error("bad_deal"); const code=random().slice(0,12).toUpperCase(), stamp=now(); await run(env,"INSERT INTO deals(share_code,seller_id,buyer_contact,gift_name,description,price,currency,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",code,user.id,buyer,input.item_type||"NFT-подарок",input.item_link||"Telegram Gift",amount,currency,"created",stamp,stamp); const row=await findDeal(env,code); return json({deal:await dealView(env,row),share_link:new URL(request.url).origin+"/?deal="+code}); }
  if (parts[0]==="api"&&parts[1]==="deal") { const row=await findDeal(env,parts[2]); if(!row)return error("deal_not_found",404); const buyer=normalized(row.buyer_contact)===normalized(user.name), seller=row.seller_id===user.id, action=parts[3]; if(method==="GET")return json({deal:await dealView(env,row),role:{is_buyer:buyer,is_seller:seller,is_staff:false,can_pay:buyer&&row.status==="created",can_confirm:buyer&&row.status==="transferred"},support_username:""}); if(action==="pay"){if(!buyer||row.status!=="created")return error("not_your_deal",403);await changeBalance(env,user.id,row.currency,-row.price,"deal_payment",row.share_code);await run(env,"UPDATE deals SET buyer_id=?,status='paid',updated_at=? WHERE id=?",user.id,now(),row.id);return json({ok:true});}if(action==="transferred"){if(!seller||row.status!=="paid")return error("transfer_not_available",409);await run(env,"UPDATE deals SET status='transferred',updated_at=? WHERE id=?",now(),row.id);return json({ok:true});}if(action==="receipt"){if(!buyer||row.status!=="transferred")return error("transfer_not_confirmed",409);await changeBalance(env,row.seller_id,row.currency,row.price,"deal_release",row.share_code);await run(env,"UPDATE deals SET status='completed',updated_at=? WHERE id=?",now(),row.id);return json({ok:true});}if(action==="cancel"){if(!(buyer||seller)||!["created","paid"].includes(row.status))return error("cancel_unavailable",409);if(row.status==="paid"&&row.buyer_id)await changeBalance(env,row.buyer_id,row.currency,row.price,"deal_refund",row.share_code);await run(env,"UPDATE deals SET status='cancelled',updated_at=? WHERE id=?",now(),row.id);return json({ok:true});}if(action==="notify-seller")return json({ok:true}); }
  if (path.startsWith("/api/admin/")) { const actor=await requireAdmin(env,request); if(path==="/api/admin/overview"){const admins=await all(env,"SELECT u.id,u.name,a.granted_at FROM admins a JOIN users u ON u.id=a.user_id ORDER BY u.name");const logs=await all(env,"SELECT action,target,created_at FROM audit_log ORDER BY id DESC LIMIT 20");const count=await one(env,"SELECT count(*) count FROM deals WHERE status!='completed'");return json({owner:owner(env,actor),admins,active_deals:count.count,logs});}if(path==="/api/admin/deals"){const rows=await all(env,"SELECT * FROM deals ORDER BY id DESC LIMIT 100");return json({deals:await Promise.all(rows.map(r=>dealView(env,r)))});}if(path==="/api/admin/withdrawals"){const items=await all(env,"SELECT w.*,u.name username FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status NOT IN ('completed','rejected') ORDER BY w.id DESC");return json({items});}if(path==="/api/admin/admins"&&method==="POST"){if(!owner(env,actor))return error("owner_required",403);const target=await one(env,"SELECT * FROM users WHERE lower(name)=?",normalized(input.nickname));if(!target)return error("user_not_found",404);await run(env,"INSERT OR IGNORE INTO admins(user_id,granted_by,granted_at) VALUES(?,?,?)",target.id,actor.id,now());await audit(env,actor.id,"admin_granted","@"+target.name);return json({ok:true});}if(path==="/api/admin/balance"&&method==="POST"){const target=await one(env,"SELECT * FROM users WHERE lower(name)=?",normalized(input.nickname));if(!target)return error("user_not_found",404);if(!CURRENCIES.includes(input.currency)||!Number(input.amount))return error("bad_balance_change");await changeBalance(env,target.id,input.currency,Number(input.amount),"manual_topup");await audit(env,actor.id,"balance_changed","@"+target.name);return json({ok:true,balances:await balances(env,target.id)});}if(parts[2]==="admin"&&parts[3]==="admins"&&method==="DELETE"){if(!owner(env,actor))return error("owner_required",403);await run(env,"DELETE FROM admins WHERE user_id=?",parts[4]);return json({ok:true});}if(parts[2]==="admin"&&parts[3]==="withdrawals"&&method==="POST"){const row=await one(env,"SELECT * FROM withdrawals WHERE id=?",parts[4]);const action=parts[5];if(!row||!["checking","sending","completed","rejected"].includes(action))return error("withdrawal_not_found",404);if(action==="rejected")await changeBalance(env,row.user_id,row.currency,row.amount,"withdrawal_refund");await run(env,"UPDATE withdrawals SET status=?,updated_at=? WHERE id=?",action,now(),row.id);await audit(env,actor.id,"withdrawal_"+action,"#"+row.id);return json({ok:true});} }
  return error("not_found",404);
}

export default { async fetch(request, env) { try { const url=new URL(request.url); if(url.pathname.startsWith("/api/")) return await api(env,request,url.pathname,request.method); return env.ASSETS.fetch(request); } catch(e) { if(Array.isArray(e))return error(e[0],e[1]); return error("server_error",500); } } };
