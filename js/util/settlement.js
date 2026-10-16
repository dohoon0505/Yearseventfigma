/* ============================================================
   settlement.js — 정산 계산의 중심 (util/client.js 와 같은 층).

   2026-10-16 운영자 결정 '주문과 정산을 완전히 연결' — 정산 금액 · 포털 거래명세서 품목 · 대쉬보드 ·
   월간 리포트가 전부 **B2B 주문(b2b-mock, 배송일시의 달)** 에서 나온다. 예전엔 난수 이용 내역
   (admin-mock usageMonth)과 정적 명세서(invoice-mock)가 따로 놀아, 주문을 고쳐도 청구금액이 그대로였다.

   왜 여기인가 — store 와 b2b-mock 을 **둘 다** import 할 수 있는 층이 여기다. admin-mock 은 store 가,
   store 는 b2b-mock 이 import 하므로 그 아래층은 주문을 읽을 수 없다(거꾸로 걸면 순환).
     b2b-mock → store → admin-mock → settlement-rules   (b2b-mock → billing-entries · util/actor 도 — 둘 다 b2b-mock 을 모른다)
     util/settlement → b2b-mock · store · admin-mock · settlement-rules · billing-entries · util/client · util/actor ·
                       invoice-links(INVOICE_NOTE 낱말만)

   ── 명세서 행(billingRowsOf)의 규칙 (명세 3.4 · 5.4 · decisions-2026-10-04 맨 끝 두 절) ──
   · 주문 한 건의 기여는 `data/billing-entries.js` 한 곳이다(b2b-mock 의 정산 금액 변경 기록과 같은 규칙):
     귀속월 = 주문 **배송일시**의 년·월. 상태로 거르지 않는다(접수대기·주문접수·배송완료) — 금액 그대로, 0원 주문도 한 줄.
   · 취소한 주문은 금액이 빠지고, **수수료가 있으면 취소한 날의 달**(canceledAt — 없으면 이력의 cancel 시각)에 한 줄.
   · 삭제한 주문은 빠진다(b2bList 에 없다).
   · 줄 순서는 **주문 줄 먼저, 수수료 줄 뒤**(각각 날짜 내림차순 — 2026-10-16 S-02 '수수료 줄은 맨 아래').
   · billingRowsOf 의 행 모양은 invoice-doc 의 기존 행 [배송요청일 표기, 발송인, 배송지, 주문상품, 금액] 그대로다(옛 소비자 호환).
     수수료 줄의 **문서 모양**(S-02 — 날짜 'M월 D일 취소' · 발송인 '-' · '취소 수수료 · 주문번호 (배송 예정분을 … 취소)' · 회색 줄)은
     문서 빌더 `util/invoice-data.js::invoiceDocData` 가 만든다.

   ── 정산 상태(settlementOf)는 서버 대역 한 곳 ──
   SCHEDULED(발행 전) → AWAITING_AGREEMENT(동의대기) → AGREED(동의 · 계산서 발급 전) → ISSUED → PAID / OVERDUE.
   0원 달(명세 3.4 예외표 · '마감 전 수정' 9 · 10.4 Q21 잠정 ①) — 2026-10-16 발급 때 금액(issuedAmount)이 생겨 두 갈래로 가른다:
     · 발급 때부터 0원 → 발행과 함께 PAID(동의·계산서·입금 없음).
     · 발행 뒤 고쳐서 0원(zeroEdited — 줄이 남은 달도 · 취소·삭제로 줄이 다 빠진 달도) → 마감까지 AWAITING_AGREEMENT
       (open:false — 동의를 받지 않는다 · 보류 없음 · 수정 마감 전엔 다시 고칠 수 있다), 마감(13:00) 뒤 PAID.
   화면은 이 결과를 그대로 쓰고 날짜로 상태를 추정하지 않는다(명세 6.6 — editLockAt·editable 도 그렇다).

   ── 정산 금액 변경 기록 (2026-10-16 DATA.md 1.5 · 명세 5.4 issued_amount · amount_changed_at · 8.4) ──
   기록은 b2b-mock 이 주문 쓰기와 함께 남긴다(시드 줄 b2bSeedAmountChanges ∪ 사용자 줄 store.amountLog). 여기는 읽기만 한다:
     issuedAmount = 지금 금액 − Σ(after − before) — 발행 뒤 첫 변경의 '그 달 전' 금액과 같다(데모에는 발행 시각의 잡이 없다).
     amountChangedAt = 마지막 줄의 시각(순변동이 0이어도 줄이 있으면 남는다).

   ⚠️ 예전 문자열 필드는 아직 읽는 곳이 있는 셋(거래명세서동의 · 계산서발급 · 입금완료 — 리포트 · 대쉬보드 '정산 진행')만
      `settlementsFor` 가 status 에서 **파생해 유지**한다. 나머지(약관보류 · 마감 · 동의구분 · 동의시각 · 작성일자 · 보류 ·
      발행일 · 정산기한 …)는 S-01·S-03 이식 뒤 읽는 곳이 없어 지웠다(2026-10-16 통합 점검). '동의하기' 센티널은 계속 폐기
      상태다(PDF 로 새던 결함).
   ============================================================ */
import { store, einvoiceNoFor } from "../store.js";
import { b2bList, b2bVersion, b2bSeedAmountChanges } from "../data/b2b-mock.js";
import { DATA_NOW } from "../data/admin-mock.js";
import {
  invoiceDayOf, invoiceDayFor, issueDate, fmtKo, fmtKoShort, parseAt,
  periodOf, periodLabel, editLockAt, overdueAt, isPastOverdue, LOCK_REASON, LOCK_SHORT,
  issuedEmptyReason, ISSUED_EMPTY_SHORT,
} from "../data/settlement-rules.js";
import { entriesOfOrder, compareEntries, contributionDiff, causeOf, normAt } from "../data/billing-entries.js";
import { termsPending } from "./client.js";
import { currentActor } from "./actor.js";
import { INVOICE_NOTE } from "../data/invoice-links.js";

/* 정산회계 조회 → 거래명세서로 **어느 귀속월을 열지** 넘기는 세션 키(같은 탭 한정).
   라우터가 해시 완전일치로 매칭해 쿼리스트링을 실을 수 없어서 쓰는 우회다 — 받는 쪽(invoice.js)이
   읽고 바로 지운다. 두 페이지 모듈이 서로를 import 하지 않도록 여기에 둔다(규약). */
export const INVOICE_YM_KEY = "yeop.invoice.ym";

const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
/** "2026-06-30" → "2026년 06월 30일"(명세서 날짜 칸 규격 — 예전 INVOICE_DB 행과 같다) */
const koDay = (ymd) => `${ymd.slice(0, 4)}년 ${ymd.slice(5, 7)}월 ${ymd.slice(8, 10)}일`;

/* ── 주문 → (거래처, 귀속월) 색인 — 주문 쓰기마다 b2bVersion 이 올라 다시 만든다 ───────────── */
let idx = null;
let idxVer = -1;
function index() {
  const ver = b2bVersion();
  if (idx && idxVer === ver) return idx;
  const map = new Map();
  /* 줄 규칙은 data/billing-entries.js 한 곳(정산 금액 변경 기록과 같은 규칙). 정렬: 주문 줄 먼저 · 수수료 줄 뒤(각각 날짜 내림차순 ·
     같은 시각이면 주문번호 순 — 새로고침마다 줄이 흔들리지 않게). */
  b2bList().forEach((o) => {
    entriesOfOrder(o).forEach((e) => {
      if (!map.has(e.clientId)) map.set(e.clientId, new Map());
      const m = map.get(e.clientId);
      if (!m.has(e.ym)) m.set(e.ym, []);
      m.get(e.ym).push(e);
    });
  });
  map.forEach((m) => m.forEach((list) => list.sort(compareEntries)));
  idx = map;
  idxVer = ver;
  return idx;
}
const entriesOf = (clientId, ym) => ((index().get(clientId) || new Map()).get(ym) || []);

/* ── 정산 금액 변경 기록 색인 — 시드 줄 ∪ 사용자 줄. 사용자 줄은 주문 쓰기 때만 생긴다(b2bVersion 이 함께 오른다). ── */
let lineIdx = null;
let lineKey = null;
function linesIndex() {
  const ver = b2bVersion();
  const log = store.get().amountLog;
  if (lineIdx && lineKey && lineKey.ver === ver && lineKey.log === log) return lineIdx;
  const map = new Map();
  const add = (cid, ym, l) => {
    const k = `${cid}|${ym}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  };
  const seed = b2bSeedAmountChanges();
  Object.keys(seed).forEach((cid) => Object.keys(seed[cid]).forEach((ym) => seed[cid][ym].forEach((l) => add(cid, ym, l))));
  Object.keys(log || {}).forEach((cid) => Object.keys(log[cid] || {}).forEach((ym) => (log[cid][ym] || []).forEach((l) => add(cid, ym, l))));
  /* 시간순(같은 분이면 넣은 순서 — 안정 정렬) */
  map.forEach((list) => list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)));
  lineIdx = map;
  lineKey = { ver, log };
  return lineIdx;
}
/** 그 달의 기록 줄(발행 시각 이후 — 발행 전 달은 기록하지 않는다). */
function linesOf(clientId, ym, issueAt) {
  const list = linesIndex().get(`${clientId}|${ym}`) || [];
  const from = issueAt ? issueAt.getTime() : -Infinity;
  return list.filter((l) => { const t = parseAt(l.at); return !!t && t.getTime() >= from; });
}

/** 그 (거래처, 귀속월)의 명세서 행 — 드릴다운·명세서 문서·청구금액이 **같은 집합**을 본다(합 = 정산금액).
 *  각 줄: `{ kind: "order"|"cancelFee", orderNo, at("YYYY-MM-DD HH:mm" — 주문은 배송일시, 수수료는 취소일), ordererName, address, product, amount,
 *           orderId, clientId, ym, deliverAt?(수수료 줄 — 그 주문의 원래 배송 예정 일시 "YYYY-MM-DD HH:mm" · 없으면 "") }`
 *  순서: 주문 줄(날짜 내림차순) → 수수료 줄(날짜 내림차순). */
export function billingEntriesOf(client, ym) {
  return client ? entriesOf(client.id, ym).map((e) => ({ ...e })) : [];
}
/** invoice-doc 행 모양 — [배송요청일 표기, 발송인, 배송지, 주문상품, 금액] 배열(날짜 내림차순). */
export function billingRowsOf(client, ym) {
  return billingEntriesOf(client, ym).map((e) => [koDay(e.at), e.ordererName, e.address, e.product, e.amount]);
}

/* ── 이용 내역 (예전 admin-mock usageFor 의 자리 · 반환 모양 그대로) ─────────────────────── */
/** 명세서 행 → { items: { 품목: { count, amount } }, orders, total }. 수수료는 '취소 수수료' 품목 한 칸으로 묶인다 —
 *  드릴다운 합계·도넛 합계가 청구금액과 같아야 하기 때문이다(주문 건수 orders 에는 세지 않는다). */
function usageFromEntries(list) {
  const items = {};
  let total = 0, orders = 0;
  list.forEach((e) => {
    if (!items[e.product]) items[e.product] = { count: 0, amount: 0 };
    items[e.product].count += 1;
    items[e.product].amount += e.amount;
    total += e.amount;
    if (e.kind === "order") orders += 1;
  });
  return { items, orders, total };
}
/** 최근 6개월(DATA_NOW 기준, m=0 이 이번 달) 귀속월 키 */
const windowYms = () => [0, 1, 2, 3, 4, 5].map((m) => periodOf(new Date(DATA_NOW.getFullYear(), DATA_NOW.getMonth() - m, 1)));

const usageCache = new Map();
/** usageFor(client)["YYYY년 MM월"] = { items:{상품:{count,amount}}, orders, total } — 최근 6개월.
 *  ⚠️ 라벨은 조인 키다(정산 행 `청구년월` 과 문자열 비교) — settlement-rules.periodLabel 한 곳에서만 만든다. */
export function usageFor(client) {
  const ver = b2bVersion();
  const hit = usageCache.get(client.id);
  if (hit && hit.ver === ver) return hit.data;
  const data = {};
  windowYms().forEach((ym) => { data[periodLabel(ym)] = usageFromEntries(entriesOf(client.id, ym)); });
  usageCache.set(client.id, { ver, data });
  return data;
}
/** report.js 계약 유지용 — { [clientId]: usageFor } */
export const usageMap = (clients) => Object.fromEntries(clients.map((c) => [c.id, usageFor(c)]));

/* ── per-client 정산 행의 **바탕**(귀속월·금액) — 날짜·동의·발급·입금은 settlementsFor 가 settlementOf 로 얹는다 ─────── */
const settleCache = new Map();
export function settlementBaseRows(client) {
  /* 메모 키: 주문 버전 + 발급일 **이력 지문** + 회사명. 발급일을 바꾸면 이력이 붙어 키가 갈리고,
     주문을 고치면 버전이 올라 다시 계산된다("15일 → 1일 → 다시 15일" 도 이력이 달라 stale 이 남지 않는다). */
  const logKey = (client.invoiceDayLog || []).map((e) => `${e.from}:${e.day}`).join(",");
  const key = `${b2bVersion()}|${invoiceDayOf(client)}|${logKey}|${client.companyName}`;
  const hit = settleCache.get(client.id);
  if (hit && hit.key === key) return hit.rows;
  const usage = usageFor(client);
  /* 예전 표시 문자열(발행일시 · 정산기한일 · 발행일 · 정산기한 · 청구내역 · 입금자)은 S-01·S-03 이식 뒤 읽는 곳이 없어
     지웠다(2026-10-16 통합 점검) — 날짜는 settlementOf 의 issueAt·dueAt 을 쓴다. 남은 둘: 청구년월(report.js 조인 키 ·
     포털 정산 표) · 정산금액(report.js · 대쉬보드 '정산 진행'). */
  const rows = windowYms().map((ym, m) => {
    const label = periodLabel(ym);
    return {
      id: `${client.id}-${ym.replace("-", "")}`,
      ym, m,
      청구년월: label,
      정산금액: won(usage[label].total),
    };
  });
  settleCache.set(client.id, { key, rows });
  return rows;
}

/* ── 정산 상태 — 단일 파생 ───────────────────────────────────────────────── */
/** 정산 담당에게 알림(T3~T8)이 닿을 수 없는가 — 정산 담당이 없거나 연락처가 비었다. */
export function noRecipientOf(client) {
  const b = client ? store.getBillingContactOf(client.id) : null;
  return !b || !String(b.phone || "").trim();
}

/**
 * 한 (거래처, 귀속월)의 정산 상태(명세 5.4 · 6.6 응답의 데모 대역).
 * @returns {{ id, period, status: "SCHEDULED"|"AWAITING_AGREEMENT"|"AGREED"|"ISSUED"|"OVERDUE"|"PAID"|"NONE",
 *   autoAgreeHold: null|"TERMS_NOT_AGREED"|"NOTICE_UNDELIVERED"|"CLIENT_SUSPENDED",
 *   amount: number, count: number, feeCount: number, empty: boolean, zero: boolean, group: "early"|"late",
 *   issued: boolean, open: boolean, issueAt: Date, deadline: Date, dueAt: Date, overdueAt: Date,
 *   editLockAt: Date|null, editable: boolean, lockReason: string|null, lockShort: string|null,
 *   agreedAt: Date|null, mode: null|"manual"|"auto", docDate: Date|null,
 *   einvoice: { no, at: Date, mode: "auto"|"retry"|"manual", by: object|null }|null, einvoiceFail: { detail }|null,
 *   paidAt: Date|null, paidBy: object|null, termsHold: boolean, noRecipient: boolean,
 *   issuedAmount: number|null, amountChangedAt: Date|null, changed: boolean, changeCount: number,
 *   zeroEdited: boolean, zeroCloseAt: Date|null, docStamp: boolean }}
 * - 0원 달(zero — 줄은 있고 합이 0원): 발급 때부터 0원이면 발행 전 SCHEDULED, 발행 뒤 PAID(동의·계산서·입금 칸은 비운다).
 * - 고쳐서 0원(zeroEdited — 발행 뒤 금액이 0이 됐다 · issuedAmount > 0): 마감까지 AWAITING_AGREEMENT(open:false · 보류 없음),
 *   마감(13:00) 뒤 PAID. 줄이 다 빠진 달(취소·삭제)도 이 갈래다 — NONE 이 아니다(서버엔 그 달 Settlement 가 있다).
 *   그때 `empty` 는 true 그대로(줄이 없다는 사실), `zero` 는 false(줄이 없다).
 * - 거래 없는 달(empty — 줄이 0개 · 고쳐서 0원이 아님): 발행 전 SCHEDULED, 발행 뒤 NONE(정산이 없다 — 완료·미완료 어느 쪽에도 세지 않는다).
 * - 계산서: 동의(수동·자동)된 달은 동의 시각에 자동 발급된 것으로 파생(승인번호도 결정적 — 예시 꼴, 미확정 M62 · by: null = '자동').
 *   store.einvoiceFail 에 든 달만 AGREED 에 머물고, 다시 시도·직접 입력(store.einvoice)이 성공하면 ISSUED.
 * - OVERDUE: 계산서가 나간 미입금 달이 정산기한 다음 날 10:00 을 지났다(정각 포함 · 발급이 그 뒤면 발급 순간부터).
 * - editable: SCHEDULED · NONE 이거나 (AWAITING_AGREEMENT 이고 now < editLockAt). lockReason 은 명세 6.4 세 문구 중 하나,
 *   lockShort 는 그 짧은 말(settlement-rules LOCK_SHORT — 0원 달은 null).
 *   ⚠️ NONE 이 editable 인 것은 '잠글 정산이 없다' 는 뜻이다 — 그 달로 **들어오는** 주문은 settlementImpactOf 가 막는다(사용자 답 3).
 * - issuedAmount: 명세서 발행 순간 금액(발행 전·NONE 은 null) · amountChangedAt: 발행 뒤 마지막 변경 시각 ·
 *   changed: issuedAmount 가 있고 지금 금액과 다르다(동의·발급·입금 뒤에도 남는다) · changeCount: 발행 뒤 기록 줄 수
 *   (되돌려 순변동 0이어도 센다) · zeroCloseAt: 0원 달이 닫히는(닫힌) 시각 — 처음부터 0원 = issueAt, 고쳐서 0원 = deadline
 *   (닫혔는지는 status === "PAID") · docStamp: 문서에 '동의 전 — 금액이 바뀔 수 있습니다' + 출력 시각을 찍는 달 =
 *   명세서가 나갔고 동의 전이고 수정 마감 전(2026-10-16 사용자 답 1 — 수정 마감 뒤·보류 달은 찍지 않는다).
 * ⚠️ 변경 기록의 by·reason 은 여기 싣지 않는다 — 관리자 전용 정보라 `amountChangesOf` 로만 읽는다(포털 화면은 부르지 않는다).
 */
export function settlementOf(client, ym, now = new Date()) {
  const st = store.agreementOf(client.id, ym, now);
  const list = entriesOf(client.id, ym);
  const amount = list.reduce((a, e) => a + e.amount, 0);
  /* ⚠️ 줄이 하나도 없는 달(empty)과 줄은 있는데 합이 0원인 달(zero)은 **다른 달**이다. 0원 달은 '0원 주문만 있는 달'
     (명세 3.4 예외표 · 10.4 Q21)이고, 거래도 금액도 없는 달은 명세서·T3 자체가 없다(M05). 둘을 한 판정으로 묶으면
     가입 전 달·주문 0건 거래처의 달이 발행 시각에 '0원 · 계산서 없음 · 입금완료' 로 닫혀 정산완료 건수에 섞였다. */
  const empty = !list.length;
  const zero = !empty && amount === 0;
  /* 발급 때 금액 — 발행 뒤 기록 줄의 순변동을 지금 금액에서 뺀다(DATA.md 1.5). 기록이 없으면 지금 금액 그대로. */
  const lines = st.issued ? linesOf(client.id, ym, st.issueDate) : [];
  let issuedAmount = st.issued ? amount - lines.reduce((a, l) => a + (Number(l.after) - Number(l.before)), 0) : null;
  const zeroEdited = st.issued && amount === 0 && issuedAmount > 0;
  /* 거래가 없고 발급 때도 0원이었던 달(NONE)은 서버에 Settlement 가 없다 — 발급 때 금액도 없다. */
  if (empty && !zeroEdited) issuedAmount = null;
  const day = invoiceDayFor(client, ym);
  let status, mode = null, agreedAt = null, einvoice = null, paidAt = null, paidBy = null;
  const fail = store.einvoiceFailOf(client.id, ym);
  const pastDeadline = now.getTime() > st.deadline.getTime(); // 13:00:00.000 정각은 아직 열려 있다(agreementState 와 같다)
  /* NONE — 발행 시각이 지났는데 거래가 없는 달. 서버에는 Settlement 가 없는 달이다(프런트 표시용 상태 — 명세 6.6 에 없다).
     발행 전이면 아직 거래가 들어올 수 있어 SCHEDULED('발급예정'·'청구 전')로 둔다. */
  if (empty && !zeroEdited) status = st.issued ? "NONE" : "SCHEDULED";
  /* 발행 뒤 고쳐서 0원 — 마감까지 동의대기(동의는 받지 않는다 · open:false), 마감에 계산서 없이 닫힌다(명세 3.4 '마감 전 수정' 9).
     동의·계산서·입금 칸은 비운다(명세 6.6 — 발급 때부터 0원인 달과 같은 모양). */
  else if (zeroEdited) status = pastDeadline ? "PAID" : "AWAITING_AGREEMENT";
  /* 발급 때부터 0원 — 발행과 함께 닫는다(명세 3.4 예외표 '발급 때 0원'). */
  else if (zero) status = st.issued ? "PAID" : "SCHEDULED";
  else if (!st.mode) status = st.issued ? "AWAITING_AGREEMENT" : "SCHEDULED";
  else {
    mode = st.mode;
    agreedAt = st.at;
    const rec = store.einvoiceOf(client.id, ym);
    einvoice = rec
      ? { no: rec.no, at: parseAt(rec.at), mode: rec.mode, by: rec.by || null }
      : fail ? null : { no: einvoiceNoFor(client.id, ym, st.at), at: st.at, mode: "auto", by: null };
    const pay = einvoice ? store.paymentOf(client.id, ym) : null;
    if (!einvoice) status = "AGREED";
    else if (pay) { status = "PAID"; paidAt = parseAt(pay.at); paidBy = pay.by || null; }
    else status = isPastOverdue(ym, now) ? "OVERDUE" : "ISSUED";
  }
  const lockAt = st.issued ? editLockAt(ym, day) : null;
  /* NONE 은 잠글 정산이 없다(그 달로 들어오는 주문은 settlementImpactOf 가 막는다 — 사용자 답 3). */
  const editable = status === "SCHEDULED" || status === "NONE" || (status === "AWAITING_AGREEMENT" && now.getTime() < lockAt.getTime());
  const zeroish = zero || zeroEdited;
  const lockReason = editable ? null
    : zeroish ? LOCK_REASON.zero
    : status === "AWAITING_AGREEMENT" ? LOCK_REASON.editLock
    : LOCK_REASON.agreed;
  const lockShort = editable || zeroish ? null
    : status === "AWAITING_AGREEMENT" ? LOCK_SHORT.editLock
    : LOCK_SHORT.agreed;
  const waiting = status === "AWAITING_AGREEMENT";
  return {
    id: `${client.id}-${ym.replace("-", "")}`,
    period: ym, status,
    autoAgreeHold: waiting && !zeroEdited ? st.autoAgreeHold || null : null,
    amount, count: list.filter((e) => e.kind === "order").length, feeCount: list.filter((e) => e.kind === "cancelFee").length,
    empty, zero, group: st.group,
    issued: st.issued, open: waiting && !zeroEdited,
    issueAt: st.issueDate, deadline: st.deadline, dueAt: st.dueDate, overdueAt: overdueAt(ym),
    editLockAt: lockAt, editable, lockReason, lockShort,
    agreedAt, mode, docDate: zeroish ? null : st.docDate,
    einvoice, einvoiceFail: mode && !einvoice ? fail : null,
    paidAt, paidBy,
    termsHold: waiting && !zeroEdited && !!st.termsHold,
    noRecipient: noRecipientOf(client),
    issuedAmount,
    amountChangedAt: lines.length ? parseAt(lines[lines.length - 1].at) : null,
    changed: issuedAmount != null && issuedAmount !== amount,
    changeCount: lines.length,
    zeroEdited,
    zeroCloseAt: zeroEdited ? st.deadline : zero && st.issued ? st.issueDate : null,
    docStamp: waiting && st.issued && now.getTime() < lockAt.getTime(),
  };
}

/**
 * 그 (거래처, 귀속월)의 정산 금액 변경 기록 — **관리자 전용**(by · reason 이 들어 있다 · 포털 화면은 부르지 않는다).
 * S-01 펼침 '정산 금액 변경 기록' 카드 · 진행 기록이 읽는다.
 * @returns {{ lines: { id, at: Date, by, orderId, orderNo, cause, before, after, reason, pair?, move?, monthBefore, monthAfter }[],
 *            issuedAmount: number|null, amountChangedAt: Date|null }}
 *   lines 는 시간순(오래된 것이 [0]). before/after = 그 주문이 그 달에 보태던 금액 전 → 후,
 *   monthBefore/monthAfter = 그 달 금액 전 → 후(issuedAmount 에서 누적 — 마지막 monthAfter = 지금 금액).
 *   reason 이 "" 이면 화면은 '사유 없음'. 발행 전 달·NONE 은 { lines: [], issuedAmount: null, amountChangedAt: null }.
 */
export function amountChangesOf(client, ym, now = new Date()) {
  const s = settlementOf(client, ym, now);
  if (!s.issued || s.issuedAmount == null) return { lines: [], issuedAmount: s.issuedAmount, amountChangedAt: s.amountChangedAt };
  let run = s.issuedAmount;
  const lines = linesOf(client.id, ym, s.issueAt).map((l) => {
    const monthBefore = run;
    run += Number(l.after) - Number(l.before);
    return { ...l, by: l.by ? { ...l.by } : null, at: parseAt(l.at), monthBefore, monthAfter: run };
  });
  return { lines, issuedAmount: s.issuedAmount, amountChangedAt: s.amountChangedAt };
}

/** '발급 때 X원 → 지금 Y원 (M월 D일 수정)' — 금액이 바뀐 달(s.changed)의 한 줄. S-01 칩 title · S-02 요약 · S-03 안내가
 *  **같은 말**을 하게 한 곳에서 만든다(요청서 R9 문장 그대로). 바뀌지 않은 달이면 "". */
export function amountChangeLine(s) {
  if (!s || !s.changed) return "";
  const when = s.amountChangedAt ? ` (${fmtKoShort(s.amountChangedAt)} 수정)` : "";
  return `발급 때 ${won(s.issuedAmount)} → 지금 ${won(s.amount)}${when}`;
}

/* ── 저장 전 확인 · 잠금 검사의 단일 판정 (S-06 · 명세 3.4 '마감 전 수정' · 6.4 '정산 잠금' · 2026-10-16 DATA.md 2.3) ── */
const ymOfAt = (s) => normAt(s).slice(0, 7);
/**
 * 주문 한 건의 저장(stored → next)이 정산에 주는 영향. `stored` 가 null 이면 등록, `next` 가 null 이면 삭제.
 * 주문취소는 next 에 취소 뒤 모양(status '취소' · cancelFee · canceledAt)을 넘긴다.
 * @returns {{
 *   months: { ym, label, clientId, s, before, after, delta, orderBefore, orderAfter, isOld }[],
 *           // 줄이 바뀌는 달(touched — 금액이 같아도 줄 소속·주문상품이 바뀐 달 포함). before/after = 그 달 금액 전 → 후,
 *           // orderBefore/orderAfter = 이 주문이 그 달에 보태는 금액 전 → 후. s = 지금(저장 전) settlementOf.
 *           // 취소한 주문의 삭제는 귀속월(배송일시의 달)도 delta 0 으로 들어간다 — 잠금 검사만 한다(명세 6.4).
 *   confirm: months[],   // 저장 전 확인 창을 띄울 달 — 명세서가 나갔고(issued) · 고칠 수 있고(editable) · 금액이 실제로 바뀐다(delta ≠ 0)
 *   lock: { ym, label, s, moved, isOld, reason, short } | null,
 *           // 막힌 달 — 잠긴 달(!editable · reason = lockReason) 또는 발행 시각이 지난 거래 없는 달로 들어옴
 *           // (NONE · reason = issuedEmptyReason — 사용자 답 3). 이동이면 옛 달 먼저, 삭제는 앞선 달(명세 6.4).
 *   cause: "create"|"remove"|"feeRemove"|"cancel"|"move"|"product"|"amount"|null,   // data/billing-entries causeOf
 *   moved: boolean,   // 배송일시가 다른 달로
 * }}
 * - months 가 비면 금액·줄에 영향이 없는 저장이다(리본 문구 등) — 잠긴 달에서도 받는다(명세 6.4).
 * - confirm 이 비면 바로 저장한다. 사유는 b2bUpsert(rec, { note }) 로 넘긴다.
 */
export function settlementImpactOf(stored, next, now = new Date()) {
  const clients = store.get().clients;
  const moved = !!stored && !!next && stored.status !== "취소" && next.status !== "취소"
    && ymOfAt(stored.deliverAt) !== ymOfAt(next.deliverAt);
  const diff = contributionDiff(stored, next).filter((d) => d.touched);
  const oldYms = new Set(diff.filter((d) => entriesInclude(stored, d)).map((d) => `${d.clientId}|${d.ym}`));
  let months = diff.map((d) => {
    const c = clients.find((x) => x.id === d.clientId);
    if (!c) return null;
    const s = settlementOf(c, d.ym, now);
    return {
      ym: d.ym, label: periodLabel(d.ym), clientId: d.clientId, s,
      before: s.amount, after: s.amount + d.delta, delta: d.delta,
      orderBefore: d.before, orderAfter: d.after, isOld: oldYms.has(`${d.clientId}|${d.ym}`),
    };
  }).filter(Boolean);
  /* 취소한 주문의 삭제는 **귀속월(배송일시의 달)도** 잠금 검사를 한다(명세 6.4 'DELETE … 주문의 귀속월과 함께 canceled_at 의 달도
     잠금 검사 — 둘 중 하나라도 잠겼으면 거부'). 취소한 주문은 귀속월에 줄이 없어 위 차이에 그 달이 안 잡힌다 — 금액은 그대로라
     확인 창 대상은 아니다(delta 0). 옛 removeHit 과 같은 판정이다. */
  if (!next && stored && stored.status === "취소") {
    const dm = ymOfAt(stored.deliverAt);
    const c = clients.find((x) => x.id === stored.clientId);
    if (dm && c && !months.some((m) => m.clientId === c.id && m.ym === dm)) {
      const s = settlementOf(c, dm, now);
      months.push({ ym: dm, label: periodLabel(dm), clientId: c.id, s, before: s.amount, after: s.amount, delta: 0, orderBefore: 0, orderAfter: 0, isOld: true });
    }
  }
  /* 삭제는 앞선 달부터(배송 전에 미리 취소한 주문은 수수료 달이 귀속월보다 앞설 수 있다) · 그 밖은 옛 달 먼저. */
  months = next ? [...months].sort((a, b) => (a.isOld === b.isOld ? 0 : a.isOld ? -1 : 1)) : [...months].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0));
  const confirm = months.filter((m) => m.s.issued && m.s.editable && m.s.status !== "NONE" && m.delta !== 0);
  let lock = null;
  for (const m of months) {
    /* 거래 없는 달(NONE)은 그 달로 **들어오는** 주문만 막는다(사용자 답 3) — 나가는 쪽(옛 달)은 잠글 정산이 없다. */
    const closedEmpty = m.s.status === "NONE" && !m.isOld;
    if (closedEmpty || !m.s.editable) {
      lock = {
        ym: m.ym, label: m.label, s: m.s, moved, isOld: m.isOld,
        reason: closedEmpty ? issuedEmptyReason(m.ym) : m.s.lockReason,
        short: closedEmpty ? ISSUED_EMPTY_SHORT : m.s.lockShort || m.s.lockReason,
      };
      break;
    }
  }
  return { months, confirm, lock, cause: causeOf(stored, next), moved };
}
/* 그 달에 stored 의 줄이 있었는가(0원 주문 — 기여 0원이어도 '옛 달' 이다). */
function entriesInclude(o, d) {
  return entriesOfOrder(o).some((e) => e.clientId === d.clientId && e.ym === d.ym);
}
/**
 * 등록(B2B 등록 위저드 · 포털 접수)이 그 배송일시의 달로 주문을 넣을 수 있는가 — 막히면 settlementImpactOf 의 lock, 아니면 null.
 * 발행 시각이 지난 거래 없는 달(NONE)과 잠긴 달(동의된 달 · 수정 마감 지난 달 · 0원으로 닫는 달)을 막는다. 발행 전 달은 받는다.
 * `client` 는 거래처 레코드(또는 id), `deliverAt` 은 주문의 배송일시 문자열(어느 포맷이든).
 */
export function intakeBlockOf(client, deliverAt, now = new Date()) {
  const clientId = typeof client === "string" ? client : client && client.id;
  if (!clientId || !normAt(deliverAt)) return null;
  return settlementImpactOf(null, { id: "", clientId, deliverAt, amount: 0, status: "접수대기", product: "" }, now).lock;
}

/**
 * 미입금인 달인가 — **명세서가 나갔고**(발행 시각이 지남) · 입금 전이고 · 청구할 금액이 있는 달.
 * 동의 전(AWAITING_AGREEMENT — 보류 3종 포함)·계산서 발급 전(AGREED) 달도 센다 — 계산서 발급 여부와 무관하다
 * (2026-10-16 사용자 결정 A). 세지 않는 달: 아직 발행 전(SCHEDULED — 이번 달은 늘 여기) · 0원 달(발행과 함께 닫힌다) ·
 * 거래 없는 달(NONE) · 입금완료(PAID).
 * 관리자 정산회계 표 머리 '미입금' · 월간 분석(report.js — 화면 KPI '미입금액' · 정산 진행 현황 · 리포트 PDF) · 대쉬보드
 * KPI '미수금' · '정산 진행' 카드 '미입금' 이 **이 판정 하나**를 쓴다. 예전엔 셋이 달랐다 — 표 머리는 계산서가 나간 달
 * (ISSUED·OVERDUE)만, 리포트·대쉬보드는 `입금완료 !== "입금완료"` 라 아직 발행 전인 달까지 세어, 같은 9월을 다른 금액으로
 * 말했고 이번 달 '미수금' 은 그 달 청구 전액이었다. settlementOf 결과나 settlementsFor 행을 받는다.
 */
export const isUnpaid = (s) => !!s && !!s.issued && !s.zero && !s.empty && s.status !== "PAID";

/**
 * 한 거래처의 최근 6개월 정산 행(m=0 이 이번 달 귀속) = 바탕(귀속월·금액) + settlementOf.
 * 예전 문자열 필드는 아직 읽는 곳이 있는 셋(거래명세서동의 · 계산서발급 · 입금완료 — report.js 정산 진행 · 대쉬보드
 * '정산 진행')만 status 에서 파생해 남긴다. 마감 · 동의구분 · 동의시각 · 작성일자 · 약관보류 · 보류 는 S-01·S-03 이식 뒤
 * 읽는 곳이 없어 지웠다(2026-10-16 통합 점검) — 새 화면은 settlementOf 의 deadline · mode · agreedAt · docDate · autoAgreeHold 를 쓴다.
 * 표시 문자열은 호출부가 포맷한다(html`` 은 Date 를 String() 으로 찍는다).
 */
export function settlementsFor(client, now = new Date()) {
  return settlementBaseRows(client).map((b) => {
    const s = settlementOf(client, b.ym, now);
    /* 0원 달(발급 때부터 · 고쳐서 0원 모두)은 동의·계산서·입금이 없다 — 세 칸 모두 '해당없음'. 이 칸을 읽는 report.js ·
       대쉬보드는 0원 달을 이미 빼고 센다(inSettlementFlow 와 같은 두 칸) — 숫자는 그대로다. */
    const zeroish = (s.zero || s.zeroEdited) && s.issued;
    const none = s.status === "NONE";
    return {
      ...b,
      ...s,
      /* 0원으로 닫힌(닫히는) 달은 동의·계산서가 없다 — '해당없음'(배지 대신 '0원 · 계산서 없음' 을 찍는다). */
      /* 거래가 없는 달(NONE)은 '거래없음' — 청구서가 없으니 입금완료도 미입금도 아니다. */
      거래명세서동의: none ? "거래없음" : zeroish ? "해당없음" : s.mode ? "동의완료" : !s.issued ? "발급예정" : "동의대기",
      계산서발급: none ? "거래없음" : zeroish ? "해당없음" : s.einvoice ? "발급완료" : "발급대기",
      /* '미입금' 은 isUnpaid 한 판정의 결과다(report.js 가 이 칸을 읽는다 — data 층이라 util 을 import 하지 않는다).
         아직 발행 전인 달은 '청구전' — 낼 청구서가 아직 없어 미입금이 아니다(사용자 결정 A). */
      입금완료: none ? "거래없음" : zeroish ? "해당없음" : s.status === "PAID" ? "입금완료" : isUnpaid(s) ? "미입금" : "청구전",
    };
  });
}
/** report.js 계약 유지용 — { [clientId]: rows } */
export const settlementsMap = (clients, now = new Date()) =>
  Object.fromEntries(clients.map((c) => [c.id, settlementsFor(c, now)]));

/** 조치가 필요한 이유들(없으면 빈 배열) — 보류 3종 · 계산서 발급 전(AGREED)에 머문 달 · 기한 초과 · 알림 수신자 없음. */
export function actionReasons(row) {
  if (!row) return [];
  const out = [];
  if (row.autoAgreeHold) out.push(row.autoAgreeHold);
  if (row.status === "AGREED") out.push("EINVOICE_PENDING");
  if (row.status === "OVERDUE") out.push("OVERDUE");
  /* 청구할 것이 남은 달만 — 0원·입금 끝난 달은 알림을 보낼 일이 없다. */
  if (row.noRecipient && !row.zero && !row.empty && row.status !== "PAID") out.push("NO_RECIPIENT");
  return out;
}

/** 정산 절차(명세서 → 동의 → 계산서 → 입금)를 밟는 달인가 — 0원 달(발행과 함께 닫힘)과 거래 없는 달은 아니다.
 *  관리자 정산 진행 카드(report.js)와 대쉬보드 '정산 진행' 이 같은 판정을 쓴다(예전엔 둘이 달라 같은 9월을 다른 수로 말했다). */
export const inSettlementFlow = (row) => !!row && !row.zero && !row.empty;

/** 문서의 '계산서 발행' 칸 낱말(S-02 시안 · 상태별) — settlementOf 결과나 settlementsFor 행을 받는다.
 *  동의 여부가 아니라 **계산서가 실제로 나갔는지**를 말한다.
 *  발행 전 '발행 전' · 거래 없음 '해당 없음' · 0원 '해당 없음(0원)' · 동의대기 '발급대기 · 동의 후 발급' ·
 *  동의했지만 계산서 전(AGREED — 발급 실패·재시도) '발급 중' · 계산서가 나간 달(ISSUED·OVERDUE·PAID) '발급완료'.
 *  ⚠️ 발행 전이 거래 없음보다 먼저다 — 주문이 아직 0건인 이번 달도 '발행 전' 이다(2026-10-16 결정 D: 관리자·포털 정산회계가
 *     이미 '발행 전 · M월 D일 10:00 발급' 이라고 말한다). '해당 없음' 은 발행 시각이 지났는데 거래가 없는 달(NONE)뿐이다.
 *  고쳐서 0원(zeroEdited)은 줄이 다 빠졌어도 '해당 없음(0원)' 이다(명세서가 나갔던 달 — '해당 없음' 이면 거래처가 받은
 *  명세서가 사라진 것처럼 읽힌다 · DATA.md Q3).
 *  포털 미리보기 · 관리자 정산 PDF · 공개 열람 링크가 쓴다(문서 빌더 util/invoice-data.js `invoiceDocData` 한 곳을 지난다).
 *  (옛 두 낱말 판정 `invoiceNoteOf` 는 호출부가 없어져 지웠다 — 2026-10-16 통합 점검) */
export const invoiceDocNoteOf = (s) => (
  !s ? INVOICE_NOTE.wait
    : s.status === "SCHEDULED" ? INVOICE_NOTE.scheduled
    : s.zeroEdited ? INVOICE_NOTE.zero
    : s.empty ? INVOICE_NOTE.none
    : s.zero ? INVOICE_NOTE.zero
    : s.status === "AWAITING_AGREEMENT" ? INVOICE_NOTE.awaiting
    : s.status === "AGREED" ? INVOICE_NOTE.issuing
    : INVOICE_NOTE.done
);
/** 조치 필요 — settlementOf 결과나 settlementsFor 행을 받는다. */
export const needsAction = (row) => actionReasons(row).length > 0;

/* S-04·S-05 — 약관 동의 전 거래처의 명세서 일정(거래처 목록 한 줄 · 정보 창 배너 · 대쉬보드 약관 경고).
   (첫 달만 보던 `firstStatementOf` 는 대쉬보드가 이 함수로 옮겨 호출부가 없어져 지웠다 — 2026-10-16 통합 점검) */
/**
 * 약관 동의 전 거래처의 **명세서 일정 경고**. 약관에 동의했거나(termsPending 이 아니면) 주문이 없으면 null.
 * 상태는 settlementOf 에서 끌어온다 — 화면이 날짜로 상태를 짐작하지 않는다(명세 6.6).
 * - held: 약관 동의 전에 마감이 지나 **자동 동의하지 않은** 달들(autoAgreeHold TERMS_NOT_AGREED · 오래된 순)
 *   `[{ ym, label, issueAt, deadline, first }]`. 그 달은 마감 뒤에도 수동 동의를 기다린다(명세 3.4 예외표) — 그래서
 *   거래처가 약관에 동의할 때까지 경고를 남긴다(운영자 결정 6).
 * - next: 그 밖에 아직 마감 전인 가장 이른 달 — `{ ym, label, issueAt, deadline, dDay, phase: "before"|"open", first }` 또는 null.
 *   first = 그 달이 첫 명세서(거래가 있는 가장 이른 귀속월 — 배송일의 달 또는 수수료 취소의 취소한 달)인가 ·
 *   dDay = 오늘 → 발급일의 달력일 차. 0원으로 닫힌 첫 달(가입 혜택 '1회 무료')은 건너뛰므로 next 가 첫 달이 아닐 수 있다.
 * - hot: next 가 7일 이내 발급이거나 발급 뒤 마감 전 · 또는 held 가 있다(마감이 지나도 약관 동의 전이면 남는다).
 * - firstZero: 첫 달(거래가 있는 가장 이른 귀속월)이 0원으로 **닫혔으면** `{ ym, label }`, 아니면 null(S-05 '첫 달(M월분)은
 *   0원이라 계산서 없이 닫혔습니다'). 0원 달(발급 때부터 · 고쳐서 0원)은 동의 대상이 아니라 held·next 어디에도 넣지 않는다 —
 *   고쳐서 0원이 된 달(마감 전 AWAITING · 동의 버튼 없음)을 '동의 기다리는 달' 로 경고하면 거짓 경고다.
 * 거래처 목록(S-04)과 대쉬보드 약관 경고(S-05)가 **같은 이 판정**을 쓴다 — 예전엔 대쉬보드가 첫 달만 보는 별도 판정이라
 * 첫 달이 0원으로 닫힌 거래처를 목록은 'D-4' 로 경고하는데 대쉬보드는 놓쳤다(2026-10-16 통합 점검 실측).
 */
export function termsWatchOf(client, now = new Date()) {
  if (!client || !termsPending(client)) return null;
  const m = index().get(client.id);
  const yms = m ? [...m.keys()].filter((ym) => m.get(ym).length).sort() : [];
  if (!yms.length) return null;
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const held = [];
  let next = null;
  let firstZero = null;
  yms.forEach((ym) => {
    const s = settlementOf(client, ym, now);
    if ((s.zero || s.zeroEdited) && s.status === "PAID" && ym === yms[0]) firstZero = { ym, label: periodLabel(ym) };
    if (s.autoAgreeHold === "TERMS_NOT_AGREED") {
      held.push({ ym, label: periodLabel(ym), issueAt: s.issueAt, deadline: s.deadline, first: ym === yms[0] });
      return;
    }
    if (next) return;
    /* 0원 달(닫혔든 마감 전이든)·동의된 달은 동의를 기다리지 않는다 — 다음 후보로 넘어간다. */
    if (s.zero || s.zeroEdited) return;
    if (s.status !== "SCHEDULED" && !(s.status === "AWAITING_AGREEMENT" && !s.autoAgreeHold)) return;
    const d1 = new Date(s.issueAt.getFullYear(), s.issueAt.getMonth(), s.issueAt.getDate());
    next = {
      ym, label: periodLabel(ym), issueAt: s.issueAt, deadline: s.deadline,
      dDay: Math.round((d1 - d0) / 864e5), phase: s.issued ? "open" : "before", first: ym === yms[0],
    };
  });
  const hot = held.length > 0 || (!!next && (next.phase === "open" || next.dDay <= 7));
  return { held, next, hot, firstZero };
}

/* ── 포털 거래명세서의 달 (예전 invoice-mock 의 자리 · 시그니처 그대로) ─────────────────────── */
/** 명세서 발행일 표기("2026년 09월 15일") — **그 귀속월에 유효했던** 발급일로. */
const issueOf = (client, ym) => fmtKo(issueDate(ym, invoiceDayFor(client, ym)));
/** 한 달치. 없는 달도 빈 껍데기를 돌려준다(호출부가 null 분기를 하지 않게). */
export function invoiceMonth(client, ym) {
  const rows = billingRowsOf(client, ym);
  /* count = **주문** 건수 — 취소 수수료 줄은 세지 않는다(settlementOf.count · usageFor.orders · 관리자 '주문 건수' 와 같은 규칙).
     줄 수로 세면 수수료가 있는 달만 화면마다 건수가 갈렸다. 수수료 줄의 표기는 디자이너 몫(운영자 결정 1)이라 여기서는 세지만 않는다. */
  const count = client ? entriesOf(client.id, ym).filter((e) => e.kind === "order").length : 0;
  /* fees = 취소 수수료 줄 수(settlementOf.feeCount 와 같다 — S-02 '거래 10건 · 수수료 1건'). 더하기만 한 칸이다. */
  const fees = client ? entriesOf(client.id, ym).filter((e) => e.kind === "cancelFee").length : 0;
  return { ym, rows, issue: rows.length ? issueOf(client, ym) : "", count, fees, total: rows.reduce((a, r) => a + r[4], 0), empty: !rows.length };
}
/** 한 해를 12칸으로. **거래가 없는 달도 칸을 만든다**(빈 해로 가면 12칸 모두 empty). */
export function monthsOf(client, year) {
  return MONTHS.map((mm) => ({ ...invoiceMonth(client, `${year}-${mm}`), mm }));
}
/** 화면의 기본 선택월("YYYY-MM") — 거래가 있는 달 중 **명세서가 이미 발행된** 가장 최근 달.
 *  주문이 정산과 이어진 뒤(2026-10-16)로는 이번 달에도 거의 늘 거래가 있어서 '거래가 있는 가장 최근 달'만 보면
 *  아직 발행 전이라 네 버튼이 모두 잠긴 이번 달이 열린다 — 거래처가 보러 오는 것은 받은 명세서다.
 *  발행된 달이 없으면(첫 명세서 전) 오늘이 속한 달까지 중 거래가 있는 가장 최근 달, 그것도 없으면 지난달.
 *  다음 달 이후 배송 예약만 있는 달은 기본으로 열지 않는다(명세 6.6 · 2026-10-15 귀속월 배송일 기준). ⚠️ 상수로 박지 말 것. */
export function latestInvoiceKey(client, now = new Date()) {
  const cur = periodOf(now);
  const m = client ? index().get(client.id) : null;
  const keys = m ? [...m.keys()].filter((k) => k <= cur && m.get(k).length).sort() : [];
  const issued = keys.filter((k) => issueDate(k, invoiceDayFor(client, k)) <= now);
  return issued.pop() || keys.pop() || periodOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

/* ── 쓰기 — 상태를 settlementOf 로 한 번 더 거른 뒤 store 에 기록한다 ─────────────────────── */
/* (예전 `agreementFor` — 동의 상태 + 0원 여부 — 는 포털 거래명세서가 settlementOf 로 옮겨 호출부가 없어져 지웠다.
   0원 달은 동의를 받지 않는다는 규칙은 settlementOf(zero → PAID · 고쳐서 0원 → open:false) 와 store.agreeInvoice
   (보여 준 금액도 0 → null) 가 지킨다.) */
/** 거래처의 계산서 발급 동의 — **화면이 보여 준 금액**(shownAmount)을 함께 보낸다(명세 3.4 '마감 전 수정' 5).
 *  반환: 동의 시각 문자열 · null(동의할 수 없는 상태 — 마감 지나 자동 동의 등 · 보여 준 금액도 지금 금액도 0) ·
 *        `{ error: "SETTLEMENT_AMOUNT_CHANGED", amount, issuedAmount }`(그 사이 금액이 바뀜 — **금액 불일치를 먼저 본다**:
 *          고쳐서 0원이 된 달이면 amount 0. 화면은 새 금액을 보여 주고 다시 받는다 — 바뀐 시각은 settlementOf().amountChangedAt) ·
 *        `{ error: "STORAGE_FULL" }`(저장 공간 부족 — 동의가 기록되지 않았다). */
export function agreeSettlement(client, ym, shownAmount, now = new Date()) {
  const s = settlementOf(client, ym, now);
  return store.agreeInvoice(client.id, ym, { amount: shownAmount, currentAmount: s.amount, issuedAmount: s.issuedAmount }, now);
}
/** 계산서 발급 재시도·수기 입력 — AGREED 에서만(그 밖이면 null). 결과는 store.issueEinvoice 와 같다
 *  (`{ error: "STORAGE_FULL" }` 포함). 처리자(by)는 지금 화면을 쓰는 사람(util/actor currentActor)이다. */
export function issueEinvoiceFor(client, ym, opts, now = new Date()) {
  if (settlementOf(client, ym, now).status !== "AGREED") return null;
  return store.issueEinvoice(client.id, ym, { ...(opts || {}), by: (opts && opts.by) || currentActor() }, now);
}
/** 입금 확인 — 계산서가 나간 미입금 달(ISSUED·OVERDUE)에서만(그 밖이면 null). `{ error: "STORAGE_FULL" }` 이면 기록되지 않았다.
 *  처리자(by)는 지금 화면을 쓰는 사람. */
export function confirmPaymentFor(client, ym, at, now = new Date(), by = null) {
  const s = settlementOf(client, ym, now).status;
  if (s !== "ISSUED" && s !== "OVERDUE") return null;
  return store.confirmPayment(client.id, ym, at, now, by || currentActor());
}
