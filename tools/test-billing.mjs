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
     ⑧ 2026-10-22 운영자 결정 — '정지' 장치 걷어내기 · 0원 주문만 있는 달 = NONE · 탈퇴 거래처 · 옛 저장본
        + 2026-10-23 운영자 결정 D1 — 고지 미도달 보류 · 마감 당일 다시 보내기 걷어내기(T4 발송 실패는 기록만 · 그 달도 자동 동의)
     ⑪ 2026-10-23 운영자 결정 D2 · D3 — 정산에는 배송완료 주문만(이번 달 예상 · 드릴다운 = 청구금액 = 리포트 = 도넛) · 명세서가 나간 뒤
        배송완료가 된 주문(열린 달은 더함 · complete 기록 / 잠긴 달·거래 없는 달은 '정산에 넣지 않음' 표지 · 새로고침 뒤에도) — ⑥ 뒤에 둔다
        + E1 · F1 배송 전 주문을 잠긴 달에서 · 잠긴 달로 옮기기(막지 않음 · closedMove 경고 · 이력 한 줄) · F2 '첫 명세서 일정 없음' 문장
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
  if (process.env.BILLING_ACT === "unbill") { // 동의된 달(C001 9월)로 배송완료 — '정산에 넣지 않음' 표지를 달아 저장(2026-10-23 결정 D3 · 화면 judge 와 같은 길)
    const o = B2B.b2bUpsert({ id: "n-d3-keep", orderNo: B2B.b2bNextOrderNo(), clientId: "C001", date: "2026/10/16 09:00", deliverAt: "2026-09-28T13:00",
      product: "3단화환(고급형)", amount: 60000, status: "주문접수", ordererName: "시험", address: "예시로 1", receiver: "", image: "", manager: "", history: [], cancelFee: 0 });
    const next = { ...o, status: "배송완료", image: "data:image/jpeg;base64,AA", receiver: "상주" };
    B2B.b2bUpsert(S.withUnbilled(next, S.settlementImpactOf(o, next, NOW).unbill, NOW));
  }
  if (process.env.BILLING_ACT === "oldLog") { // 2026-10-23 결정 D2 전의 저장본 — 발급 달(C011 9월)에 등록한 배송 전 주문 · 배송완료 주문과 그때 남은 create 줄
    const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
    const mkO = (id, no, status, amount) => ({ id, orderNo: no, clientId: "C011", date: "2026/10/15 15:00", deliverAt: "2026-09-27T14:00", product: "3단화환(고급형)",
      amount, status, ordererName: "시험", address: "예시로 1", receiver: status === "배송완료" ? "상주" : "", image: "", manager: "", history: [], cancelFee: 0 });
    const line = (oid, no, after) => ({ id: `ac-old-${oid}`, at: "2026-10-15 15:00", by: { type: "staff", id: "s3", name: "시험", dept: "" },
      orderId: oid, orderNo: no, cause: "create", before: 0, after, reason: "" });
    const ops = raw.orderOps || { created: {}, patched: {}, removed: [], lastNo: 0 };
    ops.created = { ...(ops.created || {}), "n-old-pend": mkO("n-old-pend", "B2B-26109901", "주문접수", 60000), "n-old-done": mkO("n-old-done", "B2B-26109902", "배송완료", 50000) };
    raw.orderOps = ops;
    const log = raw.amountLog || {};
    log.C011 = { ...(log.C011 || {}), [LAST]: [...((log.C011 || {})[LAST] || []), line("n-old-pend", "B2B-26109901", 60000), line("n-old-done", "B2B-26109902", 50000)] };
    raw.amountLog = log;
    localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
    store.hydrate();
  }
  if (process.env.BILLING_ACT === "oldPrivacy") { // 개인정보 동의 칸이 생기기 전(2026-10-23 결정 D6)에 저장한 옛 브라우저 — C001 레코드에 그 칸이 없다
    const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
    raw.clients = raw.clients.map((c) => { if (c.id !== "C001") return c; const { privacyAgreedAt: _a, privacyVersion: _v, ...r } = c; return { ...r, termsVersion: "2026-09-29" }; });
    localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
    store.hydrate();
  }
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
  /* '정산에 넣지 않음' 표지를 단 시험 주문(BILLING_ACT=unbill 로 만든 것 — 없으면 null) */
  const uo = B2B.b2bFind("n-d3-keep");
  const U = uo ? { st: uo.status, mark: uo.unbilled || null, entries: BE.entriesOfOrder(uo).length } : null;
  /* 개인정보 동의 기록(2026-10-23 결정 D6) — C001 · C002 의 [시각, 버전] */
  const pv = (id) => { const c = client(id); return c ? [c.privacyAgreedAt || null, c.privacyVersion || null] : null; };
  B2B.b2bList(); // 주문 목록을 먼저 만든다 — 옛 줄 이행(b2b-mock pruneStaleUserLines)이 그때 돈다
  const L = { C011: store.amountLogOf("C011", LAST).map((l) => l.orderId) };
  console.log(JSON.stringify({ C001: pick("C001"), C011: pick("C011"), C019: pick("C019"), W: { C028: wd("C028"), C019: wd("C019") }, U, P: { C001: pv("C001"), C002: pv("C002") }, L }));
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
/* 2026-10-23 운영자 결정 D2 — 정산에는 배송완료 주문만 · D3 — '정산에 넣지 않음' 표지 · 배송완료 처리(complete) */
{
  const wait = { ...base, status: "접수대기" }, acc = { ...base, status: "주문접수" };
  const mark = { ym: "2026-09", at: "2026-10-16 09:30", why: "agreed" };
  eq("D2 접수대기·주문접수 — 줄 없음(배송일이 지났어도)", [BE.entriesOfOrder(wait), BE.entriesOfOrder(acc)], [[], []]);
  eq("D2 배송 전 0원 주문도 줄 없음", BE.entriesOfOrder({ ...acc, amount: 0 }), []);
  eq("D3 배송완료 + 표지 — 줄 없음", BE.entriesOfOrder({ ...base, unbilled: mark }), []);
  eq("D3 표지 붙은 주문을 수수료 받고 취소 — 수수료 줄은 그대로(취소한 달)", BE.entriesOfOrder({ ...base, unbilled: mark, status: "취소", cancelFee: 10000, canceledAt: "2026-10-16 09:30" }).map((e) => [e.kind, e.ym, e.amount]), [["cancelFee", "2026-10", 10000]]);
  eq("D3 배송 전에 수수료 받고 취소 — 수수료 줄(그대로)", BE.entriesOfOrder({ ...acc, status: "취소", cancelFee: 10000, canceledAt: "2026-10-02 10:00" }).map((e) => [e.kind, e.ym]), [["cancelFee", "2026-10"]]);
  eq("D2 isBilled — 배송완료만 · 표지 있으면 아님", [BE.isBilled(base), BE.isBilled(acc), BE.isBilled({ ...base, unbilled: mark }), BE.isBilled(null)], [true, false, false, false]);
  eq("D3 isCompletion — 배송 전 → 배송완료만", [BE.isCompletion(acc, base), BE.isCompletion(wait, base), BE.isCompletion(base, base), BE.isCompletion({ ...base, status: "취소" }, base), BE.isCompletion(null, base)], [true, true, false, false, false]);
  eq("D3 배송완료 전환 — 그 달에 금액이 생긴다", dif(acc, base), [["2026-09", 0, 50000, 50000, true]]);
  eq("D3 원인: 배송완료 처리", BE.causeOf(acc, base), "complete");
  eq("D3 원인: 다른 달로 옮기며 배송완료 · 금액도 고침 — 그래도 complete", BE.causeOf(acc, { ...base, deliverAt: "2026-10-02T10:00", amount: 70000 }), "complete");
  eq("D3 표지를 단 전환 — 기여 없음 · 원인 없음", [dif(acc, { ...base, unbilled: mark }), BE.causeOf(acc, { ...base, unbilled: mark })], [[], null]);
  eq("D2 배송 전 주문의 금액·배송일시 수정 — 정산과 무관", [dif(acc, { ...acc, amount: 90000 }), dif(acc, { ...acc, deliverAt: "2026-10-02T10:00" })], [[], []]);
  eq("D2 배송 전 주문 삭제 — 정산과 무관", dif(acc, null), []);
}

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
  /* 배송완료로 드는 등록(D2 — 정산에 닿는 것은 배송완료뿐)이 그 달을 막는다. 접수대기 등록은 그 자리에서는 정산에 닿지 않는다 —
     그래도 받을 수 있는 달인가는 intakeBlockOf 가 배송완료로 들 때를 보고 예전처럼 막는다. */
  const intoNone = { id: "", clientId: "C022", deliverAt: "2026-09-25T10:00", amount: 50000, status: "배송완료", product: "3단화환(기본형)" };
  const im = S.settlementImpactOf(null, intoNone, NOW);
  eq("발행 시각이 지난 거래 없는 달로 등록 — 막힘(사용자 답 3)", [im.cause, im.lock && im.lock.reason, im.lock && im.lock.short, im.unbill], ["create", RULES.issuedEmptyReason(LAST), RULES.ISSUED_EMPTY_SHORT, null]);
  const w0 = S.settlementImpactOf(null, { ...intoNone, status: "접수대기" }, NOW);
  eq("D2 접수대기 등록 — 정산과 무관(바뀌는 달 없음 · 막힘 없음)", [w0.months.length, w0.lock], [0, null]);
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

/* ══ ⑪ 2026-10-23 운영자 결정 D2 · D3 — 정산에는 배송완료만 · 명세서가 나간 뒤 배송완료가 된 주문 ══════════════════════════
   D2 — 접수대기·주문접수는 배송일이 지났든 아니든 0(이번 달 예상 정산에서도 빠진다). 드릴다운 = 청구금액 = 이용 내역 = 리포트 = 도넛.
   D3 — 배송완료 전환은 그 달이 아직 고칠 수 있으면 더한다(발행 뒤면 확인 창 · 원인 complete). 잠긴 달 · 발행이 지난 거래 없는 달이면
        막지 않고 '정산에 넣지 않음' 표지를 달아 어느 달에도 넣지 않는다(settlementImpactOf unbill → withUnbilled → 다시 판정 — 화면 judge).
   시험 주문(n-d3-…)은 이 구역 끝에서 지운다(뒤 구역이 그 달들을 본다). */
{
  const { buildMonthlyReport } = await import(R + "data/report.js");
  const { USAGE_CATEGORIES } = await import(R + "data/admin-mock.js");
  const cl = store.get().clients;
  const curLabel = RULES.periodLabel(CUR);
  const inCur = (o) => BE.normAt(o.deliverAt).startsWith(CUR);
  const ords = B2B.b2bList().filter((o) => cl.some((c) => c.id === o.clientId));
  const billed = ords.filter((o) => o.status === "배송완료" && !o.unbilled && inCur(o));
  const feeCur = ords.filter((o) => o.status === "취소" && Number(o.cancelFee) > 0 && BE.canceledAtOf(o).startsWith(CUR)).reduce((a, o) => a + Number(o.cancelFee), 0);
  const pending = ords.filter((o) => ["접수대기", "주문접수"].includes(o.status) && inCur(o));
  const usage = cl.reduce((a, c) => a + ((S.usageFor(c)[curLabel] || {}).total || 0), 0);
  eq("⑪ D2 이번 달 예상 정산 = 배송완료 주문 + 이번 달 취소 수수료", usage, billed.reduce((a, o) => a + (Number(o.amount) || 0), 0) + feeCur);
  eq("⑪ D2 이번 달에 배송 전 주문이 있다(전제 — 지난 배송일 포함 · 그 금액은 빠진다)", [pending.length > 0, pending.some((o) => Number(o.amount) > 0)], [true, true]);
  eq("⑪ D2 청구금액 합 = 드릴다운 합 = 이용 내역",
    [cl.reduce((a, c) => a + so(c.id, CUR).amount, 0), cl.reduce((a, c) => a + S.billingEntriesOf(c, CUR).reduce((x, e) => x + e.amount, 0), 0)], [usage, usage]);
  const rep = buildMonthlyReport({ year: 2026, month: 10, clients: cl, usage: S.usageMap(cl), settlements: S.settlementsMap(cl, NOW), categories: USAGE_CATEGORIES });
  eq("⑪ D2 월간 리포트 총계 = 이용 내역 · 품목 합 = 총계", [rep.total, rep.catStats.reduce((a, x) => a + x.amount, 0)], [usage, usage]);
  const donut = cl.reduce((a, c) => a + Object.values((S.usageFor(c)[curLabel] || {}).items || {}).reduce((x, v) => x + v.amount, 0), 0);
  eq("⑪ D2 도넛(품목 합) = 이용 내역", donut, usage);
  eq("⑪ D2 주문 건수 = 배송완료 주문 수(배송 전 주문은 세지 않는다)", cl.reduce((a, c) => a + so(c.id, CUR).count, 0), billed.length);
  /* 시드는 지금보다 앞선 배송일의 주문을 모두 배송완료로 만든다(generateMonth) — 그래서 명세서가 나간 지난달의 금액과 시드 예시 A~G 가 그대로다 */
  eq("⑪ D2 지난달 시드 주문은 모두 배송완료(또는 취소)", ords.filter((o) => BE.normAt(o.deliverAt).startsWith(LAST) && !["배송완료", "취소"].includes(o.status)).length, 0);
}
{
  const mk = (id, cid, deliverAt) => B2B.b2bUpsert({
    id, orderNo: B2B.b2bNextOrderNo(), clientId: cid, date: "2026/10/16 09:00", deliverAt, product: "3단화환(고급형)", amount: 60000,
    status: "주문접수", ordererName: "시험", address: "예시로 1", recipientName: "故 시험", recipientPhone: "010-0000-0199",
    receiver: "", image: "", manager: "", history: [], cancelFee: 0,
  });
  const done = (o) => ({ ...o, status: "배송완료", image: "data:image/jpeg;base64,AA", receiver: "상주" });
  const mark = (o, im) => S.withUnbilled(done(o), im.unbill, NOW);
  /* ① 명세서가 나갔고 아직 고칠 수 있는 달(C011 9월 — 15일 그룹 · 수정 마감 10-27 10:00) */
  const log0 = store.amountLogOf("C011", LAST).length;
  const amt0 = so("C011", LAST).amount;
  const o1 = mk("n-d3-open", "C011", "2026-09-27T14:00");
  eq("⑪ D2 발급 달에 늦게 등록한 배송 전 주문 — 기록·금액 그대로", [store.amountLogOf("C011", LAST).length - log0, so("C011", LAST).amount - amt0], [0, 0]);
  const pre = S.settlementImpactOf(o1, { ...o1, amount: 10 }, NOW);
  eq("⑪ D2 배송 전 주문의 금액 수정 — 정산과 무관(확인 창·막힘 없음)", [pre.months.length, pre.confirm.length, pre.lock], [0, 0, null]);
  const im1 = S.settlementImpactOf(o1, done(o1), NOW);
  eq("⑪ D3 열린 발급 달로 배송완료 — 확인 창 · 원인 complete · 막힘·표지 없음",
    [im1.cause, im1.confirm.map((m) => m.ym), im1.lock, im1.unbill, im1.months[0].delta], ["complete", [LAST], null, null, 60000]);
  const w1 = B2B.b2bUpsert(done(o1), { note: "완료 처리를 늦게 함" });
  const l1 = store.amountLogOf("C011", LAST).pop();
  eq("⑪ D3 배송완료 처리 — 기록 한 줄(complete · 0 → 60,000 · 사유)", [!!w1, l1.cause, l1.before, l1.after, l1.reason, l1.orderId], [true, "complete", 0, 60000, "완료 처리를 늦게 함", "n-d3-open"]);
  eq("⑪ D3 그 달 금액 +60,000 · 바뀜", [so("C011", LAST).amount - amt0, so("C011", LAST).changed], [60000, true]);
  eq("⑪ D3 변경 기록 카드의 원인 · 낱말", [S.amountChangesOf(client("C011"), LAST, NOW).lines.pop().cause, S.AMOUNT_CAUSE_WORD.complete], ["complete", "배송완료 처리"]);
  /* ② 발행 전 달(이번 달) — 확인 창 없이 더한다 */
  const c0 = so("C011", CUR).amount, lc0 = store.amountLogOf("C011", CUR).length;
  const o2 = mk("n-d3-cur", "C011", "2026-10-14T14:00");
  const im2 = S.settlementImpactOf(o2, done(o2), NOW);
  eq("⑪ D3 발행 전 달로 배송완료 — 확인 창 없이 더한다", [im2.cause, im2.confirm.length, im2.lock, im2.unbill, im2.months[0].delta], ["complete", 0, null, null, 60000]);
  B2B.b2bUpsert(done(o2));
  eq("⑪ D3 발행 전 달 — 금액 +60,000 · 기록 없음", [so("C011", CUR).amount - c0, store.amountLogOf("C011", CUR).length - lc0], [60000, 0]);
  /* ③ 동의된 달(C001 9월 — 1일 그룹 · 10-10 13:00 자동 동의) */
  const a0 = so("C001", LAST).amount, la0 = store.amountLogOf("C001", LAST).length;
  const o3 = mk("n-d3-agreed", "C001", "2026-09-28T13:00");
  eq("⑪ D2 잠긴 달의 배송 전 주문 — 금액 수정·같은 달 안의 날짜 이동은 정산과 무관(막지 않음)",
    [S.settlementImpactOf(o3, { ...o3, amount: 10 }, NOW).lock, S.settlementImpactOf(o3, { ...o3, deliverAt: "2026-09-30T18:00" }, NOW).lock], [null, null]);
  /* 다른 달로 옮기기는 **막지 않고 경고한다**(2026-10-23 운영자 결정 E1 — 세무 5-3 '충분': 배송완료 때 실제 배송일로 고쳐 그 달로 옮기는
     운영). 금액은 그대로(D2)이고 옮긴 뒤 배송완료하면 새 달 규칙(D3)을 따른다. 한때 옛 달 잠금으로 막았다 — 걷어 냈다. */
  const mv3a = S.settlementImpactOf(o3, { ...o3, deliverAt: "2026-10-20T10:00" }, NOW);
  eq("⑪ E1 잠긴 달(동의된 달)의 배송 전 주문을 발행 전 달로 — 막지 않음 · 바뀌는 달·확인 창·표지 없음 · 원인 move",
    [mv3a.lock, mv3a.moved, mv3a.months.length, mv3a.confirm.length, mv3a.unbill, mv3a.cause], [null, true, 0, 0, null, "move"]);
  const cm3 = mv3a.closedMove;
  eq("⑪ E1 경고 판정(closedMove) — 옛 달 9월 · 동의를 마친 달 · 배송일시 전 → 후 · 새 달 10월 발행 전",
    cm3 && [cm3.ym, cm3.word, cm3.fromAt, cm3.toAt, cm3.toYm, cm3.to, cm3.toWord, cm3.s.status, cm3.toS.status],
    [LAST, "동의를 마친 달", "2026-09-28 13:00", "2026-10-20 10:00", CUR, "scheduled", "", so("C001", LAST).status, "SCHEDULED"]);
  /* 저장 줄 한 마디는 주의 낱말('실제 배송일일 때만')도 싣는다 — 배송일시 줄 경고는 1280 폭에서 그 낱말 쯤에서 말줄임이다(2026-10-23 검증) ·
     이력 줄에는 넣지 않는다. 저장 줄은 화면(admin-orders syncDirty)이 부르는 orderSaveLineOf 그대로 본다(손으로 다시 짓지 않는다 —
     2026-10-23 검증: 예전엔 같은 모양을 시험 안에서 지어 갈래 순서·앞말이 틀려도 통과했다). */
  eq("⑪ E1 배송일시 줄 경고 · 저장 줄(orderSaveLineOf — 글자 · title) · 처리 이력 한 줄",
    cm3 && [S.closedMoveWarn(cm3, NOW), S.orderSaveLineOf(mv3a, 1, "", NOW), S.closedMoveLine(cm3, NOW)],
    ["9월은 동의를 마친 달 — 실제 배송일일 때만 옮기세요 · 배송완료하면 10월 정산에 듭니다",
      { text: "수정한 항목 1개 · 실제 배송일일 때만 · 9월(동의를 마친 달)에서 옮김 · 배송완료하면 10월 정산에 듭니다",
        tip: "9월은 동의를 마친 달 — 실제 배송일일 때만 옮기세요 · 배송완료하면 10월 정산에 듭니다", ask: false },
      "배송일시 변경 · 09-28 13:00 → 10-20 10:00 · 9월(동의를 마친 달)에서 옮김"]);
  eq("⑪ E1 같은 달 안의 날짜·시각 변경 — 경고 없음", S.settlementImpactOf(o3, { ...o3, deliverAt: "2026-09-30T18:00" }, NOW).closedMove, null);
  /* 새 배송일시가 비었거나 날짜 모양이 아니면 던지지 않고 경고도 없다(E1 이전과 같은 빈 결과 — settlementOf 는 "YYYY-MM" 만 받는다 ·
     저장 줄은 입력마다 이 판정을 부른다 · 2026-10-23 검증). */
  eq("⑪ E1 새 배송일시가 비었거나 모양이 틀림 — 던지지 않음 · 경고·막힘 없음",
    ["", "2026-1", "abc"].map((x) => { try { const r = S.settlementImpactOf(o3, { ...o3, deliverAt: x }, NOW); return [r.closedMove, r.lock]; } catch (e) { return `throw: ${e.message}`; } }),
    [[null, null], [null, null], [null, null]]);
  const mv3b = S.settlementImpactOf(o3, done({ ...o3, deliverAt: "2026-10-20T10:00" }), NOW);
  eq("⑪ E1 옮기며 배송완료 — 새 달(발행 전 10월) 규칙: 막힘·표지·확인 창 없이 10월에 더한다 · 경고는 그대로",
    [mv3b.lock, mv3b.unbill, mv3b.cause, mv3b.confirm.length, mv3b.months.map((m) => [m.ym, m.delta]), !!mv3b.closedMove],
    [null, null, "complete", 0, [[CUR, 60000]], true]);
  eq("⑪ E1 묶임 판정(pendingInClosedOf) — 배송 전 · 잠긴 달만 / 발행 전 달·배송완료·취소는 아니다",
    [S.pendingInClosedOf(o3, so("C001", LAST)), S.pendingInClosedOf(o3, so("C001", CUR)), S.pendingInClosedOf({ ...o3, status: "배송완료" }, so("C001", LAST)), S.pendingInClosedOf({ ...o3, status: "취소" }, so("C001", LAST))],
    [true, false, false, false]);
  const mv1 = S.settlementImpactOf(o1, { ...o1, deliverAt: "2026-10-20T10:00" }, NOW);
  eq("⑪ E1 고칠 수 있는 발급 달(C011 9월)의 배송 전 주문을 옮김 — 막지 않음 · 경고도 없음(옛 달이 열려 있다)",
    [mv1.lock, mv1.closedMove, S.pendingInClosedOf(o1, so("C011", LAST))], [null, null, false]);
  /* 새 달이 고칠 수 있는 발급 달(open) — 지금(10-16) 열린 발급 달은 C011 9월(15일 그룹)이다. 그 거래처의 잠긴 8월(동의된 달)에서 옮긴다. */
  const o8 = mk("n-e1-aug", "C011", "2026-08-27T14:00");
  const s8 = so("C011", PREV);
  const mv8 = S.settlementImpactOf(o8, { ...o8, deliverAt: "2026-09-27T14:00" }, NOW);
  eq("⑪ E1 잠긴 8월(C011)의 배송 전 주문을 열린 발급 달(9월)로 — 막지 않음 · to open · '배송완료하면 9월 명세서에 듭니다'",
    [s8.issued && !s8.editable, mv8.lock, mv8.closedMove && mv8.closedMove.to, mv8.closedMove && S.closedMoveTail(mv8.closedMove, NOW), mv8.confirm.length],
    [true, null, "open", "배송완료하면 9월 명세서에 듭니다", 0]);
  const mv8b = S.settlementImpactOf(o8, done({ ...o8, deliverAt: "2026-09-27T14:00" }), NOW);
  eq("⑪ E1 옮기며 배송완료(열린 발급 달) — 기존 확인 창 흐름(9월 · complete) · 표지 없음",
    [mv8b.lock, mv8b.unbill, mv8b.cause, mv8b.confirm.map((m) => m.ym), !!mv8b.closedMove], [null, null, "complete", [LAST], true]);
  /* 저장 줄(화면과 같은 orderSaveLineOf) — 새 달이 고칠 수 있는 발급 달이면 '배송완료하면 9월 명세서에 듭니다' · 옮기며 배송완료면 확인 창 갈래(앞에 E1
     한 마디 · 바뀌는 달 한 줄은 화면 monthsLine 이 넘긴다 — 여기서는 자리표시 'M') · 경고가 없는 저장은 '수정한 항목 N개' 만 */
  const w8c = S.closedMonthWord(s8);
  eq("⑪ E1 저장 줄(orderSaveLineOf) — 고칠 수 있는 발급 달로 · 옮기며 배송완료(확인 창 · 앞말 · title) · 경고 없는 저장",
    [w8c, S.orderSaveLineOf(mv8, 1, "", NOW), S.orderSaveLineOf(mv8b, 2, "M", NOW), S.orderSaveLineOf(mv1, 1, "", NOW)],
    ["동의를 마친 달",
      { text: "수정한 항목 1개 · 실제 배송일일 때만 · 8월(동의를 마친 달)에서 옮김 · 배송완료하면 9월 명세서에 듭니다",
        tip: "8월은 동의를 마친 달 — 실제 배송일일 때만 옮기세요 · 배송완료하면 9월 명세서에 듭니다", ask: false },
      { text: "저장 전에 확인합니다 · 실제 배송일일 때만 · 8월(동의를 마친 달)에서 옮김 · M",
        tip: "8월은 동의를 마친 달 — 실제 배송일일 때만 옮기세요 · 배송완료하면 9월 명세서에 듭니다", ask: true },
      { text: "수정한 항목 1개", tip: "", ask: false }]);
  /* 새 달이 잠긴 달(closed) — C001 9월(동의된 달)에서 8월(동의된 달)로 */
  const mv3c = S.settlementImpactOf(o3, { ...o3, deliverAt: "2026-08-28T13:00" }, NOW);
  eq("⑪ E1 잠긴 달에서 잠긴 달로 — 막지 않음 · to closed · 배송완료 때 정산에 넣지 않는다는 말",
    [mv3c.lock, mv3c.closedMove && mv3c.closedMove.to, mv3c.closedMove && S.closedMoveWarn(mv3c.closedMove, NOW)],
    [null, "closed", `9월은 동의를 마친 달 — 실제 배송일일 때만 옮기세요 · 8월은 ${S.closedMonthWord(so("C001", PREV))}이라 배송완료해도 정산에 넣지 않습니다`]);
  const mv3d = S.settlementImpactOf(o3, done({ ...o3, deliverAt: "2026-08-28T13:00" }), NOW);
  eq("⑪ E1 옮기며 배송완료(잠긴 달로) — 새 달 규칙: 8월로 표지 갈래(unbill)", [mv3d.unbill && mv3d.unbill.ym, mv3d.lock && mv3d.lock.isOld], [PREV, false]);
  /* 옮겨 저장 → 이력 한 줄이 같은 쓰기에 남는다(화면 commitSave 와 같은 길) → 옮긴 달에서 배송완료하면 새 달 규칙(D3) */
  const { histEntry } = await import(R + "data/order-history.js");
  const mvRec = { ...o3, deliverAt: "2026-10-20T10:00", history: [...(o3.history || []), histEntry("edit", S.closedMoveLine(cm3, NOW), "2026-10-16 09:30")] };
  const sv3 = B2B.b2bUpsert(mvRec);
  const h3 = (B2B.b2bFind("n-d3-agreed").history || []).pop();
  eq("⑪ E1 옮긴 저장 — 저장됨 · 이력 줄(edit · 날짜 → 날짜 · 어느 달에서) · 9월·10월 금액·기록 그대로",
    [!!sv3, h3 && h3.type, h3 && h3.label, so("C001", LAST).amount - a0, store.amountLogOf("C001", LAST).length - la0, so("C001", CUR).status],
    [true, "edit", "배송일시 변경 · 09-28 13:00 → 10-20 10:00 · 9월(동의를 마친 달)에서 옮김", 0, 0, "SCHEDULED"]);
  const cur0 = so("C001", CUR).amount;
  const mvDone = B2B.b2bFind("n-d3-agreed");
  const imDone = S.settlementImpactOf(mvDone, done(mvDone), NOW);
  eq("⑪ E1 옮긴 뒤 배송완료 — 새 달(10월) 규칙: 막힘·표지·확인 창 없음 · 경고 없음(이미 10월)", [imDone.lock, imDone.unbill, imDone.confirm.length, imDone.closedMove], [null, null, 0, null]);
  B2B.b2bUpsert(done(mvDone));
  eq("⑪ E1 옮긴 뒤 배송완료 — 10월 +60,000 · 9월 그대로", [so("C001", CUR).amount - cur0, so("C001", LAST).amount - a0], [60000, 0]);
  /* 아래 ③ 의 표지 시험을 위해 원래 모양(9월 · 주문접수)으로 되돌린다 — 배송완료를 다시 배송 전으로 되돌리는 쓰기(시험 전용) */
  B2B.b2bUpsert({ ...mvDone, deliverAt: "2026-09-28T13:00", status: "주문접수", image: "", receiver: "" });
  eq("⑪ E1 되돌림 — 10월 금액 처음과 같다", so("C001", CUR).amount, cur0);
  const im3 = S.settlementImpactOf(o3, done(o3), NOW);
  eq("⑪ D3 동의된 달로 배송완료 — 표지 갈래(unbill agreed) · 표지 없이는 막힘(lock)",
    [im3.cause, im3.unbill && im3.unbill.why, im3.unbill && im3.unbill.ym, im3.lock && im3.lock.reason, im3.confirm.length], ["complete", "agreed", LAST, RULES.LOCK_REASON.agreed, 0]);
  const m3 = mark(o3, im3);
  eq("⑪ D3 표지 모양 { ym, at, why }", m3.unbilled, { ym: LAST, at: "2026-10-16 09:30", why: "agreed" });
  const re3 = S.settlementImpactOf(o3, m3, NOW);
  eq("⑪ D3 표지를 달고 다시 판정 — 막힘·바뀌는 달·확인 창 없음 · 원인 없음", [re3.lock, re3.months.length, re3.confirm.length, re3.unbill, re3.cause], [null, 0, 0, null, null]);
  const warns = [];
  const w0 = console.warn;
  console.warn = (x) => warns.push(String(x));
  const s3 = B2B.b2bUpsert(m3);
  console.warn = w0;
  eq("⑪ D3 표지 단 배송완료 저장 — 배송완료 · 그 달 금액·기록 그대로 · 잠긴 달 경고 없음",
    [s3 && s3.status, so("C001", LAST).amount - a0, store.amountLogOf("C001", LAST).length - la0, warns.length], ["배송완료", 0, 0, 0]);
  const s3b = B2B.b2bFind("n-d3-agreed");
  eq("⑪ D3 표지 단 주문 — 정산 줄 없음", [BE.entriesOfOrder(s3b).length, BE.isBilled(s3b)], [0, false]);
  const raw3 = JSON.parse(localStorage.getItem("yeop.store.v5"));
  eq("⑪ D3 표지는 주문 변경분(orderOps)과 함께 저장된다", [store.orderOps().created["n-d3-agreed"].unbilled, raw3.orderOps.created["n-d3-agreed"].unbilled], [m3.unbilled, m3.unbilled]);
  eq("⑪ D3 처리 이력 줄 · 토스트 꼬리(계산서가 나간 달 — 수정계산서로)", [S.unbilledLine(m3.unbilled, NOW), S.unbilledWhy(m3.unbilled, NOW)],
    ["정산 마감 뒤 배송완료 · 9월 정산에 넣지 않음 · 수정계산서로", "9월 정산이 잠겨 이 주문 금액은 넣지 않았습니다 — 바로빌에서 수정계산서로 처리하세요"]);
  const mv3 = S.settlementImpactOf(s3b, { ...s3b, deliverAt: "2026-10-20T10:00", amount: 90000 }, NOW);
  eq("⑪ D3 표지 단 주문은 열린 달로 옮기고 금액을 고쳐도 어느 달에도 안 든다", [mv3.months.length, mv3.lock, mv3.confirm.length], [0, null, 0]);
  eq("⑪ D3 해가 바뀐 뒤 단 표지 — 연도를 붙인다", S.unbilledLine({ ym: "2026-12", at: "2027-01-05 10:00", why: "agreed" }, D(2027, 1, 5, 10)),
    "정산 마감 뒤 배송완료 · 2026년 12월 정산에 넣지 않음 · 수정계산서로");
  /* ④ 수정 마감이 지난 동의 전 달(C011 9월을 10-27 11:00 에) — 같은 주문이 지금(10-16)이면 확인 창 */
  const o4 = mk("n-d3-lock", "C011", "2026-09-29T15:00");
  const im4 = S.settlementImpactOf(o4, done(o4), D(2026, 10, 27, 11));
  eq("⑪ D3 수정 마감 지난 달로 배송완료 — 표지 갈래 editLock", [im4.unbill && im4.unbill.why, im4.lock && im4.lock.reason], ["editLock", RULES.LOCK_REASON.editLock]);
  eq("⑪ D3 같은 주문 · 수정 마감 전(지금) — 확인 창 · 표지 없음", [S.settlementImpactOf(o4, done(o4), NOW).confirm.length, S.settlementImpactOf(o4, done(o4), NOW).unbill], [1, null]);
  /* ⑤ 고쳐서 0원으로 닫힌 달(C019 9월 — 시드 예시 D) — 고칠 계산서가 없어 '따로 처리' */
  const o5 = mk("n-d3-zero", "C019", "2026-09-26T13:00");
  const im5 = S.settlementImpactOf(o5, done(o5), NOW);
  const k5 = im5.unbill && S.unbilledMarkOf(im5.unbill, NOW);
  eq("⑪ D3 고쳐서 0원으로 닫힌 달로 배송완료 — 표지 갈래 zero · '따로 처리'",
    [im5.unbill && im5.unbill.why, im5.lock && im5.lock.reason, k5 && S.unbilledLine(k5, NOW), k5 && S.unbilledWhy(k5, NOW)],
    ["zero", RULES.LOCK_REASON.zero, "정산 마감 뒤 배송완료 · 9월 정산에 넣지 않음 · 바로빌에서 따로 처리", "9월 정산이 0원으로 닫혀 이 주문 금액은 넣지 않았습니다 — 바로빌에서 따로 처리하세요"]);
  eq("⑪ D2 배송 전 주문이 들어와도 그 달은 고쳐서 0원 그대로", [so("C019", LAST).status, so("C019", LAST).zeroEdited, so("C019", LAST).amount], ["PAID", true, 0]);
  /* ⑥ 발행이 지난 거래 없는 달(C022 9월) · 0원 주문만 있어 명세서를 내지 않은 달(C007 7월) */
  const o6 = mk("n-d3-none", "C022", "2026-09-25T10:00");
  const im6 = S.settlementImpactOf(o6, done(o6), NOW);
  eq("⑪ D3 발행이 지난 거래 없는 달로 배송완료 — 표지 갈래 none", [im6.unbill && im6.unbill.why, im6.lock && im6.lock.reason], ["none", RULES.issuedEmptyReason(LAST)]);
  const mv6 = S.settlementImpactOf(o6, { ...o6, deliverAt: "2026-10-20T10:00" }, NOW);
  eq("⑪ E1 발행이 지난 거래 없는 달의 배송 전 주문을 다른 달로 — 막지 않음 · 그 달 낱말로 경고 · 이력 줄",
    [mv6.lock, mv6.closedMove && mv6.closedMove.word, mv6.closedMove && S.closedMoveWarn(mv6.closedMove, NOW), mv6.closedMove && S.closedMoveLine(mv6.closedMove, NOW)],
    [null, RULES.ISSUED_EMPTY_SHORT, "9월은 명세서 발행이 지난 달 — 실제 배송일일 때만 옮기세요 · 배송완료하면 10월 정산에 듭니다",
      "배송일시 변경 · 09-25 10:00 → 10-20 10:00 · 9월(명세서 발행이 지난 달)에서 옮김"]);
  const m6 = mark(o6, im6);
  B2B.b2bUpsert(m6);
  eq("⑪ D3 표지 단 뒤에도 그 달은 거래 없음(NONE) · 이력 줄 · 토스트 꼬리", [so("C022", LAST).status, S.unbilledLine(m6.unbilled, NOW), S.unbilledWhy(m6.unbilled, NOW)],
    ["NONE", "명세서 발행 뒤 배송완료 · 9월 정산에 넣지 않음 · 바로빌에서 따로 처리", "9월은 명세서 발행이 지난 달이라 이 주문 금액은 넣지 않았습니다 — 바로빌에서 따로 처리하세요"]);
  const o7 = mk("n-d3-zm", "C007", "2026-07-20T10:00");
  const im7 = S.settlementImpactOf(o7, done(o7), NOW);
  eq("⑪ D3 0원 주문만 있던 달(NONE)로 배송완료 — 표지 갈래 none", im7.unbill && im7.unbill.why, "none");
  /* ⑦ 탈퇴 판정 — 배송 전 주문은 배송 전 주문으로만 막는다(정산 전 달로 세지 않는다 · D2) */
  eq("⑪ D2 등록 막기는 그대로(그 주문이 배송완료로 들 때를 본다)", [S.intakeBlockOf("C001", "2026-09-28T13:00", NOW).reason, S.intakeBlockOf("C011", "2026-09-28T13:00", NOW)], [RULES.LOCK_REASON.agreed, null]);
  /* 뒷정리 — 표지 단 주문 · 배송 전 주문은 기여가 없어 기록 없이 지워진다. 열린 발급 달의 완료 주문은 remove 줄을 남긴다(사실대로) */
  ["n-d3-open", "n-d3-cur", "n-d3-agreed", "n-d3-lock", "n-d3-zero", "n-d3-none", "n-d3-zm", "n-e1-aug"].forEach((id) => B2B.b2bRemove(id));
  eq("⑪ 뒷정리 — 시험 주문이 남지 않는다 · 9월 금액은 처음과 같다", [B2B.b2bList().some((o) => o.id.startsWith("n-d3-")), so("C011", LAST).amount, so("C001", LAST).amount], [false, amt0, a0]);
  eq("⑪ 뒷정리 — 열린 발급 달의 완료 주문 삭제는 remove 줄", store.amountLogOf("C011", LAST).pop().cause, "remove");
}
{
  /* ⑪ F1 — 반대 방향(2026-10-23 운영자 결정 F1): 발행 전 달·고칠 수 있는 달(그 밖 아무 달)의 **배송 전 주문**을 잠긴 달·발행이 지난 거래
     없는 달로 옮기면 막지 않고 E1 과 같은 `closedMove`(from ≠ closed · to = closed)로 알린다 — 배송일시 줄 경고 = 새 달 사정(closedMoveTail
     그대로) · 저장 줄 한 마디(closedMoveNote "" + closedMoveTail) · 처리 이력 'N월(낱말)로 옮김'. 잠긴 달 → 잠긴 달은 한 줄(…에서 …로 옮김).
     같은 달 안 · 배송완료 · 취소 · 표지 주문은 해당 없음. 옮긴 뒤 배송완료하면 그 달 규칙(D3 표지). 시험 주문(n-f1-…)은 끝에서 지운다. */
  const { histEntry } = await import(R + "data/order-history.js");
  const mk = (id, cid, deliverAt, extra = {}) => B2B.b2bUpsert({
    id, orderNo: B2B.b2bNextOrderNo(), clientId: cid, date: "2026/10/16 09:00", deliverAt, product: "3단화환(고급형)", amount: 60000,
    status: "주문접수", ordererName: "시험", address: "예시로 1", recipientName: "故 시험", recipientPhone: "010-0000-0199",
    receiver: "", image: "", manager: "", history: [], cancelFee: 0, ...extra,
  });
  const done = (o) => ({ ...o, status: "배송완료", image: "data:image/jpeg;base64,AA", receiver: "상주" });
  const w9 = S.closedMonthWord(so("C001", LAST)), w8 = S.closedMonthWord(so("C001", PREV));
  const a9 = so("C001", LAST).amount, l9 = store.amountLogOf("C001", LAST).length, a10 = so("C001", CUR).amount;
  /* ① 발행 전 달(C001 10월) → 잠긴 달(C001 9월 — 동의된 달) */
  const f1 = mk("n-f1-cur", "C001", "2026-10-05T14:00");
  const mvA = S.settlementImpactOf(f1, { ...f1, deliverAt: "2026-09-30T14:00" }, NOW);
  const cmA = mvA.closedMove;
  eq("⑪ F1 발행 전 달의 배송 전 주문을 잠긴 달로 — 막지 않음 · 바뀌는 달·확인 창·표지 없음 · 원인 move",
    [mvA.lock, mvA.moved, mvA.months.length, mvA.confirm.length, mvA.unbill, mvA.cause], [null, true, 0, 0, null, "move"]);
  eq("⑪ F1 경고 판정(closedMove) — 옛 달 10월 발행 전(from scheduled · 낱말 없음) · 새 달 9월 잠김(to closed · 그 달 낱말)",
    cmA && [cmA.ym, cmA.from, cmA.word, cmA.fromAt, cmA.toAt, cmA.toYm, cmA.to, cmA.toWord, cmA.s.status, cmA.toS.status],
    [CUR, "scheduled", "", "2026-10-05 14:00", "2026-09-30 14:00", LAST, "closed", w9, "SCHEDULED", so("C001", LAST).status]);
  eq("⑪ F1 낱말 — 9월은 동의를 마친 달(예시 문장의 낱말)", w9, "동의를 마친 달");
  /* 저장 줄은 closedMoveNote 가 "" 라 '수정한 항목 N개 · {closedMoveTail}' 한 마디 — 화면(admin-orders syncDirty)과 같은 orderSaveLineOf 로 본다. */
  eq("⑪ F1 배송일시 줄 경고(= closedMoveTail 그대로) · 저장 줄 한 마디(note 없음) · 처리 이력 한 줄('…로 옮김')",
    cmA && [S.closedMoveWarn(cmA, NOW), S.closedMoveTail(cmA, NOW), S.closedMoveNote(cmA, NOW), S.closedMoveLine(cmA, NOW)],
    ["9월은 동의를 마친 달이라 배송완료해도 정산에 넣지 않습니다", "9월은 동의를 마친 달이라 배송완료해도 정산에 넣지 않습니다", "",
      "배송일시 변경 · 10-05 14:00 → 09-30 14:00 · 9월(동의를 마친 달)로 옮김"]);
  eq("⑪ F1 저장 줄(orderSaveLineOf) — '수정한 항목 1개 · {새 달 사정}' · title = 배송일시 줄 경고 · 확인 창 아님",
    S.orderSaveLineOf(mvA, 1, "", NOW),
    { text: "수정한 항목 1개 · 9월은 동의를 마친 달이라 배송완료해도 정산에 넣지 않습니다", tip: "9월은 동의를 마친 달이라 배송완료해도 정산에 넣지 않습니다", ask: false });
  /* 같은 달 안 · 발행 전 달끼리는 해당 없음 */
  eq("⑪ F1 같은 달 안(10월 안) · 발행 전 달 → 발행 전 달(11월) — 경고 없음",
    [S.settlementImpactOf(f1, { ...f1, deliverAt: "2026-10-28T09:00" }, NOW).closedMove, S.settlementImpactOf(f1, { ...f1, deliverAt: "2026-11-03T09:00" }, NOW).closedMove], [null, null]);
  /* 옮기며 배송완료(같은 저장 — 사진·인수자가 찬 주문접수) — 새 달 규칙: 9월로 표지 갈래 · 표지를 달고 다시 판정하면 막힘 없음 · 경고는 그대로 */
  const mvA2 = S.settlementImpactOf(f1, done({ ...f1, deliverAt: "2026-09-30T14:00" }), NOW);
  const reA2 = mvA2.unbill && S.settlementImpactOf(f1, S.withUnbilled(done({ ...f1, deliverAt: "2026-09-30T14:00" }), mvA2.unbill, NOW), NOW);
  eq("⑪ F1 옮기며 배송완료 — 9월로 표지 갈래(unbill agreed) · 다시 판정하면 막힘·바뀌는 달 없음 · closedMove 는 그대로(from scheduled)",
    [mvA2.unbill && mvA2.unbill.ym, mvA2.unbill && mvA2.unbill.why, reA2 && reA2.lock, reA2 && reA2.months.length, reA2 && reA2.closedMove && reA2.closedMove.from],
    [LAST, "agreed", null, 0, "scheduled"]);
  /* 화면 판정(admin-orders judge)은 표지를 단 다시 판정에 unbill 을 실어 준다 — 저장 줄은 표지 문장만(옛 달이 열린 달이라 E1 한 마디 없음 ·
     새 달 사정은 표지 문장이 이미 말해 두 번 서지 않는다) · title 은 이유만 */
  eq("⑪ F1 옮기며 배송완료 — 저장 줄(orderSaveLineOf)은 표지 문장만 · title 은 이유만",
    reA2 && S.orderSaveLineOf({ ...reA2, unbill: mvA2.unbill }, 1, "", NOW),
    { text: "수정한 항목 1개 · 저장하면 배송완료 · 9월 정산에는 넣지 않습니다", tip: RULES.LOCK_REASON.agreed, ask: false });
  /* 옮겨 저장 → 이력 한 줄이 같은 쓰기에 남는다(화면 commitSave 와 같은 길) → 9월·10월 금액·기록 그대로 */
  const svA = B2B.b2bUpsert({ ...f1, deliverAt: "2026-09-30T14:00", history: [...(f1.history || []), histEntry("edit", S.closedMoveLine(cmA, NOW), "2026-10-16 09:30")] });
  const hA = (B2B.b2bFind("n-f1-cur").history || []).slice(-1)[0];
  eq("⑪ F1 옮긴 저장 — 저장됨 · 이력 줄(edit · 날짜 → 날짜 · 어느 달로) · 9월·10월 금액·기록 그대로",
    [!!svA, hA && hA.type, hA && hA.label, so("C001", LAST).amount - a9, store.amountLogOf("C001", LAST).length - l9, so("C001", CUR).amount - a10],
    [true, "edit", "배송일시 변경 · 10-05 14:00 → 09-30 14:00 · 9월(동의를 마친 달)로 옮김", 0, 0, 0]);
  /* 옮긴 뒤 배송완료(스테퍼) — 그 달(9월) 규칙: 표지 → 9월 금액·기록 그대로 · 정산 줄 없음 */
  const sA = B2B.b2bFind("n-f1-cur");
  const imA = S.settlementImpactOf(sA, done(sA), NOW);
  eq("⑪ F1 옮긴 뒤 배송완료 — 9월 규칙: 표지 갈래(agreed) · 경고 없음(이미 9월 · 같은 달)", [imA.unbill && imA.unbill.why, imA.unbill && imA.unbill.ym, imA.closedMove], ["agreed", LAST, null]);
  const kA = B2B.b2bUpsert(S.withUnbilled(done(sA), imA.unbill, NOW));
  const sA2 = B2B.b2bFind("n-f1-cur");
  eq("⑪ F1 옮긴 뒤 배송완료 — 표지 · 정산 줄 없음 · 9월 금액·기록 그대로",
    [!!kA, sA2.unbilled && sA2.unbilled.ym, BE.isBilled(sA2), BE.entriesOfOrder(sA2).length, so("C001", LAST).amount - a9, store.amountLogOf("C001", LAST).length - l9],
    [true, LAST, false, 0, 0, 0]);
  /* 표지 붙은 주문 · 배송완료 주문 · 취소한 주문 — 해당 없음(배송완료 주문은 기존 잠금 규칙 그대로) */
  const mvMark = S.settlementImpactOf(sA2, { ...sA2, deliverAt: "2026-08-28T13:00" }, NOW);
  const fDone = mk("n-f1-done", "C001", "2026-10-06T14:00", { status: "배송완료", image: "data:image/jpeg;base64,AA", receiver: "상주" });
  const mvDone = S.settlementImpactOf(fDone, { ...fDone, deliverAt: "2026-09-30T14:00" }, NOW);
  const fCan = { ...f1, status: "취소", deliverAt: "2026-10-05T14:00" };
  const mvCan = S.settlementImpactOf(fCan, { ...fCan, deliverAt: "2026-09-30T14:00" }, NOW);
  const mvPendMark = S.settlementImpactOf({ ...f1, unbilled: { ym: CUR, at: "2026-10-16 09:30", why: "agreed" } }, { ...f1, unbilled: { ym: CUR, at: "2026-10-16 09:30", why: "agreed" }, deliverAt: "2026-09-30T14:00" }, NOW);
  eq("⑪ F1 해당 없음 — 표지 붙은 주문 · 배송완료 주문(잠긴 달로 — 기존 잠금 그대로) · 취소한 주문 · 표지 붙은 배송 전 모양",
    [mvMark.closedMove, mvDone.closedMove, !!mvDone.lock && mvDone.lock.ym, mvCan.closedMove, mvPendMark.closedMove], [null, null, LAST, null, null]);
  /* ② 고칠 수 있는 달(C027 9월 — 11일 그룹 · 수정 마감 10-27 10:00 · 시드 예시 E 의 고쳐서 0원 달 · 앞 구역의 동의 시험이 C021 9월을
     동의된 달로 만들어 C027 을 쓴다) → 발행이 지난 거래 없는 달(C027 8월 · NONE) */
  const s21 = so("C027", LAST), n21 = so("C027", PREV);
  const f2 = mk("n-f1-open", "C027", "2026-09-20T14:00");
  const mvB = S.settlementImpactOf(f2, { ...f2, deliverAt: "2026-08-20T14:00" }, NOW);
  const cmB = mvB.closedMove;
  eq("⑪ F1 고칠 수 있는 달 → 발행이 지난 거래 없는 달 — 전제(9월 열림 · 8월 NONE) · 막지 않음 · from open · to closed · 낱말 '명세서 발행이 지난 달'",
    [s21.issued && s21.editable && s21.status !== "NONE", n21.status, mvB.lock, mvB.months.length, cmB && cmB.from, cmB && cmB.to, cmB && cmB.toWord],
    [true, "NONE", null, 0, "open", "closed", RULES.ISSUED_EMPTY_SHORT]);
  eq("⑪ F1 고칠 수 있는 달 → NONE 달 — 경고 · 저장 줄 한 마디(note 없음) · 이력 한 줄",
    cmB && [S.closedMoveWarn(cmB, NOW), S.closedMoveNote(cmB, NOW), S.closedMoveLine(cmB, NOW)],
    ["8월은 명세서 발행이 지난 달이라 배송완료해도 정산에 넣지 않습니다", "", "배송일시 변경 · 09-20 14:00 → 08-20 14:00 · 8월(명세서 발행이 지난 달)로 옮김"]);
  eq("⑪ F1 고칠 수 있는 달 → 발행 전 달(10월) — 경고 없음(새 달이 열려 있다 · 기존 E1 시험과 같은 판정)",
    S.settlementImpactOf(f2, { ...f2, deliverAt: "2026-10-20T14:00" }, NOW).closedMove, null);
  const mvB2 = S.settlementImpactOf(f2, done({ ...f2, deliverAt: "2026-08-20T14:00" }), NOW);
  eq("⑪ F1 옮기며 배송완료(NONE 달로) — 표지 갈래 none", [mvB2.unbill && mvB2.unbill.why, mvB2.unbill && mvB2.unbill.ym], ["none", PREV]);
  /* 고칠 수 있는 달(C011 9월) → 잠긴 달(C011 8월 — 동의된 달) */
  const f4 = mk("n-f1-open2", "C011", "2026-09-21T14:00");
  const cmD = S.settlementImpactOf(f4, { ...f4, deliverAt: "2026-08-21T14:00" }, NOW).closedMove;
  eq("⑪ F1 고칠 수 있는 달 → 잠긴 달(C011) — from open · to closed · 경고 · 이력",
    cmD && [cmD.from, cmD.to, S.closedMoveWarn(cmD, NOW), S.closedMoveLine(cmD, NOW)],
    ["open", "closed", `8월은 ${S.closedMonthWord(so("C011", PREV))}이라 배송완료해도 정산에 넣지 않습니다`,
      `배송일시 변경 · 09-21 14:00 → 08-21 14:00 · 8월(${S.closedMonthWord(so("C011", PREV))})로 옮김`]);
  /* ③ 잠긴 달 → 잠긴 달(E1 과 겹침 · C001 9월 → 8월) — closedMove 하나 · 경고 한 문장 · 이력 한 줄(…에서 …로 옮김) · 저장 줄은 새 달을 한 번만 */
  const f3 = mk("n-f1-both", "C001", "2026-09-28T13:00");
  const mvC = S.settlementImpactOf(f3, { ...f3, deliverAt: "2026-08-28T13:00" }, NOW);
  const cmC = mvC.closedMove;
  const saveC = S.orderSaveLineOf(mvC, 1, "", NOW).text; // 화면(syncDirty)과 같은 함수 — 손으로 다시 짓지 않는다
  eq("⑪ F1 잠긴 달 → 잠긴 달 — 한 값(from closed · to closed) · 경고 한 문장 · 이력 한 줄 · 저장 줄에 새 달 사정은 한 번",
    cmC && [cmC.from, cmC.to, cmC.word, cmC.toWord, S.closedMoveWarn(cmC, NOW), S.closedMoveLine(cmC, NOW), saveC, saveC.split("8월").length - 1],
    ["closed", "closed", w9, w8, `9월은 ${w9} — 실제 배송일일 때만 옮기세요 · 8월은 ${w8}이라 배송완료해도 정산에 넣지 않습니다`,
      `배송일시 변경 · 09-28 13:00 → 08-28 13:00 · 9월(${w9})에서 8월(${w8})로 옮김`,
      `수정한 항목 1개 · 실제 배송일일 때만 · 9월(${w9})에서 옮김 · 8월은 ${w8}이라 배송완료해도 정산에 넣지 않습니다`, 1]);
  /* 잠긴 달 → 잠긴 달 + 같은 저장이 배송완료로(사진·인수자가 찬 주문접수) — 화면 판정(judge)대로 표지를 달고 다시 판정한 값에 unbill 을 싣는다.
     저장 줄 = E1 한 마디 + 표지 문장(새 달은 한 번) · title = 배송일시 줄 경고 · 이유 */
  const doneC = done({ ...f3, deliverAt: "2026-08-28T13:00" });
  const mvC2 = S.settlementImpactOf(f3, doneC, NOW);
  const reC2 = mvC2.unbill && S.settlementImpactOf(f3, S.withUnbilled(doneC, mvC2.unbill, NOW), NOW);
  const lnC2 = reC2 && S.orderSaveLineOf({ ...reC2, unbill: mvC2.unbill }, 1, "", NOW);
  eq("⑪ F1 잠긴 달 → 잠긴 달 + 같은 저장 배송완료 — 표지 갈래(8월) · 다시 판정 막힘 없음 · 저장 줄 E1 한 마디 + 표지 문장 · title 경고 · 이유",
    [mvC2.unbill && mvC2.unbill.ym, reC2 && reC2.lock, reC2 && !!reC2.closedMove, lnC2 && lnC2.text.split("8월").length - 1, lnC2],
    [PREV, null, true, 1,
      { text: `수정한 항목 1개 · 실제 배송일일 때만 · 9월(${w9})에서 옮김 · 저장하면 배송완료 · 8월 정산에는 넣지 않습니다`,
        tip: `9월은 ${w9} — 실제 배송일일 때만 옮기세요 · 8월은 ${w8}이라 배송완료해도 정산에 넣지 않습니다 · ${RULES.LOCK_REASON.agreed}`, ask: false }]);
  /* 해가 다르면 연도(E1 과 같은 규칙) */
  eq("⑪ F1 해가 바뀐 뒤의 이력 줄 — 연도를 붙인다",
    cmA && S.closedMoveLine(cmA, D(2027, 1, 5, 10)), "배송일시 변경 · 2026-10-05 14:00 → 2026-09-30 14:00 · 2026년 9월(동의를 마친 달)로 옮김");
  /* 뒷정리 */
  ["n-f1-cur", "n-f1-done", "n-f1-open", "n-f1-open2", "n-f1-both"].forEach((id) => B2B.b2bRemove(id));
  eq("⑪ F1 뒷정리 — 시험 주문이 남지 않는다 · 9월·10월 금액은 처음과 같다",
    [B2B.b2bList().some((o) => o.id.startsWith("n-f1-")), so("C001", LAST).amount, so("C001", CUR).amount], [false, a9, a10]);
}
{
  /* ⑪ F2 — 약관 동의 전 거래처의 '첫 명세서 일정 없음' 문장(2026-10-23 운영자 결정 F2 · util/settlement.js pendingOnlyOf · noScheduleLeadOf —
     거래처 목록 한 줄 · 정보 창 배너가 같이 쓴다). C022(약관 동의 전 · 주문 0건)에 시험 주문을 붙여 본다. 시험 주문(n-f2-…)은 끝에서 지운다. */
  const mk = (id, deliverAt, extra = {}) => B2B.b2bUpsert({
    id, orderNo: B2B.b2bNextOrderNo(), clientId: "C022", date: "2026/10/16 09:00", deliverAt, product: "3단화환(고급형)", amount: 60000,
    status: "주문접수", ordererName: "시험", address: "예시로 1", recipientName: "故 시험", recipientPhone: "010-0000-0199",
    receiver: "", image: "", manager: "", history: [], cancelFee: 0, ...extra,
  });
  const c22 = () => client("C022");
  const OLD = "아직 거래가 없어 첫 명세서 일정이 없습니다", NEW = "아직 배송완료된 주문이 없어 첫 명세서 일정이 없습니다";
  const look = () => [S.termsWatchOf(c22(), NOW), S.pendingOnlyOf(c22()), S.noScheduleLeadOf(c22())];
  eq("⑪ F2 전제 — C022 약관 동의 전 · 주문 0건", [B2B.b2bList().filter((o) => o.clientId === "C022").length, !c22().termsFirstAgreedAt], [0, true]);
  eq("⑪ F2 주문 0건 — 일정 없음 · 지금 문구 그대로", look(), [null, false, OLD]);
  mk("n-f2-zero", "2026-10-20T10:00", { amount: 0 });
  eq("⑪ F2 0원 배송 전 주문만 — 지금 문구 그대로(0원 주문만 · 2026-10-22 결정 B)", look(), [null, false, OLD]);
  mk("n-f2-pend", "2026-10-21T10:00");
  eq("⑪ F2 배송 전 주문(금액 있음)이 있고 배송완료 없음 — 일정 없음 · '아직 배송완료된 주문이 없어'", look(), [null, true, NEW]);
  eq("⑪ F2 아이디로도 같은 판정 · 없는 거래처는 false", [S.pendingOnlyOf("C022"), S.pendingOnlyOf(null), S.pendingOnlyOf("C999")], [true, false, false]);
  mk("n-f2-can", "2026-10-22T10:00", { status: "취소", amount: 70000 });
  eq("⑪ F2 취소한 주문(수수료 없음)은 세지 않는다 — 그대로 배송 전 주문만", look(), [null, true, NEW]);
  mk("n-f2-done0", "2026-10-15T10:00", { amount: 0, status: "배송완료", image: "data:image/jpeg;base64,AA", receiver: "상주" });
  eq("⑪ F2 0원 배송완료 주문이 생기면 — '배송완료된 주문이 없어' 가 거짓이라 지금 문구(거래 없음 — 결정 B)", look(), [null, false, OLD]);
  B2B.b2bRemove("n-f2-done0");
  B2B.b2bRemove("n-f2-pend");
  eq("⑪ F2 0원 배송 전 주문 + 취소 주문만 — 지금 문구", look(), [null, false, OLD]);
  ["n-f2-zero", "n-f2-can"].forEach((id) => B2B.b2bRemove(id));
  eq("⑪ F2 뒷정리 — 시험 주문이 남지 않는다", B2B.b2bList().some((o) => o.id.startsWith("n-f2-")), false);
  /* 시드 — 약관 동의 전 8곳 중 일정이 없는 곳과 그 문장(목록·정보 창이 이 값을 그대로 쓴다). 기대 문장을 직접 적는다 — 판정을 그 정의와
     다시 비교하면 틀릴 수 없다(2026-10-23 검증). 지금 시드에서 일정이 없는 곳은 주문 0건인 C022 하나다(배송 전 주문만 있는 시드 거래처는 없다 —
     그 갈래는 위 시험 주문이 덮는다). */
  const seedNull = store.get().clients.filter((c) => /^C02[0-7]$/.test(c.id) && !S.termsWatchOf(c, NOW));
  eq("⑪ F2 시드 — 일정 없는 약관 동의 전 거래처와 문장", seedNull.map((c) => [c.id, S.noScheduleLeadOf(c)]), [["C022", OLD]]);
}
{
  /* ⑧ 새로고침 뒤에도 표지가 남는다 — 이 파일을 다시 띄워(⑦ 수법) 표지를 단 저장소를 읽힌다 */
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const os = await import("node:os");
  const path = await import("node:path");
  const self = fileURLToPath(import.meta.url);
  const probe = (at, extra = {}) => JSON.parse(execFileSync(process.execPath, [self], {
    env: { ...process.env, BILLING_PROBE: at, ...extra }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim().split("\n").pop());
  const dump = path.join(os.tmpdir(), `test-billing-d3-${process.pid}.json`);
  try {
    const base = probe("2026-10-16T09:30");
    probe("2026-10-16T09:30", { BILLING_ACT: "unbill", BILLING_DUMP: dump });
    const re = probe("2026-10-16T09:30", { BILLING_STORE: dump });
    eq("⑪ D3 새로고침 뒤 — 배송완료 · 표지 그대로 · 정산 줄 없음", [re.U && re.U.st, re.U && re.U.mark, re.U && re.U.entries], ["배송완료", { ym: LAST, at: "2026-10-16 09:30", why: "agreed" }, 0]);
    eq("⑪ D3 새로고침 뒤 — 그 달(C001 9월) 상태·금액·기록은 표지 전과 같다", re.C001, base.C001);
    /* 옛 저장본 둘(2026-10-23 검증) — D2 전에 남은 배송 전 주문의 정산 금액 변경 기록 줄 · 개인정보 동의 칸이 없는 시드 거래처 레코드 */
    probe("2026-10-16T09:30", { BILLING_ACT: "touch", BILLING_DUMP: dump });
    const old = probe("2026-10-16T09:30", { BILLING_STORE: dump, BILLING_ACT: "oldLog" });
    eq("⑪ D2 옛 저장본 — 지금 배송 전 주문을 가리키는 줄은 버리고 배송완료 주문의 줄은 둔다", old.L.C011.filter((id) => String(id).startsWith("n-old-")), ["n-old-done"]);
    eq("⑪ D2 옛 저장본 — '발급 때' 금액 그대로 · 지금 금액은 배송완료 주문만큼 · 바뀐 횟수 +1(배송 전 주문 줄은 세지 않는다)",
      old.C011, [base.C011[0], base.C011[1] + 50000, base.C011[2], true, base.C011[4] + 1]);
    const pOld = probe("2026-10-16T09:30", { BILLING_STORE: dump, BILLING_ACT: "oldPrivacy" });
    eq("⑪ D6 옛 저장본의 시드 거래처 — 개인정보 동의 칸을 시드로 채우지 않는다(C001) · 칸이 있는 레코드는 그대로(C002)",
      [pOld.P.C001, pOld.P.C002], [[null, null], base.P.C002]);
    eq("⑪ D6 빈 저장소의 시드 — 가입일 09:00 · 지금 버전으로 동의(데모 첫 로그인에 게이트가 없다)", [base.P.C001, base.P.C002], [["2024-12-11 09:00", "2026-10-23"], ["2026-01-08 09:00", "2026-10-23"]]);
  } finally { try { fs.unlinkSync(dump); } catch { /* 없으면 그만 */ } }
}

/* ══ ⑧ '정지' 장치 걷어내기 · 고지 미도달 · 0원 주문만 있는 달 · 탈퇴 · 기한 뒤 발급 (2026-10-22 운영자 결정 A·B) ══════════════════
   A — 거래처 상태는 활성 · 승인대기 · 반려 · 탈퇴. '정지' 와 그 장치(statusLog · 정지 중 T3·T4 빼기 · 정지 중 마감 보류)는 없다.
   D1(2026-10-23) — 마감 하루 전 안내(T4)가 닿지 않은 달(바다향 C005 시드 — 발송 실패 기록)도 마감에 평소대로 자동 동의한다.
       마감 당일 다시 보내기와 고지 미도달 보류는 걷어 냈고, 닿지 않은 사실(t4.why)만 남는다.
   B — 0원 주문만 있는 달은 내역서를 내지 않는다(거래 없는 달 NONE 과 같다). 발급 뒤 고쳐서 0원은 그대로. */
const fa = (d) => (d ? RULES.fmtAt(d) : null);
const nw = (s) => [s.notice.t3.why, s.notice.t4 && s.notice.t4.why];
{
  /* 예전 '정지' 시드 둘 — 싱싱마켓(C009 · 정지·해제 이야기)과 다솜물산(C023 · 정지) — 은 평소 거래처가 됐다 */
  const c9 = client("C009");
  eq("⑧ 싱싱마켓 — 활성 · 상태 이력 칸 없음", [c9.status, "statusLog" in c9], ["활성", false]);
  const s9 = so("C009", LAST);
  eq("⑧ 싱싱마켓 9월 — 평소처럼 마감에 자동 동의 · 발급(보류 없음)", [s9.status, s9.mode, s9.autoAgreeHold, s9.heldAtDeadline], ["ISSUED", "auto", null, null]);
  eq("⑧ 싱싱마켓 9월 — T3·T4 닿음", nw(s9), [null, null]);
  const c23 = client("C023");
  const s23 = so("C023", LAST);
  eq("⑧ 다솜물산 — 활성(약관 동의 전은 그대로) · 9월분 T3·T4 나감 · 보류 이유는 약관",
    [c23.status, "statusLog" in c23, s23.autoAgreeHold, ...nw(s23)], ["활성", false, "TERMS_NOT_AGREED", null, null]);
  eq("⑧ 다솜물산 — 약관 경고는 남는다(마감 지난 달)", S.termsWatchOf(c23, NOW).held.length, 1);
  /* T4 발송 실패(바다향 9월)는 기록만 — 그 달은 마감(10-10 13:00)에 평소대로 자동 동의됐다(2026-10-23 운영자 결정 D1) */
  const s5 = so("C005", LAST);
  eq("⑧ 바다향 9월 — T4 닿지 않음 기록은 남고 마감에 자동 동의 · 발급(보류 없음)",
    [s5.status, s5.mode, fa(s5.agreedAt), s5.autoAgreeHold, s5.heldAtDeadline, ...nw(s5)], ["ISSUED", "auto", "2026-10-10 13:00", null, null, null, "UNDELIVERED"]);
  eq("⑧ 바다향 9월 — 다시 보내기 · 보류 칸 없음 · 조치 필요 아님", [["resend", "resendAt", "hold"].filter((k) => k in s5.notice).join(","), S.needsAction(s5)], ["", false]);
  const s5pre = so("C005", LAST, D(2026, 10, 10, 11));
  eq("⑧ 바다향 9월 — 마감 전(10-10 11:00) 동의대기 · 이유 없음 · 마감 1분 뒤 자동 동의",
    [s5pre.status, s5pre.autoAgreeHold, s5pre.notice.t4.why, so("C005", LAST, D(2026, 10, 10, 13, 1)).mode], ["AWAITING_AGREEMENT", null, "UNDELIVERED", "auto"]);
  eq("⑧ 마감 전 보류 예측(holdPendingOf)은 없다", "holdPendingOf" in S, false);
  eq("⑧ 온새미로 정산 담당 연락처 채움 — 알림 수신자 있음", [so("C026", LAST).noRecipient, store.getBillingContactOf("C026").phone], [false, "010-0000-0126"]);
  eq("⑧ 아무 거래처 — 평소대로 닿음", nw(so("C011", LAST)), [null, null]);
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
  const inNone = S.settlementImpactOf(null, { id: "", clientId: "C007", deliverAt: `${ZM}-25T10:00`, amount: 50000, status: "배송완료", product: "3단화환(기본형)" }, NOW);
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
  /* 옛 저장본(2026-10-19 ~ 10-22 코드) — '정지' 레코드 · 상태 이력 칸 · 옛 키 holds('NOTICE_UNDELIVERED' · 'CLIENT_SUSPENDED')를 읽으면:
     정지 → 활성 · 이력 칸은 버림 · 정지 중 마감 기록은 버림 · 고지 미도달 코드는 T4 발송 실패 기록(noticeFails "UNDELIVERED")으로 옮긴다
     (2026-10-23 결정 D1 — 보류가 아니다). 어느 달도 보류로 읽히지 않고 평소처럼 마감에 자동 동의된 달이다. */
  const raw = JSON.parse(localStorage.getItem("yeop.store.v5"));
  delete raw.noticeFails; // 새 키가 생기기 전의 저장본
  raw.holds = { C005: { [LAST]: "NOTICE_UNDELIVERED" }, C012: { [PREV]: "CLIENT_SUSPENDED" }, C013: { [LAST]: "CLIENT_SUSPENDED" } };
  raw.clients = raw.clients.map((c) => (c.id === "C015"
    ? { ...c, status: "정지", statusLog: [{ at: "2026-09-08 16:00", from: "활성", to: "정지" }] }
    : c.id === "C012" ? { ...c, statusLog: [{ at: "2026-09-08 16:00", from: "활성", to: "정지" }, { at: "2026-09-11 10:00", from: "정지", to: "활성" }] } : c));
  localStorage.setItem("yeop.store.v5", JSON.stringify(raw));
  store.hydrate();
  eq("⑧ hydrate — 옛 holds 의 고지 미도달만 T4 발송 실패 기록으로 옮긴다(정지 중 마감 기록은 버림 · 옛 키는 상태에 없다)",
    [JSON.stringify(store.get().noticeFails), "holds" in store.get()], [JSON.stringify({ C005: { [LAST]: "UNDELIVERED" } }), false]);
  eq("⑧ 옛 고지 미도달 달(바다향 9월) — 보류로 읽히지 않는다 · 자동 동의 · 닿지 않은 기록은 남음",
    [so("C005", LAST).mode, so("C005", LAST).autoAgreeHold, so("C005", LAST).heldAtDeadline, so("C005", LAST).notice.t4.why], ["auto", null, null, "UNDELIVERED"]);
  eq("⑧ hydrate — 옛 '정지' 레코드는 '활성' · 상태 이력 칸은 버림", [client("C015").status, "statusLog" in client("C015"), "statusLog" in client("C012")], ["활성", false, false]);
  eq("⑧ 옛 정지 중 마감 달 — 평소처럼 자동 동의(바른길 8월 · 다온 9월 · 윤지아 8월·9월)",
    [so("C012", PREV).mode, so("C012", PREV).autoAgreeHold, so("C013", LAST).mode, so("C015", PREV).mode, so("C015", LAST).mode], ["auto", null, "auto", "auto", "auto"]);
  eq("⑧ 옛 정지 레코드 — 이번 달(발행 전) 안내도 평소대로", nw(so("C015", CUR)), [null, null]);
  /* 다음 쓰기에 옮긴 값이 새 키로 저장되고 옛 키는 사라진다(persist 가 저장본을 통째로 다시 쓴다) */
  store.updateClient({ ...client("C001") });
  const saved = JSON.parse(localStorage.getItem("yeop.store.v5"));
  eq("⑧ 다음 쓰기 — 저장본에 새 키 noticeFails · 옛 키 holds 없음", [JSON.stringify(saved.noticeFails), "holds" in saved],
    [JSON.stringify({ C005: { [LAST]: "UNDELIVERED" } }), false]);
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
  eq("⑨-1 이번 달(발행 전) 안내도 평소대로", nw(so("C003", CUR)), [null, null]);
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
  /* 검토 9 — 예전 보류 예측(holdPendingOf)은 2026-10-23 결정 D1 로 보류가 없어져 지웠다. 세 화면(관리자 정산회계 · 포털 거래명세서 ·
     포털 정산회계)은 T4 가 닿지 않은 달에도 평소처럼 '…에 자동 동의됩니다' 를 말한다 — 그 근거가 맞는지 본다. */
  const n9 = so("C005", LAST, D(2026, 10, 10, 11)).notice;
  eq("⑨-9 바다향 9월 마감 전 — T4 닿지 않음 기록은 있고 보류 예측 칸은 없다", [n9.t4.why, "hold" in n9, "resend" in n9], ["UNDELIVERED", false, false]);
  eq("⑨-9 평소 달 — T4 닿음", so("C011", LAST).notice.t4.why, null);
  eq("⑨-9 마감이 지나도 보류가 서지 않는다(자동 동의)", [so("C005", LAST).autoAgreeHold, so("C005", LAST).mode], [null, "auto"]);
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
  /* 배송 전 주문은 정산에 들지 않는다(2026-10-23 운영자 결정 D2) — 그 달은 정산 전 달이 아니고, 배송 전 주문으로만 막는다. */
  eq("⑩ 탈퇴 · 접수대기 주문", b22 && [b22.open, b22.months.map((m) => `${m.ym}:${m.status}`), b22.reason],
    [1, [], "배송 전 주문 1건"]);
  // 배송완료로 바꿔도 이번 달 주문은 다음 달 명세서 · 입금이 끝나야 풀린다(배송 전 주문만 빠진다)
  B2B.b2bUpsert({ ...B2B.b2bFind("wd-t1"), status: "배송완료" });
  const b22b = W.withdrawBlockOf(client(WT), NOW);
  eq("⑩ 탈퇴 · 배송완료여도 이번 달 주문은 막는다", b22b && [b22b.open, b22b.months.length], [0, 1]);
  B2B.b2bRemove("wd-t1");
  eq("⑩ 탈퇴 · 주문을 지우면 다시 null", W.withdrawBlockOf(client(WT), NOW), null);
  // 모두 PAID/NONE 이면 null — C001 의 입금 전 달을 입금 처리하고, 이번 달 이후 주문은 지우고, 지난 달의 배송 전 주문은 배송완료로
  // (시드의 지난 달 주문은 모두 배송완료라 실제로는 없다 — 있으면 D2 로 그 달 금액이 바뀐다)
  const pre = W.withdrawBlockOf(client("C001"), NOW);
  eq("⑩ 탈퇴 · C001 은 막혀 있다(전제)", !!pre && pre.open > 0, true);
  pre.months.forEach((m) => { if (m.status === "ISSUED" || m.status === "OVERDUE") S.confirmPaymentFor(client("C001"), m.ym, undefined, NOW); });
  B2B.b2bList().filter((o) => o.clientId === "C001").forEach((o) => {
    /* 정산 줄의 달(취소 수수료는 취소한 달)로 가른다 — 배송 전 주문은 줄이 없어(D2) 배송일의 달로 */
    const e = BE.entriesOfOrder(o)[0];
    const ym = e ? e.ym : BE.normAt(o.deliverAt).slice(0, 7);
    if (ym >= CUR) B2B.b2bRemove(o.id);
    else if (["접수대기", "주문접수"].includes(o.status)) B2B.b2bUpsert({ ...o, status: "배송완료" });
  });
  eq("⑩ 탈퇴 · 모두 PAID/NONE → null", W.withdrawBlockOf(client("C001"), NOW), null);
  // 지난 달(이미 입금까지 끝난 달)이라도 배송 전 주문이 남아 있으면 막는다 — 배송 전 주문만 말한다
  //  · 쓰기 함수를 바로 불러 배송완료를 배송 전으로 되돌린다(화면은 앞으로만) — 입금까지 끝난 달에서 금액이 빠져 잠긴 달 경고가 난다(D2 · 시험이 삼킨다)
  const past = B2B.b2bList().find((o) => o.clientId === "C001" && o.status === "배송완료" && BE.normAt(o.deliverAt).slice(0, 7) < CUR);
  const warn0 = console.warn;
  console.warn = () => {};
  B2B.b2bUpsert({ ...past, status: "주문접수" });
  console.warn = warn0;
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
