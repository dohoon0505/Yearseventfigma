/* ============================================================
   settlement-rules.js — 정산 규칙의 단일 소스 (import 0 · 순수 함수).
   발행일 · 동의 마감 · 자동 동의 · 계산서 작성일자 · 정산기한을 **여기서만** 계산한다.
   `node tools/test-settlement-rules.mjs` 가 시계를 못박고 검증한다 — 그래서 이 파일은
   규칙 본문 안에서 `new Date()` 를 부르지 않는다(기본 인자로만).

   규칙(2026-09-17 사용자 확정):
   ─ 거래명세서는 귀속월 **다음 달의 거래처 지정일(invoiceDay 1~28) 10:00** 에 발급된다.
   ─ 계산서 발급 동의 **마감**은 발급일 그룹으로 갈린다 —
       발급일 1~10일  → 발급월 **10일 13:00**  (세법상 익월 10일 발급 기한 안)
       발급일 11~28일 → 발급월 **28일 13:00**
     마감까지 동의가 없으면 **마감 시각에 자동 동의**된다.
   ─ 계산서 **작성일자**:
       1~10 그룹  → **귀속월 말일**(수동·자동 무관 — 전월분으로 소급 발급)
       11~28 그룹 → **동의한 날**(자동 동의면 28일 — 소급이 불가능해 동의일 귀속)
   ─ 정산기한(입금)은 그대로 **발행일이 속한 달의 말일**.
   ─ 전 품목 면세라 발급 문서는 '계산서' 다(세금계산서가 아니다).

   ⚠️ 기간은 언제나 "YYYY-MM" 문자열이다. 월 인덱스(0-based)를 인자로 받는 API 를 두지
      않는다 — `monthEnd(y, m)` 의 0-based 함정으로 정산기한이 다음 달로 밀린 전력이 있다.
   ============================================================ */
const pad = (n) => String(n).padStart(2, "0");

/** 거래처별 계산서 발급일 후보(매월 N일, 1~28). 29~31 은 없는 달이 있어 두지 않는다. */
export const INVOICE_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));
/** 거래처 레코드 → 발급일(숫자). 미설정·범위 밖이면 1일. */
export function invoiceDayOf(client) {
  const n = Number(client && client.invoiceDay);
  return n >= 1 && n <= 28 ? n : 1;
}
/** 동의 마감일 — 발급일 그룹으로 정해진다(10일 / 28일). */
export const deadlineDayOf = (day) => (Number(day) <= 10 ? 10 : 28);
export const ISSUE_HOUR = 10;    // 명세서 발급 시각
export const DEADLINE_HOUR = 13; // 동의 마감 · 자동 동의 시각

/* ── 기간("YYYY-MM") ──────────────────────────────────────── */
/** "YYYY-MM" → { y, m1 } (m1 은 **1-based**). 모양이 어긋나면 throw — 조용한 NaN 날짜를 만들지 않는다. */
export function splitPeriod(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period));
  if (!m) throw new Error(`period must be "YYYY-MM": ${period}`);
  return { y: Number(m[1]), m1: Number(m[2]) };
}
export const periodOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
/** "2026-08" → "2026년 08월" (정산 표·이용 내역의 라벨 규격) */
export function periodLabel(period) {
  const { y, m1 } = splitPeriod(period);
  return `${y}년 ${pad(m1)}월`;
}
export function shiftPeriod(period, delta) {
  const { y, m1 } = splitPeriod(period);
  return periodOf(new Date(y, m1 - 1 + delta, 1));
}
/** 귀속월 말일 00:00. `new Date(y, m1, 0)` — m1 이 1-based 라 "다음 달의 0일" = 이 달 말일. */
export function periodEnd(period) {
  const { y, m1 } = splitPeriod(period);
  return new Date(y, m1, 0);
}

/* ── 날짜 규칙 ────────────────────────────────────────────── */
/** 명세서 발행일시 — 귀속월 다음 달 `day` 일 10:00 */
export function issueDate(period, day) {
  const { y, m1 } = splitPeriod(period);
  return new Date(y, m1, invoiceDayOf({ invoiceDay: day }), ISSUE_HOUR, 0, 0, 0);
}
/** 동의 마감 — 발급월 10일/28일 13:00. 항상 `issueDate` 이후다(같은 날이면 10:00 → 13:00 세 시간이 수동 창). */
export function agreeDeadline(period, day) {
  const { y, m1 } = splitPeriod(period);
  return new Date(y, m1, deadlineDayOf(invoiceDayOf({ invoiceDay: day })), DEADLINE_HOUR, 0, 0, 0);
}
/** 정산기한 — 발행일이 속한 달의 말일 */
export function dueDate(period) {
  const { y, m1 } = splitPeriod(period);
  return new Date(y, m1 + 1, 0);
}
/** 계산서 작성일자. 1~10 그룹은 귀속월 말일(동의 전에도 확정), 11~28 그룹은 동의한 날(동의 전이면 null). */
export function docDate(period, day, agreedAt) {
  if (invoiceDayOf({ invoiceDay: day }) <= 10) return periodEnd(period);
  const d = agreedAt instanceof Date ? agreedAt : parseAt(agreedAt);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
}

/* ── 포맷 ────────────────────────────────────────────────── */
/** "YYYY-MM-DD HH:mm" — store 의 동의 기록·주문 이력과 같은 규격 */
export const fmtAt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function parseAt(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
export const fmtYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtMd = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtMdHm = (d) => `${fmtMd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** "2026년 09월 15일" — 명세서 문서의 발행일 규격 */
export const fmtKo = (d) => `${d.getFullYear()}년 ${pad(d.getMonth() + 1)}월 ${pad(d.getDate())}일`;
/** "2026. 09. 15" — 정산 표의 날짜 규격 */
export const fmtDot = (d) => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;
/** "9월 28일" / "9월 28일 13:00" — 안내문용 */
export const fmtKoShort = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
export const fmtKoShortTime = (d) => `${fmtKoShort(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ── 동의 상태 ────────────────────────────────────────────── */
/**
 * 한 (거래처, 귀속월)의 동의 상태를 파생한다. 포털 버튼 활성 · store 의 쓰기 가드 ·
 * 관리자 표가 **전부 이 한 함수**를 본다.
 *   issued ⇔ issueDate ≤ now
 *   auto   ⇔ 수동 기록이 없고 now > deadline (13:00:00.000 정각은 아직 열려 있다)
 *   open   ⇔ issued && mode === null
 * 수동 기록은 **읽을 때 항상 이긴다**(마감은 쓰기에서만 막는다 — store.agreeInvoice).
 * @returns {{ period, invoiceDay, group:"early"|"late", issueDate, deadline, dueDate,
 *            issued, open, mode: null|"manual"|"auto", at: Date|null, docDate: Date|null }}
 */
export function agreementState({ period, invoiceDay, manualAt = null, now }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("agreementState: now(Date) is required");
  const day = invoiceDayOf({ invoiceDay });
  const issue = issueDate(period, day);
  const deadline = agreeDeadline(period, day);
  const issued = issue.getTime() <= now.getTime();
  const manual = manualAt instanceof Date ? manualAt : parseAt(manualAt);
  let mode = null, at = null;
  if (manual) { mode = "manual"; at = manual; }
  else if (now.getTime() > deadline.getTime()) { mode = "auto"; at = deadline; }
  return {
    period, invoiceDay: day, group: day <= 10 ? "early" : "late",
    issueDate: issue, deadline, dueDate: dueDate(period),
    issued, open: issued && mode === null, mode, at,
    docDate: mode ? docDate(period, day, at) : (day <= 10 ? periodEnd(period) : null),
  };
}
