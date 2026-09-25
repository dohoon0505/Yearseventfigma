/* ============================================================
   session.js — DEMO-ONLY client-side role gate.

   ⚠️  This is a STATIC site with NO backend. The admin credential
   below ships in client JS (visible in page source, trivially
   bypassable via devtools / direct hash navigation), so this gate is
   a UX/demo convenience only — the same posture as the existing mock
   enterprise login (login.js has no real authentication either).
   There are no real secrets here (seed accounts carry no passwords).
   ⚠️ PII: the 거래처 seed (data/admin-mock.js INITIAL_CLIENTS) IS real data
   migrated from the old system — CEO names and contact numbers included.
   It stays in this public repo/site by user decision (2026-09-25,
   HANDOFF '일부러 남긴 것'). Do not describe it as mock.

   PRODUCTION PATH: replace resolveRole() with a real server call and
   enforce the role SERVER-SIDE — session cookie or JWT with a role
   claim + per-request authorization. Never ship admin credentials in
   client JS in production. The role is kept in sessionStorage so it is
   ephemeral (cleared on tab close and on logout).
   ============================================================ */
const KEY = "yeop.session.v1";
const CKEY = "yeop.session.client.v1"; // which 거래처 the enterprise user is (drives per-client pricing)
const RKEY = "yeop.session.return.v1"; // 로그인 전에 들어오려던 주소 — 로그인 직후 한 번 쓰고 지운다
const NKEY = "yeop.session.notice.v1"; // 라우터가 세션을 끊은 이유 — 로그인 화면이 한 번 말하고 지운다
const VALID = new Set(["admin", "enterprise"]);

// DEMO credential — replace with a server authentication call in production.
const ADMIN = { id: "admin", pw: "0324" };

/** 거래처가 쓸 수 없는 접속 아이디 — 관리자 아이디와 겹치면 로그인이 어느 쪽인지 비밀번호로 갈린다. */
export const isReservedAccountId = (id) => id === ADMIN.id;

export function getRole() {
  const r = sessionStorage.getItem(KEY);
  return VALID.has(r) ? r : null;
}

export function setRole(role) {
  if (VALID.has(role)) sessionStorage.setItem(KEY, role);
}

export function clearRole() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(CKEY);
}

/** The 거래처(client) id the logged-in enterprise user maps to, or null. */
export function getClientId() {
  return sessionStorage.getItem(CKEY) || null;
}
export function setClientId(id) {
  if (id) sessionStorage.setItem(CKEY, id);
  else sessionStorage.removeItem(CKEY);
}
export function clearClientId() {
  sessionStorage.removeItem(CKEY);
}

/* ── 딥링크 복귀 (2026-09-17 결정) ──
   가드에 막혀 로그인으로 보낼 때 원래 주소를 남기고, 로그인이 되면 그리로 돌아간다.
   역할과 맞는 영역인지는 login.js 가 판단한다(거래처 계정이 관리자 주소로 튀면 안 된다). */
export function setReturnTo(hash) {
  if (hash && (hash.startsWith("#/app") || hash.startsWith("#/admin"))) sessionStorage.setItem(RKEY, hash);
}
/** 남겨 둔 주소를 돌려주고 지운다 — 한 번만 쓴다. */
export function takeReturnTo() {
  const h = sessionStorage.getItem(RKEY);
  sessionStorage.removeItem(RKEY);
  return h && (h.startsWith("#/app") || h.startsWith("#/admin")) ? h : null;
}

/* ── 세션을 끊은 이유 (2026-09-25) ──
   라우터가 거래처 세션을 끊으면(로그인 뒤 관리자가 정지·반려했거나 거래처를 지웠다) 로그인 화면이
   그 이유를 한 번 말한다. 이유 없이 로그인 화면으로 튕기면 사용자는 무엇이 잘못됐는지 모른다. */
export function setLoginNotice(msg) {
  if (msg) sessionStorage.setItem(NKEY, msg);
}
export function takeLoginNotice() {
  const m = sessionStorage.getItem(NKEY);
  sessionStorage.removeItem(NKEY);
  return m;
}

/** DEMO role resolution. admin/0324 → "admin", anything else → "enterprise" —
 *  login.js then requires a matching, 활성 거래처 account before granting it. */
export function resolveRole(id, pw) {
  return id === ADMIN.id && pw === ADMIN.pw ? "admin" : "enterprise";
}
