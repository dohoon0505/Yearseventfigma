/* ============================================================
   test-settlement-rules.mjs — 정산 규칙 회귀 테스트
   실행:  node tools/test-settlement-rules.mjs   (의존성 없음 · 실패하면 exit 1)

   발행일·동의 마감·자동 동의·작성일자·정산기한은 청구와 세무의 근거다. 규칙을 고치면
   이 파일을 먼저 돌릴 것. 시계(now)는 전부 못박혀 있다 — 규칙 모듈이 `new Date()` 를
   스스로 부르지 않기 때문에 가능하다.
   ============================================================ */
import {
  invoiceDayOf, deadlineDayOf, splitPeriod, periodOf, periodLabel, shiftPeriod, periodEnd,
  issueDate, agreeDeadline, dueDate, docDate, fmtAt, parseAt, fmtKo, fmtDot, fmtMd, fmtMdHm,
  agreementState,
} from "../js/data/settlement-rules.js";

let pass = 0, fail = 0;
const bad = [];
const eq = (name, got, want) => {
  const g = got instanceof Date ? fmtAt(got) : got;
  const w = want instanceof Date ? fmtAt(want) : want;
  if (g === w) pass++; else { fail++; bad.push(`${name}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`); }
};
const throws = (name, fn) => { try { fn(); fail++; bad.push(`${name}: expected throw`); } catch { pass++; } };
const D = (y, m1, d, h = 0, mi = 0, ms = 0) => new Date(y, m1 - 1, d, h, mi, 0, ms);

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

// 발급일 15 (late) — 발행 9/15 10:00 · 마감 9/28 13:00 (뉴트리 데모)
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

console.log(`settlement-rules: ${pass} passed, ${fail} failed`);
if (fail) { bad.forEach((b) => console.log("  x " + b)); process.exit(1); }
