/* ============================================================
   settlement-rules.js — 정산 규칙의 단일 소스 (import 0 · 순수 함수).
   발행일 · 동의 마감 · 자동 동의 · 계산서 작성일자 · 정산기한을 **여기서만** 계산한다.
   `node tools/test-settlement-rules.mjs` 가 시계를 못박고 검증한다 — 그래서 이 파일은
   규칙 본문 안에서 `new Date()` 를 부르지 않는다(기본 인자로만).

   규칙(2026-09-17 사용자 확정):
   ─ 거래명세서는 귀속월 **다음 달의 거래처 지정일(invoiceDay 1~28) 10:00** 에 발급된다.
     새로 고를 수 있는 날은 동의 기간이 3일 이상인 **1~7일·11~25일**이다(2026-09-25 결정 — `INVOICE_DAYS`).
   ─ 계산서 발급 동의 **마감**은 발급일 그룹으로 갈린다 —
       발급일 1~10일  → 발급월 **10일 13:00**  (세법상 익월 10일 발급 기한 안)
       발급일 11~28일 → 발급월 **28일 13:00**
     마감까지 동의가 없으면 **마감 시각에 자동 동의**된다.
   ─ 계산서 **작성일자**:
       1~10 그룹  → **귀속월 말일**(수동·자동 무관 — 전월분으로 소급 발급)
       11~28 그룹 → **동의한 날**(자동 동의면 28일 — 소급이 불가능해 동의일 귀속)
   ─ 정산기한(입금)은 그대로 **발행일이 속한 달의 말일**.
   ─ **발급일 변경은 다음 달 발급분부터 적용된다**(2026-09-17 사용자 결정) — `invoiceDayFor` 참조.
   ─ 전 품목 면세라 발급 문서는 '계산서' 다(세금계산서가 아니다).

   ⚠️ 기간은 언제나 "YYYY-MM" 문자열이다. 월 인덱스(0-based)를 인자로 받는 API 를 두지
      않는다 — `monthEnd(y, m)` 의 0-based 함정으로 정산기한이 다음 달로 밀린 전력이 있다.
   ============================================================ */
const pad = (n) => String(n).padStart(2, "0");

/* 계산이 받는 발급일은 1~28 이다(29~31 은 없는 달이 있다). **새로 고를 수 있는 날**은 더 좁다 —
   아래 `INVOICE_DAYS` 참조. 계산 쪽을 좁히면 제한 전에 저장된 값과 이력이 조용히 1일로 바뀐다. */
const clampDay = (v) => {
  const n = Number(v);
  return n >= 1 && n <= 28 ? n : 1;
};
/** 거래처 레코드 → **현재(앞으로 적용될)** 발급일(숫자). 미설정·범위 밖이면 1일.
 *  ⚠️ 과거 귀속월의 발행일·마감·작성일자를 계산할 때는 이걸 쓰면 안 된다 — `invoiceDayFor` 를 쓸 것. */
export function invoiceDayOf(client) {
  return clampDay(client && client.invoiceDay);
}

/** 발급일 변경이 처음 적용되는 **귀속월**("YYYY-MM").
 *  변경한 달을 귀속월로 하는 명세서가 곧 다음 달에 발급되므로, "다음 달 발급분부터" 와 같은 뜻이다. */
export const invoiceDayEffectiveFrom = (now) => periodOf(now);

/**
 * 그 **귀속월에 유효했던** 발급일. 발급일 변경은 다음 달 발급분부터 적용되므로(2026-09-17 사용자 결정)
 * 이미 발급된 달은 옛 발급일로 계속 계산된다.
 *
 * ⚠️ 이게 없으면 관리자가 발급일 드롭다운을 한 번 바꾸는 순간 **과거 6개월이 통째로 다시 계산된다** —
 *    실측: 수동 동의한 달의 작성일자가 2026-09-17 → 2026-08-31 로 밀리고(사례 1), 이미 자동 동의로
 *    계산서가 나간 달이 '동의대기' 로 되돌아가 거래처 포털에 동의 버튼이 다시 떴다(사례 3).
 *    작성일자는 국세청에 신고되는 날짜라 소급해 바뀌면 발급분과 대사가 되지 않는다.
 *
 * 이력(`client.invoiceDayLog`)은 오름차순 `[{ from, day, prev, at }]` 이고 `from` 은 **적용 시작 귀속월**이다.
 * 이력이 없으면 지금 값이 곧 전 기간의 값이다(변경한 적이 없는 거래처 — 시드 19곳 전부).
 */
export function invoiceDayFor(client, period) {
  splitPeriod(period); // 모양 검증 — "YYYY-MM" 은 사전순 비교가 곧 시간순 비교다
  const log = (client && Array.isArray(client.invoiceDayLog) ? client.invoiceDayLog : []).filter((e) => e && e.from);
  if (!log.length) return invoiceDayOf(client);
  const sorted = [...log].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const later = sorted.find((e) => e.from > period);
  return clampDay(later ? later.prev : sorted[sorted.length - 1].day);
}
/** 동의 마감일 — 발급일 그룹으로 정해진다(10일 / 28일). */
export const deadlineDayOf = (day) => (Number(day) <= 10 ? 10 : 28);
export const ISSUE_HOUR = 10;    // 명세서 발급 시각
export const DEADLINE_HOUR = 13; // 동의 마감 · 자동 동의 시각

/** 동의 기간의 하한(일). 발급(10:00)에서 마감(13:00)까지 이보다 짧은 발급일은 **새로 고를 수 없다**
 *  (2026-09-25 사용자 결정). 발급일 10·28일은 발급과 마감이 같은 날이라 거래처에 3시간뿐이었고, 약관 3항의
 *  '마감 전날 안내'도 불가능했다 — 약관규제법 12조의 '상당한 기한' 문제다(명세 3.4 법무 질문서). */
export const MIN_CONSENT_DAYS = 3;
/** 발급일 → 발급 10:00 부터 동의 마감 13:00 까지의 시간. 1일 219h · 7일 75h · 8일 51h · 10일 3h. */
export const consentWindowHours = (day) => (deadlineDayOf(day) - Number(day)) * 24 + (DEADLINE_HOUR - ISSUE_HOUR);
/**
 * 거래처가 **새로 고를 수 있는** 발급일(매월 N일, 문자열) — 동의 기간이 `MIN_CONSENT_DAYS` 이상인 날,
 * 곧 1~7일 · 11~25일. 관리자 발급일 드롭다운의 선택지다.
 * ⚠️ 선택지일 뿐이다. 계산(`invoiceDayOf`·`invoiceDayFor`)은 1~28 을 그대로 받는다.
 */
export const INVOICE_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1))
  .filter((d) => consentWindowHours(d) >= MIN_CONSENT_DAYS * 24);
/** 선택지를 사람이 읽는 범위로 — "1~7일·11~25일". 안내 문구가 숫자를 따로 적지 않게 여기서 만든다. */
export function invoiceDayRangeLabel() {
  const runs = [];
  INVOICE_DAYS.map(Number).forEach((n) => {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  });
  return runs.map(([a, b]) => (a === b ? `${a}일` : `${a}~${b}일`)).join("·");
}

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
/** 위 둘과 같되 **`now` 와 해가 다르면 연도를 붙인다** — "2027년 1월 1일" / "2027년 1월 1일 10:00"(같은 해면 위와 한 글자도
 *  같다). 다음 해·지난해 달을 고를 수 있는 화면용 — 연도 없이 '1월 1일 10:00에 발급됩니다' 라고 하면 올해 1월로 읽힌다. */
export const fmtKoShortY = (d, now = new Date()) =>
  (d.getFullYear() === now.getFullYear() ? fmtKoShort(d) : `${d.getFullYear()}년 ${fmtKoShort(d)}`);
export const fmtKoShortTimeY = (d, now = new Date()) => `${fmtKoShortY(d, now)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ── 동의 상태 ────────────────────────────────────────────── */
/**
 * 한 (거래처, 귀속월)의 동의 상태를 파생한다. 포털 버튼 활성 · store 의 쓰기 가드 ·
 * 관리자 표가 **전부 이 한 함수**를 본다.
 *   issued ⇔ issueDate ≤ now
 *   auto   ⇔ 수동 기록이 없고 now > deadline (13:00:00.000 정각은 아직 열려 있다)
 *            **그리고 마감 전에 약관에 동의했다**(termsAt ≤ deadline — 2026-09-29 법무 답). 의제 조항은 동의한
 *            약관에서만 나온다. 약관 전이면 마감이 지나도 자동 동의하지 않고, 수동 동의를 기다리며 열려 있다.
 *            termsAt: `undefined` = 약관을 따지지 않는 순수 규칙 계산(테스트) · `null` = 동의 기록 없음
 *   open   ⇔ issued && mode === null
 * 수동 기록은 **읽을 때 항상 이긴다**(마감은 쓰기에서만 막는다 — store.agreeInvoice).
 * 자동 동의를 막는 것은 약관 동의 전 **하나뿐**이다(2026-10-23 운영자 결정 D1 — 예전 잠정 '고지 미도달' 보류(Q19)는 걷어 냈다 ·
 * 마감 하루 전 안내(T4)가 닿지 않은 달도 마감에 평소대로 자동 동의한다 · 닿지 않은 사실은 `noticeState` 가 기록으로만 말한다).
 * 옛 호출이 `hold` 를 실어 와도(옛 'NOTICE_UNDELIVERED' · 'CLIENT_SUSPENDED') 읽지 않는다.
 * @returns {{ period, invoiceDay, group:"early"|"late", issueDate, deadline, dueDate,
 *            issued, open, mode: null|"manual"|"auto", at: Date|null, docDate: Date|null }}
 */
export function agreementState({ period, invoiceDay, manualAt = null, termsAt, now }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("agreementState: now(Date) is required");
  const day = invoiceDayOf({ invoiceDay });
  const issue = issueDate(period, day);
  const deadline = agreeDeadline(period, day);
  const issued = issue.getTime() <= now.getTime();
  const manual = manualAt instanceof Date ? manualAt : parseAt(manualAt);
  const terms = termsAt === undefined ? undefined : termsAt instanceof Date ? termsAt : parseAt(termsAt);
  const termsOk = terms === undefined || (!!terms && terms.getTime() <= deadline.getTime());
  const past = now.getTime() > deadline.getTime();
  let mode = null, at = null;
  if (manual) { mode = "manual"; at = manual; }
  else if (termsOk && past) { mode = "auto"; at = deadline; }
  const autoAgreeHold = manual || !past || termsOk ? null : "TERMS_NOT_AGREED";
  /* 마감 시각에 자동 동의를 막고 있던 이유 — autoAgreeHold 와 같은 판정이되 **마감 뒤 직접 동의해도 남는다**(지난 사실 ·
     관리자 진행 기록의 '마감 · 자동 동의 안 함' 줄 · 서버 보류 이력의 데모 대역 — 명세 10.4 Q34). 마감 전이거나, 마감 전
     (정각 포함)에 직접 동의했거나, 자동 동의된 달은 null. termsAt 은 처음 동의한 시각이라 뒤에 바뀌지 않는다 — 그래서 날짜로
     짐작하지 않고 그 값에서 파생한다. */
  const heldAtDeadline = !past || (manual && manual.getTime() <= deadline.getTime()) || termsOk ? null : "TERMS_NOT_AGREED";
  return {
    period, invoiceDay: day, group: day <= 10 ? "early" : "late",
    issueDate: issue, deadline, dueDate: dueDate(period),
    issued, open: issued && mode === null, mode, at,
    /* 마감이 지났는데 약관 동의 전이라 자동 동의하지 않은 달 — 화면이 이유를 말할 수 있게 */
    termsHold: !manual && !termsOk && past,
    /* 마감이 지났는데 자동 동의하지 않은 이유(명세 6.6 `autoAgreeHold`) — 약관 동의 전("TERMS_NOT_AGREED") 하나, 아니면 null */
    autoAgreeHold,
    heldAtDeadline,
    docDate: mode ? docDate(period, day, at) : (day <= 10 ? periodEnd(period) : null),
  };
}

/* ── 수정 마감 · 기한 초과 (2026-10-15 결정 — 정정 체계 폐지 · 명세 3.4 '마감 전 수정' · 6.6) ──────── */
/** 수정 마감 — 동의 마감 **날짜의 전날 10:00**(= T4 마감 안내 발송 시각). 1~10 그룹은 발급월 9일 10:00,
 *  11~28 그룹은 27일 10:00. 이 시각부터(정각 포함) 동의 전이어도 그 달 금액을 바꾸는 수정이 잠긴다. */
export function editLockAt(period, day) {
  const d = agreeDeadline(period, day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, ISSUE_HOUR, 0, 0, 0);
}
/** 기한 초과 시각 — 정산기한(발행월 말일) **다음 날 10:00**(T8 과 같은 시각 · M44). 이 시각부터(정각 포함) 미입금은 OVERDUE. */
export function overdueAt(period) {
  const d = dueDate(period);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, ISSUE_HOUR, 0, 0, 0);
}
/** 수정 마감의 **날(일)** — 동의 마감일의 전날(1~10 그룹 9일 · 11~28 그룹 27일). `editLockAt` 과 같은 규칙이다 —
 *  화면이 '수정 마감 N일 10:00' 을 적을 때 날짜 산술을 페이지에 두지 않으려고 여기서 낸다(S-03 정산 절차 카드). */
export const editLockDayOf = (day) => deadlineDayOf(invoiceDayOf({ invoiceDay: day })) - 1;
/** 지금 수정 마감이 지났는가(정각 포함 — 10:00:00 부터 잠긴다). */
export const isEditLocked = (period, day, now) => now.getTime() >= editLockAt(period, day).getTime();
/** 지금 기한 초과 시각이 지났는가(정각 포함). */
export const isPastOverdue = (period, now) => now.getTime() >= overdueAt(period).getTime();

/** 잠긴 이유 — 명세 6.4 '정산 잠금' 의 정본 문구 3종(2026-10-15 결정 — 귀속월 배송일 기준). 화면이 지어내지 않는다.
 *  editLock: 수정 마감 뒤 · 동의 전 / agreed: 동의된 달(AGREED·ISSUED·PAID·OVERDUE) / zero: 0원으로 계산서 없이 닫는(닫힌) 달 */
export const LOCK_REASON = {
  editLock: "배송일이 지난 달 · 수정 마감(마감 안내 시각)이 지났습니다 — 금액 조정은 동의 뒤 수정계산서로",
  agreed: "배송일이 지난 달 · 동의를 마쳤습니다 — 금액 조정은 수정계산서로",
  zero: "배송일이 지난 달 · 0원이라 계산서 없이 닫는 달입니다 — 금액을 바꿀 수 없습니다",
};
/** 잠긴 이유의 **짧은 말**(시안 S-06 — 금액 칸 옆 한 줄). 정본은 언제나 LOCK_REASON 이고 화면은 그것을 title·보조기술용
 *  글로 함께 둔다. zero 는 시안에 짧은 말이 없어 두지 않는다(settlementOf 의 lockShort 가 null → 정본 전체를 쓴다). */
export const LOCK_SHORT = {
  editLock: "수정 마감 지남 · 동의 뒤 수정계산서로",
  agreed: "동의된 달 · 수정계산서로",
};
/** 발행 시각이 지났는데 거래가 없던 달(NONE)로는 등록·배송일 이동을 받지 않는다(2026-10-16 사용자 답 3) — 그 이유.
 *  그 달로 주문이 들어오면 명세서·발급 안내(T3) 없이 '발급 때 0원 → 지금 X원' 이 되고, 마감이 지났으면 주문이 생기기 전
 *  시각에 자동 동의된 꼴이 된다. 발행 전 달(이번 달·다음 달)은 그대로 받는다. 판정은 util/settlement `settlementImpactOf`.
 *  0원 주문만 있던 달도 NONE 이다(2026-10-22 운영자 결정 B — 내역서를 내지 않는다) — 그 달로 들어오는 주문도 이 이유로 막는다
 *  (그 달에 있던 0원 주문의 금액을 올리는 저장은 아래 issuedZeroReason). */
export const issuedEmptyReason = (period) => `${splitPeriod(period).m1}월은 명세서 발행이 지난 달입니다 — 배송일을 확인해 주세요`;
/** 위 이유의 짧은 말(칸 옆 한 줄용). 정본은 issuedEmptyReason. */
export const ISSUED_EMPTY_SHORT = "명세서 발행이 지난 달";
/** 0원 주문만 있어 명세서를 내지 않은 달(NONE — 2026-10-22 운영자 결정 B)에서 그 달에 있던 0원 주문의 금액을 올리는 저장을 막는 이유.
 *  받으면 명세서·발급 안내(T3) 없이 '발급 때 0원 → 지금 X원' 이 된다(위 issuedEmptyReason 과 같은 까닭). 판정은 util/settlement
 *  `settlementImpactOf`. 상품만 바꾸거나 다른 달로 옮기거나 지우는 것은 받는다. */
export const issuedZeroReason = (period) => `${splitPeriod(period).m1}월은 0원 주문만 있어 명세서를 내지 않은 달입니다 — 금액을 올릴 수 없습니다`;
/** 위 이유의 짧은 말. 정본은 issuedZeroReason. */
export const ISSUED_ZERO_SHORT = "명세서를 내지 않은 달";
/** 탈퇴한 거래처로는 새 주문(등록 위저드 · 포털 접수)을 받지 않는 이유(2026-10-22 운영자 결정 A — 탈퇴는 되돌리지 않는다 ·
 *  끝나지 않은 정산이 없을 때만 받았으므로 새 주문이 들어오면 로그인할 수 없는 거래처에 명세서·자동 동의가 걸린다).
 *  판정은 util/settlement `intakeBlockOf`. 화면은 이미 막는다(등록 위저드는 활성 거래처만 고르고 · 탈퇴 계정은 로그인할 수 없다) —
 *  이 이유는 그 문이 바뀌어도 지키는 마지막 문이다. 이미 있는 주문을 고치는 길은 util/withdraw.js `orderImpactOf` 가 막는다. */
export const WITHDRAWN_INTAKE_REASON = "탈퇴한 거래처라 새 주문을 받을 수 없습니다 — 다시 쓰려면 새로 가입합니다";
/** 위 이유의 짧은 말. 정본은 WITHDRAWN_INTAKE_REASON. */
export const WITHDRAWN_INTAKE_SHORT = "탈퇴한 거래처";
/** 자동 동의를 막는 이유(명세 6.6 `autoAgreeHold`) → 관리자 정산 표 낱말. 약관 동의 전 **하나뿐**이다.
 *  (예전 잠정 'NOTICE_UNDELIVERED' 고지 미도달(Q19)은 2026-10-23 운영자 결정 D1 로 걷어 냈다 — 실패 기록만 남는다 · `noticeState`.
 *  'CLIENT_SUSPENDED' 정지 중 마감(Q20)은 2026-10-22 운영자 결정 A 로 지웠다.) */
export const HOLD_LABEL = {
  TERMS_NOT_AGREED: "약관 동의 전 · 자동 동의 안 함",
};
export const HOLD_CODES = Object.keys(HOLD_LABEL);

/* ── 정산 안내(T3·T4)의 도달 (명세 9.4 T3·T4) ──────────────────────────────────────────
   닿지 않은 사실을 **기록으로만** 말한다 — 자동 동의는 막지 않는다(2026-10-23 운영자 결정 D1 — 예전 '마감 당일 10:00 다시 보내기' 와
   '고지 미도달 자동 동의 보류'(Q19 잠정)는 걷어 냈다 · 실패 기록만). */
/**
 * 한 (거래처, 귀속월)의 정산 안내 도달 — 명세서 발급 안내(T3) · 마감 하루 전 안내(T4). 시각은 고정이라(발급일 10:00 ·
 * 수정 마감 = 마감 전날 10:00 · 마감 13:00) `now` 를 받지 않는다 — 화면은 `at ≤ now` 인 것만 보인다.
 *   · T4 가 닿지 않은 달(발송 실패 기록 `undelivered` — 발송 로그의 데모 대역 · store.noticeFails)은 t4.why = "UNDELIVERED".
 *     연락처가 비면 "NO_RECIPIENT". 둘 다 그 달은 마감에 평소대로 자동 동의된다(약관 동의 전이 아니면 — agreementState).
 *   · 0원 달(T3·T4 없음)은 이제 거래 없는 달(NONE — 2026-10-22 결정 B)이라 금액을 아는 쪽(util/settlement)이 화면에서 뺀다.
 *     발급 뒤 고쳐서 0원이 된 달의 T4 도 그쪽이 가린다. 여기는 금액을 모른다.
 * @param {{ period, invoiceDay, reach?: boolean, undelivered?: boolean, manualAt?: Date|string|null }} o
 *   reach = 정산·회계 담당자가 있고 연락처가 있다 · undelivered = T4 발송 실패 기록이 있는 달 · manualAt = 직접 동의 시각
 * @returns {{ issueAt, editLockAt, deadline,
 *   t3: { at, sent, why: null|"NO_RECIPIENT" },
 *   t4: null|{ at, sent, why: null|"UNDELIVERED"|"NO_RECIPIENT" } }}      // t4 null = 수정 마감 전에 직접 동의해 T4 가 없다
 */
export function noticeState({ period, invoiceDay, reach = true, undelivered = false, manualAt = null }) {
  const day = invoiceDayOf({ invoiceDay });
  const issueAt = issueDate(period, day);
  const lockAt = editLockAt(period, day);
  const deadline = agreeDeadline(period, day);
  const manual = manualAt instanceof Date ? manualAt : parseAt(manualAt);
  const t3 = reach ? { at: issueAt, sent: true, why: null } : { at: issueAt, sent: false, why: "NO_RECIPIENT" };
  /* T4 는 수정 마감 시각에 아직 동의 전인 달에만(정각 포함 — 그 시각에 동의했으면 이미 늦다 · admin 진행 기록과 같은 경계) */
  let t4 = null;
  if (!manual || manual.getTime() >= lockAt.getTime()) {
    t4 = undelivered ? { at: lockAt, sent: false, why: "UNDELIVERED" }
      : !reach ? { at: lockAt, sent: false, why: "NO_RECIPIENT" }
      : { at: lockAt, sent: true, why: null };
  }
  return { issueAt, editLockAt: lockAt, deadline, t3, t4 };
}
