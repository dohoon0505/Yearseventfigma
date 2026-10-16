/* ============================================================
   test-billing.mjs — 정산 금액 변경 기록 · 발급 때 금액 · 0원 규칙 · 저장 전 판정 회귀 테스트
   실행:  node tools/test-billing.mjs   (의존성 없음 · 실패하면 exit 1)

   2026-10-16 2차 시안(S-01~S-06) 공통 기반 — DATA.md 1~3절. 시계는 **2026-10-16 09:30(Asia/Seoul)** 에 못박고,
   저장소는 메모리 대역이다(setItem 을 일부러 실패시켜 '저장 공간 부족' 도 본다). 모듈은 시계를 건 **뒤에** 불러온다 —
   목데이터 기준 시각(DATA_NOW)이 import 순간의 new Date() 라서다.
   다루는 것:
     ① data/billing-entries — 주문 한 건의 기여 · 저장 전후 차이 · 원인(8가지 경우)
     ② 시드 예시 A~G — issuedAmount · changed · zeroEdited · zeroCloseAt · docStamp · termsWatchOf.firstZero · 수수료 줄 순서
     ③ settlementImpactOf — 확인 창 달 · 잠긴 달 · 발행 시각이 지난 거래 없는 달로 들어오는 주문 막기(사용자 답 3)
     ④ agreeSettlement — 금액 불일치를 먼저 본다 · 저장 실패
     ⑤ b2b-mock 쓰기 — 변경 기록 줄 · 사유 · 처리자 · 저장 실패 때 주문과 기록을 함께 되돌림 · hydrate
     ⑥ 계산서 다시 시도 · 입금 확인의 처리자와 저장 실패 · 문서 빌더(동의 전 표기 · 수수료 줄) · 공개 링크 레코드
   ============================================================ */
process.env.TZ = "Asia/Seoul";
/* ⑦ 이 파일을 **다른 시각으로** 다시 띄워 본다(목데이터 기준 시각은 import 순간에 굳어 한 프로세스에서 옮길 수 없다).
   BILLING_PROBE="YYYY-MM-DDTHH:mm"(서울) · BILLING_STORE=시작 저장소 JSON 파일 · BILLING_ACT · BILLING_DUMP=끝 저장소를 쓸 파일. */
const PROBE = process.env.BILLING_PROBE || "";
const FIX = PROBE ? Date.parse(`${PROBE}:00+09:00`) : Date.UTC(2026, 9, 16, 0, 30); // 2026-10-16 09:30 KST
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIX); else super(...a); }
  static now() { return FIX; }
}
globalThis.Date = FakeDate;
let failSet = false;
const fs = await import("node:fs");
const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failSet) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    _m: m,
  };
};
globalThis.localStorage = mem(process.env.BILLING_STORE ? JSON.parse(fs.readFileSync(process.env.BILLING_STORE, "utf8")) : {});
globalThis.sessionStorage = mem();

const R = new URL("../js/", import.meta.url).href;
const BE = await import(R + "data/billing-entries.js");
const RULES = await import(R + "data/settlement-rules.js");
const { store } = await import(R + "store.js");
const B2B = await import(R + "data/b2b-mock.js");
const S = await import(R + "util/settlement.js");
const { invoiceDocData } = await import(R + "util/invoice-data.js");
const LINKS = await import(R + "data/invoice-links.js");
const { SEED_ACTOR } = await import(R + "data/staff-mock.js");

let pass = 0, fail = 0;
const bad = [];
const eq = (name, got, want) => {
  const g = got instanceof RealDate ? RULES.fmtAt(got) : got;
  const w = want instanceof RealDate ? RULES.fmtAt(want) : want;
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if (ok) pass++; else { fail++; bad.push(`${name}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`); }
};
const D = (y, m1, d, h = 0, mi = 0, s = 0) => new Date(y, m1 - 1, d, h, mi, s);
const NOW = new Date();
const client = (id) => store.get().clients.find((c) => c.id === id);
const so = (id, ym, now = NOW) => S.settlementOf(client(id), ym, now);
const order = (id) => B2B.b2bFind(id);
const LAST = "2026-09", PREV = "2026-08", CUR = "2026-10";

if (PROBE) { // ⑦ 의 자식 프로세스 — 9월 상태만 찍고 끝낸다
  if (process.env.BILLING_STORE) store.hydrate(); // 새로고침처럼 — 주문 목록을 만들기 전에 저장소를 읽는다
  if (process.env.BILLING_ACT === "ribbon") { const o = order("g-C011-202609-02"); B2B.b2bUpsert({ ...o, ribbonPhrase: "근조(시험)" }); }
  const pick = (id) => { const s = so(id, LAST); return [s.status, s.amount, s.issuedAmount, s.changed, s.changeCount]; };
  if (process.env.BILLING_DUMP) fs.writeFileSync(process.env.BILLING_DUMP, JSON.stringify(Object.fromEntries(localStorage._m)));
  console.log(JSON.stringify({ C001: pick("C001"), C011: pick("C011"), C019: pick("C019") }));
  process.exit(0);
}

eq("시계가 못박혔다", RULES.fmtAt(NOW), "2026-10-16 09:30");

/* ══ ① billing-entries ══════════════════════════════════════════════ */
const base = { id: "x1", orderNo: "B2B-X1", clientId: "C900", ordererName: "총무팀", address: "주소", product: "3단화환(기본형)", amount: 50000, status: "배송완료", deliverAt: "2026-09-20T14:00" };
const feeO = { ...base, status: "취소", cancelFee: 10000, canceledAt: "2026-09-28 10:20", deliverAt: "2026-10-03T14:00" };
eq("주문 줄 — 배송일의 달", BE.entriesOfOrder(base).map((e) => [e.kind, e.ym, e.amount, e.orderId]), [["order", "2026-09", 50000, "x1"]]);
eq("수수료 줄 — 취소한 달 · 원래 배송 예정 일시", BE.entriesOfOrder(feeO).map((e) => [e.kind, e.ym, e.amount, e.deliverAt]), [["cancelFee", "2026-09", 10000, "2026-10-03 14:00"]]);
eq("수수료 0 취소 — 줄 없음", BE.entriesOfOrder({ ...feeO, cancelFee: 0 }), []);
eq("배송일시 없음 — 줄 없음", BE.entriesOfOrder({ ...base, deliverAt: "" }), []);
eq("거래처 없음 — 줄 없음", BE.entriesOfOrder({ ...base, clientId: "" }), []);
eq("0원 주문도 한 줄", BE.entriesOfOrder({ ...base, amount: 0 }).length, 1);
eq("수수료 이력만 있는 옛 저장본 — 이력의 취소 시각", BE.canceledAtOf({ history: [{ type: "cancel", at: "2026-09-02 11:00" }] }), "2026-09-02 11:00");
{
  const a = BE.entriesOfOrder(base)[0], f = BE.entriesOfOrder(feeO)[0];
  eq("정렬: 주문 줄 먼저 · 수수료 줄 뒤", [f, a].sort(BE.compareEntries).map((e) => e.kind), ["order", "cancelFee"]);
}
const dif = (b, a) => BE.contributionDiff(b, a).map((d) => [d.ym, d.before, d.after, d.delta, d.touched]);
eq("금액 직접 수정", dif(base, { ...base, amount: 70000 }), [["2026-09", 50000, 70000, 20000, true]]);
eq("원인: 금액", BE.causeOf(base, { ...base, amount: 70000 }), "amount");
eq("상품 변경(같은 금액이어도 touched)", dif(base, { ...base, product: "근조바구니" }), [["2026-09", 50000, 50000, 0, true]]);
eq("원인: 상품", BE.causeOf(base, { ...base, product: "근조바구니", amount: 60000 }), "product");
eq("리본 문구 — 영향 없음", dif(base, { ...base, ribbonPhrase: "x" }), [["2026-09", 50000, 50000, 0, false]]);
eq("원인: 영향 없음 → null", BE.causeOf(base, { ...base, ribbonPhrase: "x" }), null);
eq("같은 달 안 날짜 이동 — 영향 없음", dif(base, { ...base, deliverAt: "2026-09-25T10:00" }), [["2026-09", 50000, 50000, 0, false]]);
eq("주문취소(수수료 有) — 귀속월 −금액 · 취소한 달 +수수료",
  dif(base, { ...base, status: "취소", cancelFee: 10000, canceledAt: "2026-10-16 09:30" }),
  [["2026-09", 50000, 0, -50000, true], ["2026-10", 0, 10000, 10000, true]]);
eq("주문취소(수수료 無)", dif(base, { ...base, status: "취소", cancelFee: 0 }), [["2026-09", 50000, 0, -50000, true]]);
eq("원인: 취소", BE.causeOf(base, { ...base, status: "취소" }), "cancel");
eq("삭제", dif(base, null), [["2026-09", 50000, 0, -50000, true]]);
eq("원인: 삭제", BE.causeOf(base, null), "remove");
eq("수수료 붙은 취소 주문 삭제", dif(feeO, null), [["2026-09", 10000, 0, -10000, true]]);
eq("원인: 수수료 주문 삭제", BE.causeOf(feeO, null), "feeRemove");
eq("배송일시를 다른 달로", dif(base, { ...base, deliverAt: "2026-10-02T10:00" }), [["2026-09", 50000, 0, -50000, true], ["2026-10", 0, 50000, 50000, true]]);
eq("원인: 이동", BE.causeOf(base, { ...base, deliverAt: "2026-10-02T10:00" }), "move");
eq("0원 주문 이동 — 기여는 그대로 · 두 달 다 touched", dif({ ...base, amount: 0 }, { ...base, amount: 0, deliverAt: "2026-10-02T10:00" }), [["2026-09", 0, 0, 0, true], ["2026-10", 0, 0, 0, true]]);
eq("등록", dif(null, base), [["2026-09", 0, 50000, 50000, true]]);
eq("원인: 등록", BE.causeOf(null, base), "create");

/* ══ 규칙 모듈 — 새 상수·함수 ═══════════════════════════════════════ */
eq("수정 마감 날: 1일 → 9일", RULES.editLockDayOf("1"), 9);
eq("수정 마감 날: 15일 → 27일", RULES.editLockDayOf("15"), 27);
eq("수정 마감 날 = editLockAt 의 날", [1, 7, 11, 25].every((d) => RULES.editLockDayOf(d) === RULES.editLockAt("2026-09", d).getDate()), true);
eq("짧은 말은 정본과 같은 상태에만", Object.keys(RULES.LOCK_SHORT).every((k) => k in RULES.LOCK_REASON), true);
eq("발행 지난 빈 달 이유", RULES.issuedEmptyReason("2026-09"), "9월은 명세서 발행이 지난 달입니다 — 배송일을 확인해 주세요");

/* ══ ② 시드 예시 (10-16 09:30) ══════════════════════════════════════ */
{
  const s = so("C011", LAST); // A
  const ch = S.amountChangesOf(client("C011"), LAST, NOW);
  eq("A 바뀐 달 · 동의 전 — 상태", [s.status, s.editable, s.open, s.docStamp], ["AWAITING_AGREEMENT", true, true, true]);
  eq("A 발급 때 금액 = 지금 + 40,000", s.issuedAmount - s.amount, 40000);
  eq("A changed · 줄 1", [s.changed, s.changeCount], [true, 1]);
  eq("A 마지막 수정 = 발행일 14:20", s.amountChangedAt, D(2026, 10, 15, 14, 20));
  eq("A 줄 — 처리자 · 사유 · 주문 기여", [ch.lines[0].by.name, ch.lines[0].by.dept, ch.lines[0].reason.startsWith("[예시]"), ch.lines[0].before, ch.lines[0].after, ch.lines[0].cause],
    [SEED_ACTOR.name, SEED_ACTOR.dept, true, 90000, 50000, "product"]);
  eq("A 그 달 금액 전 → 후", [ch.lines[0].monthBefore, ch.lines[0].monthAfter], [s.issuedAmount, s.amount]);
  eq("A 문장", S.amountChangeLine(s), `발급 때 ${s.issuedAmount.toLocaleString("ko-KR")}원 → 지금 ${s.amount.toLocaleString("ko-KR")}원 (10월 15일 수정)`);
  const hist = (order("g-C011-202609-02").history || []).filter((h) => h.type === "edit");
  eq("A 처리 이력 edit 한 줄", hist.map((h) => [h.at, h.label]), [["2026-10-15 14:20", "명세서 발행 뒤 금액 수정 · 90,000원 → 50,000원"]]);
}
{
  const s = so("C001", LAST); // B + G
  const ch = S.amountChangesOf(client("C001"), LAST, NOW);
  eq("B 동의 뒤(자동) — 줄 2 · changed", [s.status, s.changeCount, s.changed, s.docStamp], ["ISSUED", 2, true, false]);
  eq("B 발급 때 − 지금 = 90,000", s.issuedAmount - s.amount, 90000);
  eq("B 사유 없음 줄 · 0원 처리 줄", ch.lines.map((l) => [l.reason === "", l.after]), [[true, 50000], [false, 0]]);
  eq("B 누적 끝 = 지금 금액", ch.lines[ch.lines.length - 1].monthAfter, s.amount);
  const es = S.billingEntriesOf(client("C001"), LAST);
  eq("G 수수료 줄이 맨 아래 · 다른 달(이번 달 3일) 배송분", [es[es.length - 1].kind, es[es.length - 1].orderNo, es[es.length - 1].deliverAt.slice(0, 10)], ["cancelFee", "B2B-0045", "2026-10-03"]);
  eq("G 수수료 1건 · 주문 건수에 안 셈", [s.feeCount, s.count], [1, es.length - 1]);
}
{
  const s = so("C002", PREV); // C
  eq("C 동의·발급·입금 뒤에도 남음", [s.status, s.changed, s.issuedAmount - s.amount], ["PAID", true, 45000]);
  eq("C 입금 처리자 = 시드 처리자", s.paidBy && s.paidBy.name, SEED_ACTOR.name);
}
{
  const s = so("C019", LAST); // D
  eq("D 고쳐서 0원 · 1일 그룹 — 마감에 닫힘", [s.status, s.zero, s.zeroEdited, s.amount, s.issuedAmount, s.count], ["PAID", true, true, 0, 60000, 1]);
  eq("D 닫힌 시각 = 마감", s.zeroCloseAt, D(2026, 10, 10, 13, 0));
  eq("D 동의·계산서·입금 칸 비움", [s.mode, s.agreedAt, s.einvoice, s.paidAt], [null, null, null, null]);
  eq("D 잠긴 이유 = 0원", [s.lockReason, s.lockShort], [RULES.LOCK_REASON.zero, null]);
  eq("D 문서 낱말 '해당 없음(0원)'", S.invoiceDocNoteOf(s), LINKS.INVOICE_NOTE.zero);
  eq("D 미입금·조치 필요 아님", [S.isUnpaid(s), S.needsAction(s), S.inSettlementFlow(s)], [false, false, false]);
  const rows = S.settlementsFor(client("C019"), NOW).find((r) => r.ym === LAST);
  eq("D 옛 문자열 칸 — 해당없음", [rows.거래명세서동의, rows.계산서발급, rows.입금완료], ["해당없음", "해당없음", "해당없음"]);
  const s9 = so("C019", LAST, D(2026, 10, 5, 12)); // 마감 전
  eq("D 마감 전 — 동의대기 · 동의 안 받음 · 보류 없음", [s9.status, s9.open, s9.autoAgreeHold, s9.editable], ["AWAITING_AGREEMENT", false, null, true]);
  eq("D 마감 전 문서 낱말도 0원", S.invoiceDocNoteOf(s9), LINKS.INVOICE_NOTE.zero);
}
{
  const s = so("C027", LAST); // E
  eq("E 고쳐서 0원 · 11일 그룹 · 마감 전", [s.status, s.zeroEdited, s.open, s.autoAgreeHold, s.termsHold, s.editable, s.docStamp], ["AWAITING_AGREEMENT", true, false, null, false, true, true]);
  eq("E 수정 마감 · 마감", [s.editLockAt, s.deadline], [D(2026, 10, 27, 10), D(2026, 10, 28, 13)]);
  eq("E 닫힐 시각 = 마감", s.zeroCloseAt, D(2026, 10, 28, 13));
  const sl = so("C027", LAST, D(2026, 10, 27, 10));
  eq("E 수정 마감 정각 — 잠김(0원 이유) · 표기 없음", [sl.status, sl.editable, sl.lockReason, sl.docStamp], ["AWAITING_AGREEMENT", false, RULES.LOCK_REASON.zero, false]);
  const sp = so("C027", LAST, D(2026, 10, 28, 13, 0, 1));
  eq("E 마감 뒤 — PAID", sp.status, "PAID");
  eq("E 마감 정각 13:00:00 은 아직 열림", so("C027", LAST, D(2026, 10, 28, 13)).status, "AWAITING_AGREEMENT");
  const w = S.termsWatchOf(client("C027"), NOW);
  eq("E 약관 경고 — 0원 달은 건너뛰고 다음 달", [w.next && w.next.ym, w.held.length, w.firstZero], [CUR, 0, null]);
}
{
  const s = so("C020", LAST); // F
  eq("F 처음부터 0원 — 발행과 함께 닫힘 · 줄 없음", [s.status, s.zero, s.zeroEdited, s.changeCount, s.issuedAmount], ["PAID", true, false, 0, 0]);
  eq("F 닫힌 시각 = 발행", s.zeroCloseAt, D(2026, 10, 1, 10));
  const w = S.termsWatchOf(client("C020"), NOW);
  eq("F 첫 달이 0원으로 닫힌 약관 전 거래처", [w.firstZero && w.firstZero.ym, w.held.length, w.next && w.next.ym, w.next && w.next.first], [LAST, 0, CUR, false]);
  eq("F 다른 보류 거래처는 그대로(C023·C026)", ["C023", "C026"].map((id) => S.termsWatchOf(client(id), NOW).held.length), [1, 1]);
}
{
  const s = so("C022", LAST); // 주문 없는 거래처
  eq("거래 없는 달 — NONE · 발급 때 금액 없음", [s.status, s.issuedAmount, s.changed, s.zeroEdited], ["NONE", null, false, false]);
  eq("발행 전 달 — 발급 때 금액 없음", [so("C011", CUR).status, so("C011", CUR).issuedAmount], ["SCHEDULED", null]);
}

/* ══ ③ settlementImpactOf ══════════════════════════════════════════ */
{
  const o = order("g-C011-202609-02");
  const im = S.settlementImpactOf(o, { ...o, amount: 70000 }, NOW);
  eq("확인 창: 고칠 수 있는 발급 달 1", [im.confirm.length, im.lock, im.cause, im.months[0].after - im.months[0].before], [1, null, "amount", 20000]);
  const r = S.settlementImpactOf(o, { ...o, ribbonPhrase: "x" }, NOW);
  eq("리본 문구 — 영향 없음", [r.months.length, r.confirm.length, r.lock], [0, 0, null]);
  const mv = S.settlementImpactOf(o, { ...o, deliverAt: "2026-10-05T10:00" }, NOW);
  eq("다른 달로 — 두 달 · 옛 달 먼저 · 확인은 발급 달만", [mv.moved, mv.months.map((m) => [m.ym, m.isOld, m.delta]), mv.confirm.map((m) => m.ym)],
    [true, [[LAST, true, -50000], [CUR, false, 50000]], [LAST]]);
  eq("새 달은 발행 전", mv.months[1].s.status, "SCHEDULED");
}
{
  const o = order("g-C001-202609-04"); // C001 9월 — 자동 동의됨
  const im = S.settlementImpactOf(o, { ...o, amount: 10 }, NOW);
  eq("동의된 달 — 막힘(정본 · 짧은 말)", [im.lock && im.lock.ym, im.lock && im.lock.reason, im.lock && im.lock.short, im.confirm.length], [LAST, RULES.LOCK_REASON.agreed, RULES.LOCK_SHORT.agreed, 0]);
  const fee = S.settlementImpactOf(order("t45"), null, NOW);
  eq("수수료 주문 삭제 — 수수료 달(동의됨)이 막는다", [fee.cause, fee.lock && fee.lock.ym], ["feeRemove", LAST]);
  /* 명세 6.4 — 취소한 주문의 DELETE 는 귀속월(배송일시의 달)도 잠금 검사(옛 removeHit 과 같다) */
  const c0 = { ...o, status: "취소", cancelFee: 0, canceledAt: "2026-09-20 10:00" };
  const d0 = S.settlementImpactOf(c0, null, NOW);
  eq("수수료 0원 취소 주문 삭제 — 귀속월(동의됨)이 막는다 · 확인 창 없음", [d0.lock && d0.lock.ym, d0.lock && d0.lock.reason, d0.confirm.length], [LAST, RULES.LOCK_REASON.agreed, 0]);
  const cf = { ...o, status: "취소", cancelFee: 10000, canceledAt: "2026-10-02 10:00" };
  const df = S.settlementImpactOf(cf, null, NOW);
  eq("수수료 달은 열려도 귀속월이 잠겼으면 막는다", [df.months.map((m) => [m.ym, m.delta]), df.lock && df.lock.ym], [[[LAST, 0], [CUR, -10000]], LAST]);
  const oo = order("g-C011-202609-05");
  const dOpen = S.settlementImpactOf({ ...oo, status: "취소", cancelFee: 0, canceledAt: "2026-09-20 10:00" }, null, NOW);
  eq("열린 귀속월의 취소 주문 삭제 — 막지 않음 · 확인 창 없음", [dOpen.lock, dOpen.confirm.length], [null, 0]);
  const dNone = S.settlementImpactOf({ ...oo, clientId: "C022", status: "취소", cancelFee: 0, canceledAt: "2026-09-20 10:00" }, null, NOW);
  eq("거래 없는 달(NONE)의 취소 주문 삭제 — 들어오는 주문이 아니라 막지 않음", dNone.lock, null);
  const z = order("g-C019-202609-01");
  const zm = S.settlementImpactOf(z, { ...z, deliverAt: "2026-10-05T10:00" }, NOW);
  eq("0원 주문을 닫힌 0원 달에서 옮기기 — 막힘(0원 이유)", [zm.lock && zm.lock.reason, zm.months.every((m) => m.delta === 0)], [RULES.LOCK_REASON.zero, true]);
}
{
  const intoNone = { id: "", clientId: "C022", deliverAt: "2026-09-25T10:00", amount: 50000, status: "접수대기", product: "3단화환(기본형)" };
  const im = S.settlementImpactOf(null, intoNone, NOW);
  eq("발행 시각이 지난 거래 없는 달로 등록 — 막힘(사용자 답 3)", [im.cause, im.lock && im.lock.reason, im.lock && im.lock.short], ["create", RULES.issuedEmptyReason(LAST), RULES.ISSUED_EMPTY_SHORT]);
  eq("intakeBlockOf — 같은 판정", S.intakeBlockOf(client("C022"), "2026-09-25T10:00", NOW).reason, RULES.issuedEmptyReason(LAST));
  eq("intakeBlockOf — 발행 전 달은 받는다", S.intakeBlockOf(client("C022"), "2026-10-25T10:00", NOW), null);
  eq("intakeBlockOf — 동의된 달은 막는다", S.intakeBlockOf("C001", "2026-09-25T10:00", NOW).reason, RULES.LOCK_REASON.agreed);
  eq("intakeBlockOf — 고칠 수 있는 발급 달은 받는다", S.intakeBlockOf("C011", "2026-09-25T10:00", NOW), null);
  const o = order("g-C022-202610-01") || null;
  eq("(C022 는 주문이 없다)", o, null);
}

/* ══ ④ agreeSettlement ═════════════════════════════════════════════ */
{
  const r = S.agreeSettlement(client("C027"), LAST, 50000, NOW);
  eq("고쳐서 0원 달에 옛 금액으로 동의 — 금액 불일치가 먼저", r, { error: "SETTLEMENT_AMOUNT_CHANGED", amount: 0, issuedAmount: 50000 });
  eq("보여 준 금액도 0 — null", S.agreeSettlement(client("C027"), LAST, 0, NOW), null);
  const s = so("C011", LAST);
  const w = S.agreeSettlement(client("C011"), LAST, s.amount + 1, NOW);
  eq("금액 불일치 detail", w, { error: "SETTLEMENT_AMOUNT_CHANGED", amount: s.amount, issuedAmount: s.issuedAmount });
  failSet = true;
  const f = S.agreeSettlement(client("C011"), LAST, s.amount, NOW);
  failSet = false;
  eq("저장 실패 — STORAGE_FULL · 기록 없음", [f, (store.get().invoiceAgreed.C011 || {})[LAST] || null, so("C011", LAST).mode], [{ error: "STORAGE_FULL" }, null, null]);
  const ok = S.agreeSettlement(client("C021"), LAST, so("C021", LAST).amount, NOW);
  eq("정상 동의 — 시각 문자열", ok, "2026-10-16 09:30");
}

/* ══ ⑤ b2b-mock 쓰기 — 변경 기록 ═══════════════════════════════════ */
sessionStorage.setItem("yeop.session.v1", "admin");
{
  const id = "g-C011-202609-02";
  const issued0 = so("C011", LAST).issuedAmount;
  const amt0 = so("C011", LAST).amount;
  const o = order(id);
  const saved = B2B.b2bUpsert({ ...o, amount: 70000 }, { note: "  고객센터 접수 — 금액 협의  " });
  const log = store.amountLogOf("C011", LAST);
  eq("수정 저장 — 레코드", saved && saved.amount, 70000);
  eq("수정 저장 — 기록 한 줄(사유 다듬음 · 처리자 = 로그인 직원)",
    log.map((l) => [l.cause, l.before, l.after, l.reason, l.by.id, l.by.name, l.by.dept, l.orderNo, l.at]),
    [["amount", 50000, 70000, "고객센터 접수 — 금액 협의", "s1", "최고관리자", "시스템", o.orderNo, "2026-10-16 09:30"]]);
  const s = so("C011", LAST);
  eq("발급 때 금액은 그대로 · 지금 금액 +20,000 · 줄 2(시드 + 사용자)", [s.issuedAmount, s.amount - amt0, s.changeCount], [issued0, 20000, 2]);
  const ch = S.amountChangesOf(client("C011"), LAST, NOW);
  eq("누적 끝 = 지금 금액", ch.lines[ch.lines.length - 1].monthAfter, s.amount);
  const long = "가".repeat(250);
  B2B.b2bUpsert({ ...order(id), amount: 60000 }, { note: long });
  eq("사유 200자로 자름", store.amountLogOf("C011", LAST).pop().reason.length, 200);
  /* 되돌려 순변동 0 — 줄은 남는다(changeCount 는 세고 changed 는 아님) */
  B2B.b2bUpsert({ ...order(id), amount: 50000 });
  const r0 = so("C011", LAST);
  eq("되돌려 순변동 0 — changed 는 원래대로(시드 변경만) · 줄은 셈", [r0.issuedAmount - r0.amount, r0.changeCount], [40000, 4]);
}
{
  const o10 = B2B.b2bList().find((x) => x.clientId === "C011" && String(x.deliverAt).startsWith(CUR) && x.status !== "취소");
  const before = store.amountLogOf("C011", CUR).length;
  B2B.b2bUpsert({ ...o10, amount: Number(o10.amount) + 1000 });
  eq("발행 전 달 수정 — 기록 없음", store.amountLogOf("C011", CUR).length, before);
}
{
  const id = "g-C011-202609-01";
  const o = order(id);
  B2B.b2bUpsert({ ...o, deliverAt: "2026-10-05T10:00" }, { note: "배송일 변경 요청" });
  const l = store.amountLogOf("C011", LAST).pop();
  eq("다른 달로 — 옛 달 줄 · 상대 달 · 전후 일시", [l.cause, l.before, l.after, l.pair, l.move && l.move.from, l.move && l.move.to],
    ["move", Number(o.amount), 0, CUR, o.deliverAt, "2026-10-05T10:00"]);
  eq("새 달(발행 전) — 줄 없음", store.amountLogOf("C011", CUR).length, 0);
}
{
  /* 저장 실패 — 주문과 기록을 함께 되돌린다 */
  const id = "g-C011-202609-03";
  const o = order(id);
  const logLen = store.amountLogOf("C011", LAST).length;
  const opsJson = JSON.stringify(store.orderOps());
  failSet = true;
  const r = B2B.b2bUpsert({ ...o, amount: 12345 }, { note: "실패해야 함" });
  failSet = false;
  eq("저장 실패 — null", r, null);
  eq("저장 실패 — 주문 되돌림", order(id).amount, o.amount);
  eq("저장 실패 — 기록 되돌림", store.amountLogOf("C011", LAST).length, logLen);
  eq("저장 실패 — 변경분 되돌림", JSON.stringify(store.orderOps()), opsJson);
  failSet = true;
  const rm = B2B.b2bRemove(id);
  failSet = false;
  eq("삭제 저장 실패 — false · 주문 남음 · 기록 없음", [rm, !!order(id), store.amountLogOf("C011", LAST).length], [false, true, logLen]);
  const ok = B2B.b2bRemove(id, { note: "중복 주문" });
  const l = store.amountLogOf("C011", LAST).pop();
  eq("삭제 — remove 줄", [ok, l.cause, l.before, l.after, l.reason], [true, "remove", Number(o.amount), 0, "중복 주문"]);
}
{
  const id = "g-C011-202609-04";
  const o = order(id);
  B2B.b2bCancel(id, { reason: "고객 요청", fee: 10000, note: "" });
  const l = store.amountLogOf("C011", LAST).pop();
  eq("주문취소 — 귀속월 금액 → 0 · 사유 없음(취소 사유를 대신 적지 않는다)", [l.cause, l.before, l.after, l.reason], ["cancel", Number(o.amount), 0, ""]);
  eq("수수료는 이번 달(발행 전) — 줄 없음", store.amountLogOf("C011", CUR).length, 0);
  eq("수수료는 이번 달 정산에", S.billingEntriesOf(client("C011"), CUR).some((e) => e.kind === "cancelFee" && e.orderId === id), true);
}
{
  const rec = { id: B2B.b2bNewId(), orderNo: B2B.b2bNextOrderNo(), clientId: "C011", date: "2026/10/16 09:30", deliverAt: "2026-09-26T13:30", product: "3단화환(기본형)", amount: 50000, status: "배송완료", ordererName: "마케팅팀", address: "주소", history: [] };
  B2B.b2bUpsert(rec, { note: "늦은 등록" });
  const l = store.amountLogOf("C011", LAST).pop();
  eq("발급 달로 늦은 등록 — create 줄", [l.cause, l.before, l.after, l.orderId], ["create", 0, 50000, rec.id]);
}
{
  /* 잠긴 달(동의된 C001 9월)의 수수료 주문을 지우면 — 기록은 사실대로 남기고 경고(화면이 막았어야 한다) */
  const warns = [];
  const w0 = console.warn;
  console.warn = (m) => warns.push(String(m));
  const ok = B2B.b2bRemove("t45");
  console.warn = w0;
  const l = store.amountLogOf("C001", LAST).pop();
  eq("잠긴 달 변경 — 기록 · 경고", [ok, l && l.cause, l && l.before, warns.length], [true, "feeRemove", 10000, 1]);
}
{
  /* 영속 · hydrate — 줄 단위로 거른다 */
  const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
  eq("amountLog 가 저장됐다", Object.keys(raw.amountLog || {}).sort(), ["C001", "C011"]);
  raw.amountLog.C011[LAST].push({ id: "bad", at: "어제", before: 1, after: 2, orderNo: "x" });
  raw.amountLog.C011[LAST].push({ id: "bad2", at: "2026-10-16 09:30", before: "1", after: 2, orderNo: "x" });
  const n = raw.amountLog.C011[LAST].length;
  localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
  store.hydrate();
  eq("hydrate — 깨진 줄만 버린다", store.amountLogOf("C011", LAST).length, n - 2);
  const old = JSON.parse(localStorage.getItem("yeop.store.v5"));
  delete old.amountLog;
  localStorage.setItem("yeop.store.v5", JSON.stringify(old));
  store.hydrate();
  eq("hydrate — 칸이 없는 옛 저장본은 빈 기록", store.get().amountLog, {});
  localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
  store.hydrate();
}

/* ══ ⑥ 계산서 다시 시도 · 입금 확인 · 문서 · 공개 링크 ═══════════════ */
{
  eq("C004 지난달 — 발급 실패로 AGREED", so("C004", LAST).status, "AGREED");
  failSet = true;
  const f = S.issueEinvoiceFor(client("C004"), LAST, { mode: "retry" }, NOW);
  failSet = false;
  eq("다시 시도 저장 실패 — STORAGE_FULL · 그대로 AGREED", [f, store.einvoiceOf("C004", LAST), so("C004", LAST).status], [{ error: "STORAGE_FULL" }, null, "AGREED"]);
  const r = S.issueEinvoiceFor(client("C004"), LAST, { mode: "retry" }, NOW);
  eq("다시 시도 — 처리자", [r.mode, r.by && r.by.name, so("C004", LAST).einvoice.by && so("C004", LAST).einvoice.by.dept], ["retry", "최고관리자", "시스템"]);
  eq("자동 발급(파생)은 처리자 없음", so("C002", LAST).einvoice.by, null);
  failSet = true;
  const pf = S.confirmPaymentFor(client("C002"), LAST, undefined, NOW);
  failSet = false;
  eq("입금 확인 저장 실패 — STORAGE_FULL · 미입금 그대로", [pf, store.paymentOf("C002", LAST), so("C002", LAST).status], [{ error: "STORAGE_FULL" }, null, "ISSUED"]);
  const p = S.confirmPaymentFor(client("C002"), LAST, undefined, NOW);
  eq("입금 확인 — 처리자", [p.at, p.by && p.by.name, so("C002", LAST).paidBy && so("C002", LAST).paidBy.name], ["2026-10-16 09:30", "최고관리자", "최고관리자"]);
}
{
  const d = invoiceDocData(client("C011"), LAST, NOW);
  eq("문서 — 동의 전 · 수정 마감 전이면 표기", d.stamp, { text: LINKS.DOC_STAMP, printedAt: "10월 16일 09:30" });
  eq("문서 — 합계 = 정산 금액", d.total, `${so("C011", LAST).amount.toLocaleString("ko-KR")}원`);
  eq("문서 — 수정 마감 뒤엔 표기 없음", invoiceDocData(client("C011"), LAST, D(2026, 10, 27, 10)).stamp, null);
  eq("문서 — 동의된 달엔 표기 없음", invoiceDocData(client("C002"), LAST, NOW).stamp, null);
  const fee = invoiceDocData(client("C011"), CUR, NOW).items.filter((it) => it.kind === "fee");
  eq("문서 — 수수료 줄 모양", fee.map((it) => [it.sender, it.date.endsWith("취소"), it.product, it.address.includes("배송 예정분을"), it.value]), [["-", true, "취소 수수료", true, 10000]]);
  const items = invoiceDocData(client("C011"), CUR, NOW).items;
  eq("문서 — 수수료 줄은 주문 줄 뒤", items[items.length - 1].kind, "fee");
  const none = invoiceDocData(client("C022"), LAST, NOW);
  eq("문서 — 거래 없는 달", [none.items.length, none.buyer.issueDate, none.buyer.invoiceNote], [1, "-", LINKS.INVOICE_NOTE.none]);
}
{
  const t = LINKS.issueLink({ clientId: "C011", bizNumber: "000-00-00011", ym: LAST });
  const rec = LINKS.resolveLink(t);
  eq("공개 링크 — 본문 없이 귀속월만", [rec.ym, "doc" in rec], [LAST, false]);
  const t2 = LINKS.issueLink({ clientId: "C011", bizNumber: "000-00-00011", doc: { period: "2026년 09월 귀속", items: [] } });
  eq("옛 호출 모양(doc) — 같은 토큰 · 귀속월로 바꿔 저장", [t2 === t, "doc" in LINKS.resolveLink(t2)], [true, false]);
  eq("시드 토큰(C001 04월) — 귀속월을 싣는다", LINKS.resolveLink("FP9S0QA8YA").ym, "2026-04");
  /* C003 시드는 예전에 주문 데이터에 없는 2026-04 본문을 박아 두어 관리자 화면('거래 없음')과 금액이 갈렸다 — 이제 지난달을 가리킨다. */
  eq("시드 토큰(C003) — 지난달 귀속월 · 본문 없음", [LINKS.resolveLink("ZT6W1HE4NC").ym, !!LINKS.resolveLink("ZT6W1HE4NC").doc], [LAST, false]);
  const t3 = LINKS.issueLink({ clientId: "C001", bizNumber: "000-00-00001", ym: "2026-04" });
  eq("시드와 같은 (거래처, 귀속월) — 시드 토큰을 그대로 쓴다", t3, "FP9S0QA8YA");
}

/* ══ ⑦ 시드 줄 시각 전후 · 그 전에 사용자가 고친 시드 주문 (다른 시각으로 이 파일을 다시 띄운다) ══
   시드 줄 시각(발행일 14:20 · 15:40)이 아직 오지 않았으면 주문도 고치기 전 값이다 — 예전엔 고친 값을 그대로 둬서
   '발행 ≤ 지금 < 줄 시각' 동안 C019 9월이 '처음부터 0원 · PAID' 였다가 줄 시각에 동의대기로 되돌아갔다. */
{
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const os = await import("node:os");
  const path = await import("node:path");
  const self = fileURLToPath(import.meta.url);
  const probe = (at, extra = {}) => JSON.parse(execFileSync(process.execPath, [self], {
    env: { ...process.env, BILLING_PROBE: at, ...extra }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim().split("\n").pop());
  const win = probe("2026-10-01T12:00"); // 1일 그룹 발행(10:00) 뒤 · 줄 시각(14:20) 전
  eq("⑦ 줄 시각 전 D — 고치기 전 값 · 동의대기(닫히지 않는다)", win.C019, ["AWAITING_AGREEMENT", 60000, 60000, false, 0]);
  eq("⑦ 줄 시각 전 B — 바뀜 없음 · 발급 때 = 지금", [win.C001[3], win.C001[4], win.C001[1] === win.C001[2]], [false, 0, true]);
  const aft = probe("2026-10-01T15:41"); // 두 줄 시각 뒤
  eq("⑦ 줄 시각 뒤 D — 고쳐서 0원 · 동의대기", aft.C019, ["AWAITING_AGREEMENT", 0, 60000, true, 1]);
  eq("⑦ 줄 시각 뒤 B — 줄 2 · 발급 때 − 지금 = 90,000", [aft.C001[4], aft.C001[2] - aft.C001[1], win.C001[2] === aft.C001[2]], [2, 90000, true]);
  const dump = path.join(os.tmpdir(), `test-billing-${process.pid}.json`);
  try {
    probe("2026-10-15T12:00", { BILLING_ACT: "ribbon", BILLING_DUMP: dump }); // A 의 줄 시각(10-15 14:20) 전에 그 주문을 고쳐 저장
    const re = probe("2026-10-16T09:30", { BILLING_STORE: dump });
    eq("⑦ 줄 시각 전에 고친 시드 주문 — 시드 줄을 버린다(거짓 '바뀜' 없음)", [re.C011[3], re.C011[4], re.C011[1] === re.C011[2]], [false, 0, true]);
  } finally { try { fs.unlinkSync(dump); } catch { /* 없으면 그만 */ } }
}

console.log(`billing: ${pass} passed, ${fail} failed`);
if (fail) { bad.forEach((b) => console.log("  x " + b)); process.exit(1); }
