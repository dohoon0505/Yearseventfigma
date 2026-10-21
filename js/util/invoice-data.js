/* ============================================================
   invoice-data.js — 거래명세서 **문서 데이터의 단일 빌더** (2026-10-16 DATA.md 3.1 · HANDOFF 남은 것 7·8).

   예전엔 같은 문서를 두 곳이 따로 만들었다 — 관리자 정산(admin-settlement.js `buildDoc`)과 포털 명세서(invoice.js `docData`,
   "고치면 여기도 같이 고칠 것" 주석). 공개 열람 링크는 복사한 순간의 본문을 토큰에 실었다. 이제 셋이 이 함수 하나를 지난다:
     · 포털 미리보기 · PDF · EXCEL(items · stamp 를 그대로 쓴다)
     · 관리자 정산 PDF · 공개 링크 복사(issueLink 는 본문을 싣지 않는다 — 귀속월만)
     · 공개 열람 페이지(public-invoice.js — **열 때** 이 함수로 다시 만든다 · 명세 3.5 '열 때의 지금 값')

   반환은 invoice-doc.js 의 데이터 모양 그대로 + 선택 필드 둘(넘기지 않던 옛 호출부의 출력은 그대로다):
     { title, period, buyer, supplier, items, account, total,
       stamp: { text, printedAt } | null,   // settlementOf().docStamp 일 때만 — 명세서가 나갔고 · 동의 전이고 · 수정 마감 전
                                            //   (2026-10-16 사용자 답 1). printedAt = now 의 'M월 D일 HH:mm'(그리는·인쇄하는·여는
                                            //   순간 — 저장하지 않는다). 수정 마감 뒤(보류 달 포함)는 null.
       items[i].kind: "fee" | undefined,    // 취소 수수료 줄(문서가 회색으로 그린다) — 자리는 주문 줄 뒤
       items[i].value: number,              // 금액 숫자(EXCEL 용 · 문서는 amount 글자를 쓴다)
       ym, settlement }                     // 화면용 — 귀속월 · 그 순간의 settlementOf(요약 숫자 count · feeCount · issueAt …)
   ⚠️ 문서에는 '발급 때 → 지금' 을 넣지 않는다(시안 — 그 표시는 화면 몫).
   ⚠️ PDF 는 누르는 순간 now 로 **다시 만들어** 인쇄할 것(printInvoiceFor) — 미리보기 DOM 을 그대로 복사하면 미리보기를 그린
      시각이 출력 시각으로 찍힌다.
   ============================================================ */
import { setHTML } from "../dom.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { store } from "../store.js";
import { settlementOf, billingEntriesOf, invoiceDocNoteOf } from "./settlement.js";
import { SUPPLIER, ACCOUNT, DOC_STAMP } from "../data/invoice-links.js";
import { periodLabel, fmtKo, fmtKoShortTime } from "../data/settlement-rules.js";
import { sharedBizKeys, displayName } from "./biz.js";

const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
/** "2026-06-30 …" → "2026년 06월 30일"(명세서 날짜 칸 규격) */
const koDay = (at) => `${at.slice(0, 4)}년 ${at.slice(5, 7)}월 ${at.slice(8, 10)}일`;
/** "2026-10-03 14:00" → "10월 3일" */
const koMd = (at) => `${Number(at.slice(5, 7))}월 ${Number(at.slice(8, 10))}일`;

/** 명세서 행 하나 → 문서 줄. 수수료 줄은 S-02 시안 모양(날짜 '… 취소' · 발송인 '-' · 어느 주문의 수수료인지). */
function itemOf(e) {
  if (e.kind === "cancelFee") {
    const plan = e.deliverAt ? `${koMd(e.deliverAt)} 배송 예정분을 ` : "";
    return {
      kind: "fee", orderNo: e.orderNo, value: e.amount,
      date: `${koDay(e.at)} 취소`, sender: "-",
      address: `취소 수수료 · ${e.orderNo} (${plan}${koMd(e.at)} 취소)`,
      product: "취소 수수료", amount: won(e.amount),
    };
  }
  return {
    orderNo: e.orderNo, value: e.amount,
    date: koDay(e.at), sender: e.ordererName, address: e.address, product: e.product, amount: won(e.amount),
  };
}

/**
 * 한 (거래처, 귀속월)의 거래명세서 문서 데이터. `client` 는 거래처 레코드.
 * 공급받는자 표시명은 포털과 같다 — 사업자번호를 공유하는 거래처만 계정 구분을 병기한다(util/biz displayName).
 */
export function invoiceDocData(client, ym, now = new Date()) {
  const s = settlementOf(client, ym, now);
  /* 내역서가 없는 달(거래가 없거나 **0원 주문만** 있다 — 2026-10-22 운영자 결정 B)은 거래 없는 달 문서다('해당 월의 거래 내역이 없습니다').
     발급 뒤 고쳐서 0원이 된 달은 받은 명세서가 있어 남은 줄을 그대로 싣는다. */
  const entries = s.empty && !s.zeroEdited ? [] : billingEntriesOf(client, ym);
  const name = displayName(client, sharedBizKeys(store.get().clients));
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const items = entries.length
    ? entries.map(itemOf)
    : [{ date: "", sender: "", address: "해당 월의 거래 내역이 없습니다", product: "", amount: "" }];
  return {
    title: `${ym.slice(2, 4)}년 ${ym.slice(5, 7)}월 꽃배달 거래명세서`,
    period: `${periodLabel(ym)} 귀속`,
    /* 발행일 칸 — 발행 전이면 발급될 날, 명세서가 나간 달이면 발행한 날. '-' 는 거래 없는 달(NONE)뿐(결정 D). */
    buyer: {
      address: `${client.address} ${name}`, company: name, bizNumber: client.bizNumber, ceo: client.ceoName,
      summary: "꽃배달 이용료 청구", issueDate: s.status === "NONE" ? "-" : fmtKo(s.issueAt), invoiceNote: invoiceDocNoteOf(s),
    },
    supplier: SUPPLIER,
    items,
    account: ACCOUNT,
    total: won(total),
    stamp: s.docStamp ? { text: DOC_STAMP, printedAt: fmtKoShortTime(now) } : null,
    ym,
    settlement: s,
  };
}

/** 문서 데이터 → 화면에 붙지 않은 `.invoice-doc` 요소(인쇄용). */
export function invoiceDocElement(d, assetBase) {
  const holder = document.createElement("div");
  setHTML(holder, invoiceDoc(d, assetBase));
  return holder.querySelector(".invoice-doc");
}

/** 누르는 순간의 시각으로 문서를 **다시 만들어** 인쇄창(→ PDF)을 연다. 실패하면 throw(호출부가 토스트로 말한다).
 *  `title` 은 인쇄창 제목(저장 파일명), `assetBase` 는 로고 경로("./assets/" 앱 · "../assets/" 공개 페이지).
 *  돌려주는 값은 printInvoiceDoc 그대로 — `=== false` 면 팝업이 막혔다(경고창은 이미 떴다 · 성공 통보를 띄우지 말 것). */
export function printInvoiceFor(client, ym, title, { now = new Date(), assetBase } = {}) {
  const el = invoiceDocElement(invoiceDocData(client, ym, now), assetBase);
  if (!el) throw new Error("invoice doc not rendered");
  return printInvoiceDoc(el, title);
}
