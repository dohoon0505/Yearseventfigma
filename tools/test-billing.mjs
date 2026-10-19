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
  if (process.env.BILLING_ACT === "touch") store.updateClient({ ...client("C001") }); // 아무 쓰기 — 저장소가 생긴다
  const pick = (id) => { const s = so(id, LAST); return [s.status, s.amount, s.issuedAmount, s.changed, s.changeCount]; };
  /* 싱싱마켓(C009) — 상태 · 이력 시각 · 지난달분 / 두 달 전분의 [상태, 보류] (검토 3 — 어느 날 열어도 '정지' 로 굳지 않는다) */
  const c9 = client("C009");
  const hold = (ym) => { const s = so("C009", ym); return [s.status, s.autoAgreeHold || s.heldAtDeadline || s.notice.hold || null]; };
  const C009 = { st: c9.status, log: (c9.statusLog || []).map((l) => `${l.at} ${l.to}`), last: hold(LAST), prev: hold(PREV) };
  if (process.env.BILLING_DUMP) fs.writeFileSync(process.env.BILLING_DUMP, JSON.stringify(Object.fromEntries(localStorage._m)));
  console.log(JSON.stringify({ C001: pick("C001"), C011: pick("C011"), C019: pick("C019"), C009 }));
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

/* ══ ⑧ 정지 이력(statusLog) · 파생 보류 · 정산 안내 도달 · 기한 뒤 발급 (2026-10-19) ══════════════════
   보류(정지 중 마감 Q20 · 고지 미도달 Q19)와 T3·T4 를 '보냈다' 고 말하는 판정이 거래처 상태 이력에서 나온다. */
const fa = (d) => (d ? RULES.fmtAt(d) : null);
const nw = (s) => [s.notice.t3.why, s.notice.t4 && s.notice.t4.why, s.notice.resend && (s.notice.resend.reached ? "REACHED" : s.notice.resend.why), s.notice.hold];
{
  /* 시드 — 싱싱마켓(C009)은 holds 기록이 아니라 상태 이력에서 보류가 나온다(화면 결과는 예전 'CLIENT_SUSPENDED' 시드와 같다) */
  const c9 = client("C009");
  eq("⑧ 싱싱마켓 시드 이력 — 수정 마감 전날 16:00 정지 → 마감 다음 날 10:00 해제 · 지금 활성",
    [c9.status, (c9.statusLog || []).map((l) => [l.at, l.from, l.to])], ["활성", [["2026-10-08 16:00", "활성", "정지"], ["2026-10-11 10:00", "정지", "활성"]]]);
  const s9 = so("C009", LAST);
  eq("⑧ 싱싱마켓 9월 — 정지 중 마감 보류(파생) · 보류 기록은 없다", [s9.status, s9.autoAgreeHold, s9.heldAtDeadline, store.holdOf("C009", LAST)],
    ["AWAITING_AGREEMENT", "CLIENT_SUSPENDED", "CLIENT_SUSPENDED", null]);
  eq("⑧ 싱싱마켓 9월 — T3 나감 · T4·다시 보내기는 정지라 안 보냄", nw(s9), [null, "SUSPENDED", "SUSPENDED", "CLIENT_SUSPENDED"]);
  eq("⑧ 싱싱마켓 조치 필요(보류) 그대로", S.needsAction(s9), true);
  const s5 = so("C005", LAST);
  eq("⑧ 바다향 9월 — 발송 실패 기록 → T4·다시 보내기 닿지 않음 · 고지 미도달", [s5.autoAgreeHold, ...nw(s5)], ["NOTICE_UNDELIVERED", null, "UNDELIVERED", "UNDELIVERED", "NOTICE_UNDELIVERED"]);
  const s23 = so("C023", LAST);
  eq("⑧ 다솜물산 — 지난달 28일부터 정지 · 9월분 T3 부터 안 보냄 · 보류 이유는 약관이 먼저",
    [client("C023").status, client("C023").statusLog.length, s23.autoAgreeHold, ...nw(s23)], ["정지", 1, "TERMS_NOT_AGREED", "SUSPENDED", "SUSPENDED", "SUSPENDED", "CLIENT_SUSPENDED"]);
  eq("⑧ 온새미로 정산 담당 연락처 채움 — 알림 수신자 있음", [so("C026", LAST).noRecipient, store.getBillingContactOf("C026").phone], [false, "010-0000-0126"]);
  eq("⑧ 이력 없는 거래처 — 평소대로 닿음", nw(so("C011", LAST)), [null, null, null, null]);
}
{
  /* 소급 금지 — 오늘 정지해도 지난 달(이미 자동 동의·발급)은 그대로. 이번 달(발행 전)은 이대로면 T3 을 못 보낸다고 예측한다. */
  const before = so("C010", LAST);
  store.updateClient({ ...client("C010"), status: "정지" });
  const c = client("C010");
  eq("⑧ 상태를 바꾸면 이력 한 줄", c.statusLog.map((l) => [l.at, l.from, l.to]), [["2026-10-16 09:30", "활성", "정지"]]);
  const after = so("C010", LAST);
  eq("⑧ 정지해도 지난 달은 소급해 바뀌지 않는다", [after.status, after.mode, after.autoAgreeHold, after.notice.t4.why], [before.status, before.mode, null, null]);
  eq("⑧ 이번 달(발행 전) — 지금 정지면 T3 을 못 보낸다고 본다", so("C010", CUR).notice.t3.why, "SUSPENDED");
  /* 창이 들고 있던 낡은 사본(statusLog 없음 · 더 짧음)으로 써도 이력은 지워지지 않는다(admin-clients writeForm 과 같은 길) */
  const stale = { ...c };
  delete stale.statusLog;
  store.updateClient({ ...stale, ceoName: "임수빈(시험)" });
  eq("⑧ statusLog 없는 사본으로 저장 — 이력 유지", client("C010").statusLog.length, 1);
  store.updateClient({ ...c, statusLog: [], ceoName: "임수빈" });
  eq("⑧ 더 짧은 이력을 실은 사본 — 저장소 이력 유지", client("C010").statusLog.length, 1);
  store.updateClient({ ...client("C010"), status: "정지" });
  eq("⑧ 같은 상태로 다시 저장 — 줄이 생기지 않는다", client("C010").statusLog.length, 1);
  /* 상태 칸을 뺀 레코드 = 활성(앱 전체가 그렇게 읽는다 — updateClient 는 레코드를 통째로 바꾼다) → 정지 → 활성 줄 */
  const { status: _s, ...noStatus } = client("C010");
  store.updateClient(noStatus);
  /* 줄 시각 'HH:mm' 은 그 분의 끝이라(검토 5) 같은 분(09:30) 안의 statusAt 은 바뀌기 전 상태다 — 지금 상태는 그 분이 지난 뒤(09:31)로 본다 */
  const AFTER_MIN = D(2026, 10, 16, 9, 31);
  eq("⑧ 상태 칸이 빠진 레코드 — 활성으로 바꾼 것과 같다(줄이 남는다)", [client("C010").statusLog.length, client("C010").statusLog[1].to, RULES.statusAt(client("C010"), AFTER_MIN)], [2, "활성", "활성"]);
  store.updateClient({ ...client("C010"), status: "정지" });
  eq("⑧ 다시 정지 — 같은 분이어도 줄이 쌓이고 마지막 줄이 지금 상태(그 분이 지난 뒤)", [client("C010").statusLog.length, RULES.statusAt(client("C010"), AFTER_MIN), client("C010").status], [3, "정지", "정지"]);
  eq("⑧ 같은 분 안의 statusAt 은 바뀌기 전(분의 끝 규칙) — '지금 정지 중' 은 레코드 상태로 본다", RULES.statusAt(client("C010"), NOW), "활성");
  /* 이번 달 마감(11-10 13:00)까지 정지면 정지 중 마감 → 해제해도 그 달 보류는 남는다(마감 때 사실) */
  const atDl = so("C010", CUR, D(2026, 11, 10, 13, 30));
  eq("⑧ 정지 그대로 마감 — T3·T4 안 보냄 · 정지 중 마감", [atDl.autoAgreeHold, ...nw(atDl)], ["CLIENT_SUSPENDED", "SUSPENDED", "SUSPENDED", "SUSPENDED", "CLIENT_SUSPENDED"]);
  store.updateClient({ ...client("C010"), status: "활성" }, D(2026, 11, 12, 10));
  const re = so("C010", CUR, D(2026, 11, 12, 11));
  eq("⑧ 마감 뒤 해제 — 이력 네 줄 · 보류는 남는다", [client("C010").statusLog.length, re.autoAgreeHold, re.heldAtDeadline], [4, "CLIENT_SUSPENDED", "CLIENT_SUSPENDED"]);
  eq("⑧ 해제 뒤에도 지난 달은 그대로", so("C010", LAST).status, before.status);
}
{
  /* Q35 ③ 잠정 — 정지라 T4 를 못 보낸 달: 마감 당일 10:00 에 정지가 아니면 다시 보내 닿는다 → 평소대로 자동 동의 */
  store.updateClient({ ...client("C012"), status: "정지" }, D(2026, 11, 5, 9));
  store.updateClient({ ...client("C012"), status: "활성" }, D(2026, 11, 9, 15));
  const pre = so("C012", CUR, D(2026, 11, 9, 16));
  eq("⑧ 해제 뒤 · 다시 보내기 전 — T4 정지라 안 보냄 · 보류 예상 없음", [pre.status, pre.notice.t4.why, pre.notice.hold], ["AWAITING_AGREEMENT", "SUSPENDED", null]);
  const s = so("C012", CUR, D(2026, 11, 10, 13, 1));
  eq("⑧ 마감 당일 10:00 다시 보내 닿음 → 자동 동의", [s.mode, s.autoAgreeHold, nw(s)[2], fa(s.notice.resend.at)], ["auto", null, "REACHED", "2026-11-10 10:00"]);
  /* 다시 보내기(10:00) 뒤 · 마감(13:00) 전에 해제 — 그 시각엔 정지라 못 보냈다 → 고지 미도달 */
  store.updateClient({ ...client("C013"), status: "정지" }, D(2026, 11, 5, 9));
  store.updateClient({ ...client("C013"), status: "활성" }, D(2026, 11, 10, 11));
  const u = so("C013", CUR, D(2026, 11, 10, 13, 1));
  eq("⑧ 10:00 뒤 해제 — 다시 보내지 못함 · 마감 땐 활성 → 고지 미도달", [u.autoAgreeHold, ...nw(u)], ["NOTICE_UNDELIVERED", null, "SUSPENDED", "SUSPENDED", "NOTICE_UNDELIVERED"]);
  eq("⑧ 고지 미도달(파생)도 조치 필요", S.needsAction(u), true);
}
{
  /* 0원 달 — 발급 때부터 0원(새솔테크 9월)은 T3 이 없다(N20 ⓔ). 화면은 zero 로 가린다 — 판정 재료는 그대로 */
  const z = so("C020", LAST);
  eq("⑧ 발급 때부터 0원 — 화면이 T3 을 가릴 재료(zero · !zeroEdited · issuedAmount 0)", [z.zero, z.zeroEdited, z.issuedAmount], [true, false, 0]);
}
{
  /* 기한 뒤 발급(N01 · M39 · Q36 잠정) — 기한 초과가 된 시각 = max(정산기한 다음 날 10:00, 계산서 발급 시각) */
  const s4 = so("C004", LAST); // ⑥ 에서 10-16 09:30 에 다시 시도로 발급 — 기한 전 발급
  eq("⑧ 기한 전 발급 — overdueFrom = 정산기한 다음 날 10:00", [fa(s4.overdueFrom), fa(s4.overdueAt)], ["2026-11-01 10:00", "2026-11-01 10:00"]);
  eq("⑧ 기한 다음 날 — OVERDUE · 같은 시각부터", [so("C004", LAST, D(2026, 11, 2)).status, fa(so("C004", LAST, D(2026, 11, 2)).overdueFrom)], ["OVERDUE", "2026-11-01 10:00"]);
  eq("⑧ 계산서가 없는 달 — overdueFrom 없음", so("C011", LAST).overdueFrom, null);
  /* 한빛과학 8월(입금 시드 없음)을 '자동 발급 실패' 로 되돌려 지금(10-16) 다시 시도 — 정산기한(09-30) 다음 날 10:00(10-01) 뒤 발급 */
  const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
  raw.einvoiceFail.C001 = { ...(raw.einvoiceFail.C001 || {}), [PREV]: { detail: "[시험] 발급 실패" } };
  localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
  store.hydrate();
  eq("⑧ 발급 실패로 되돌린 8월 — AGREED(기한이 지나도 계산서 전이면 기한 초과가 아니다)", [so("C001", PREV).status, so("C001", PREV).overdueFrom], ["AGREED", null]);
  const r = S.issueEinvoiceFor(client("C001"), PREV, { mode: "retry" }, NOW);
  const s = so("C001", PREV);
  eq("⑧ 기한 뒤 다시 시도 — 발급 순간 기한 초과 · overdueFrom = 발급 시각", [r.mode, s.status, fa(s.overdueFrom), fa(s.overdueAt)], ["retry", "OVERDUE", "2026-10-16 09:30", "2026-10-01 10:00"]);
  eq("⑧ 방식 낱말 셋", [S.EINVOICE_MODE_WORD.auto, S.EINVOICE_MODE_WORD.retry, S.EINVOICE_MODE_WORD.manual, S.EINVOICE_MODE_WORD[s.einvoice.mode]], ["자동 발급", "다시 시도", "직접 입력", "다시 시도"]);
}
{
  /* 옛 저장본의 'CLIENT_SUSPENDED' 보류 기록 — holds 에서는 버리고(정지 중 마감은 statusLog 에서 파생 — 남기면 그 브라우저를 처음 연 달의
     보류가 따로 논다) **그 달**을 상태 이력 두 줄로 옮긴다(1차 후속 검증 — 그냥 버리면 시드 이력(지금 기준 달)이 들어와 보류가 다른 달로
     옮겨 갔다: 10-05 저장본의 입금 끝난 8월이 보류로 · 9월 보류는 사라짐). 일정은 싱싱마켓 시드와 같다(admin-mock suspendStoryLines). */
  const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
  raw.holds = { C005: { [LAST]: "NOTICE_UNDELIVERED" }, C012: { [PREV]: "CLIENT_SUSPENDED" }, C013: { [LAST]: "CLIENT_SUSPENDED" }, C015: { [PREV]: "CLIENT_SUSPENDED" } };
  /* statusLog 이전 코드의 레코드 — 이력 없음(위 시험들이 남긴 줄은 걷는다) · 한결 윤지아(C015)는 그 코드로 정지해 두었다 */
  const OLD = { C012: "활성", C013: "활성", C015: "정지" };
  raw.clients = raw.clients.map((c) => { if (!(c.id in OLD)) return c; const { statusLog: _l, ...r } = c; return { ...r, status: OLD[c.id] }; });
  localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
  store.hydrate();
  const lg = (id) => (client(id).statusLog || []).map((l) => [l.at, l.from, l.to]);
  eq("⑧ hydrate — 고지 미도달만 받는다", JSON.stringify(store.get().holds), JSON.stringify({ C005: { [LAST]: "NOTICE_UNDELIVERED" } }));
  eq("⑧ 옛 정지 보류(바른길 8월) — 그 달의 두 줄(수정 마감 18시간 전 정지 · 마감 21시간 뒤 해제) · 레코드는 활성 그대로",
    [client("C012").status, lg("C012")], ["활성", [["2026-09-08 16:00", "활성", "정지"], ["2026-09-11 10:00", "정지", "활성"]]]);
  eq("⑧ 바른길 — 그 달만 정지 중 마감 · 다음 달은 평소(자동 동의)", [so("C012", PREV).autoAgreeHold, so("C012", LAST).mode, so("C012", LAST).autoAgreeHold], ["CLIENT_SUSPENDED", "auto", null]);
  eq("⑧ 다온 9월 — 10-08 정지 · 10-11 해제 · 9월 보류 · 8월 평소",
    [lg("C013"), so("C013", LAST).autoAgreeHold, so("C013", PREV).mode], [[["2026-10-08 16:00", "활성", "정지"], ["2026-10-11 10:00", "정지", "활성"]], "CLIENT_SUSPENDED", "auto"]);
  eq("⑧ 지금 정지인 레코드(한결 윤지아 8월) — 두 줄 뒤 '지금 · 활성 → 정지' 로 사슬 끝을 저장된 상태에 맞춘다",
    lg("C015"), [["2026-09-08 16:00", "활성", "정지"], ["2026-09-11 10:00", "정지", "활성"], ["2026-10-16 09:30", "활성", "정지"]]);
  eq("⑧ 윤지아 — 8월 보류 · 9월 마감 때는 활성이었다(자동 동의)", [so("C015", PREV).autoAgreeHold, so("C015", LAST).mode], ["CLIENT_SUSPENDED", "auto"]);
  const saved = JSON.parse(localStorage.getItem("yeop.store.v5"));
  eq("⑧ 옮긴 이력은 바로 저장된다(옛 값과 함께 굳는다)", [(saved.clients.find((c) => c.id === "C013").statusLog || []).length, JSON.stringify(saved.holds).includes("CLIENT_SUSPENDED")], [2, false]);
  store.hydrate();
  eq("⑧ 다시 읽어도 같은 줄(시드 이력 · 지금 시각으로 다시 만들지 않는다)", [lg("C012").length, lg("C013").length, lg("C015").length, so("C013", LAST).autoAgreeHold], [2, 2, 3, "CLIENT_SUSPENDED"]);
  eq("⑧ hydrate — 상태 이력은 거래처 레코드와 함께 남는다", client("C010").statusLog.length, 4);
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

/* ══ ⑧ 취소 수수료 — 0원~주문 금액(명세 5.3 불변식 · 6.4 400 CANCEL_FEE_INVALID · 2026-10-04 2차 답 N22 ①) ══
   쓰기 함수는 막을 때도 저장 실패와 같은 거짓 값을 돌려준다(오류 객체는 truthy 라 고치지 않은 호출부가 성공으로 읽는다). */
{
  const B2C = await import(R + "data/b2c-mock.js");
  const over = B2C.cancelFeeError(50000, 50001);
  eq("⑧ 수수료 상한 초과 — 코드·상한·문구", [over.code, over.max, over.message], ["CANCEL_FEE_INVALID", 50000, "취소 수수료는 0원부터 주문금액(50,000원)까지 적을 수 있습니다"]);
  eq("⑧ 상한=금액·0원·빈값 받음", [B2C.cancelFeeError(50000, 50000), B2C.cancelFeeError(50000, 0), B2C.cancelFeeError(50000, "")], [null, null, null]);
  eq("⑧ 음수·소수·NaN 거부 · 0원 주문은 0원만", [!!B2C.cancelFeeError(5e4, -1), !!B2C.cancelFeeError(5e4, 1.5), !!B2C.cancelFeeError(5e4, "abc"), !!B2C.cancelFeeError(0, 1)], [true, true, true, true]);
  const ops = JSON.stringify(store.orderOps());
  eq("⑧ b2bCancel 초과 — false · 그대로", [B2B.b2bCancel("t2", { fee: order("t2").amount + 1 }), order("t2").status, JSON.stringify(store.orderOps()) === ops], [false, "주문접수", true]);
  eq("⑧ b2bCancel 상한=금액 — 취소", [B2B.b2bCancel("t2", { reason: "중복 주문", fee: order("t2").amount }), order("t2").status], [true, "취소"]);
  const t11 = order("t11"); // 취소 · 75,000 · 수수료 10,000
  eq("⑧ 취소 주문 금액 < 수수료 — null · 그대로", [B2B.b2bUpsert({ ...t11, amount: 1000 }), order("t11").amount], [null, 75000]);
  eq("⑧ 취소 주문 금액 = 수수료 — 저장", B2B.b2bUpsert({ ...t11, amount: 10000 })?.amount, 10000);
  eq("⑧ 금액·수수료 그대로인 저장은 보지 않음", B2C.orderFeeError({ amount: 5e4, cancelFee: 5e5, memo: "x" }, { amount: 5e4, cancelFee: 5e5 }), null);
  const b2 = B2C.b2cList().find((x) => x.id === "b2"), h = b2.history.length;
  eq("⑧ b2cCancel 초과 — false", B2C.b2cCancel("b2", { fee: 60001 }), false);
  eq("⑧ b2cCancel — 취소 이력 한 줄", [B2C.b2cCancel("b2", { reason: "중복 주문", fee: 10000 }), b2.status, b2.history.length - h, b2.history.at(-1).label], [true, "취소", 1, "주문취소 · 중복 주문 · 수수료 10,000원"]);
}

/* ══ ⑨ 정산 독립 검토(2026-10-19) 회귀 — 상태 이력 사슬 · 싱싱마켓 시드 · 직접 입력 기록 시각 · 분 단위 경계 · 보류 예측 · 순번 ══
   옛 저장본은 지금 저장소(JSON)를 고쳐 다시 hydrate 하는 수법(⑤·⑧과 같다)이고, 다른 날짜는 ⑦처럼 이 파일을 다시 띄운다. */
const SKEY = "yeop.store.v5";
const rawStore = () => JSON.parse(localStorage.getItem(SKEY));
const putStore = (raw) => { localStorage.setItem(SKEY, JSON.stringify(raw)); store.hydrate(); };
const noLog = (raw, id, status) => {
  raw.clients = raw.clients.map((c) => { if (c.id !== id) return c; const { statusLog: _l, ...r } = c; return { ...r, status }; });
  return raw;
};
{
  /* 검토 1 — statusLog 이전 코드로 '정지' 저장된 레코드(이력 없음): 예전엔 지난 모든 달이 소급해 '정지 중 마감' 으로 보류됐다(5~9월 PAID → 동의대기) */
  const YMS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const before = YMS.map((ym) => [so("C003", ym).status, so("C003", ym).mode]);
  putStore(noLog(rawStore(), "C003", "정지"));
  eq("⑨-1 이력 없는 정지 — 지난 다섯 달 그대로(자동 동의 · 발급 · 입금)", YMS.map((ym) => [so("C003", ym).status, so("C003", ym).mode]), before);
  eq("⑨-1 hydrate 가 한 줄 — 지금 · 활성 → 정지", (client("C003").statusLog || []).map((l) => [l.at, l.from, l.to]), [["2026-10-16 09:30", "활성", "정지"]]);
  eq("⑨-1 그 줄은 바로 저장된다(새로고침마다 시각이 밀리지 않게)", (rawStore().clients.find((c) => c.id === "C003").statusLog || []).length, 1);
  store.hydrate();
  eq("⑨-1 다시 읽어도 한 줄 · 이번 달(발행 전)은 지금 정지라 안내를 못 보낸다고 본다", [(client("C003").statusLog || []).length, so("C003", CUR).notice.t3.why], [1, "SUSPENDED"]);
  eq("⑨-1 활성 레코드에는 줄을 붙이지 않는다", "statusLog" in client("C002"), false);
}
{
  /* 검토 2 — 끊긴 사슬(옛 저장본을 10-09 12:00 에 열어 시드 줄 '활성 → 정지' 하나 + 저장 상태 '활성'): 10-20 에 정지하면 예전엔
     10-08~10-20 이 '정지' 로 읽혀 9월이 ISSUED(자동) → 동의대기 · 정지 중 마감으로 소급해 바뀌었다 */
  const raw = rawStore();
  raw.clients = raw.clients.map((c) => (c.id === "C014" ? { ...c, status: "활성", statusLog: [{ at: "2026-10-08 16:00", from: "활성", to: "정지" }] } : c));
  putStore(raw);
  const b = so("C014", LAST, D(2026, 10, 19, 10));
  eq("⑨-2 끊긴 사슬 — 9월 자동 동의 · 발급(마감 때 활성)", [b.status, b.mode, b.autoAgreeHold], ["ISSUED", "auto", null]);
  store.updateClient({ ...client("C014"), status: "정지" }, D(2026, 10, 20, 10));
  const a = so("C014", LAST, D(2026, 10, 20, 11));
  eq("⑨-2 10-20 정지 뒤에도 9월 그대로(소급 없음)", [a.status, a.mode, a.autoAgreeHold, a.heldAtDeadline, a.notice.t4.why], ["ISSUED", "auto", null, null, null]);
  /* 시드 백필 — 저장본에 이력이 없을 때 시드 이력은 사슬 끝이 저장 상태와 같을 때만 받는다 */
  putStore(noLog(rawStore(), "C009", "활성"));
  eq("⑨-2 옛 저장본(싱싱마켓 활성) — 시드 이력(정지 → 해제)을 받는다 · 9월 정지 중 마감", [(client("C009").statusLog || []).length, so("C009", LAST).autoAgreeHold], [2, "CLIENT_SUSPENDED"]);
  putStore(noLog(rawStore(), "C009", "정지"));
  eq("⑨-2 옛 저장본(싱싱마켓 정지) — 시드 사슬 끝(활성)과 달라 버리고 '지금부터 정지' 한 줄", (client("C009").statusLog || []).map((l) => [l.at, l.from, l.to]), [["2026-10-16 09:30", "활성", "정지"]]);
  eq("⑨-2 그때 지난 시각은 활성(statusLog 이전 코드와 같다) — 9월 자동 동의", so("C009", LAST).mode, "auto");
}
{
  /* 검토 3 — 싱싱마켓 시드는 어느 날 열어도 정지·해제 두 줄 + '활성'. 예전엔 8일 16:00 ~ 11일 10:00 에 열고 무엇이든 저장하면
     정지 한 줄과 '정지' 레코드가 저장값으로 굳었다(로그인 막힘 · 다음 달도 정지 중 마감). */
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const os = await import("node:os");
  const path = await import("node:path");
  const self = fileURLToPath(import.meta.url);
  const probe = (at, extra = {}) => JSON.parse(execFileSync(process.execPath, [self], {
    env: { ...process.env, BILLING_PROBE: at, ...extra }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim().split("\n").pop()).C009;
  /* 해제 줄 '10-11 10:00' 은 그 분의 끝이라 10:01 부터 지난달분 이야기다 — 그 전에는 두 달 전분(8월분)에 같은 이야기가 있다 */
  [["2026-10-07T12:00", "prev"], ["2026-10-08T16:30", "prev"], ["2026-10-09T12:00", "prev"], ["2026-10-10T11:00", "prev"],
    ["2026-10-11T10:00", "prev"], ["2026-10-11T10:01", "last"], ["2026-10-12T09:00", "last"]].forEach(([at, which]) => {
    const r = probe(at);
    const held = which === "last" ? r.last[1] : r.prev[1];
    const other = which === "last" ? r.prev[1] : r.last[1];
    eq(`⑨-3 ${at} — 활성 · 두 줄 · ${which === "last" ? "지난달분" : "두 달 전분"} 정지 중 마감 · 다른 달은 평소`,
      [r.st, r.log.length, r.log[1] && r.log[1].endsWith("활성"), held, other], ["활성", 2, true, "CLIENT_SUSPENDED", null]);
  });
  const dump = path.join(os.tmpdir(), `test-billing-c9-${process.pid}.json`);
  try {
    probe("2026-10-09T12:00", { BILLING_ACT: "touch", BILLING_DUMP: dump }); // 예전 시드 창 안에서 저장소를 만든다
    const a = probe("2026-10-19T10:00", { BILLING_STORE: dump });
    const b = probe("2026-11-19T10:00", { BILLING_STORE: dump });
    eq("⑨-3 10-09 12:00 에 저장한 브라우저를 10-19 · 11-19 에 다시 열어도 활성(정지로 굳지 않는다)", [a.st, b.st, a.log.length], ["활성", "활성", 2]);
  } finally { try { fs.unlinkSync(dump); } catch { /* 없으면 그만 */ } }
  /* 1차 후속 — statusLog 이전 코드(HEAD)로 저장한 브라우저: 싱싱마켓은 '활성' · 이력 없음 · holds 에 그 브라우저가 처음 저장한 날의 지난달분
     'CLIENT_SUSPENDED'. 예전 고침은 그 값을 버리고 **지금** 기준 시드 이력을 받아 보류가 다른 달로 옮겨 갔다(실측 — 10-05 저장본을 13:00 에
     열면 입금까지 끝난 8월이 '정지 중 마감' · 09-20 저장본을 10-19 에 열면 8월이 자동 동의로 거슬러 올라가 기한 초과 · 9월 발급완료가 보류). */
  const oldStore = (ym, dropPay, status = "활성") => {
    const raw = noLog(rawStore(), "C009", status);
    raw.holds = { ...raw.holds, C009: { [ym]: "CLIENT_SUSPENDED" } };
    if (dropPay && raw.payments.C009) delete raw.payments.C009[dropPay]; // 그 브라우저에서는 보류 달이라 입금 기록이 없었다
    return { "yeop.store.v5": JSON.stringify(raw) };
  };
  const fA = path.join(os.tmpdir(), `test-billing-old-a-${process.pid}.json`);
  const fA2 = path.join(os.tmpdir(), `test-billing-old-a2-${process.pid}.json`);
  const fB = path.join(os.tmpdir(), `test-billing-old-b-${process.pid}.json`);
  const fC = path.join(os.tmpdir(), `test-billing-old-c-${process.pid}.json`);
  try {
    fs.writeFileSync(fA, JSON.stringify(oldStore(LAST)));
    const a = probe("2026-10-05T13:00", { BILLING_STORE: fA, BILLING_DUMP: fA2 });
    eq("⑨-10 10-05 저장본을 13:00 에 — 9월분 두 줄(10-08 정지 · 10-11 해제) · 활성 · 8월 입금완료 그대로 · 9월은 보류가 잡힐 달",
      [a.st, a.log, a.prev, a.last], ["활성", ["2026-10-08 16:00 정지", "2026-10-11 10:00 활성"], ["PAID", null], ["AWAITING_AGREEMENT", "CLIENT_SUSPENDED"]]);
    const a2 = probe("2026-10-12T09:00", { BILLING_STORE: fA2 });
    eq("⑨-10 그 브라우저를 10-12 에 — 같은 두 줄(밀리지 않는다) · 9월 정지 중 마감 · 8월 그대로", [a2.log, a2.prev, a2.last],
      [["2026-10-08 16:00 정지", "2026-10-11 10:00 활성"], ["PAID", null], ["AWAITING_AGREEMENT", "CLIENT_SUSPENDED"]]);
    fs.writeFileSync(fB, JSON.stringify(oldStore(PREV, PREV)));
    const b = probe("2026-10-19T10:00", { BILLING_STORE: fB });
    eq("⑨-10 09-20 저장본(8월분 보류)을 10-19 에 — 8월 그대로 보류 · 9월 자동 동의 · 발급(시드 이력의 9월 이야기를 받지 않는다)",
      [b.st, b.log, b.prev, b.last], ["활성", ["2026-09-08 16:00 정지", "2026-09-11 10:00 활성"], ["AWAITING_AGREEMENT", "CLIENT_SUSPENDED"], ["ISSUED", null]]);
    fs.writeFileSync(fC, JSON.stringify(oldStore(LAST, null, "정지")));
    const c = probe("2026-10-05T13:00", { BILLING_STORE: fC });
    eq("⑨-10 지금 정지인 옛 레코드 · 그 달 줄이 아직 오지 않음 — 미래 줄은 넣지 않고 '지금 · 활성 → 정지' 한 줄(사슬 끝 = 저장된 상태) · 8월 그대로",
      [c.st, c.log, c.prev], ["정지", ["2026-10-05 13:00 정지"], ["PAID", null]]);
  } finally { [fA, fA2, fB, fC].forEach((f) => { try { fs.unlinkSync(f); } catch { /* 없으면 그만 */ } }); }
}
{
  /* 검토 4 — 직접 입력 계산서는 적은 발급 시각(at)과 기록한 시각(recordedAt)이 다르다. 기한 초과는 기록한 순간부터(M39 — T8 은
     발급이 기록된 직후로 미뤄진다). 예전엔 적은 시각을 써서 '10월 1일 10:00부터 기한 초과 · 18일 지남' 이었다(그 시각엔 계산서가 없었다). */
  const raw = rawStore();
  const failAt = (id, ym) => { raw.einvoiceFail[id] = { ...(raw.einvoiceFail[id] || {}), [ym]: { detail: "[시험] 발급 실패" } }; if (raw.payments[id]) delete raw.payments[id][ym]; };
  failAt("C006", PREV); failAt("C017", PREV); failAt("C007", LAST);
  if (raw.payments.C018) delete raw.payments.C018[PREV];
  raw.einvoice.C018 = { ...(raw.einvoice.C018 || {}), [PREV]: { no: "20261005-41000002-12345678", at: "2026-10-05 10:00", mode: "manual" } }; // 옛 기록(recordedAt 없음)
  putStore(raw);
  eq("⑨-4 C006 8월 — 발급 실패로 AGREED", so("C006", PREV).status, "AGREED");
  const r = S.issueEinvoiceFor(client("C006"), PREV, { mode: "manual", no: "20260925-41000001-12345678", at: "2026-09-25 14:00" }, NOW);
  const s = so("C006", PREV);
  eq("⑨-4 직접 입력 — 기록 시각을 남긴다(적은 시각과 따로)", [r.at, r.recordedAt, fa(s.einvoice.at), fa(s.einvoice.recordedAt)], ["2026-09-25 14:00", "2026-10-16 09:30", "2026-09-25 14:00", "2026-10-16 09:30"]);
  eq("⑨-4 정산기한 전 시각을 기한 뒤에 기록 — 기한 초과는 기록한 순간부터 · 까닭 'record'", [s.status, fa(s.overdueFrom), S.overdueLateOf(s), S.OVERDUE_LATE_WORD.record],
    ["OVERDUE", "2026-10-16 09:30", "record", "직접 입력을 정산기한 뒤에 기록해 기록한 순간부터"]);
  eq("⑨-4 저장본에도 recordedAt", rawStore().einvoice.C006[PREV].recordedAt, "2026-10-16 09:30");
  S.issueEinvoiceFor(client("C017"), PREV, { mode: "manual", no: "20261005-41000003-12345678", at: "2026-10-05 10:00" }, NOW);
  const s17 = so("C017", PREV);
  eq("⑨-4 정산기한 뒤 시각(10-05)을 적어도 기록한 순간(10-16)부터", [fa(s17.overdueFrom), S.overdueLateOf(s17)], ["2026-10-16 09:30", "record"]);
  S.issueEinvoiceFor(client("C007"), LAST, { mode: "manual", no: "20261012-41000004-12345678", at: "2026-10-12 10:00" }, NOW);
  const s7 = so("C007", LAST);
  eq("⑨-4 정산기한 전에 기록 — 규칙상 시각 그대로 · 까닭 없음", [s7.status, fa(s7.overdueFrom), S.overdueLateOf(s7)], ["ISSUED", "2026-11-01 10:00", null]);
  const s18 = so("C018", PREV);
  eq("⑨-4 옛 직접 입력 기록(recordedAt 없음) — 적은 시각으로", [s18.status, fa(s18.overdueFrom), S.overdueLateOf(s18)], ["OVERDUE", "2026-10-05 10:00", "issue"]);
  eq("⑨-4 다시 시도로 기한 뒤 발급(C001 8월 · ⑧) — 까닭 'issue'", S.overdueLateOf(so("C001", PREV)), "issue");
}
{
  /* 검토 5 — 분 단위 기록: 13:00:40 정지는 '13:00' 으로 남지만 13:00:00 마감 뒤다(예전엔 자동 동의된 10월을 정지 중 마감으로 뒤집었다) */
  store.updateClient({ ...client("C016"), status: "정지" }, new Date(2026, 10, 10, 13, 0, 40));
  const s = so("C016", CUR, D(2026, 11, 10, 13, 5));
  eq("⑨-5 마감 40초 뒤 정지 — 기록 '13:00' · 10월은 자동 동의 그대로", [client("C016").statusLog.at(-1).at, s.mode, s.autoAgreeHold, s.heldAtDeadline], ["2026-11-10 13:00", "auto", null, null]);
  eq("⑨-5 그 1분 안의 statusAt 은 아직 활성 · 레코드는 정지", [RULES.statusAt(client("C016"), new Date(2026, 10, 10, 13, 0, 50)), client("C016").status], ["활성", "정지"]);
  store.updateClient({ ...client("C017"), status: "정지" }, new Date(2026, 10, 10, 12, 59, 30));
  const s2 = so("C017", CUR, D(2026, 11, 10, 13, 5));
  eq("⑨-5 마감 30초 전(12:59:30) 정지 — 정지 중 마감", [s2.mode, s2.autoAgreeHold], [null, "CLIENT_SUSPENDED"]);
  store.updateClient({ ...client("C018"), status: "정지" }, new Date(2026, 10, 9, 10, 0, 20));
  const s3 = so("C018", CUR, D(2026, 11, 9, 11));
  eq("⑨-5 수정 마감과 같은 분(10:00:20) 정지 — T4 는 이미 나갔다 · 다시 보낼 일 없음", [s3.notice.t4.why, s3.notice.resend], [null, null]);
}
{
  /* 검토 9 — 보류 예측(holdPendingOf): 관리자 정산회계 · 포털 거래명세서 · 포털 정산회계가 같은 판정으로 '자동 동의됩니다' 를 피한다 */
  eq("⑨-9 바다향 9월 — 마감 전(10-10 11:00)이면 보류가 잡힐 달", S.holdPendingOf(so("C005", LAST, D(2026, 10, 10, 11))), true);
  eq("⑨-9 평소 달은 아님", S.holdPendingOf(so("C011", LAST)), false);
  eq("⑨-9 마감이 지나 보류가 선 달은 예측이 아니다(autoAgreeHold 가 말한다)", [S.holdPendingOf(so("C005", LAST)), so("C005", LAST).autoAgreeHold], [false, "NOTICE_UNDELIVERED"]);
}
{
  /* 검토 12 — 순번(ct/pf)은 저장된 원본에서 먼저 잰다. 예전엔 id 없는 옛 줄에 매긴 새 id 가 뒤 버킷의 저장 id 와 겹칠 수 있었다. */
  const ST = await import(R + "store.js");
  const nextCt = Number(ST.newContactId().slice(2)) + 1;
  const nextPf = Number(ST.newProfileId().slice(2)) + 1;
  const raw = rawStore();
  raw.contactsByClient.C002 = [{ name: "아이디 없는 옛 줄", role: "", phone: "010-0000-0999", message: "", isBilling: false }, ...raw.contactsByClient.C002];
  raw.contactsByClient.C004 = [...raw.contactsByClient.C004, { id: `ct${nextCt}`, name: "저장된 id", role: "", phone: "010-0000-0998", message: "", isBilling: false }];
  raw.profilesByClient.C001 = [{ no: "00", name: "아이디 없는 옛 명의", role: "", phone: "010-0000-0997", greeting: "옛 명의" }, ...raw.profilesByClient.C001];
  raw.profilesByClient.C002 = [{ id: `pf${nextPf}`, no: "01", name: "저장된 명의", role: "", phone: "010-0000-0996", greeting: "저장된 명의" }];
  putStore(raw);
  const cts = Object.values(store.get().contactsByClient).flat().map((c) => c.id);
  const pfs = Object.values(store.get().profilesByClient).flat().map((p) => p.id);
  eq("⑨-12 담당자 — 새 id 가 저장된 id 와 겹치지 않는다", [new Set(cts).size === cts.length, store.contactsOf("C002")[0].id !== `ct${nextCt}`], [true, true]);
  eq("⑨-12 발송 프로필 — 새 id 가 저장된 id 와 겹치지 않는다", [new Set(pfs).size === pfs.length, store.profilesOf("C001")[0].id !== `pf${nextPf}`], [true, true]);
}
{
  /* 1차 후속(참고) — 정산담당이 없는 옛 버킷에서 자동으로 올릴 사람은 **담당자 연락처 기준**(contactPhoneOk — 결정 ⓔ '010 이면 11자리')으로
     고른다. 예전 phoneOk(10자리 이상)는 담당자 창이 받지 않는 010-123-4567 을 정산담당으로 올렸다. */
  const raw = rawStore();
  raw.contactsByClient.C019 = [
    { id: "ct-old-1", name: "끝자리 빠진 번호", role: "", phone: "010-123-4567", message: "", isBilling: false },
    { id: "ct-old-2", name: "맞는 번호", role: "", phone: "010-1234-5678", message: "", isBilling: false },
  ];
  putStore(raw);
  eq("⑨-13 정산담당 자동 지정 — 담당자 연락처 기준에 맞는 첫 사람", store.contactsOf("C019").filter((c) => c.isBilling).map((c) => c.name), ["맞는 번호"]);
  const raw2 = rawStore();
  raw2.contactsByClient.C019 = [{ id: "ct-old-3", name: "번호 없음", role: "", phone: "", message: "", isBilling: false }, { id: "ct-old-4", name: "02 열 자리", role: "", phone: "02-1234-5678", message: "", isBilling: false }];
  putStore(raw2);
  eq("⑨-13 010 이 아닌 10자리는 받는다", store.contactsOf("C019").filter((c) => c.isBilling).map((c) => c.name), ["02 열 자리"]);
  const raw3 = rawStore();
  raw3.contactsByClient.C019 = [{ id: "ct-old-5", name: "첫 사람", role: "", phone: "010-123-4567", message: "", isBilling: false }, { id: "ct-old-6", name: "둘째", role: "", phone: "", message: "", isBilling: false }];
  putStore(raw3);
  eq("⑨-13 아무도 맞지 않으면 첫 사람(옛 데이터 — 불변식 '정산담당 1명' 이 먼저)", store.contactsOf("C019").filter((c) => c.isBilling).map((c) => c.name), ["첫 사람"]);
}

/* ══ ⑩ 담당자 연락처 기준(2026-10-19 사용자 결정 ⓔ '010 이면 11자리로') · 취소 수수료 규칙 자리(data/order-rules.js · import 0) ══ */
{
  const PH = await import(R + "util/phone.js");
  const ok = (v) => PH.contactPhoneOk(v);
  eq("⑩ 010 — 10자리 거부 · 11자리 받음 · 12자리 거부", [ok("010-1234-567"), ok("010-1234-5678"), ok("010-1234-56789")], [false, true, false]);
  eq("⑩ 02 — 9자리 거부 · 10자리 받음", [ok("02-123-4567"), ok("02-1234-5678"), ok("0212345678")], [false, true, true]);
  eq("⑩ 그 밖 — 10·11·12자리 받음 · 13자리 거부", [ok("031-123-4567"), ok("031-1234-5678"), ok("0505-1234-5678"), ok("0101234567890"), ok("1234567890123")], [true, true, true, false, false]);
  eq("⑩ 공백·하이픈은 빼고 센다 · 앞뒤 공백 받음", [ok("010 1234 5678"), ok(" 010-1234-5678 "), ok("01012345678")], [true, true, true]);
  eq("⑩ 빈 값·글자 섞임 거부", [ok(""), ok(null), ok("abc"), ok("010-1234-5678 내선"), ok("+82-10-1234-5678")], [false, false, false, false, false]);
  eq("⑩ 모자란 것 한 마디", [PH.contactPhoneNeed("010-1234-567"), PH.contactPhoneNeed("02-123-4567"), PH.contactPhoneNeed("010x")], ["010 번호는 숫자 11자리", "숫자 10~12자리, 010 번호는 11자리", "숫자와 하이픈만"]);
  eq("⑩ 받는분 기준(phoneOk)은 그대로 — 010 10자리 받음 · 9자리 거부", [PH.phoneOk("010-1234-567"), PH.phoneOk("02-123-4567")], [true, false]);
  /* 담당자 칸 정형(fmtContactPhone)은 자르지 않는다 — 12자리(0505-…)가 11자리 다른 번호로 잘려 저장되던 결함(2026-10-19 1차 후속) */
  const F = PH.fmtContactPhone;
  eq("⑩ 담당자 칸 정형 — 12자리를 자르지 않는다", [F("050512345678"), F("010123456789"), F("0505123456789")], ["0505-1234-5678", "010-1234-56789", "0505-1234-56789"]);
  eq("⑩ 담당자 칸 정형 — 02·3자리 지역번호 자리", [F("0212345678"), F("021234567"), F("0311234567"), F("03112345678"), F("0111234567")], ["02-1234-5678", "02-123-4567", "031-123-4567", "031-1234-5678", "011-123-4567"]);
  eq("⑩ 담당자 칸 정형 — 010 은 11자리까지 fmtPhone 과 한 글자도 다르지 않다", [...Array(12).keys()].every((n) => F("01012345678".slice(0, n)) === PH.fmtPhone("01012345678".slice(0, n))), true);
  eq("⑩ 담당자 칸 정형 — 숫자를 잃지 않는다(0~16자리)", ["010", "02", "0505", "031"].every((p) => [...Array(17).keys()].every((n) => { const s = (p + "98765432109876543").slice(0, n); return F(s).replace(/\D/g, "") === s; })), true);
  eq("⑩ 받는분 칸 정형(fmtPhone)은 그대로 11자리", PH.fmtPhone("050512345678"), "050-5123-4567");
  eq("⑩ 숫자가 많은가 — 010 은 11 초과 · 그 밖 12 초과", [PH.contactPhoneLong("010-1234-56789"), PH.contactPhoneLong("010-1234-5678"), PH.contactPhoneLong("0505-1234-5678"), PH.contactPhoneLong("0505-1234-56789"), PH.contactPhoneLong("010-1234-567")], [true, false, false, true, false]);
  /* 2차 후속 — 담당자 칸 정형은 숫자 밖의 글자를 지우지 않는다(지우면 맞는 모양의 다른 번호: '+82-10-1234-5678' → 821-0123-45678 이
     12자리라 기준을 지나 정산 담당 번호로 저장됐다 · '031-123-4567 내선 1' → 031-1234-5671). 그래서 정형이 판정을 바꾸지 않는다. */
  const ODD = ["+82-10-1234-5678", "+82 10 1234 5678", "031-123-4567 내선 1", "02-123-4567 내선 89", "010.1234.5678", "(02)1234-5678", "010-1234-5678 내선", "010ㅇ"];
  eq("⑩ 담당자 칸 정형 — 숫자 밖의 글자가 섞이면 그대로 둔다", ODD.map(F), ODD);
  eq("⑩ 그런 값은 받지 않고 이유는 '숫자와 하이픈만'", [ODD.map(ok).some(Boolean), ODD.every((v) => PH.contactPhoneNeed(v) === "숫자와 하이픈만"), ODD.every(PH.contactPhoneOdd)], [false, true, true]);
  const ANY = [...ODD, "", " ", "010", "010-1234-567", "01012345678", " 010 1234 5678 ", "0505-1234-5678", "0212345678", "021234567", "010123456789", "0101234567890", "02-1234-5678-", "--010--1234--5678"];
  eq("⑩ 정형은 판정을 바꾸지 않는다 — contactPhoneOk(F(v)) === contactPhoneOk(v)", ANY.filter((v) => ok(F(v)) !== ok(v)), []);
  eq("⑩ 숫자·하이픈·공백만이면 예전처럼 정형", [F(" 010 1234 5678 "), F("02 1234 5678"), F("--010--1234--5678")], ["010-1234-5678", "02-1234-5678", "010-1234-5678"]);
  eq("⑩ 받는분 칸 정형(fmtPhone)은 그대로 — 글자를 지운다", PH.fmtPhone("+82-10-1234-5678"), "821-0123-4567");
  const OR = await import(R + "data/order-rules.js");
  const B2C2 = await import(R + "data/b2c-mock.js");
  eq("⑩ 수수료 규칙은 order-rules 하나 — b2c-mock 은 재수출만", [B2C2.cancelFeeError === OR.cancelFeeError, B2C2.orderFeeError === OR.orderFeeError, B2C2.CANCEL_FEE_INVALID], [true, true, "CANCEL_FEE_INVALID"]);
  const src = (f) => fs.readFileSync(new URL(R + f), "utf8");
  eq("⑩ order-rules.js 는 import 0", /^\s*import\s/m.test(src("data/order-rules.js")), false);
  eq("⑩ b2b-mock 은 b2c-mock 을 import 하지 않는다", /from\s+["']\.\/b2c-mock\.js["']/.test(src("data/b2b-mock.js")), false);
}

console.log(`billing: ${pass} passed, ${fail} failed`);
if (fail) { bad.forEach((b) => console.log("  x " + b)); process.exit(1); }
