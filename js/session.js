/* ============================================================
   session.js — DEMO-ONLY client-side role gate.

   ⚠️  This is a STATIC site with NO backend. The admin credential
   below ships in client JS (visible in page source, trivially
   bypassable via devtools / direct hash navigation), so this gate is
   a UX/demo convenience only — the same posture as the existing mock
   enterprise login (login.js has no real authentication either).
   There are no real secrets here — the seed 거래처 share the demo password
   `demo1234` (data/admin-mock.js DEMO_PASSWORD).
   The 거래처 seed (INITIAL_CLIENTS) is FICTIONAL since 2026-09-29: clients are
   not migrated from the old system (everyone signs up anew), so the real
   records were replaced. Do not put real companies/people/contacts back —
   this repo and site are public. (Operator-side values — the supplier
   block in data/invoice-links.js and the two system staff numbers in
   data/staff-mock.js — were replaced with placeholders on 2026-10-03;
   the real values are server settings.)

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
const FKEY = "yeop.session.focus.v1"; // 화면 사이에 넘겨주는 "이 거래처를 열어라" — 받는 화면이 한 번 쓰고 지운다
const SKEY = "yeop.session.section.v1"; // 화면 사이에 넘겨주는 "이 구역을 보여 줘라" — 받는 화면이 한 번 쓰고 지운다
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
/* ── 화면 사이 거래처 넘겨주기 (2026-09-29) ──
   가입 승인은 **가입 신청 → 단가 조정 → 승인** 순서다(사용자 지시). 거래처 관리와 기업별 상품단가가 다른
   화면이라, 한쪽에서 "이 거래처" 를 들고 다른 쪽으로 건너가야 한다. 라우터가 쿼리를 모르므로 세션에 남긴다.
   `screen` 이 맞는 화면만 꺼내 쓰고, 꺼내면 지운다(남겨 두면 나중에 사이드바로 들어와도 그 거래처가 열린다). */
export function setFocusClient(screen, clientId) {
  try { sessionStorage.setItem(FKEY, JSON.stringify({ screen, clientId })); } catch { /* storage 비활성 — 첫 거래처로 열린다 */ }
}
export function takeFocusClient(screen) {
  try {
    const v = JSON.parse(sessionStorage.getItem(FKEY) || "null");
    if (!v || v.screen !== screen) return null;
    sessionStorage.removeItem(FKEY);
    return v.clientId || null;
  } catch { return null; }
}
/* ── 화면 사이 구역 넘겨주기 (2026-10-07) ──
   정산회계 조회의 회사정보 수정에서 '정산 담당 › 변경' 을 누르면 프로필 저장공간의 **담당자 카드**로
   가야 한다(정산담당은 거기서만 지정한다). 그 카드는 발송인 프로필 카드 아래라 그냥 이동하면 첫 화면에
   안 보인다. 거래처 넘겨주기(setFocusClient)와 같은 모양이지만 실어 나르는 것이 거래처 id 가 아니라
   구역 이름이라 키를 따로 둔다 — 한 키에 두 뜻을 실으면 받는 쪽이 무엇을 꺼냈는지 모른다. */
export function setFocusSection(screen, section) {
  try { sessionStorage.setItem(SKEY, JSON.stringify({ screen, section })); } catch { /* storage 비활성 — 맨 위에서 열린다 */ }
}
export function takeFocusSection(screen) {
  try {
    const v = JSON.parse(sessionStorage.getItem(SKEY) || "null");
    if (!v || v.screen !== screen) return null;
    sessionStorage.removeItem(SKEY);
    return v.section || null;
  } catch { return null; }
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
