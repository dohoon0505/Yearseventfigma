/* ============================================================
   settlement.js — 정산 계산의 중심 (util/client.js 와 같은 층).

   2026-10-16 운영자 결정 '주문과 정산을 완전히 연결' — 정산 금액 · 포털 거래명세서 품목 · 대쉬보드 ·
   월간 리포트가 전부 **B2B 주문(b2b-mock, 배송일시의 달)** 에서 나온다. 예전엔 난수 이용 내역
   (admin-mock usageMonth)과 정적 명세서(invoice-mock)가 따로 놀아, 주문을 고쳐도 청구금액이 그대로였다.

   왜 여기인가 — store 와 b2b-mock 을 **둘 다** import 할 수 있는 층이 여기다. admin-mock 은 store 가,
   store 는 b2b-mock 이 import 하므로 그 아래층은 주문을 읽을 수 없다(거꾸로 걸면 순환).
     b2b-mock → store → admin-mock → settlement-rules
     util/settlement → b2b-mock · store · admin-mock · settlement-rules · util/client · invoice-links(INVOICE_NOTE 낱말만)

   ── 명세서 행(billingRowsOf)의 규칙 (명세 3.4 · 5.4 · decisions-2026-10-04 맨 끝 두 절) ──
   · 귀속월 = 주문 **배송일시**의 년·월. 상태로 거르지 않는다(접수대기·주문접수·배송완료) — 금액 그대로, 0원 주문도 한 줄.
   · 취소한 주문은 금액이 빠지고, **수수료가 있으면 취소한 날의 달**(canceledAt — 없으면 이력의 cancel 시각)에 한 줄.
   · 삭제한 주문은 빠진다(b2bList 에 없다).
   · 행 모양은 invoice-doc 의 기존 행 [배송요청일 표기, 발송인, 배송지, 주문상품, 금액] 그대로다. 수수료 행은
     [취소일 표기, 주문자, '주문취소 · 주문번호', '취소 수수료', 수수료] — 새 모양을 두지 않는다(운영자 결정 1).

   ── 정산 상태(settlementOf)는 서버 대역 한 곳 ──
   SCHEDULED(발행 전) → AWAITING_AGREEMENT(동의대기) → AGREED(동의 · 계산서 발급 전) → ISSUED → PAID / OVERDUE.
   0원 달은 발행과 함께 PAID 로 닫힌다(동의·계산서·입금 없음 — 10.4 Q21 잠정 ①). 화면은 이 결과를 그대로 쓰고
   날짜로 상태를 추정하지 않는다(명세 6.6 — editLockAt·editable 도 그렇다).

   ⚠️ 예전 문자열 필드는 아직 읽는 곳이 있는 셋(거래명세서동의 · 계산서발급 · 입금완료 — 리포트 · 대쉬보드 '정산 진행')만
      `settlementsFor` 가 status 에서 **파생해 유지**한다. 나머지(약관보류 · 마감 · 동의구분 · 동의시각 · 작성일자 · 보류 ·
      발행일 · 정산기한 …)는 S-01·S-03 이식 뒤 읽는 곳이 없어 지웠다(2026-10-16 통합 점검). '동의하기' 센티널은 계속 폐기
      상태다(PDF 로 새던 결함).
   ============================================================ */
import { store, einvoiceNoFor } from "../store.js";
import { b2bList, b2bVersion } from "../data/b2b-mock.js";
import { DATA_NOW } from "../data/admin-mock.js";
import {
  invoiceDayOf, invoiceDayFor, issueDate, fmtKo, parseAt,
  periodOf, periodLabel, editLockAt, overdueAt, isPastOverdue, LOCK_REASON,
} from "../data/settlement-rules.js";
import { termsPending } from "./client.js";
import { INVOICE_NOTE } from "../data/invoice-links.js";

/* 정산회계 조회 → 거래명세서로 **어느 귀속월을 열지** 넘기는 세션 키(같은 탭 한정).
   라우터가 해시 완전일치로 매칭해 쿼리스트링을 실을 수 없어서 쓰는 우회다 — 받는 쪽(invoice.js)이
   읽고 바로 지운다. 두 페이지 모듈이 서로를 import 하지 않도록 여기에 둔다(규약). */
export const INVOICE_YM_KEY = "yeop.invoice.ym";

const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
/** "2026-06-30" → "2026년 06월 30일"(명세서 날짜 칸 규격 — 예전 INVOICE_DB 행과 같다) */
const koDay = (ymd) => `${ymd.slice(0, 4)}년 ${ymd.slice(5, 7)}월 ${ymd.slice(8, 10)}일`;
/** 주문의 날짜 문자열("YYYY-MM-DDTHH:mm" · "YYYY/MM/DD HH:mm" · "YYYY-MM-DD HH:mm") → "YYYY-MM-DD HH:mm" 또는 "" */
function normAt(s) {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || ""));
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4] || "00"}:${m[5] || "00"}` : "";
}
/** 취소한 시각 — 레코드의 canceledAt, 없으면(옛 저장본) 처리 이력의 마지막 cancel 줄. */
function canceledAtOf(o) {
  const own = normAt(o.canceledAt);
  if (own) return own;
  const h = (o.history || []).filter((x) => x && x.type === "cancel").pop();
  return h ? normAt(h.at) : "";
}

/* ── 주문 → (거래처, 귀속월) 색인 — 주문 쓰기마다 b2bVersion 이 올라 다시 만든다 ───────────── */
let idx = null;
let idxVer = -1;
function index() {
  const ver = b2bVersion();
  if (idx && idxVer === ver) return idx;
  const map = new Map();
  const put = (cid, ym, e) => {
    if (!map.has(cid)) map.set(cid, new Map());
    const m = map.get(cid);
    if (!m.has(ym)) m.set(ym, []);
    m.get(ym).push(e);
  };
  b2bList().forEach((o) => {
    if (!o || !o.clientId) return;
    if (o.status === "취소") {
      const fee = Number(o.cancelFee) || 0;
      const at = fee > 0 ? canceledAtOf(o) : "";
      if (at) put(o.clientId, at.slice(0, 7), { kind: "cancelFee", key: at, orderNo: o.orderNo || "", at, ordererName: o.ordererName || "", address: `주문취소 · ${o.orderNo || ""}`, product: "취소 수수료", amount: fee });
      return;
    }
    const at = normAt(o.deliverAt);
    if (!at) return;
    put(o.clientId, at.slice(0, 7), { kind: "order", key: at, orderNo: o.orderNo || "", at, ordererName: o.ordererName || "", address: o.address || "", product: o.product || "", amount: Number(o.amount) || 0 });
  });
  /* 날짜 내림차순(문서 규격) — 같은 시각이면 주문번호 순으로 고정한다(새로고침마다 줄이 흔들리지 않게). */
  map.forEach((m) => m.forEach((list) => list.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : a.orderNo < b.orderNo ? -1 : 1))));
  idx = map;
  idxVer = ver;
  return idx;
}
const entriesOf = (clientId, ym) => ((index().get(clientId) || new Map()).get(ym) || []);
const amountOf = (clientId, ym) => entriesOf(clientId, ym).reduce((a, e) => a + e.amount, 0);

/** 그 (거래처, 귀속월)의 명세서 행 — 드릴다운·명세서 문서·청구금액이 **같은 집합**을 본다(합 = 정산금액).
 *  각 줄: `{ kind: "order"|"cancelFee", orderNo, at("YYYY-MM-DD HH:mm" — 주문은 배송일시, 수수료는 취소일), ordererName, address, product, amount }` */
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
 *   amount: number, count: number, empty: boolean, zero: boolean, group: "early"|"late",
 *   issued: boolean, open: boolean, issueAt: Date, deadline: Date, dueAt: Date, overdueAt: Date,
 *   editLockAt: Date|null, editable: boolean, lockReason: string|null,
 *   agreedAt: Date|null, mode: null|"manual"|"auto", docDate: Date|null,
 *   einvoice: { no, at: Date, mode: "auto"|"retry"|"manual" }|null, einvoiceFail: { detail }|null,
 *   paidAt: Date|null, termsHold: boolean, noRecipient: boolean }}
 * - 0원 달(zero — 줄은 있고 합이 0원): 발행 전 SCHEDULED, 발행 뒤 PAID(동의·계산서·입금 칸은 비운다).
 * - 거래 없는 달(empty — 줄이 0개): 발행 전 SCHEDULED, 발행 뒤 NONE(정산이 없다 — 완료·미완료 어느 쪽에도 세지 않는다).
 * - 계산서: 동의(수동·자동)된 달은 동의 시각에 자동 발급된 것으로 파생(승인번호도 결정적 — 예시 꼴, 미확정 M62).
 *   store.einvoiceFail 에 든 달만 AGREED 에 머물고, 다시 시도·직접 입력(store.einvoice)이 성공하면 ISSUED.
 * - OVERDUE: 계산서가 나간 미입금 달이 정산기한 다음 날 10:00 을 지났다(정각 포함 · 발급이 그 뒤면 발급 순간부터).
 * - editable: SCHEDULED 이거나 (AWAITING_AGREEMENT 이고 now < editLockAt). lockReason 은 명세 6.4 세 문구 중 하나.
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
  const day = invoiceDayFor(client, ym);
  let status, mode = null, agreedAt = null, einvoice = null, paidAt = null;
  const fail = store.einvoiceFailOf(client.id, ym);
  /* NONE — 발행 시각이 지났는데 거래가 없는 달. 서버에는 Settlement 가 없는 달이다(프런트 표시용 상태 — 명세 6.6 에 없다).
     발행 전이면 아직 거래가 들어올 수 있어 SCHEDULED('발급예정'·'청구 전')로 둔다. */
  if (empty) status = st.issued ? "NONE" : "SCHEDULED";
  /* ⚠️ 0원 달은 발행과 함께 닫는다(명세 3.4 예외표 '발급 때 0원'). 명세는 **발행 뒤 고쳐서 0원이 된 달**은 마감까지
     AWAITING_AGREEMENT 로 두었다가 닫으라고 하지만(3.4 '마감 전 수정' 9), 발행 때 금액(issued_amount)을 들고 있지 않아
     둘을 가르지 못한다 — 그래서 고쳐서 0원이 된 달도 그 순간 닫힌다. HANDOFF 열린 항목(issued_amount 와 함께 정한다). */
  else if (zero) status = st.issued ? "PAID" : "SCHEDULED";
  else if (!st.mode) status = st.issued ? "AWAITING_AGREEMENT" : "SCHEDULED";
  else {
    mode = st.mode;
    agreedAt = st.at;
    const rec = store.einvoiceOf(client.id, ym);
    einvoice = rec
      ? { no: rec.no, at: parseAt(rec.at), mode: rec.mode }
      : fail ? null : { no: einvoiceNoFor(client.id, ym, st.at), at: st.at, mode: "auto" };
    const pay = einvoice ? store.paymentOf(client.id, ym) : null;
    if (!einvoice) status = "AGREED";
    else if (pay) { status = "PAID"; paidAt = parseAt(pay.at); }
    else status = isPastOverdue(ym, now) ? "OVERDUE" : "ISSUED";
  }
  const lockAt = st.issued ? editLockAt(ym, day) : null;
  /* NONE 은 잠글 정산이 없다 — 그 달로 들어오는 주문을 막을 이유가 없다. */
  const editable = status === "SCHEDULED" || status === "NONE" || (status === "AWAITING_AGREEMENT" && now.getTime() < lockAt.getTime());
  const lockReason = editable ? null
    : zero ? LOCK_REASON.zero
    : status === "AWAITING_AGREEMENT" ? LOCK_REASON.editLock
    : LOCK_REASON.agreed;
  const waiting = status === "AWAITING_AGREEMENT";
  return {
    id: `${client.id}-${ym.replace("-", "")}`,
    period: ym, status,
    autoAgreeHold: waiting ? st.autoAgreeHold || null : null,
    amount, count: list.filter((e) => e.kind === "order").length, empty, zero, group: st.group,
    issued: st.issued, open: waiting,
    issueAt: st.issueDate, deadline: st.deadline, dueAt: st.dueDate, overdueAt: overdueAt(ym),
    editLockAt: lockAt, editable, lockReason,
    agreedAt, mode, docDate: zero ? null : st.docDate,
    einvoice, einvoiceFail: mode && !einvoice ? fail : null,
    paidAt,
    termsHold: waiting && !!st.termsHold,
    noRecipient: noRecipientOf(client),
  };
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
    const closedZero = s.zero && s.issued;
    const none = s.status === "NONE";
    return {
      ...b,
      ...s,
      /* 0원으로 닫힌 달은 동의·계산서가 없다 — '해당없음'(배지 대신 '0원 · 계산서 없음' 을 찍는다). */
      /* 거래가 없는 달(NONE)은 '거래없음' — 청구서가 없으니 입금완료도 미입금도 아니다. */
      거래명세서동의: none ? "거래없음" : closedZero ? "해당없음" : s.mode ? "동의완료" : !s.issued ? "발급예정" : "동의대기",
      계산서발급: none ? "거래없음" : closedZero ? "해당없음" : s.einvoice ? "발급완료" : "발급대기",
      /* '미입금' 은 isUnpaid 한 판정의 결과다(report.js 가 이 칸을 읽는다 — data 층이라 util 을 import 하지 않는다).
         아직 발행 전인 달은 '청구전' — 낼 청구서가 아직 없어 미입금이 아니다(사용자 결정 A). */
      입금완료: none ? "거래없음" : s.status === "PAID" ? "입금완료" : isUnpaid(s) ? "미입금" : "청구전",
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
 *  포털 미리보기와 관리자 정산 PDF 가 쓴다 — 같은 issueLink 토큰을 양쪽이 덮어쓰므로 둘이 같은 함수여야 낱말이 갈리지 않는다.
 *  (옛 두 낱말 판정 `invoiceNoteOf` 는 호출부가 없어져 지웠다 — 2026-10-16 통합 점검) */
export const invoiceDocNoteOf = (s) => (
  !s ? INVOICE_NOTE.wait
    : s.status === "SCHEDULED" ? INVOICE_NOTE.scheduled
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
  yms.forEach((ym) => {
    const s = settlementOf(client, ym, now);
    if (s.autoAgreeHold === "TERMS_NOT_AGREED") {
      held.push({ ym, label: periodLabel(ym), issueAt: s.issueAt, deadline: s.deadline, first: ym === yms[0] });
      return;
    }
    if (next) return;
    /* 0원으로 닫힌 달(PAID)·동의된 달은 동의를 기다리지 않는다 — 다음 후보로 넘어간다. */
    if (s.status !== "SCHEDULED" && !(s.status === "AWAITING_AGREEMENT" && !s.autoAgreeHold)) return;
    const d1 = new Date(s.issueAt.getFullYear(), s.issueAt.getMonth(), s.issueAt.getDate());
    next = {
      ym, label: periodLabel(ym), issueAt: s.issueAt, deadline: s.deadline,
      dDay: Math.round((d1 - d0) / 864e5), phase: s.issued ? "open" : "before", first: ym === yms[0],
    };
  });
  const hot = held.length > 0 || (!!next && (next.phase === "open" || next.dDay <= 7));
  return { held, next, hot };
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
  return { ym, rows, issue: rows.length ? issueOf(client, ym) : "", count, total: rows.reduce((a, r) => a + r[4], 0), empty: !rows.length };
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
   0원 달은 동의를 받지 않는다는 규칙은 settlementOf(zero → PAID) 와 store.agreeInvoice(currentAmount 0 → null) 가 지킨다.) */
/** 거래처의 계산서 발급 동의 — **화면이 보여 준 금액**(shownAmount)을 함께 보낸다(명세 3.4 '마감 전 수정' 5).
 *  반환: 동의 시각 문자열 · null(동의할 수 없는 상태 — 마감 지나 자동 동의 등) ·
 *        `{ error: "SETTLEMENT_AMOUNT_CHANGED", amount }`(그 사이 금액이 바뀜 — 화면은 새 금액을 보여 주고 다시 받는다). */
export function agreeSettlement(client, ym, shownAmount, now = new Date()) {
  return store.agreeInvoice(client.id, ym, { amount: shownAmount, currentAmount: amountOf(client.id, ym) }, now);
}
/** 계산서 발급 재시도·수기 입력 — AGREED 에서만(그 밖이면 null). 결과는 store.issueEinvoice 와 같다. */
export function issueEinvoiceFor(client, ym, opts, now = new Date()) {
  if (settlementOf(client, ym, now).status !== "AGREED") return null;
  return store.issueEinvoice(client.id, ym, opts, now);
}
/** 입금 확인 — 계산서가 나간 미입금 달(ISSUED·OVERDUE)에서만(그 밖이면 null). */
export function confirmPaymentFor(client, ym, at, now = new Date()) {
  const s = settlementOf(client, ym, now).status;
  if (s !== "ISSUED" && s !== "OVERDUE") return null;
  return store.confirmPayment(client.id, ym, at, now);
}
