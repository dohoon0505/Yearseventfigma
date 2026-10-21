/* ============================================================
   test-billing.mjs — 정산 금액 변경 기록 · 발급 때 금액 · 0원 규칙 · 저장 전 판정 회귀 테스트
   실행:  node tools/test-billing.mjs   (의존성 없음 · 실패하면 exit 1)

   2026-10-16 2차 시안(S-01~S-06) 공통 기반 — DATA.md 1~3절. 시계는 **2026-10-16 09:30(Asia/Seoul)** 에 못박고,
   저장소는 메모리 대역이다(setItem 을 일부러 실패시켜 '저장 공간 부족' 도 본다). 모듈은 시계를 건 **뒤에** 불러온다 —
   목데이터 기준 시각(DATA_NOW)이 import 순간의 new Date() 라서다.
   다루는 것:
     ① data/billing-entries — 주문 한 건의 기여 · 저장 전후 차이 · 원인(8가지 경우)
     ② 시드 예시 A~G — issuedAmount · changed · zeroEdited · zeroCloseAt · docStamp · termsWatchOf · 수수료 줄 순서
     ③ settlementImpactOf — 확인 창 달 · 잠긴 달 · 발행 시각이 지난 거래 없는 달로 들어오는 주문 막기(사용자 답 3)
     ④ agreeSettlement — 금액 불일치를 먼저 본다 · 저장 실패
     ⑤ b2b-mock 쓰기 — 변경 기록 줄 · 사유 · 처리자 · 저장 실패 때 주문과 기록을 함께 되돌림 · hydrate
     ⑥ 계산서 다시 시도 · 입금 확인의 처리자와 저장 실패 · 문서 빌더(동의 전 표기 · 수수료 줄) · 공개 링크 레코드
     ⑧ 2026-10-22 운영자 결정 — '정지' 장치 걷어내기(고지 미도달은 그대로) · 0원 주문만 있는 달 = NONE · 탈퇴 거래처 · 옛 저장본
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
  if (process.env.BILLING_ACT === "withdraw") store.updateClient({ ...client("C019"), status: "탈퇴" }); // 화면의 탈퇴 처리와 같은 쓰기
  if (process.env.BILLING_ACT === "noC028") { // C028 이 생기기 전에 저장한 옛 브라우저 — 저장소 목록에 그 거래처가 없다
    const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
    raw.clients = raw.clients.filter((c) => c.id !== "C028");
    localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
    store.hydrate();
  }
  const pick = (id) => { const s = so(id, LAST); return [s.status, s.amount, s.issuedAmount, s.changed, s.changeCount]; };
  /* 탈퇴 거래처 — 상태 · 탈퇴한 달부터의 주문 수 · 그 전 주문 수 · 끝나지 않은 정산 달(PAID·NONE 이 아닌 달) · 마지막 입금이 탈퇴 전인가 */
  const AM = await import(R + "data/admin-mock.js");
  const wd = (id) => {
    const c = client(id) || AM.INITIAL_CLIENTS.find((x) => x.id === id); // 저장소에 없는 시드 거래처(옛 브라우저)는 시드 레코드로
    const w = String(c.withdrawnAt || "").slice(0, 7);
    const os = B2B.b2bList().filter((o) => o.clientId === id);
    const ymOf = (o) => String(o.deliverAt).slice(0, 7);
    const yms = [...new Set(os.flatMap((o) => BE.entriesOfOrder(o).map((e) => e.ym)))].sort();
    const pays = Object.values(store.get().payments[id] || {}).map((p) => p.at).sort();
    return {
      st: c.status, after: os.filter((o) => ymOf(o) >= w).length, before: os.filter((o) => ymOf(o) < w).length,
      open: client(id) ? yms.filter((ym) => !["PAID", "NONE"].includes(so(id, ym).status)) : null, paidBefore: !pays.length || pays[pays.length - 1] < c.withdrawnAt,
    };
  };
  if (process.env.BILLING_DUMP) fs.writeFileSync(process.env.BILLING_DUMP, JSON.stringify(Object.fromEntries(localStorage._m)));
  console.log(JSON.stringify({ C001: pick("C001"), C011: pick("C011"), C019: pick("C019"), W: { C028: wd("C028"), C019: wd("C019") } }));
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
  eq("D 고쳐서 0원 · 1일 그룹 — 마감에 닫힘(줄이 남아 empty 아님)", [s.status, s.empty, s.zeroEdited, s.amount, s.issuedAmount, s.count], ["PAID", false, true, 0, 60000, 1]);
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
  const s = so("C020", LAST); // F — 2026-10-22 결정 B: 0원 주문만 있는 달은 내역서가 없다(거래 없는 달 NONE · 자세히는 ⑧)
  eq("F 처음부터 0원 — 내역서 없음(NONE) · 줄 없음 · 닫힌 시각 없음", [s.status, s.empty, s.zeroEdited, s.changeCount, s.issuedAmount, s.zeroCloseAt], ["NONE", true, false, 0, null, null]);
  const w = S.termsWatchOf(client("C020"), NOW);
  eq("F 약관 전 거래처 — 0원 달은 명세서로 세지 않아 이번 달분이 첫 명세서", [w.firstZero, w.held.length, w.next && w.next.ym, w.next && w.next.first], [null, 0, CUR, true]);
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

/* ══ ⑧ '정지' 장치 걷어내기 · 고지 미도달 · 0원 주문만 있는 달 · 탈퇴 · 기한 뒤 발급 (2026-10-22 운영자 결정 A·B) ══════════════════
   A — 거래처 상태는 활성 · 승인대기 · 반려 · 탈퇴. '정지' 와 그 장치(statusLog · 정지 중 T3·T4 빼기 · 정지 중 마감 보류)는 없다.
       고지 미도달(발송 실패 — 바다향 C005 시드)의 마감 당일 다시 보내기와 보류는 남는다.
   B — 0원 주문만 있는 달은 내역서를 내지 않는다(거래 없는 달 NONE 과 같다). 발급 뒤 고쳐서 0원은 그대로. */
const fa = (d) => (d ? RULES.fmtAt(d) : null);
const nw = (s) => [s.notice.t3.why, s.notice.t4 && s.notice.t4.why, s.notice.resend && (s.notice.resend.reached ? "REACHED" : s.notice.resend.why), s.notice.hold];
{
  /* 예전 '정지' 시드 둘 — 싱싱마켓(C009 · 정지·해제 이야기)과 다솜물산(C023 · 정지) — 은 평소 거래처가 됐다 */
  const c9 = client("C009");
  eq("⑧ 싱싱마켓 — 활성 · 상태 이력 칸 없음", [c9.status, "statusLog" in c9], ["활성", false]);
  const s9 = so("C009", LAST);
  eq("⑧ 싱싱마켓 9월 — 평소처럼 마감에 자동 동의 · 발급(보류 없음)", [s9.status, s9.mode, s9.autoAgreeHold, s9.heldAtDeadline], ["ISSUED", "auto", null, null]);
  eq("⑧ 싱싱마켓 9월 — T3·T4 닿음 · 다시 보낼 일 없음", nw(s9), [null, null, null, null]);
  const c23 = client("C023");
  const s23 = so("C023", LAST);
  eq("⑧ 다솜물산 — 활성(약관 동의 전은 그대로) · 9월분 T3·T4 나감 · 보류 이유는 약관",
    [c23.status, "statusLog" in c23, s23.autoAgreeHold, ...nw(s23)], ["활성", false, "TERMS_NOT_AGREED", null, null, null, null]);
  eq("⑧ 다솜물산 — 약관 경고는 남는다(마감 지난 달)", S.termsWatchOf(c23, NOW).held.length, 1);
  /* 고지 미도달은 남는다(Q19 잠정 — 정지와 상관없다) */
  const s5 = so("C005", LAST);
  eq("⑧ 바다향 9월 — 발송 실패 기록 → T4·다시 보내기 닿지 않음 · 고지 미도달 보류(그대로)", [s5.autoAgreeHold, ...nw(s5)], ["NOTICE_UNDELIVERED", null, "UNDELIVERED", "UNDELIVERED", "NOTICE_UNDELIVERED"]);
  eq("⑧ 바다향 9월 — 다시 보내기 = 마감 당일 10:00 · 조치 필요", [fa(s5.notice.resend.at), S.needsAction(s5)], ["2026-10-10 10:00", true]);
  eq("⑧ 바다향 9월 — 마감 전(10-10 11:00)엔 보류가 잡힐 달(예측)", S.holdPendingOf(so("C005", LAST, D(2026, 10, 10, 11))), true);
  eq("⑧ 온새미로 정산 담당 연락처 채움 — 알림 수신자 있음", [so("C026", LAST).noRecipient, store.getBillingContactOf("C026").phone], [false, "010-0000-0126"]);
  eq("⑧ 아무 거래처 — 평소대로 닿음", nw(so("C011", LAST)), [null, null, null, null]);
  eq("⑧ 안내 도달에 '정지 중 마감' 칸이 없다", "suspendedAtDeadline" in so("C011", LAST).notice, false);
}
{
  /* B — 0원 주문만 있는 달(가입 혜택 '1회 무료')은 내역서가 없다: 고이메모리얼(C007) 3달 전 · 새솔테크(C020) 지난달(F) */
  const ZM = "2026-07";
  const z = so("C007", ZM);
  eq("⑧ 0원 주문만 있는 달 — NONE · 내역서 없음(발급 때 금액 없음 · 동의·계산서·입금 칸 비움)",
    [z.status, z.empty, z.zeroEdited, z.amount, z.count, z.issuedAmount, z.mode, z.einvoice, z.paidAt], ["NONE", true, false, 0, 2, null, null, null, null]);
  eq("⑧ 0원 달 — '0원' 칸은 없어졌다(zero) · 닫힌 시각 없음 · 잠금 없음", ["zero" in z, z.zeroCloseAt, z.editable, z.lockReason], [false, null, true, null]);
  eq("⑧ 0원 달 — 미입금·조치 필요·정산 진행 아님", [S.isUnpaid(z), S.needsAction(z), S.inSettlementFlow(z)], [false, false, false]);
  eq("⑧ 0원 달 — 문서 '계산서 발행' 칸 = 거래 없는 달과 같은 '해당 없음'", S.invoiceDocNoteOf(z), LINKS.INVOICE_NOTE.none);
  const row = S.settlementsFor(client("C007"), NOW).find((r) => r.ym === ZM);
  eq("⑧ 0원 달 — 옛 문자열 칸 '거래없음'(리포트·대쉬보드)", [row.거래명세서동의, row.계산서발급, row.입금완료], ["거래없음", "거래없음", "거래없음"]);
  const doc = invoiceDocData(client("C007"), ZM, NOW);
  eq("⑧ 0원 달 문서 — 거래 없는 달 모양(줄 없음 · 발행일 '-')", [doc.items.length, doc.items[0].address, doc.buyer.issueDate, doc.total], [1, "해당 월의 거래 내역이 없습니다", "-", "0원"]);
  const im = S.invoiceMonth(client("C007"), ZM, NOW);
  eq("⑧ 0원 달 — 포털 월 목록 칸도 거래 없는 달(빈 껍데기)", [im.empty, im.count, im.rows.length, im.issue], [true, 0, 0, ""]);
  eq("⑧ 0원 달 — 늦은 등록은 발행이 지난 거래 없는 달처럼 막는다", S.intakeBlockOf(client("C007"), `${ZM}-25T10:00`, NOW).reason, RULES.issuedEmptyReason(ZM));
  const zo = B2B.b2bList().find((o) => o.clientId === "C007" && String(o.deliverAt).startsWith(ZM));
  const up = S.settlementImpactOf(zo, { ...zo, amount: 50000 }, NOW);
  eq("⑧ 0원 달의 0원 주문 금액을 올리기 — 막힘(내역서·T3 없이 금액이 생기지 않게 · 들어오는 쪽으로 다룬다)",
    [up.lock && up.lock.ym, up.lock && up.lock.reason, up.lock && up.lock.short, up.lock && up.lock.isOld, up.confirm.length],
    [ZM, "7월은 0원 주문만 있어 명세서를 내지 않은 달입니다 — 금액을 올릴 수 없습니다", RULES.ISSUED_ZERO_SHORT, false, 0]);
  /* 검증 2026-10-22 — 위 막힘은 들어오는 쪽(isOld false)이지만 원인은 금액 칸이다: raise 표지로 가른다(배송일시 줄을 칠하지 않게) */
  const inNone = S.settlementImpactOf(null, { id: "", clientId: "C007", deliverAt: `${ZM}-25T10:00`, amount: 50000, status: "접수대기", product: "3단화환(기본형)" }, NOW);
  eq("⑧ 0원 달 금액 올리기 막힘 — raise 표지 · 옮긴 것 아님 / 그 달로 들어오는 등록 막힘은 raise 아님",
    [up.lock && up.lock.raise, up.lock && up.lock.moved, inNone.lock && inNone.lock.raise, inNone.lock && inNone.lock.isOld], [true, false, false, false]);
  const pr = S.settlementImpactOf(zo, { ...zo, product: "근조오브제(1단형)" }, NOW);
  eq("⑧ 0원 달의 0원 주문 상품만 바꾸기 — 받는다(금액이 그대로)", pr.lock, null);
  const mv = S.settlementImpactOf(zo, { ...zo, deliverAt: "2026-10-25T10:00" }, NOW);
  eq("⑧ 0원 달에서 발행 전 달로 옮기기 — 받는다", mv.lock, null);
  eq("⑧ 0원 달의 0원 주문 지우기 — 받는다", S.settlementImpactOf(zo, null, NOW).lock, null);
  /* F — 새솔테크(C020) 첫 달(지난달)은 0원 1건뿐이다 → 내역서가 없고, 첫 명세서는 이번 달분이다 */
  const f = so("C020", LAST);
  eq("⑧ F 0원 1건뿐인 첫 달 — NONE", [f.status, f.empty, f.zeroEdited, f.issuedAmount, f.count], ["NONE", true, false, null, 1]);
  eq("⑧ F 발행 전(10-01 09:00)엔 거래 없는 발행 전 달(SCHEDULED · empty)", [so("C020", LAST, D(2026, 10, 1, 9)).status, so("C020", LAST, D(2026, 10, 1, 9)).empty], ["SCHEDULED", true]);
  const w = S.termsWatchOf(client("C020"), NOW);
  eq("⑧ F 약관 경고 — 0원 달은 명세서로 세지 않는다 · 이번 달분이 '첫 명세서' · '첫 달 0원' 문장 없음",
    [w.next && w.next.ym, w.next && w.next.first, w.held.length, w.firstZero], [CUR, true, 0, null]);
  eq("⑧ F 포털 기본 달 — 0원 달이 아니라 이번 달(명세서가 나간 달이 아직 없다)", S.latestInvoiceKey(client("C020"), NOW), CUR);
  /* 발급 뒤 고쳐서 0원(zeroEdited)은 그대로 — D(C019 9월 · 마감에 닫힘) · E(C027 9월 · 마감 전) */
  const d9 = so("C019", LAST), e9 = so("C027", LAST);
  eq("⑧ 고쳐서 0원 — 그대로(D 닫힘 · E 마감 전 동의대기 · 문서 '해당 없음(0원)')",
    [d9.status, d9.zeroEdited, e9.status, e9.zeroEdited, S.invoiceDocNoteOf(d9), d9.zeroCloseAt && fa(d9.zeroCloseAt)],
    ["PAID", true, "AWAITING_AGREEMENT", true, LINKS.INVOICE_NOTE.zero, "2026-10-10 13:00"]);
  eq("⑧ 고쳐서 0원 — 미입금 아님 · 정산 진행 아님(줄이 남아도)", [S.isUnpaid(e9), S.inSettlementFlow(e9), S.isUnpaid(d9)], [false, false, false]);
  const d9doc = invoiceDocData(client("C019"), LAST, NOW);
  eq("⑧ 고쳐서 0원 문서 — 남은 줄을 그대로 싣는다", [d9doc.items.length, d9doc.items[0].amount], [1, "0원"]);
}
{
  /* A — 탈퇴한 가상 거래처 (주)해마루상사(C028): 주문은 두 달 전까지만 · 그 달들은 모두 입금 완료 · 탈퇴 시각은 마지막 입금 뒤 */
  const c28 = client("C028");
  eq("⑧ 탈퇴 거래처 — 상태 · 탈퇴한 시각(지난달 말일 15:00)", [c28.status, c28.withdrawnAt], ["탈퇴", "2026-09-30 15:00"]);
  const os = B2B.b2bList().filter((o) => o.clientId === "C028");
  const yms = [...new Set(os.map((o) => String(o.deliverAt).slice(0, 7)))].sort();
  eq("⑧ 탈퇴 거래처 — 탈퇴한 달(9월)부터는 시드 주문이 없다 · 그 전 넉 달은 있다", [yms.every((ym) => ym < "2026-09"), yms.join(",")], [true, "2026-05,2026-06,2026-07,2026-08"]);
  eq("⑧ 탈퇴 거래처 — 배송 전 주문 없음", os.some((o) => o.status === "접수대기" || o.status === "주문접수"), false);
  const sts = ["2026-05", "2026-06", "2026-07", "2026-08", LAST, CUR].map((ym) => so("C028", ym).status);
  eq("⑧ 탈퇴 거래처 — 지난 달들은 입금 완료 · 탈퇴 뒤 달은 거래 없음/발행 전(끝나지 않은 정산 없음)", sts, ["PAID", "PAID", "PAID", "PAID", "NONE", "SCHEDULED"]);
  /* 주문이 있는 달의 입금만 센다 — 입금 시드는 가입한 달부터 2년 전 달까지 넣어(2026-10-22) 주문 없는 달에도 기록이 생긴다(그 달은 NONE 이라 읽지 않는다) */
  const pays = Object.entries(store.get().payments.C028 || {}).filter(([ym]) => yms.includes(ym)).map(([, p]) => p.at).sort();
  eq("⑧ 탈퇴 거래처 — 탈퇴 시각은 마지막 입금 뒤", [pays.length, pays[pays.length - 1] < c28.withdrawnAt], [4, true]);
  eq("⑧ 탈퇴 거래처 — 약관 경고 · 조치 필요 없음", [S.termsWatchOf(c28, NOW), S.settlementsFor(c28, NOW).some(S.needsAction)], [null, false]);
}
{
  /* 기한 뒤 발급(N01 · M39 · Q36 — 2026-10-22 운영자 답 ③ '지금 동작 그대로') — 기한 초과가 된 시각 = max(정산기한 다음 날 10:00, 계산서 발급 시각) */
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
  /* 옛 저장본(2026-10-19 ~ 10-21 코드) — '정지' 레코드 · 상태 이력 칸 · holds 의 'CLIENT_SUSPENDED' 를 읽으면: 정지 → 활성 · 이력 칸은 버림 ·
     정지 중 마감 기록은 버림(그 달은 평소처럼 마감에 자동 동의된 달). 고지 미도달 기록만 남는다. */
  const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
  raw.holds = { C005: { [LAST]: "NOTICE_UNDELIVERED" }, C012: { [PREV]: "CLIENT_SUSPENDED" }, C013: { [LAST]: "CLIENT_SUSPENDED" } };
  raw.clients = raw.clients.map((c) => (c.id === "C015"
    ? { ...c, status: "정지", statusLog: [{ at: "2026-09-08 16:00", from: "활성", to: "정지" }] }
    : c.id === "C012" ? { ...c, statusLog: [{ at: "2026-09-08 16:00", from: "활성", to: "정지" }, { at: "2026-09-11 10:00", from: "정지", to: "활성" }] } : c));
  localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
  store.hydrate();
  eq("⑧ hydrate — 고지 미도달만 받는다(정지 중 마감 기록은 버림)", JSON.stringify(store.get().holds), JSON.stringify({ C005: { [LAST]: "NOTICE_UNDELIVERED" } }));
  eq("⑧ hydrate — 옛 '정지' 레코드는 '활성' · 상태 이력 칸은 버림", [client("C015").status, "statusLog" in client("C015"), "statusLog" in client("C012")], ["활성", false, false]);
  eq("⑧ 옛 정지 중 마감 달 — 평소처럼 자동 동의(바른길 8월 · 다온 9월 · 윤지아 8월·9월)",
    [so("C012", PREV).mode, so("C012", PREV).autoAgreeHold, so("C013", LAST).mode, so("C015", PREV).mode, so("C015", LAST).mode], ["auto", null, "auto", "auto", "auto"]);
  eq("⑧ 옛 정지 레코드 — 이번 달(발행 전) 안내도 평소대로", nw(so("C015", CUR)), [null, null, null, null]);
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

/* ══ ⑨ 정산 독립 검토(2026-10-19) 회귀 — 직접 입력 기록 시각 · 보류 예측 · 순번 · 정산담당 자동 지정 · 옛 '정지' 저장본 · 탈퇴 ══
   옛 저장본은 지금 저장소(JSON)를 고쳐 다시 hydrate 하는 수법(⑤·⑧과 같다)이고, 다른 날짜는 ⑦처럼 이 파일을 다시 띄운다.
   (2026-10-19 의 상태 이력 사슬 · 싱싱마켓 정지 이야기 · 분 단위 정지 경계 회귀는 2026-10-22 결정 A — '정지' 체계를 없앤다 — 로
   지웠다. 그 자리에 '옛 정지 저장본은 활성으로' · '탈퇴 거래처 시드 주문 없음' 회귀를 둔다.) */
const SKEY = "yeop.store.v5";
const rawStore = () => JSON.parse(localStorage.getItem(SKEY));
const putStore = (raw) => { localStorage.setItem(SKEY, JSON.stringify(raw)); store.hydrate(); };
{
  /* 옛 저장본 1 — 2026-10-19 이전 코드로 '정지' 저장된 레코드(이력 없음): 정지 → 활성으로 읽고, 지난 다섯 달은 그대로(자동 동의 · 발급 · 입금) */
  const YMS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const before = YMS.map((ym) => [so("C003", ym).status, so("C003", ym).mode]);
  const raw = rawStore();
  raw.clients = raw.clients.map((c) => (c.id === "C003" ? { ...c, status: "정지" } : c));
  putStore(raw);
  eq("⑨-1 옛 '정지' 레코드 — '활성' 으로 읽는다", client("C003").status, "활성");
  eq("⑨-1 지난 다섯 달 그대로(자동 동의 · 발급 · 입금)", YMS.map((ym) => [so("C003", ym).status, so("C003", ym).mode]), before);
  eq("⑨-1 이번 달(발행 전) 안내도 평소대로", nw(so("C003", CUR)), [null, null, null, null]);
  /* 읽기만으로는 저장하지 않는다(같은 답이 매번 나온다) — 다른 쓰기가 생기면 그때 '활성' 으로 함께 저장된다 */
  eq("⑨-1 읽기만으로는 저장하지 않는다", rawStore().clients.find((c) => c.id === "C003").status, "정지");
  store.updateClient({ ...client("C003"), ceoName: "박지호(시험)" });
  eq("⑨-1 다른 쓰기와 함께 '활성' 으로 저장된다", rawStore().clients.find((c) => c.id === "C003").status, "활성");
}
{
  /* 옛 저장본 2 — 2026-10-19 코드의 상태 이력 칸(statusLog · 끊긴 사슬 포함)은 버리고, 쓰기에 실어 와도 저장하지 않는다 */
  const raw = rawStore();
  raw.clients = raw.clients.map((c) => (c.id === "C014" ? { ...c, status: "활성", statusLog: [{ at: "2026-10-08 16:00", from: "활성", to: "정지" }] } : c));
  putStore(raw);
  eq("⑨-2 상태 이력 칸 버림 · 9월 자동 동의 · 발급", ["statusLog" in client("C014"), so("C014", LAST).status, so("C014", LAST).mode], [false, "ISSUED", "auto"]);
  store.updateClient({ ...client("C014"), statusLog: [{ at: "2026-10-16 09:00", from: "활성", to: "정지" }] });
  eq("⑨-2 쓰기에 상태 이력 칸을 실어 와도 저장하지 않는다", ["statusLog" in client("C014"), "statusLog" in rawStore().clients.find((c) => c.id === "C014")], [false, false]);
}
{
  /* 탈퇴는 되돌리지 않는다 — 저장소가 마지막으로 지킨다(화면은 상태 칸을 잠근다 · admin-clients). 탈퇴로 바뀌면 탈퇴한 시각을 남긴다. */
  const w0 = { ...client("C028") };
  store.updateClient({ ...w0, status: "활성", withdrawnAt: "" });
  eq("⑨-6 탈퇴 → 활성으로 쓰려 해도 탈퇴 그대로 · 탈퇴한 시각 그대로", [client("C028").status, client("C028").withdrawnAt], ["탈퇴", w0.withdrawnAt]);
  store.updateClient({ ...client("C022"), status: "탈퇴" }, D(2026, 10, 16, 9, 40));
  eq("⑨-6 탈퇴로 바꾸면서 시각이 없으면 지금으로 채운다", [client("C022").status, client("C022").withdrawnAt], ["탈퇴", "2026-10-16 09:40"]);
  store.updateClient({ ...client("C022"), status: "활성" });
  eq("⑨-6 다시 활성으로 — 막힘", client("C022").status, "탈퇴");
  eq("⑨-6 탈퇴한 거래처의 접속 아이디는 그대로 '쓰는 중'", store.accountIdTaken("nurisol"), true);
}
{
  /* 검증 2026-10-22 — 탈퇴한 거래처에 끝나지 않은 정산이 다시 생기는 길(0원 주문을 거쳐). 위에서 C022 를 탈퇴 처리했다.
     ① 새 주문(등록 위저드 · 포털 접수)은 intakeBlockOf 가 어느 달로도 받지 않는다(화면은 활성 거래처만 고르고 · 탈퇴 계정은 로그인 못 함 —
        이 판정은 그 문이 바뀌어도 지키는 마지막 문).
     ② 이미 있는 0원 주문의 금액 올리기 · 다른 달로 옮기기는 주문 상세가 쓰는 판정(util/withdraw.js orderImpactOf)이 막는다 —
        검증자 탐침은 settlementImpactOf 를 바로 불러 막히지 않는다고 봤다. 정산과 무관한 저장(리본 문구)은 받는다. */
  const W = await import(R + "util/withdraw.js");
  const wi = S.intakeBlockOf(client("C022"), `${CUR}-25T10:00`, NOW);
  eq("⑨-6b 탈퇴한 거래처(C022 · 화면에서 탈퇴) — 발행 전 달로도 새 주문을 받지 않는다",
    [wi && wi.reason, wi && wi.short, wi && wi.withdrawn, wi && wi.isOld, wi && wi.ym], [RULES.WITHDRAWN_INTAKE_REASON, RULES.WITHDRAWN_INTAKE_SHORT, true, false, CUR]);
  eq("⑨-6b 시드 탈퇴 거래처(C028)도 · id 로 넘겨도 같다", [S.intakeBlockOf(client("C028"), `${CUR}-25T10:00`, NOW).reason, S.intakeBlockOf("C028", "2026/11/02 10:00", NOW).reason],
    [RULES.WITHDRAWN_INTAKE_REASON, RULES.WITHDRAWN_INTAKE_REASON]);
  eq("⑨-6b 활성 거래처는 그대로(발행 전 달은 받는다)", S.intakeBlockOf("C001", `${CUR}-25T10:00`, NOW), null);
  const base = B2B.b2bList().find((o) => o.clientId === "C001");
  const mk = (id, no, at) => B2B.b2bUpsert({ ...base, id, orderNo: no, clientId: "C022", deliverAt: at, date: at, amount: 0, status: "배송완료", history: [], cancelFee: 0, canceledAt: "" });
  mk("nwd1", "B2B-26109991", "2026/10/12 10:00"); // 이번 달 0원(발행 전)
  mk("nwd2", "B2B-26099992", "2026/09/20 10:00"); // 지난달 0원(발행 지남 — 거래 없는 달)
  const a = B2B.b2bFind("nwd1"), b = B2B.b2bFind("nwd2");
  const lk = (imp) => (imp.lock ? [imp.lock.withdrawn || false, imp.lock.reason] : null);
  eq("⑨-6b 탈퇴 뒤 이번 달 0원 주문 금액 올리기 — 주문 상세 판정이 막는다(settlementImpactOf 만으로는 발행 전 달이라 열림)",
    [lk(W.orderImpactOf(a, { ...a, amount: 50000 }, NOW)), S.settlementImpactOf(a, { ...a, amount: 50000 }, NOW).lock], [[true, W.WITHDRAWN_ORDER_LOCK], null]);
  eq("⑨-6b 탈퇴 뒤 지난달 0원 주문을 이번 달로 옮기기 — 막힘(금액 0원이어도 줄이 옮겨 간다)",
    lk(W.orderImpactOf(b, { ...b, deliverAt: "2026/10/25 10:00" }, NOW)), [true, W.WITHDRAWN_ORDER_LOCK]);
  eq("⑨-6b 탈퇴 뒤 지난달 0원 주문 금액 올리기 — 막힘(0원 달 막힘이 먼저 · 그 이유도 맞다)",
    lk(W.orderImpactOf(b, { ...b, amount: 60000 }, NOW)), [false, RULES.issuedZeroReason(LAST)]);
  eq("⑨-6b 탈퇴 뒤 정산과 무관한 저장(리본 문구) — 받는다", W.orderImpactOf(b, { ...b, ribbon: "삼가 고인의 명복을 빕니다(시험)" }, NOW).lock, null);
  B2B.b2bRemove("nwd1"); B2B.b2bRemove("nwd2");
  eq("⑨-6b (시험 주문 지움)", B2B.b2bList().filter((o) => o.clientId === "C022").length, 0);
}
{
  /* 탈퇴한 거래처의 시드 주문은 **오늘 기준으로 움직여도** 탈퇴한 달부터 생기지 않는다 — 이 파일을 다른 날짜로 다시 띄운다(⑦ 수법).
     ① 시드 탈퇴 거래처(C028 — 탈퇴 시각이 DATA_NOW 상대라 늘 지난달 말일) ② 화면에서 탈퇴 처리해 저장한 거래처(C019 — 10-16 탈퇴 →
     11-19 에 다시 열면 시드는 11월 주문을 만들려 하지만 저장소 레코드가 탈퇴라 만들지 않는다). */
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const os = await import("node:os");
  const path = await import("node:path");
  const self = fileURLToPath(import.meta.url);
  const probe = (at, extra = {}) => JSON.parse(execFileSync(process.execPath, [self], {
    env: { ...process.env, BILLING_PROBE: at, ...extra }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim().split("\n").pop()).W;
  ["2026-10-01T09:00", "2026-11-19T10:00", "2027-01-05T12:00"].forEach((at) => {
    const r = probe(at);
    eq(`⑨-7 ${at} — C028 탈퇴(지난달 말일) · 탈퇴한 달부터 주문 없음 · 끝나지 않은 정산 없음`,
      [r.C028.st, r.C028.after, r.C028.open, r.C028.paidBefore], ["탈퇴", 0, [], true]);
  });
  const dump = path.join(os.tmpdir(), `test-billing-wd-${process.pid}.json`);
  try {
    probe("2026-10-16T09:30", { BILLING_ACT: "withdraw", BILLING_DUMP: dump }); // C019 를 탈퇴 처리해 저장한다
    const a = probe("2026-11-19T10:00", { BILLING_STORE: dump });
    eq("⑨-7 화면에서 탈퇴 처리한 C019 — 11-19 에 다시 열어도 탈퇴한 달(10월)부터 시드 주문이 없다 · 그 전 달은 남는다",
      [a.C019.st, a.C019.after, a.C019.before > 0], ["탈퇴", 0, true]);
    probe("2026-10-16T09:30", { BILLING_ACT: "touch", BILLING_DUMP: dump }); // 저장소를 만든다
    const b = probe("2026-10-16T09:30", { BILLING_STORE: dump, BILLING_ACT: "noC028" });
    eq("⑨-7 C028 이 없는 옛 저장본 — 목록에 없어도 시드 레코드로 탈퇴를 보고 탈퇴 뒤 달 주문을 만들지 않는다", [b.C028.after, b.C028.before > 0], [0, true]);
  } finally { try { fs.unlinkSync(dump); } catch { /* 없으면 그만 */ } }
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

/* ══ ⑩ 탈퇴 판정(util/withdraw.js withdrawBlockOf · orderImpactOf — 2026-10-22 운영자 답 A·B) ═══════════════════════
   끝나지 않은 정산(PAID·NONE 이 아닌 달 · 배송 전 주문)이 있으면 막고 이유를 말한다 · 모두 끝났으면 null.
   주문 없는 시험 거래처 WT 를 새로 만들어 쓴다(앞 구역이 C022 를 탈퇴시켜도 흔들리지 않게 · 맨 끝에서 지운다). */
const W = await import(R + "util/withdraw.js");
const WT = "C9W1";
store.addClient({ ...client("C022"), id: WT, accountId: "wdtest1", companyName: "시험탈퇴(주)", status: "활성", withdrawnAt: "" });
const sw = (id, ym) => S.settlementOf(client(id), ym, NOW);
{
  // 입금 전 달 + 이번 달 주문(발행 전) — 시드로는 C002(9월분 10월 1일 발행 · 10일 13:00 자동 동의 · 계산서 발급 · 입금 전). 앞 구역이 입금
  // 처리했을 수 있어 지금 그런 활성 거래처를 고른다.
  const pc = store.get().clients.find((c) => c.status === "활성" && ["ISSUED", "OVERDUE"].includes(sw(c.id, LAST).status)
    && sw(c.id, CUR).status === "SCHEDULED" && !sw(c.id, CUR).empty);
  eq("⑩ 탈퇴 · 입금 전 달 + 이번 달 주문이 있는 거래처(전제)", !!pc, true);
  const b2 = pc && W.withdrawBlockOf(pc, NOW);
  eq("⑩ 탈퇴 · 입금 전 달", b2 && b2.months.find((m) => m.ym === LAST)?.word, "입금 전");
  eq("⑩ 탈퇴 · 이번 달 주문(발행 전)", b2 && b2.months.find((m) => m.ym === CUR)?.status, "SCHEDULED");
  eq("⑩ 탈퇴 · 문장 앞말", b2 && b2.text.startsWith(`${W.WITHDRAW_BLOCK_LEAD} · `), true);
  eq("⑩ 탈퇴 · 문장 — 달 · 명세서 날짜", b2 && /9월분 입금 전/.test(b2.reason)
    && b2.reason.includes(`10월 주문 `) && b2.reason.includes(`건 정산 전 — 11월 ${RULES.invoiceDayOf(pc)}일 명세서`), true);
  // 동의 전 달 — 시드로는 C011(발급일 15일 · 9월분 10월 15일 10:00 발행 · 마감 28일 13:00 · 지금 동의 전)
  const ac = store.get().clients.find((c) => c.status === "활성" && sw(c.id, LAST).status === "AWAITING_AGREEMENT" && !sw(c.id, LAST).zeroEdited
    && sw(c.id, CUR).status === "SCHEDULED" && !sw(c.id, CUR).empty);
  eq("⑩ 탈퇴 · 동의 전 달이 있는 거래처(전제)", !!ac, true);
  const b11 = ac && W.withdrawBlockOf(ac, NOW);
  eq("⑩ 탈퇴 · 동의 전 달", b11 && b11.months.find((m) => m.ym === LAST)?.word, "동의 전");
  eq("⑩ 탈퇴 · 이번 달 명세서 날짜는 그 거래처 발급일", b11 && b11.reason.includes(`— 11월 ${RULES.invoiceDayOf(ac)}일 명세서`), true);
  // 주문이 없는 거래처는 탈퇴할 수 있다 · 이미 탈퇴한 거래처는 null(호출부가 isWithdrawn 을 먼저 본다)
  eq("⑩ 탈퇴 · 주문 없음 → null", W.withdrawBlockOf(client(WT), NOW), null);
  eq("⑩ 탈퇴 · 이미 탈퇴 → null", W.withdrawBlockOf({ ...client(WT), status: W.WITHDRAWN }, NOW), null);
  eq("⑩ 탈퇴 · isWithdrawn", [W.isWithdrawn({ status: "탈퇴" }), W.isWithdrawn({ status: "활성" }), W.isWithdrawn(null)], [true, false, false]);
  // 접수대기 주문 한 건(이번 달 배송) → 그 달 발행 전 + 배송 전 주문 1건
  B2B.b2bUpsert({ id: "wd-t1", orderNo: "B2B-WD1", clientId: WT, status: "접수대기", deliverAt: "2026/10/28 14:00", amount: 50000,
    product: "3단화환(기본형)", ordererName: "시험", address: "예시로 1", receiver: "", manager: "", history: [] });
  const b22 = W.withdrawBlockOf(client(WT), NOW);
  eq("⑩ 탈퇴 · 접수대기 주문", b22 && [b22.open, b22.months.map((m) => `${m.ym}:${m.status}`), b22.reason],
    [1, [`${CUR}:SCHEDULED`], `10월 주문 1건 정산 전 — 11월 ${RULES.invoiceDayOf(client(WT))}일 명세서 · 배송 전 주문 1건`]);
  // 배송완료로 바꿔도 이번 달 주문은 다음 달 명세서 · 입금이 끝나야 풀린다(배송 전 주문만 빠진다)
  B2B.b2bUpsert({ ...B2B.b2bFind("wd-t1"), status: "배송완료" });
  const b22b = W.withdrawBlockOf(client(WT), NOW);
  eq("⑩ 탈퇴 · 배송완료여도 이번 달 주문은 막는다", b22b && [b22b.open, b22b.months.length], [0, 1]);
  B2B.b2bRemove("wd-t1");
  eq("⑩ 탈퇴 · 주문을 지우면 다시 null", W.withdrawBlockOf(client(WT), NOW), null);
  // 모두 PAID/NONE 이면 null — C001 의 입금 전 달을 입금 처리하고, 이번 달 이후 주문은 지우고, 지난 달의 배송 전 주문은 배송완료로
  // (상태만 바뀌어 그 달 금액은 그대로다 — 잠긴 달 기록 경고가 나지 않는다)
  const pre = W.withdrawBlockOf(client("C001"), NOW);
  eq("⑩ 탈퇴 · C001 은 막혀 있다(전제)", !!pre && pre.open > 0, true);
  pre.months.forEach((m) => { if (m.status === "ISSUED" || m.status === "OVERDUE") S.confirmPaymentFor(client("C001"), m.ym, undefined, NOW); });
  B2B.b2bList().filter((o) => o.clientId === "C001").forEach((o) => {
    const e = BE.entriesOfOrder(o)[0]; // 정산 줄의 달(취소 수수료는 취소한 달)로 가른다
    if (e && e.ym >= CUR) B2B.b2bRemove(o.id);
    else if (["접수대기", "주문접수"].includes(o.status)) B2B.b2bUpsert({ ...o, status: "배송완료" });
  });
  eq("⑩ 탈퇴 · 모두 PAID/NONE → null", W.withdrawBlockOf(client("C001"), NOW), null);
  // 지난 달(이미 입금까지 끝난 달)이라도 배송 전 주문이 남아 있으면 막는다 — 배송 전 주문만 말한다
  const past = B2B.b2bList().find((o) => o.clientId === "C001" && o.status === "배송완료" && BE.normAt(o.deliverAt).slice(0, 7) < CUR);
  B2B.b2bUpsert({ ...past, status: "주문접수" });
  const bp = W.withdrawBlockOf(client("C001"), NOW);
  eq("⑩ 탈퇴 · 닫힌 달의 배송 전 주문", bp && [bp.months.length, bp.open, bp.reason], [0, 1, "배송 전 주문 1건"]);
}

/* ── ⑩-2 0원 주문만 있는 달(운영자 답 B) · 탈퇴한 거래처의 주문 잠금(orderImpactOf) — 2026-10-22 1차 후속 ─────────────
   0원 주문만 있는 달은 내역서를 내지 않으므로(거래 없는 달처럼) 탈퇴를 막지 않는다 — 대신 탈퇴한 뒤 그 주문을 고쳐 정산을 새로
   만드는 저장 · 다른 달로 옮기기 · 취소 · 삭제는 orderImpactOf 가 막는다. 정산과 무관한 저장은 그대로 받는다. */
{
  const zero = { id: "wd-z1", orderNo: "B2B-WDZ1", clientId: WT, status: "배송완료", date: "2026/10/13 10:00", deliverAt: "2026/10/14 14:00", amount: 0,
    product: "3단화환(기본형)", ordererName: "시험", address: "예시로 1", receiver: "예시", manager: "", history: [] };
  B2B.b2bUpsert(zero);
  const sz = S.settlementOf(client(WT), CUR, NOW);
  eq("⑩ 0원만 · 그 달은 발행 전 · 내역서 없음(empty)", [sz.status, sz.empty, sz.count], ["SCHEDULED", true, 1]);
  eq("⑩ 0원만 · 배송완료면 탈퇴를 막지 않는다(결정 B)", W.withdrawBlockOf(client(WT), NOW), null);
  // 같은 0원 주문이 배송 전이면 막는다(배송 전 주문은 0원이어도 막는다)
  B2B.b2bUpsert({ ...B2B.b2bFind("wd-z1"), status: "주문접수" });
  const bz = W.withdrawBlockOf(client(WT), NOW);
  eq("⑩ 0원만 · 배송 전이면 막는다", bz && [bz.months.length, bz.open, bz.reason], [0, 1, "배송 전 주문 1건"]);
  B2B.b2bUpsert({ ...B2B.b2bFind("wd-z1"), status: "배송완료" });
  // 0원 주문 + 돈 있는 주문이 같은 달이면 막는다
  B2B.b2bUpsert({ ...zero, id: "wd-z2", orderNo: "B2B-WDZ2", amount: 50000 });
  const bz2 = W.withdrawBlockOf(client(WT), NOW);
  eq("⑩ 0원 + 돈 있는 주문 · 막는다", bz2 && bz2.months.map((m) => `${m.ym}:${m.status}`), [`${CUR}:SCHEDULED`]);
  B2B.b2bRemove("wd-z2");
  eq("⑩ 0원만으로 되돌리면 다시 null", W.withdrawBlockOf(client(WT), NOW), null);

  // 탈퇴 처리(저장소가 withdrawnAt 을 채운다)
  store.updateClient({ ...client(WT), status: W.WITHDRAWN });
  eq("⑩ 탈퇴 처리됨", [client(WT).status, /^2026-10-16 09:30$/.test(client(WT).withdrawnAt)], ["탈퇴", true]);
  const st = B2B.b2bFind("wd-z1");
  const lockOf = (a, b) => W.orderImpactOf(a, b, NOW).lock;
  const plain = (a, b) => S.settlementImpactOf(a, b, NOW).lock;
  // 금액을 올리는 저장 — 정산 판정만으로는 열린 달(발행 전)이라 받는다 · 탈퇴 잠금이 막는다(검증자 (가))
  eq("⑩ 탈퇴 · 금액 올림 · 정산 판정은 열림(전제)", plain(st, { ...st, amount: 50000 }), null);
  const lr = lockOf(st, { ...st, amount: 50000 });
  eq("⑩ 탈퇴 · 금액 올림 → 탈퇴 잠금", lr && [lr.withdrawn, lr.isOld, lr.ym, lr.reason], [true, false, CUR, W.WITHDRAWN_ORDER_LOCK]);
  // 상품만 바꿔도(명세서 줄의 품목) 막는다
  eq("⑩ 탈퇴 · 상품 변경 → 잠금", !!(lockOf(st, { ...st, product: "근조바구니" }) || {}).withdrawn, true);
  // 다른 달로 옮기며 금액을 올림(검증자 (나)) — 이동 표시도 함께
  const lm = lockOf(st, { ...st, deliverAt: "2026/11/20 14:00", amount: 50000 });
  eq("⑩ 탈퇴 · 다른 달로 옮김 + 금액 → 잠금(moved)", lm && [lm.withdrawn, lm.moved], [true, true]);
  // 같은 달 안의 시각 · 리본 문구 · 요청사항 · 담당자 — 정산과 무관하면 받는다
  eq("⑩ 탈퇴 · 같은 달 안의 시각 → 받음", lockOf(st, { ...st, deliverAt: "2026/10/14 17:00" }), null);
  eq("⑩ 탈퇴 · 리본 문구 · 요청사항 · 담당자 → 받음", lockOf(st, { ...st, ribbonPhrase: "근조(謹弔)", request: "시험", manager: "김총무" }), null);
  // 취소 · 삭제 — 기록이 바뀐다
  eq("⑩ 탈퇴 · 주문취소 → 잠금", !!(lockOf(st, { ...st, status: "취소", cancelFee: 0, canceledAt: "2026-10-16 09:30" }) || {}).withdrawn, true);
  eq("⑩ 탈퇴 · 삭제 → 잠금", !!(lockOf(st, null) || {}).withdrawn, true);
  eq("⑩ 탈퇴 · 토스트 문장", W.withdrawnOrderMsg("지울"), "탈퇴한 거래처의 주문이라 지울 수 없습니다 — 지난 기록은 그대로 남깁니다");
  // 탈퇴하지 않은 거래처는 settlementImpactOf 와 같다
  const c2 = B2B.b2bList().find((o) => o.clientId === "C002" && o.status !== "취소" && BE.normAt(o.deliverAt).slice(0, 7) === CUR);
  eq("⑩ 활성 거래처 · 판정이 그대로", JSON.stringify(W.orderImpactOf(c2, { ...c2, amount: 99000 }, NOW)), JSON.stringify(S.settlementImpactOf(c2, { ...c2, amount: 99000 }, NOW)));
  // 이미 잠긴 달(입금까지 끝난 달)이면 그 이유가 먼저 — 탈퇴 예시 C028 의 지난 주문을 이번 달로 옮김
  const c28 = B2B.b2bList().find((o) => o.clientId === "C028" && o.status === "배송완료");
  const l28 = c28 && lockOf(c28, { ...c28, deliverAt: "2026/10/20 14:00" });
  eq("⑩ 탈퇴 · 이미 잠긴 달은 그 이유가 먼저", l28 && [!!l28.withdrawn, l28.isOld, l28.moved], [false, true, true]);
  eq("⑩ 탈퇴 · C028 지난 주문 · 판정 결과가 settlementImpactOf 와 같다", JSON.stringify(W.orderImpactOf(c28, { ...c28, deliverAt: "2026/10/20 14:00" }, NOW)),
    JSON.stringify(S.settlementImpactOf(c28, { ...c28, deliverAt: "2026/10/20 14:00" }, NOW)));
  // 0원 주문만 있어 명세서를 내지 않은 지난 달(NONE · 결정 B)의 금액 올림 — 정산 판정의 raise 잠금이 먼저다(탈퇴 잠금이 덮지 않는다)
  //  · 주문 상세는 두 잠금 모두 '금액 칸이 원인' 으로 보고 이유를 금액 칸에 잇고 배송일시 줄은 칠하지 않는다(admin-orders amtBlocked · syncDeliv)
  B2B.b2bUpsert({ ...zero, id: "wd-z3", orderNo: "B2B-WDZ3", deliverAt: "2026/09/20 14:00", date: "2026/09/19 10:00" });
  const s9 = S.settlementOf(client(WT), LAST, NOW);
  eq("⑩ 탈퇴 · 0원만 있던 지난 달은 거래 없음(전제)", [s9.status, s9.empty], ["NONE", true]);
  const z3 = B2B.b2bFind("wd-z3");
  const lz = lockOf(z3, { ...z3, amount: 50000 });
  eq("⑩ 탈퇴 · 0원 달 금액 올림 → raise 잠금이 먼저", lz && [!!lz.raise, !!lz.withdrawn, lz.isOld, lz.moved, lz.reason], [true, false, false, false, RULES.issuedZeroReason(LAST)]);
  eq("⑩ 탈퇴 · 0원 달 · 금액 그대로 상품만 → 탈퇴 잠금", !!(lockOf(z3, { ...z3, product: "근조바구니" }) || {}).withdrawn, true);
  // 뒷정리 — 시험 주문(쓰기 함수를 바로 부른다 · 화면 판정을 지나지 않는다)과 시험 거래처
  ["wd-z1", "wd-z3"].forEach((id) => B2B.b2bRemove(id));
  store.removeClient(WT);
  eq("⑩ 뒷정리 — 시험 거래처 · 주문이 남지 않는다", [!!client(WT), B2B.b2bList().some((o) => o.clientId === WT)], [false, false]);
}

console.log(`billing: ${pass} passed, ${fail} failed`);
if (fail) { bad.forEach((b) => console.log("  x " + b)); process.exit(1); }
