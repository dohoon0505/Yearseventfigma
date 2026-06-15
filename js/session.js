/* ============================================================
   session.js — DEMO-ONLY client-side role gate.

   ⚠️  This is a STATIC site with NO backend. The admin credential
   below ships in client JS (visible in page source, trivially
   bypassable via devtools / direct hash navigation), so this gate is
   a UX/demo convenience only — the same posture as the existing mock
   enterprise login (login.js has no real authentication either).
   All data here is mock/localStorage; there are no real secrets/PII.

   PRODUCTION PATH: replace resolveRole() with a real server call and
   enforce the role SERVER-SIDE — session cookie or JWT with a role
   claim + per-request authorization. Never ship admin credentials in
   client JS in production. The role is kept in sessionStorage so it is
   ephemeral (cleared on tab close and on logout).
   ============================================================ */
const KEY = "yeop.session.v1";
const VALID = new Set(["admin", "enterprise"]);

// DEMO credential — replace with a server authentication call in production.
const ADMIN = { id: "admin", pw: "0324" };

export function getRole() {
  const r = sessionStorage.getItem(KEY);
  return VALID.has(r) ? r : null;
}

export function setRole(role) {
  if (VALID.has(role)) sessionStorage.setItem(KEY, role);
}

export function clearRole() {
  sessionStorage.removeItem(KEY);
}

export function isAuthed() {
  return getRole() !== null;
}

/** DEMO role resolution. admin/0324 → "admin", anything else → "enterprise". */
export function resolveRole(id, pw) {
  return id === ADMIN.id && pw === ADMIN.pw ? "admin" : "enterprise";
}
