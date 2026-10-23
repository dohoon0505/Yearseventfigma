/* ============================================================
   test-settlement-rules.mjs — 정산 규칙 회귀 테스트
   실행:  node tools/test-settlement-rules.mjs   (의존성 없음 · 실패하면 exit 1)

   발행일·동의 마감·자동 동의·작성일자·정산기한은 청구와 세무의 근거다. 규칙을 고치면
   이 파일을 먼저 돌릴 것. 시계(now)는 전부 못박혀 있다 — 규칙 모듈이 `new Date()` 를
   스스로 부르지 않기 때문에 가능하다.
   ============================================================ */
import {
  invoiceDayOf, invoiceDayFor, invoiceDayEffectiveFrom, deadlineDayOf, splitPeriod, periodOf,
  periodLabel, shiftPeriod, periodEnd, issueDate, agreeDeadline, dueDate, docDate,
  fmtAt, parseAt, fmtKo, fmtDot, fmtMd, fmtMdHm, agreementState,
  INVOICE_DAYS, MIN_CONSENT_DAYS, consentWindowHours, invoiceDayRangeLabel, DEADLINE_HOUR,
  editLockAt, overdueAt, isEditLocked, isPastOverdue, LOCK_REASON, HOLD_LABEL, HOLD_CODES,
  editLockDayOf, noticeState,
} from "../js/data/settlement-rules.js";
import * as RULES from "../js/data/settlement-rules.js";
import { TERMS, TERMS_VERSION } from "../js/data/terms.js";
import { PRIVACY, PRIVACY_VERSION } from "../js/data/privacy.js";

let pass = 0, fail = 0;
const bad = [];
const eq = (name, got, want) => {
  const g = got instanceof Date ? fmtAt(got) : got;
  const w = want instanceof Date ? fmtAt(want) : want;
  if (g === w) pass++; else { fail++; bad.push(`${name}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`); }
};
const throws = (name, fn) => { try { fn(); fail++; bad.push(`${name}: expected throw`); } catch { pass++; } };
const D = (y, m1, d, h = 0, mi = 0, ms = 0) => new Date(y, m1 - 1, d, h, mi, 0, ms);
const fmtYmdSafe = (d) => (d ? fmtAt(d).slice(0, 10) : null);

/* ── 발급일 정규화 ── */
eq("invoiceDayOf 15", invoiceDayOf({ invoiceDay: "15" }), 15);
eq("invoiceDayOf 0 → 1", invoiceDayOf({ invoiceDay: "0" }), 1);
eq("invoiceDayOf 29 → 1", invoiceDayOf({ invoiceDay: "29" }), 1);
eq("invoiceDayOf empty → 1", invoiceDayOf({ invoiceDay: "" }), 1);
eq("invoiceDayOf undefined → 1", invoiceDayOf(undefined), 1);
eq("deadlineDayOf 1", deadlineDayOf(1), 10);
eq("deadlineDayOf 10", deadlineDayOf(10), 10);
eq("deadlineDayOf 11", deadlineDayOf(11), 28);
eq("deadlineDayOf 28", deadlineDayOf(28), 28);

/* ── 고를 수 있는 발급일 (2026-09-25 결정 — 동의 기간 3일 이상) ──
   10·28일은 발급 10:00 과 마감 13:00 이 같은 날이라 3시간뿐이었다. 선택지만 좁히고 계산은 1~28 을 그대로 받는다. */
eq("동의 기간 1일 = 219h", consentWindowHours(1), 219);
eq("동의 기간 7일 = 75h", consentWindowHours(7), 75);
eq("동의 기간 8일 = 51h", consentWindowHours(8), 51);
eq("동의 기간 10일 = 3h", consentWindowHours(10), 3);
eq("동의 기간 11일 = 411h", consentWindowHours(11), 411);
eq("동의 기간 25일 = 75h", consentWindowHours(25), 75);
eq("동의 기간 28일 = 3h", consentWindowHours(28), 3);
eq("선택지 = 1~7 · 11~25", INVOICE_DAYS.join(","), "1,2,3,4,5,6,7,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25");
eq("선택지는 문자열(드롭다운 엄격 비교)", INVOICE_DAYS.every((d) => typeof d === "string"), true);
eq("선택지 전부 하한 이상", INVOICE_DAYS.every((d) => consentWindowHours(d) >= MIN_CONSENT_DAYS * 24), true);
eq("선택지 범위 문구", invoiceDayRangeLabel(), "1~7일·11~25일");
eq("제한 전 값(9일)도 계산은 그대로", invoiceDayOf({ invoiceDay: "9" }), 9);
eq("제한 전 값(28일)의 마감", deadlineDayOf(invoiceDayOf({ invoiceDay: "28" })), 28);

/* ── 기간 ── */
eq("splitPeriod", JSON.stringify(splitPeriod("2026-08")), JSON.stringify({ y: 2026, m1: 8 }));
throws("splitPeriod 2026-8 throws", () => splitPeriod("2026-8"));
throws("splitPeriod label throws", () => splitPeriod("2026년 08월"));
eq("periodOf", periodOf(D(2026, 9, 17)), "2026-09");
eq("periodLabel", periodLabel("2026-08"), "2026년 08월");
eq("shiftPeriod -1 across year", shiftPeriod("2026-01", -1), "2025-12");
eq("shiftPeriod +5", shiftPeriod("2026-08", 5), "2027-01");
eq("periodEnd 2026-08", fmtAt(periodEnd("2026-08")), "2026-08-31 00:00");
eq("periodEnd 2026-02 (평년)", fmtAt(periodEnd("2026-02")), "2026-02-28 00:00");
eq("periodEnd 2028-02 (윤년)", fmtAt(periodEnd("2028-02")), "2028-02-29 00:00");

/* ── 발행·마감·작성일자 (귀속 2026-08) ── */
eq("issue day1", issueDate("2026-08", 1), D(2026, 9, 1, 10));
eq("issue day10", issueDate("2026-08", 10), D(2026, 9, 10, 10));
eq("issue day11", issueDate("2026-08", 11), D(2026, 9, 11, 10));
eq("issue day15", issueDate("2026-08", 15), D(2026, 9, 15, 10));
eq("issue day28", issueDate("2026-08", 28), D(2026, 9, 28, 10));
eq("deadline day1", agreeDeadline("2026-08", 1), D(2026, 9, 10, 13));
eq("deadline day10", agreeDeadline("2026-08", 10), D(2026, 9, 10, 13));
eq("deadline day11", agreeDeadline("2026-08", 11), D(2026, 9, 28, 13));
eq("deadline day15", agreeDeadline("2026-08", 15), D(2026, 9, 28, 13));
eq("deadline day28", agreeDeadline("2026-08", 28), D(2026, 9, 28, 13));
eq("due 2026-08", fmtAt(dueDate("2026-08")), "2026-09-30 00:00");
eq("due 2026-12 → 2027-01-31", fmtAt(dueDate("2026-12")), "2027-01-31 00:00");
eq("issue 2026-12 day5 → 2027-01-05", issueDate("2026-12", 5), D(2027, 1, 5, 10));
eq("deadline 2026-12 day5 → 2027-01-10", agreeDeadline("2026-12", 5), D(2027, 1, 10, 13));
eq("docDate early (agreed 9/3)", docDate("2026-08", 1, "2026-09-03 09:12"), D(2026, 8, 31));
eq("docDate early (auto)", docDate("2026-08", 10, D(2026, 9, 10, 13)), D(2026, 8, 31));
eq("docDate early (not agreed yet → still 말일)", docDate("2026-08", 3, null), D(2026, 8, 31));
eq("docDate late (agreed 9/17 14:32)", docDate("2026-08", 15, "2026-09-17 14:32"), D(2026, 9, 17));
eq("docDate late (auto 9/28 13:00)", docDate("2026-08", 15, D(2026, 9, 28, 13)), D(2026, 9, 28));
eq("docDate late (not agreed) → null", docDate("2026-08", 15, null), null);

/* ── 불변식: 1~28 전부 deadline >= issue, 발급일이 곧 마감일이면 세 시간 창 ── */
for (let day = 1; day <= 28; day++) {
  const i = issueDate("2026-08", day), dl = agreeDeadline("2026-08", day);
  eq(`deadline >= issue (day ${day})`, dl.getTime() >= i.getTime(), true);
}
eq("day10: 3h manual window", agreeDeadline("2026-08", 10) - issueDate("2026-08", 10), 3 * 3600 * 1000);
eq("day28: 3h manual window", agreeDeadline("2026-08", 28) - issueDate("2026-08", 28), 3 * 3600 * 1000);

/* ── 포맷 왕복 ── */
eq("fmtAt<->parseAt", fmtAt(parseAt("2026-09-17 14:32")), "2026-09-17 14:32");
eq("parseAt bad → null", parseAt("2026/09/17 14:32"), null);
eq("fmtKo", fmtKo(D(2026, 9, 5)), "2026년 09월 05일");
eq("fmtDot", fmtDot(D(2026, 9, 5)), "2026. 09. 05");
eq("fmtMd", fmtMd(D(2026, 9, 5)), "09-05");
eq("fmtMdHm", fmtMdHm(D(2026, 10, 1, 10)), "10-01 10:00");

/* ── agreementState — 시계를 못박는다 ── */
const st = (invoiceDay, now, manualAt = null) => agreementState({ period: "2026-08", invoiceDay, manualAt, now });
const pick = (s) => ({ issued: s.issued, open: s.open, mode: s.mode, at: s.at && fmtAt(s.at), doc: s.docDate && fmtAt(s.docDate) });
const J = (o) => JSON.stringify(o);

// 발급일 1 (early) — 발행 9/1 10:00 · 마감 9/10 13:00
eq("early: issue-1ms", J(pick(st(1, D(2026, 9, 1, 9, 59, 999)))), J({ issued: false, open: false, mode: null, at: null, doc: "2026-08-31 00:00" }));
eq("early: at issue", J(pick(st(1, D(2026, 9, 1, 10)))), J({ issued: true, open: true, mode: null, at: null, doc: "2026-08-31 00:00" }));
eq("early: at deadline (정각은 열림)", J(pick(st(1, D(2026, 9, 10, 13)))), J({ issued: true, open: true, mode: null, at: null, doc: "2026-08-31 00:00" }));
eq("early: deadline+1ms → auto", J(pick(st(1, D(2026, 9, 10, 13, 0, 1)))), J({ issued: true, open: false, mode: "auto", at: "2026-09-10 13:00", doc: "2026-08-31 00:00" }));
eq("early: manual wins after deadline", J(pick(st(1, D(2026, 9, 17, 12), "2026-09-03 09:12"))), J({ issued: true, open: false, mode: "manual", at: "2026-09-03 09:12", doc: "2026-08-31 00:00" }));

// 발급일 15 (late) — 발행 9/15 10:00 · 마감 9/28 13:00 (온누리헬스 데모)
eq("late: 9/17 open", J(pick(st(15, D(2026, 9, 17, 12)))), J({ issued: true, open: true, mode: null, at: null, doc: null }));
eq("late: 9/14 not issued", J(pick(st(15, D(2026, 9, 14, 12)))), J({ issued: false, open: false, mode: null, at: null, doc: null }));
eq("late: manual 9/17 → doc 9/17", J(pick(st(15, D(2026, 9, 17, 15), "2026-09-17 14:32"))), J({ issued: true, open: false, mode: "manual", at: "2026-09-17 14:32", doc: "2026-09-17 00:00" }));
eq("late: auto → doc 9/28", J(pick(st(15, D(2026, 9, 28, 13, 0, 1)))), J({ issued: true, open: false, mode: "auto", at: "2026-09-28 13:00", doc: "2026-09-28 00:00" }));
eq("late: manual record still wins after deadline", J(pick(st(15, D(2026, 10, 3), "2026-09-20 10:00"))), J({ issued: true, open: false, mode: "manual", at: "2026-09-20 10:00", doc: "2026-09-20 00:00" }));

// 발급일 10·28 — 발행일 = 마감일
eq("day10: 10:00~13:00 open", J(pick(st(10, D(2026, 9, 10, 11)))), J({ issued: true, open: true, mode: null, at: null, doc: "2026-08-31 00:00" }));
eq("day28: 09:59 not issued", st(28, D(2026, 9, 28, 9, 59)).issued, false);
eq("day28: 13:01 auto", st(28, D(2026, 9, 28, 13, 1)).mode, "auto");
eq("group early", st(10, D(2026, 9, 17)).group, "early");
eq("group late", st(11, D(2026, 9, 17)).group, "late");
eq("dueDate on state", fmtAt(st(15, D(2026, 9, 17)).dueDate), "2026-09-30 00:00");
throws("agreementState without now throws", () => agreementState({ period: "2026-08", invoiceDay: 1 }));
throws("agreementState bad period throws", () => agreementState({ period: "2026-8", invoiceDay: 1, now: D(2026, 9, 17) }));


/* ── 발급일 변경은 **다음 달 발급분부터** (2026-09-17 사용자 결정) ──
   이력이 없으면 지금 값이 전 기간 값이고, 이력이 있으면 그 귀속월에 유효했던 값을 쓴다.
   이게 깨지면 관리자가 발급일을 바꾸는 순간 과거 6개월의 동의·작성일자가 소급해 바뀐다. */
eq("effectiveFrom = 변경한 달의 귀속분", invoiceDayEffectiveFrom(D(2026, 9, 17, 15)), "2026-09");
const noLog = { invoiceDay: "15" };
eq("이력 없음 → 전 기간 현재값", invoiceDayFor(noLog, "2026-03"), 15);
eq("이력 없음 → 미래도 현재값", invoiceDayFor(noLog, "2027-01"), 15);
eq("client 없음 → 1", invoiceDayFor(undefined, "2026-08"), 1);
// 2026-09 에 15일 → 1일 로 변경: 귀속 2026-09 부터 1일, 그 이전은 15일
const changed = { invoiceDay: "1", invoiceDayLog: [{ from: "2026-09", day: "1", prev: "15", at: "2026-09-17 15:30" }] };
eq("변경 전 귀속월은 옛 값", invoiceDayFor(changed, "2026-08"), 15);
eq("변경 전 먼 과거도 옛 값", invoiceDayFor(changed, "2026-01"), 15);
eq("적용 시작 귀속월부터 새 값", invoiceDayFor(changed, "2026-09"), 1);
eq("이후 귀속월도 새 값", invoiceDayFor(changed, "2026-12"), 1);
// 두 번 바뀐 거래처: 2026-05 에 1→10, 2026-09 에 10→28
const twice = { invoiceDay: "28", invoiceDayLog: [
  { from: "2026-05", day: "10", prev: "1", at: "2026-05-02 09:00" },
  { from: "2026-09", day: "28", prev: "10", at: "2026-09-17 15:30" },
] };
eq("2구간 이력: 첫 변경 이전", invoiceDayFor(twice, "2026-04"), 1);
eq("2구간 이력: 중간 구간", invoiceDayFor(twice, "2026-08"), 10);
eq("2구간 이력: 마지막 구간", invoiceDayFor(twice, "2026-09"), 28);
eq("이력 순서가 뒤섞여도 같은 답", invoiceDayFor({ invoiceDay: "28", invoiceDayLog: [twice.invoiceDayLog[1], twice.invoiceDayLog[0]] }, "2026-08"), 10);
eq("이력값이 범위 밖이면 1로 클램프", invoiceDayFor({ invoiceDay: "5", invoiceDayLog: [{ from: "2026-09", day: "99", prev: "0" }] }, "2026-09"), 1);
eq("prev 가 범위 밖이면 1로 클램프", invoiceDayFor({ invoiceDay: "5", invoiceDayLog: [{ from: "2026-09", day: "5", prev: "" }] }, "2026-08"), 1);
throws("invoiceDayFor 도 기간 모양을 검증한다", () => invoiceDayFor(noLog, "2026-8"));

/* 소급 방지의 본론 — 발급일을 바꿔도 과거 달의 동의 상태·작성일자가 그대로여야 한다.
   (실측으로 잡은 세 사례: 수동 동의 작성일자가 09-17 → 08-31 로 밀림 / 자동 동의 시각이 07-10 → 07-28 로
    이동 / 자동 동의분이 '동의대기' 로 되돌아가 포털에 동의 버튼이 다시 뜸) */
const stFor = (client, ym, now, manual = null) =>
  agreementState({ period: ym, invoiceDay: invoiceDayFor(client, ym), manualAt: manual, now });
const before = { invoiceDay: "15" };
const after = { invoiceDay: "1", invoiceDayLog: [{ from: "2026-09", day: "1", prev: "15", at: "2026-09-17 15:30" }] };
const NOW2 = D(2026, 9, 17, 16);
eq("사례1 수동 동의 작성일자 불변", fmtAt(stFor(after, "2026-08", NOW2, "2026-09-17 14:32").docDate), fmtAt(stFor(before, "2026-08", NOW2, "2026-09-17 14:32").docDate));
eq("사례1 작성일자 = 동의한 날", fmtYmdSafe(stFor(after, "2026-08", NOW2, "2026-09-17 14:32").docDate), "2026-09-17");
const auto0 = { invoiceDay: "1" };
const auto1 = { invoiceDay: "15", invoiceDayLog: [{ from: "2026-09", day: "15", prev: "1", at: "2026-09-17 15:30" }] };
eq("사례2 자동 동의 시각 불변", fmtAt(stFor(auto1, "2026-06", NOW2).at), fmtAt(stFor(auto0, "2026-06", NOW2).at));
eq("사례3 자동 동의가 동의대기로 안 돌아간다", stFor(auto1, "2026-08", NOW2).mode, "auto");
eq("사례3 작성일자도 그대로", fmtYmdSafe(stFor(auto1, "2026-08", NOW2).docDate), "2026-08-31");
eq("변경 이후 귀속월은 새 발급일로", fmtAt(stFor(auto1, "2026-09", D(2026, 10, 20)).issueDate), "2026-10-15 10:00");

/* ── 약관 동의 전에는 자동 동의하지 않는다 (2026-09-29 법무 답 · 명세 3.4) ── */
const stT = (termsAt, now, manual = null) => agreementState({ period: "2026-08", invoiceDay: "1", manualAt: manual, termsAt, now });
const AFTER = D(2026, 9, 12); // 마감(2026-09-10 13:00) 이틀 뒤
eq("약관: termsAt 미지정(순수 규칙)이면 기존대로 자동", stT(undefined, AFTER).mode, "auto");
eq("약관: 마감 전에 동의했으면 자동", stT("2026-09-01 09:00", AFTER).mode, "auto");
eq("약관: 마감 정각에 동의했어도 자동", stT("2026-09-10 13:00", AFTER).mode, "auto");
eq("약관: 동의 기록 없음 → 자동 아님", stT(null, AFTER).mode, null);
eq("약관: 동의 기록 없음 → 수동 동의를 기다리며 열림", stT(null, AFTER).open, true);
eq("약관: 동의 기록 없음 → termsHold", stT(null, AFTER).termsHold, true);
eq("약관: 마감 뒤에 동의 → 그 달은 자동 아님", stT("2026-09-11 09:00", AFTER).mode, null);
eq("약관: 마감 전이면 termsHold 아님", stT(null, D(2026, 9, 5)).termsHold, false);
eq("약관: 수동 기록은 약관과 무관하게 이긴다", stT(null, AFTER, "2026-09-11 10:00").mode, "manual");
eq("약관: 자동 동의 작성일자는 그대로(1일 → 말일)", fmtYmdSafe(stT("2026-09-01 09:00", AFTER).docDate), "2026-08-31");

/* ── 수정 마감 · 기한 초과 (2026-10-15 결정 — 정정 체계 폐지 · 명세 3.4 · 6.6) ── */
eq("수정 마감: 9월분 1일 그룹 → 10-09 10:00", editLockAt("2026-09", "1"), D(2026, 10, 9, 10));
eq("수정 마감: 9월분 7일 그룹 → 10-09 10:00", editLockAt("2026-09", "7"), D(2026, 10, 9, 10));
eq("수정 마감: 9월분 15일 그룹 → 10-27 10:00", editLockAt("2026-09", "15"), D(2026, 10, 27, 10));
eq("수정 마감: 12월분 1일 그룹 → 다음 해 01-09 10:00", editLockAt("2026-12", "1"), D(2027, 1, 9, 10));
eq("수정 마감: 1월분 15일 그룹 → 02-27 10:00", editLockAt("2027-01", "15"), D(2027, 2, 27, 10));
/* 수정 마감의 날(포털 정산 절차 2번 카드 '수정 마감 N일 10:00') — editLockAt 과 같은 규칙이어야 한다 */
eq("수정 마감 날: 1일 그룹 → 9", editLockDayOf("1"), 9);
eq("수정 마감 날: 15일 그룹 → 27", editLockDayOf("15"), 27);
for (const d of INVOICE_DAYS) eq(`수정 마감 날 = editLockAt 의 날: ${d}일`, editLockDayOf(d), editLockAt("2026-09", d).getDate());
eq("수정 마감 정각 1ms 전은 열림", isEditLocked("2026-09", "1", D(2026, 10, 9, 9, 59, 999)), false);
eq("수정 마감 정각부터 잠김", isEditLocked("2026-09", "1", D(2026, 10, 9, 10)), true);
eq("기한 초과: 9월분 → 11-01 10:00", overdueAt("2026-09"), D(2026, 11, 1, 10));
eq("기한 초과: 8월분 → 10-01 10:00", overdueAt("2026-08"), D(2026, 10, 1, 10));
eq("기한 초과: 12월분 → 다음 해 02-01 10:00", overdueAt("2026-12"), D(2027, 2, 1, 10));
eq("기한 초과: 1월분(정산기한 2월 말) → 03-01 10:00", overdueAt("2027-01"), D(2027, 3, 1, 10));
eq("기한 초과 정각 1ms 전은 아직", isPastOverdue("2026-09", D(2026, 11, 1, 9, 59, 999)), false);
eq("기한 초과 정각부터", isPastOverdue("2026-09", D(2026, 11, 1, 10)), true);
eq("잠긴 이유 3종은 모두 '배송일이 지난 달' 로 시작", Object.values(LOCK_REASON).every((s) => s.startsWith("배송일이 지난 달 · ")), true);
eq("잠긴 이유: 수정 마감", LOCK_REASON.editLock, "배송일이 지난 달 · 수정 마감(마감 안내 시각)이 지났습니다 — 금액 조정은 동의 뒤 수정계산서로");
eq("자동 동의를 막는 이유는 약관 하나(고지 미도달은 2026-10-23 결정 D1 · 정지 중 마감은 10-22 결정 A 로 없앴다)", HOLD_CODES.join(","), "TERMS_NOT_AGREED");
eq("보류 낱말: 약관", HOLD_LABEL.TERMS_NOT_AGREED, "약관 동의 전 · 자동 동의 안 함");
eq("보류 낱말: 고지 미도달은 없다(2026-10-23 결정 D1)", "NOTICE_UNDELIVERED" in HOLD_LABEL, false);

/* ── 자동 동의를 막는 것은 약관 동의 전 하나뿐(2026-10-23 운영자 결정 D1 — 잠정 '고지 미도달 보류'(Q19)를 걷어 냈다).
      옛 저장본·옛 호출이 hold 코드('NOTICE_UNDELIVERED' · 'CLIENT_SUSPENDED')를 실어 와도 읽지 않는다 ── */
const stH = (hold, now, manual = null, termsAt = "2026-01-01 09:00") =>
  agreementState({ period: "2026-08", invoiceDay: "1", manualAt: manual, termsAt, hold, now });
eq("옛 hold 고지 미도달 → 무시 · 마감에 자동 동의", stH("NOTICE_UNDELIVERED", AFTER).mode, "auto");
eq("옛 hold 고지 미도달 → 자동 동의라 열림 아님", stH("NOTICE_UNDELIVERED", AFTER).open, false);
eq("옛 hold 고지 미도달 → 이유 없음", stH("NOTICE_UNDELIVERED", AFTER).autoAgreeHold, null);
eq("옛 hold 고지 미도달 · 마감 전 → 열림(동의 대기)", [stH("NOTICE_UNDELIVERED", D(2026, 9, 5)).open, stH("NOTICE_UNDELIVERED", D(2026, 9, 5)).autoAgreeHold].join(","), "true,");
eq("수동 기록이 이긴다", stH("NOTICE_UNDELIVERED", AFTER, "2026-09-11 10:00").mode, "manual");
eq("수동 동의면 이유 없음", stH("NOTICE_UNDELIVERED", AFTER, "2026-09-11 10:00").autoAgreeHold, null);
eq("약관 동의 전 → 자동 아님 · 이유 = 약관", [stH(null, AFTER, null, null).mode, stH(null, AFTER, null, null).autoAgreeHold].join(","), ",TERMS_NOT_AGREED");
eq("약관 동의 전 → 열림(수동 동의 대기)", stH(null, AFTER, null, null).open, true);
eq("termsHold 는 약관 동의 전일 때만", [stH(null, AFTER, null, null).termsHold, stH("NOTICE_UNDELIVERED", AFTER).termsHold].join(","), "true,false");
eq("모르는 값은 무시(자동)", stH("WHATEVER", AFTER).mode, "auto");
eq("없으면 자동 · 이유 null", stH(null, AFTER).autoAgreeHold, null);
/* 옛 저장본·옛 호출이 '정지 중 마감' 코드를 실어 와도 보류로 치지 않는다 — 그 달은 평소처럼 마감에 자동 동의된다(2026-10-22 결정 A) */
eq("옛 CLIENT_SUSPENDED 는 무시 → 마감에 자동 동의", [stH("CLIENT_SUSPENDED", AFTER).mode, stH("CLIENT_SUSPENDED", AFTER).autoAgreeHold, stH("CLIENT_SUSPENDED", AFTER).heldAtDeadline].join(","), "auto,,");

/* ── 마감 때 자동 동의를 막던 이유(heldAtDeadline — 약관 동의 전 하나) — autoAgreeHold 와 같은 판정이되 **마감 뒤 직접 동의해도
      남는다**(관리자 진행 기록의 '마감 · 자동 동의 안 함' 줄 · 명세 6.6 · 10.4 Q34). 마감(2026-09-10 13:00) 전이거나,
      마감 전(정각 포함)에 직접 동의했거나, 자동 동의된 달은 null. ── */
const HELD_DL = D(2026, 9, 10, 13);
eq("마감 때 보류: 약관 동의 전 · 동의 전 → 남는다", stH(null, AFTER, null, null).heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 옛 hold 고지 미도달은 남기지 않는다(자동 동의)", stH("NOTICE_UNDELIVERED", AFTER).heldAtDeadline, null);
eq("마감 때 보류: 옛 hold 고지 미도달 · 마감 뒤 직접 동의 → 없음", stH("NOTICE_UNDELIVERED", AFTER, "2026-09-11 10:00").heldAtDeadline, null);
eq("마감 때 보류: 마감 뒤 직접 동의면 지금 보류는 없다", stH(null, AFTER, "2026-09-11 10:00", "2026-09-11 09:59").autoAgreeHold, null);
eq("마감 때 보류: 마감 1분 뒤 약관+직접 동의 → 남는다", stH(null, AFTER, "2026-09-10 13:01", "2026-09-10 13:01").heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 마감 정각 직접 동의 → 없음(정각은 아직 열림)", stH(null, AFTER, HELD_DL, null).heldAtDeadline, null);
eq("마감 때 보류: 마감 전 직접 동의 → 없음(약관 동의 전이어도)", stH(null, AFTER, "2026-09-03 10:00", null).heldAtDeadline, null);
eq("마감 때 보류: 마감 정각(now)은 아직 없음", stH(null, HELD_DL, null, null).heldAtDeadline, null);
eq("마감 때 보류: 마감 1ms 뒤부터", stH(null, D(2026, 9, 10, 13, 0, 1), null, null).heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 보류 없음 → 자동 동의 · 없음", stH(null, AFTER).heldAtDeadline, null);
eq("마감 때 보류: 보류 없음 → 자동 동의(mode)", stH(null, AFTER).mode, "auto");
eq("마감 때 보류: 약관 동의 전 · 마감 뒤 약관+직접 동의 → 약관", stH(null, AFTER, "2026-09-11 10:00", "2026-09-11 09:59").heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 옛 hold 를 실어 와도 약관 판정만", stH("NOTICE_UNDELIVERED", AFTER, "2026-09-11 10:00", "2026-09-11 09:59").heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 약관 기록 없음 · 동의 전 → 약관", stH(null, AFTER, null, null).heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 약관을 마감 정각에 동의 → 약관 보류 아님(자동)", stH(null, AFTER, null, HELD_DL).heldAtDeadline, null);
eq("마감 때 보류: 순수 규칙 계산(termsAt 없음) · 옛 hold 고지 미도달 → 없음 · 자동",
  [agreementState({ period: "2026-08", invoiceDay: "1", hold: "NOTICE_UNDELIVERED", now: AFTER }).heldAtDeadline,
   agreementState({ period: "2026-08", invoiceDay: "1", hold: "NOTICE_UNDELIVERED", now: AFTER }).mode].join(","), ",auto");
eq("마감 때 보류: 순수 규칙 계산 · 보류 없음 → 없음", agreementState({ period: "2026-08", invoiceDay: "1", now: AFTER }).heldAtDeadline, null);
eq("마감 때 보류: hold 에 약관 코드를 넣어도 보류로 치지 않는다", stH("TERMS_NOT_AGREED", AFTER).heldAtDeadline, null);
eq("마감 때 보류: 모르는 값 → 없음", stH("WHATEVER", AFTER).heldAtDeadline, null);
eq("마감 때 보류: 11~28 그룹(15일 · 마감 09-28 13:00) 마감 뒤 약관+직접 동의 → 남는다",
  agreementState({ period: "2026-08", invoiceDay: "15", manualAt: "2026-09-29 09:00", termsAt: "2026-09-29 08:00", now: D(2026, 9, 30) }).heldAtDeadline, "TERMS_NOT_AGREED");
eq("마감 때 보류: 11~28 그룹 마감 전 직접 동의 → 없음",
  agreementState({ period: "2026-08", invoiceDay: "15", manualAt: "2026-09-28 12:59", termsAt: null, now: D(2026, 9, 30) }).heldAtDeadline, null);

/* ── '정지' 장치는 없다(2026-10-22 운영자 결정 A — '정지' 를 없애고 '탈퇴' 를 둔다). 2026-10-19 에 넣은 상태 이력 판정(statusAt ·
      statusLineTime · SUSPENDED)이 규칙 모듈에 되살아나면 지난 달 보류가 다시 상태 이력에서 나온다 ── */
eq("정지 장치 없음 — statusAt · statusLineTime · SUSPENDED 를 내보내지 않는다",
  ["statusAt", "statusLineTime", "SUSPENDED"].filter((k) => k in RULES).join(","), "");

/* ── 정산 안내 도달(noticeState) — T3 · T4 가 닿았는지의 **기록**(명세 9.4). 자동 동의에는 끼지 않는다(2026-10-23 운영자 결정 D1 —
   마감 당일 다시 보내기와 고지 미도달 보류를 걷어 냈다 · 실패 기록만).
   귀속 2026-08 · 발급일 1일: 발급 09-01 10:00 · 수정 마감(T4) 09-09 10:00 · 마감 09-10 13:00 ── */
eq("다시 보내기 시각 함수(noticeResendAt)는 없다(2026-10-23 결정 D1)", "noticeResendAt" in RULES, false);
const NS = (o) => noticeState({ period: "2026-08", invoiceDay: "1", ...o });
const why = (n) => [n.t3.why, n.t4 && n.t4.why];
eq("안내: 평소 — 모두 닿음", JSON.stringify(why(NS({}))), JSON.stringify([null, null]));
eq("안내: 반환에 다시 보내기 · 보류 칸이 없다(발송 실패 기록이 있어도)",
  ["resend", "resendAt", "hold"].filter((k) => k in NS({ undelivered: true })).join(","), "");
eq("안내: 시각 = 발급 · 수정 마감 · 마감", [NS({}).t3.at, NS({}).t4.at, NS({}).deadline].map(fmtAt).join(","),
  "2026-09-01 10:00,2026-09-09 10:00,2026-09-10 13:00");
eq("안내: 발송 실패 기록 — T4 닿지 않음(UNDELIVERED) 만 기록한다",
  JSON.stringify(why(NS({ undelivered: true }))), JSON.stringify([null, "UNDELIVERED"]));
eq("안내: 발송 실패 · T4 는 보내지 못한 것으로 남는다(sent false)", NS({ undelivered: true }).t4.sent, false);
eq("안내: 수정 마감 전에 직접 동의 — T4 없음(발송 실패 기록이 있어도)",
  JSON.stringify(why(NS({ undelivered: true, manualAt: "2026-09-08 11:00" }))), JSON.stringify([null, null]));
eq("안내: 수정 마감 정각에 동의 — T4 는 그 달에 있다(진행 기록과 같은 경계)", NS({ manualAt: "2026-09-09 10:00" }).t4 !== null, true);
eq("안내: 발송 실패 · 수정 마감 뒤 직접 동의 — T4 닿지 않음은 남는다",
  JSON.stringify(why(NS({ undelivered: true, manualAt: "2026-09-09 16:00" }))), JSON.stringify([null, "UNDELIVERED"]));
eq("안내: 연락처만 없음(실패 기록 없음) — T3 · T4 수신자 없음",
  JSON.stringify(why(NS({ reach: false }))), JSON.stringify(["NO_RECIPIENT", "NO_RECIPIENT"]));
eq("안내: 연락처 없음 + 발송 실패 기록 — 발송 실패가 먼저",
  JSON.stringify(why(NS({ reach: false, undelivered: true }))), JSON.stringify(["NO_RECIPIENT", "UNDELIVERED"]));
/* 옛 호출이 거래처(정지 상태 · 상태 이력)를 실어 와도 안내 판정은 바뀌지 않는다 — 정지 중 T3·T4 빼기 · 정지 중 마감은 없다 */
eq("안내: 옛 client 인자(정지 · 상태 이력)는 무시 — 평소대로",
  JSON.stringify(why(NS({ client: { status: "정지", statusLog: [{ at: "2026-08-20 10:00", from: "활성", to: "정지" }] } }))), JSON.stringify([null, null]));
eq("안내: 반환에 '정지 중 마감' 칸이 없다", "suspendedAtDeadline" in NS({}), false);
{
  const n = noticeState({ period: "2026-08", invoiceDay: "15", undelivered: true });
  eq("안내: 11~28 그룹(15일) — 수정 마감 09-27 10:00 에 닿지 않음(기록만)",
    JSON.stringify([fmtAt(n.t4.at), n.t4.why]), JSON.stringify(["2026-09-27 10:00", "UNDELIVERED"]));
}
/* T4 가 닿지 않은 달도 마감에 자동 동의한다 — 약관 동의 전만 막고 · 직접 동의가 이긴다(2026-10-23 결정 D1) */
{
  const st = agreementState({ period: "2026-08", invoiceDay: "1", termsAt: "2026-01-01 09:00", hold: "NOTICE_UNDELIVERED", now: D(2026, 9, 12) });
  eq("안내 → 동의: T4 가 닿지 않은 달(옛 hold 코드) → 마감에 자동 동의", [st.mode, st.autoAgreeHold, st.heldAtDeadline].join(","), "auto,,");
  const st2 = agreementState({ period: "2026-08", invoiceDay: "1", termsAt: "2026-01-01 09:00", hold: "NOTICE_UNDELIVERED", manualAt: "2026-09-12 09:00", now: D(2026, 9, 12, 10) });
  eq("안내 → 동의: 마감 뒤 직접 동의 기록 — 수동 · 마감 때 보류 없음", [st2.mode, st2.autoAgreeHold, st2.heldAtDeadline].join(","), "manual,,");
  const st3 = agreementState({ period: "2026-08", invoiceDay: "1", termsAt: null, hold: "NOTICE_UNDELIVERED", now: D(2026, 9, 12) });
  eq("안내 → 동의: 약관 동의 전 → 약관 보류", st3.autoAgreeHold, "TERMS_NOT_AGREED");
  const st4 = agreementState({ period: "2026-08", invoiceDay: "1", termsAt: "2026-01-01 09:00", now: D(2026, 9, 12) });
  eq("안내 → 동의: 평소 → 마감에 자동 동의", [st4.mode, st4.autoAgreeHold].join(","), "auto,");
}

/* ── 약관 본문이 규칙과 같은 숫자를 말하는지 (terms.js 는 버전 고정 문장이라 파생하지 않는다) ── */
const clause2 = TERMS[0].items[1];
const early = INVOICE_DAYS.filter((d) => deadlineDayOf(d) === 10);
const late = INVOICE_DAYS.filter((d) => deadlineDayOf(d) !== 10);
eq("약관 ②: 이른 무리 범위", clause2.includes(`${early[0]}일~${early[early.length - 1]}일인 경우 발급월 10일`), true);
eq("약관 ②: 늦은 무리 범위", clause2.includes(`${late[0]}일~${late[late.length - 1]}일인 경우 발급월 28일`), true);
eq("약관 ②: 최소 동의 기간", clause2.includes(`${MIN_CONSENT_DAYS}일 이상`), true);
eq("약관 ②: 마감 시각", clause2.includes(`13:00`) && DEADLINE_HOUR === 13, true);
eq("약관 ⑤: 무리 범위가 ②와 같다", TERMS[0].items[4].includes(`${early[0]}일~${early[early.length - 1]}일`) && TERMS[0].items[4].includes(`${late[0]}일~${late[late.length - 1]}일`), true);
eq("약관 ⑥: '수정할 수 없다' 가 남아 있지 않다", /취소·수정할 수 없/.test(TERMS[0].items[5]), false);
/* 2026-10-23 운영자 결정 D4 — ①에 미발급 단서 · ②④에서 '이의' 절차를 빼고 오류 알림·고친 금액 · 버전을 올려 다시 동의. ③⑤⑥항은 그대로 */
eq("약관 D4: 버전을 올렸다(모든 거래처가 다음 로그인 때 다시 동의)", TERMS_VERSION, "2026-10-23");
eq("약관 D4: 항 수·번호는 그대로(6항 — '④항(자동 동의)' 로 부른다)", TERMS[0].items.length, 6);
eq("약관 D4 ①: 거래 없는 달·0원 거래만 있는 달은 발급하지 않는다(결정 B 와 같은 말)",
  TERMS[0].items[0].endsWith("다만 전월에 거래가 없거나 금액이 0원인 거래만 있는 경우에는 거래명세서를 발급하지 않는다."), true);
eq("약관 D4: '이의' 라는 낱말이 남아 있지 않다", TERMS.some((sec) => sec.items.some((t) => t.includes("이의"))), false);
eq("약관 D4 ②: 동의만 요구한다('동의하여야 한다')", clause2.includes("계산서 발급에 동의하여야 한다."), true);
eq("약관 D4 ②: 다르면 기한 전에 알리고 회사가 확인한 뒤 고친다",
  clause2.includes("명세서 내용이 사실과 다르면 이 기한 전에 회사에 알려야 하며, 회사는 확인한 뒤 명세서를 고친다."), true);
eq("약관 D4 ④: 동의의 의사표시가 없으면 · 고친 경우 고친 금액으로",
  TERMS[0].items[3], "제2항 기한까지 동의의 의사표시가 없는 경우, 거래처는 해당 명세서 금액(제2항에 따라 고친 경우 고친 금액)으로 계산서 발급에 동의한 것으로 본다.");
eq("약관 D4 ③: 그대로(기한 전날 별도 고지)", TERMS[0].items[2], "회사는 제2항 기한 전날 담당자에게 기한과 미응답 시 처리 내용을 별도로 고지한다.");

/* ── 개인정보 수집·이용 동의서(2026-10-23 운영자 결정 D6 — 약관과 따로 · 문안은 운영자 확정 낱말 그대로) ── */
const pv = (t) => (PRIVACY.items.find((x) => x.t === t) || { lines: [] }).lines;
eq("개인정보 D6: 버전", PRIVACY_VERSION, "2026-10-23");
eq("개인정보 D6: 제목", PRIVACY.title, "개인정보 수집·이용 동의");
eq("개인정보 D6: 여섯 항목 · 순서", PRIVACY.items.map((x) => x.t).join("|"), "모으는 항목|쓰는 목적|보관 기간|동의하지 않을 권리|맡기는 업체|다른 사람의 정보");
eq("개인정보 D6: 줄마다 글자가 있다", PRIVACY.items.every((x) => x.lines.length > 0 && x.lines.every((l) => typeof l === "string" && l.trim() === l && l.length > 0)), true);
eq("개인정보 D6/D7: 보관 기간 — 주문 기록 5년 · 알림 기록 5년 · 주문의 다른 이름 1년 · 담당자 저장공간",
  pv("보관 기간").join(" / "),
  "주문 기록(받는 분 포함): 주문이 끝난 날부터 5년 / 알림 발송 기록: 보낸 날부터 5년 / 주문에 남긴 보내는 분·담당자·직접 적은 요청자·추가 수신자: 주문이 끝난 날부터 1년 / 담당자 저장공간: 거래처가 지울 때까지, 탈퇴하면 탈퇴한 날부터 5년");
eq("개인정보 D6: 맡기는 업체 — 바로빌 · 알리고", pv("맡기는 업체").join(" / "), "계산서 발급 대행: 바로빌 / 알림톡·문자 발송 대행: 알리고");
eq("개인정보 D6: 동의하지 않을 권리", pv("동의하지 않을 권리")[0], "동의하지 않을 수 있지만, 그러면 가입과 주문을 할 수 없습니다.");

console.log(`settlement-rules: ${pass} passed, ${fail} failed`);
if (fail) { bad.forEach((b) => console.log("  x " + b)); process.exit(1); }
