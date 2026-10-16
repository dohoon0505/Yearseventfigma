/* ============================================================
   invoice.js — 거래명세서 조회 (#/app/invoice)
   시안: claude.ai/design '거래명세서 조회 - 리모델링.dc.html' → 'S-02 포털 거래명세서 동의.dc.html'(2026-10-16 이식)

   좌: 미리보기 카드(머리 = 제목 · 'A4 · N장' · 맞춤/100% · PDF · EXCEL · 열람링크 / 상태 띠 / A4 문서)
   우: 340px 레일 = [연도 스테퍼 + 12개월 목록(월 · 거래 N건 · 금액 · 상태 알약)] + [요약·동의 카드].

   예전엔 우측이 연·월 **드롭다운 2개 + 월 스테퍼**라 "6월 얼마였지"를 보려면 드롭다운을
   두 번 여닫아야 했다. 지금은 12개월이 펼쳐져 달마다 건수·금액·상태가 함께 보인다 —
   **고르는 동작이 곧 비교**가 된다.

   S-02 이식(2026-10-16)으로 바뀐 것:
   ─ PDF·EXCEL·열람링크가 레일에서 **미리보기 머리**로 올라갔다(시안 — 금액을 한 줄로 줄여 월 목록이 3달 이상 보이게).
     배율 토글(맞춤/100%)은 운영자 결정으로 남겼다(1366 창에선 A4 794px 가 안 들어간다).
   ─ 동의 카드는 **배지 + 제목 + 설명 + 사실 줄 + 버튼** 갈래다. 갈래는 `settlementOf` 의 status·autoAgreeHold·zero·
     mode·einvoice 로만 고른다(화면이 날짜로 상태를 짐작하지 않는다 — 명세 6.6).
       발행 전 · 거래 없음 · 0원 · 동의 필요(열림) · 동의 필요(보류 3종 — 고객센터 줄) · 발급 중(AGREED) · 발급 완료
     ⚠️ 발행 전을 거래 없음보다 먼저 고른다(2026-10-16 결정 D) — 주문이 아직 0건인 이번 달(그리고 발행 시각 전인 모든 달)은
        '발행 전' 이고, '이 달은 거래가 없습니다' 는 발행 시각이 지났는데 거래가 없는 달(NONE)뿐이다. 관리자·포털 정산회계가
        이미 그 달을 '발행 전 · M-D 10:00 발급' 이라고 말한다. 상태 띠 · 문서 '계산서 발행'·발행일 칸도 같은 순서다.
        월 목록 알약만은 예외 — 시안 규칙 '내역 없음은 표시하지 않습니다' 대로 주문 0건인 달은 조용하다(markOf).
   ─ 발행 전 달도 네 버튼을 잠근다(예전엔 거래 없는 달만). 잠긴 이유는 미리보기 머리 아래 상태 띠가 말한다.
   ─ 알림 링크로 오면 페이지 머리 아래에 닫을 수 있는 한 줄 안내(main.js 가 남긴 도착 표시를 읽고 지운다).
   ⚠️ 시안에는 2026-10-15 에 폐지된 '내역 고침' 체계의 갈래(진행 중 · 완료)와 그 띠·알약·창이 남아 있다 — 옮기지 않았다.
   ⚠️ 시안에 없는 새 표시(발급 때 → 지금 금액 · '금액이 바뀌었습니다' 전용 표시 · 동의 전 문서의 출력 시각 ·
      취소 수수료 줄 모양)는 디자이너 몫이다(운영자 결정 1). 금액이 바뀌어 동의가 거부되면 지금처럼 토스트로만 말한다.

   ⚠️ **`js/invoice-doc.js` 는 건드리지 않는다.** A4 서식과 **여러 장 분할**(paginateItems ·
      페이지 번호 푸터)이 이미 거기 있고, **공개 열람 링크 페이지(`invoice/`)와 관리자 정산
      화면이 같은 모듈을 쓴다**. 이 화면은 그 결과물을 감싸는 껍데기만 담당한다.
   ⚠️ PDF·EXCEL·열람링크는 **진짜로 동작한다**(시안은 토스트만 띄우는 목업이다) —
      인쇄창 · 서식 있는 .xlsx 생성 · 공개 토큰 발급 + 클립보드.
   ============================================================ */
import { setHTML, on, qs, qsa, html } from "../dom.js";
import { icon } from "../icons.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { issueLink, publicInvoiceUrl, SUPPLIER, ACCOUNT, INVOICE_NOTE } from "../data/invoice-links.js";
import { fmtKo, fmtKoShort, fmtKoShortTime, periodLabel, periodEnd } from "../data/settlement-rules.js";
import { CS_PHONE } from "../data/contact.js";
import { currentClient, currentClientName } from "../util/client.js";
import { takeFocusSection } from "../session.js";
import { pageHead } from "../ui.js";
import { openDialog, dlgActions } from "../util/dialog.js";
import { makeToast } from "../toast.js";
import { sheetToXlsx } from "../util/xlsx.js";
/* 명세서 행·달 목록·동의는 B2B 주문(배송일시의 달)에서 파생한다(2026-10-16 — 주문과 정산 연결). 예전엔 정적 목데이터
   (invoice-mock)를 읽어 주문을 고쳐도 명세서가 그대로였다. */
import {
  INVOICE_YM_KEY, settlementsFor, monthsOf, invoiceMonth, latestInvoiceKey, agreeSettlement,
  settlementOf, invoiceDocNoteOf,
} from "../util/settlement.js";

const DOC_W = 794; /* A4 폭(px) — invoice-doc.js 의 .invoice-page 와 같은 값 */
const DAY = 864e5;
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
/** 남은 시간 — "2일 3시간" / "5시간 12분" / "40분"(시안 span()). 지난 시간은 0분. */
function spanText(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mi}분` : `${mi}분`;
}

/* 자동 동의 보류 3종(명세 6.6 autoAgreeHold)의 **포털 제목** — 시안 문구 그대로. 관리자 표 낱말(HOLD_LABEL)과 다르다:
   거래처에게는 '왜 자동 동의되지 않았는지'를 사실로 말하고, 설명·고객센터 줄이 뒤따른다. */
const HOLD_TITLE = {
  TERMS_NOT_AGREED: "약관 동의 전에 마감이 지났습니다",
  NOTICE_UNDELIVERED: "마감 안내가 전달되지 않았습니다",
  CLIENT_SUSPENDED: "마감 때 이용이 정지되어 있었습니다",
};

/* 공급받는자 — 로그인한 거래처에서 매번 파생한다(util/client.js).
   모듈 로드 시점에 한 번 굽지 않는 이유: 셸 배지·정산회계 조회와 같은 거래처를
   가리켜야 하고, 거래처 정보를 수정하면 문서에도 바로 반영돼야 한다. */
/* `invoiceNote`(문서의 '계산서 발행' 칸)는 **그 달의 정산 상태에 따라 달라지므로** 여기서 확정하지 않는다 —
   docData() 가 invoiceDocNoteOf(settlementOf) 로 덮어쓴다. 기본값은 '발급대기'다. */
function buyerOf() {
  const c = currentClient();
  if (!c) return { address: "", company: "", bizNumber: "", ceo: "", summary: "꽃배달 이용료 청구", invoiceNote: INVOICE_NOTE.wait };
  const name = currentClientName();
  return {
    address: `${c.address} ${name}`, company: name,
    bizNumber: c.bizNumber, ceo: c.ceoName, summary: "꽃배달 이용료 청구", invoiceNote: INVOICE_NOTE.wait,
  };
}

/* ── 엑셀 스타일 팔레트(ARGB) · tokens.css 브랜드값 미러링 ────────
   워크시트 색상은 CSS 토큰을 참조할 수 없어 브랜드 hex 를 ARGB(FF+hex)로 옮겨 둔다. */
const XA = {
  orange: "FFF15A2A", orangeSoft: "FFFFF1EC", orangeInk: "FFD94000",
  white: "FFFFFFFF", ink: "FF111111", text2: "FF444444", muted: "FF888888",
  label: "FFF5F5F5", zebra: "FFFAFBFC", total: "FFFFF6EF",
};
const MONEY_FMT = '#,##0"원"';
const XS = {
  title:   { bold: true, size: 18, color: XA.orangeInk, fill: XA.orangeSoft, align: "center", valign: "center" },
  sub:     { size: 10.5, color: XA.muted, align: "center", valign: "center" },
  section: { bold: true, size: 11.5, color: XA.ink, fill: XA.label, align: "left", valign: "center" },
  mlabel:  { bold: true, size: 10.5, color: XA.text2, fill: XA.label, align: "right", valign: "center", border: true },
  mvalue:  { size: 10.5, color: XA.ink, align: "left", valign: "center", wrap: true, border: true },
  th:      { bold: true, size: 11, color: XA.white, fill: XA.orange, align: "center", valign: "center", border: true },
  tlabel:  { bold: true, size: 11, color: XA.ink, fill: XA.total, align: "right", valign: "center", border: true },
  tmoney:  { bold: true, size: 12, color: XA.orangeInk, fill: XA.total, align: "right", valign: "center", border: true, numFmt: MONEY_FMT },
  flabel:  { bold: true, size: 10.5, color: XA.text2, fill: XA.label, align: "right", valign: "center", border: true },
  fvalue:  { size: 10.5, color: XA.ink, align: "left", valign: "center", wrap: true, border: true },
  empty:   { size: 11, color: XA.muted, align: "center", valign: "center", border: true },
};
const xCenter = (z) => ({ size: 10.5, color: XA.text2, align: "center", valign: "center", border: true, ...(z ? { fill: XA.zebra } : {}) });
const xLeft   = (z) => ({ size: 10.5, color: XA.ink, align: "left", valign: "center", wrap: true, border: true, ...(z ? { fill: XA.zebra } : {}) });
const xMoney  = (z) => ({ size: 10.5, color: XA.ink, align: "right", valign: "center", border: true, numFmt: MONEY_FMT, ...(z ? { fill: XA.zebra } : {}) });

/** 넘겨받은 귀속월이 있으면 그 달로, 없으면 기본 달(latestInvoiceKey — 명세서가 발행된 가장 최근 달)로 연다.
 *  넘겨주는 곳은 둘이다 — 정산회계 조회의 '…명세서' 버튼과 알림 링크(`?period=`, main.js · 명세 6.6 M20).
 *  ⚠️ 읽고 **바로 지운다** — 남겨 두면 나중에 사이드바로 그냥 들어왔을 때도 옛 달이 열린다.
 *  ⚠️ **그 거래처의 달**일 때만 연다(명세 6.6 — 형식이 틀리거나 그 거래처에 없는 달이면 기본 달). '그 거래처의 달' =
 *     정산 행이 있는 달(최근 6개월 — 거래가 없어도 '청구 전' 행이 있다) 또는 명세서 내역이 있는 달.
 *     정산회계 조회의 버튼은 언제나 정산 행의 달이라 이 검사에 걸리지 않는다.
 *  알림으로 왔으면(main.js 의 구역 전달 'arrival' · 'arrival:login') 그 사실과 **넘겨받은 달을 썼는지**를 함께 돌려준다 —
 *  시안의 도착 안내 두 갈래('카톡 알림에서 바로 열었습니다' / '알림 주소의 달을 찾지 못했습니다')가 여기서 갈린다. */
function initialKey() {
  const client = currentClient();
  let handoff = null;
  try {
    handoff = sessionStorage.getItem(INVOICE_YM_KEY);
    sessionStorage.removeItem(INVOICE_YM_KEY);
  } catch { /* storage 비활성 — 기본 달로 */ }
  const sec = takeFocusSection("invoice");
  const used = !!(handoff && /^\d{4}-(0[1-9]|1[0-2])$/.test(handoff) && client
    && (!invoiceMonth(client, handoff).empty || settlementsFor(client).some((r) => r.ym === handoff)));
  const key = used ? handoff : latestInvoiceKey(client);
  const arrival = sec === "arrival" || sec === "arrival:login" ? { ok: used, viaLogin: sec === "arrival:login" } : null;
  return { key, arrival };
}

export function mount(root) {
  const first = initialKey();
  const state = { year: first.key.slice(0, 4), month: first.key.slice(5, 7), fit: true, arrival: first.arrival };
  const toast = makeToast();
  let dlg = null;
  let ro = null;
  /* 사용자가 월 목록을 직접 굴린 뒤에는 자동 가운데 정렬이 관여하지 않는다 —
     보던 자리를 빼앗는 건 도움이 아니라 방해다. */
  let userScrolled = false;

  const ym = () => `${state.year}-${state.month}`;
  const clientRec = () => currentClient() || { id: "" };
  /* 그릴 때마다 다시 파생한다 — 동의 기록은 거래처별이고, 마감(13:00)이 지나면 같은 달이 자동 동의로 바뀐다.
     상태의 단일 소스는 util/settlement.js `settlementOf`(발행 전 · 동의대기 · 보류 · 발급 중 · 발급 완료 · 0원). */
  const settle = (key = ym()) => settlementOf(clientRec(), key);
  /** 내려받을 문서가 없는 달 — 거래가 없거나 아직 발행 전이다(네 버튼 잠금 · 상태 띠). */
  const docsLocked = (s) => s.empty || s.status === "SCHEDULED";

  /* ── 현재 선택 월 → invoice-doc.js 문서 데이터 ───────────── */
  function docData() {
    const m = invoiceMonth(currentClient(), ym());
    const s = settle();
    const label = periodLabel(ym());
    const items = m.empty
      ? [{ date: "", sender: "", address: "해당 월의 거래 내역이 없습니다", product: "", amount: "" }]
      : m.rows.map((r) => ({ date: r[0], sender: r[1], address: r[2], product: r[3], amount: won(r[4]) }));
    return {
      _label: label, _month: m, _settle: s,
      title: `${state.year.slice(2)}년 ${state.month}월 꽃배달 거래명세서`,
      period: `${label} 귀속`,
      /* 문서의 '계산서 발행' 칸은 **동의 카드와 같은 말**을 한다 — 동의 뒤 계산서 전(발급 실패·재시도)은 '발급 중',
         0원 달은 '해당 없음(0원)', 발행 전은 '발행 전'(S-02 시안 낱말). 판정은 invoiceDocNoteOf(settlementOf) 한 곳.
         ⚠️ 동의 여부(mode)로 정하면 안 된다 — 0원 달도 마감이 지나면 mode 가 'auto' 이고, 발급에 실패한 달도 동의는
         돼 있어 둘 다 '발급완료' 로 찍혔던 전력이 있다. 칸은 **계산서가 실제로 나갔는지**를 말한다. */
      /* 발행일 칸 — 거래가 없어도 발행 전이면 발급될 날을 적는다(카드 '발행 전' 갈래와 같은 날 · 결정 D). '-' 는 거래 없는 달(NONE)뿐. */
      buyer: { ...buyerOf(), issueDate: !m.empty ? m.issue : s.status === "SCHEDULED" ? fmtKo(s.issueAt) : "-", invoiceNote: invoiceDocNoteOf(s) },
      supplier: SUPPLIER,
      items,
      account: ACCOUNT,
      total: won(m.total),
    };
  }

  /* ── 월 목록 ─────────────────────────────────────────────
     상태 알약은 시안이 고른 넷뿐이다 — 동의 필요 · 발급 중 · 발행 전 · 0원. 발급 완료·내역 없음은 표시하지 않는다
     (조용한 달은 조용히 두어야 표시가 있는 달이 눈에 띈다). '금액 바뀜' 표시는 디자이너 몫이라 넣지 않는다. */
  function markOf(s) {
    /* 거래가 없는 달은 발행 전이어도 알약을 달지 않는다 — 시안 규칙 '내역 없음은 표시하지 않습니다'(줄에 '내역 없음' 이 이미
       보인다). 그래서 이번 달·다음 달처럼 주문 0건인 발행 전 달은 줄이 조용하고, 고르면 카드가 '발행 전' 갈래로 말한다(결정 D 는
       카드 갈래의 순서다). 알약이 없다는 것은 '거래 없음' 을 주장하지 않는다 — 발행 시각이 지난 NONE 달도 알약이 없다. */
    if (s.empty) return null;
    if (s.status === "SCHEDULED") return ["발행 전", "gray"];
    if (s.zero) return ["0원", "gray"];
    if (s.status === "AWAITING_AGREEMENT") return ["동의 필요", "orange"];
    if (s.status === "AGREED") return ["발급 중", "gray"];
    return null;
  }
  const monthInner = (m) => {
    const mk = markOf(settle(`${state.year}-${m.mm}`));
    return html`
      <span class="iv-month__l">
        <b>${m.mm}월</b>
        <span>${m.empty ? "내역 없음" : `거래 ${m.count}건`}</span>
      </span>
      <span class="iv-month__r">
        <span class="iv-month__amt">${m.empty ? "-" : won(m.total)}</span>
        ${mk ? html`<span class="iv-tag iv-tag--sm iv-tag--${mk[1]}">${mk[0]}</span>` : ""}
      </span>`;
  };
  const monthRow = (m) => html`
    <button type="button" class="iv-month ${m.mm === state.month ? "is-sel" : ""}"
            data-month="${m.mm}" aria-current="${m.mm === state.month ? "true" : "false"}">${monthInner(m)}</button>
  `;
  const monthsBody = () => monthsOf(currentClient(), state.year).map(monthRow);
  /** 한 달 줄의 안쪽만 다시 그린다(동의 뒤 '동의 필요' 알약이 빠지고, 금액이 바뀌었으면 그 금액으로) —
   *  목록 전체를 다시 그리면 스크롤 위치가 날아간다. 버튼 요소는 그대로라 포커스도 남는다. */
  function refreshMonthRow(mm = state.month) {
    const btn = qs(root, `.iv-month[data-month='${mm}']`);
    if (!btn) return;
    setHTML(btn, monthInner({ ...invoiceMonth(currentClient(), `${state.year}-${mm}`), mm }));
  }

  /* ── 요약(금액 한 줄) ─────────────────────────────────── */
  function sumTop() {
    const m = invoiceMonth(currentClient(), ym());
    const s = settle();
    return html`
      <div class="iv-sum__l">
        <p class="iv-sum__k">${periodLabel(ym())} 귀속</p>
        <p class="iv-sum__meta">${m.empty ? "거래 내역 없음" : `거래 ${m.count}건 · ${fmtKoShort(s.issueAt)} 발행`}</p>
      </div>
      <b class="iv-sum__amt">${won(m.total)}</b>
    `;
  }

  /* ── 계산서 발급 동의 카드 — 갈래 ───────────────────────
     작성일자 규칙: 1~7일 그룹 = 귀속월 말일(동의 시점과 무관), 11~25일 그룹 = 동의한 날(자동이면 마감일).
     보류 달(11~25 그룹)에는 '자동이면 …' 이 거짓이다(그 달은 자동 동의되지 않는다) — 오늘 동의하면 며칠인지 말한다.
     ⚠️ html`` 은 Date 를 String(date) 로 찍는다 — 반드시 포맷해서 넣는다. */
  function writtenOf(s, now) {
    if (s.group === "early") return `${fmtKoShort(periodEnd(s.period))} · 귀속월 말일`;
    if (s.agreedAt) return `${fmtKoShort(s.agreedAt)} · 동의한 날`;
    if (s.autoAgreeHold) return `동의한 날 · 오늘 동의하면 ${fmtKoShort(now)}`;
    return `동의한 날 · 자동이면 ${fmtKoShort(s.deadline)}`;
  }
  /** 정산 상태 → 카드 갈래. btn: "on"(동의 가능) · "off"(잠금 — 이유는 제목·설명이 말한다) · "none"(버튼 없음). */
  function cardOf(s, now) {
    /* ⚠️ 발행 전을 거래 없음보다 **먼저** 본다(2026-10-16 결정 D). 주문이 아직 0건인 이번 달도 '발행 전' 이다 — 관리자 정산회계
       ('발급예정 · M-D 10:00 발행')와 포털 정산회계('발행 전 · M-D 10:00 발급')가 이미 그렇게 말하므로 세 화면을 맞춘다.
       '이 달은 거래가 없습니다' 는 발행 시각이 지났는데 거래가 없는 달(settlementOf NONE)뿐이다. */
    if (s.status === "SCHEDULED") {
      return {
        badge: ["발행 전", "gray"], title: "아직 발행 전입니다",
        body: `이 달의 거래명세서는 ${fmtKoShortTime(s.issueAt)}에 발급됩니다. 발급되면 내용을 확인하고 동의할 수 있습니다.`, btn: "off",
      };
    }
    if (s.empty) {
      return { badge: ["해당 없음", "gray"], title: "이 달은 거래가 없습니다", body: "거래가 없는 달은 발급할 계산서가 없습니다.", btn: "off" };
    }
    /* 0원 달 — 명세서는 발급되지만 동의·계산서·입금 없이 닫힌다(명세 3.4 예외표 · 10.4 Q21 잠정 ①). */
    if (s.zero) {
      return {
        badge: ["0원 · 계산서 없음", "gray"], title: "이 달은 청구 금액이 0원입니다",
        body: "0원 주문만 있어 계산서 발급 동의가 필요 없습니다. 입금할 금액도 없습니다.",
        facts: [["거래", `${s.count}건 · 모두 0원 주문`]], btn: "none",
      };
    }
    if (s.status === "AWAITING_AGREEMENT" && s.autoAgreeHold) {
      /* 마감이 지났지만 자동 동의되지 않은 달 — '…까지 동의가 없으면 자동 동의' 는 이 달에 거짓이다. 이유를 말하고 지금 받는다. */
      return {
        badge: ["동의 필요", "orange"], title: HOLD_TITLE[s.autoAgreeHold] || "마감이 지났지만 자동 동의되지 않았습니다",
        body: "그래서 자동 동의되지 않았습니다. 내용을 확인하시고 동의해 주세요. 마감이 지났어도 지금 동의할 수 있습니다.",
        facts: [["동의 마감", `${fmtKoShortTime(s.deadline)} · 지남`], ["작성일자", writtenOf(s, now)]],
        btn: "on", help: true,
      };
    }
    if (s.status === "AWAITING_AGREEMENT") {
      const left = s.deadline.getTime() - now.getTime();
      return {
        badge: ["동의 필요", "orange"], title: "금액을 확인하고 동의해 주세요",
        body: "동의하면 이 금액으로 계산서(면세)가 발급됩니다. 동의 후에는 내용을 바꿀 수 없습니다.",
        /* 마감 24시간 전부터 남은 시간을 빨갛게(시안 · S-01·S-03 과 같은 기준). */
        facts: [
          ["동의 마감", `${fmtKoShortTime(s.deadline)} · ${spanText(left)} 남음`, left <= DAY],
          ["마감까지 동의가 없으면", "그 시각에 자동 동의"],
          ["작성일자", writtenOf(s, now)],
        ],
        btn: "on",
      };
    }
    const auto = s.mode === "auto";
    const agreed = s.agreedAt ? `${fmtKoShortTime(s.agreedAt)} · ${auto ? "자동 동의" : "직접 동의"}` : "-";
    /* AGREED — 동의는 했지만 계산서가 아직 안 나왔다(발급 실패·재시도). '발급완료' 라고 말하지 않는다. */
    if (s.status === "AGREED") {
      return {
        badge: ["발급 중", "gray"], title: auto ? "마감 시각에 자동 동의되었습니다" : "계산서 발급에 동의했습니다",
        body: "계산서를 발급하고 있습니다. 발급되면 정산·회계 담당자에게 카톡으로 알려 드립니다.",
        facts: [["동의 일시", agreed], ["작성일자", writtenOf(s, now)]], btn: "none",
      };
    }
    /* ISSUED · OVERDUE · PAID — 계산서가 나간 달. 입금·기한은 정산회계 조회가 말한다. */
    return {
      badge: ["발급 완료", "green"], title: "계산서가 발급되었습니다",
      body: auto ? "동의 마감 시각에 자동 동의되어 계산서(면세)가 발급되었습니다." : "동의하신 금액으로 계산서(면세)가 발급되었습니다.",
      facts: [["동의 일시", agreed], ["작성일자", writtenOf(s, now)], ["승인번호", s.einvoice ? s.einvoice.no : "-"]],
      btn: "none",
    };
  }
  function agreeBody() {
    const c = cardOf(settle(), new Date());
    return html`
      <div class="iv-agree__hd">
        <b>계산서 발급 동의</b>
        <span class="iv-tag iv-tag--${c.badge[1]}">${c.badge[0]}</span>
      </div>
      <p class="iv-agree__t" tabindex="-1" data-agree-title>${c.title}</p>
      <p class="iv-agree__p">${c.body}</p>
      ${c.facts && c.facts.length
        ? html`<dl class="iv-facts">${c.facts.map(([k, v, warn]) => html`
            <div class="iv-fact"><dt>${k}</dt><dd class="${warn ? "is-warn" : ""}">${v}</dd></div>`)}</dl>`
        : ""}
      ${c.btn === "none" ? "" : html`
        <button type="button" class="iv-btn iv-btn--agree" data-action="agree" ${c.btn === "off" ? "disabled" : ""}>계산서 발급에 동의</button>`}
      ${c.help ? html`<p class="iv-help">문의 · 고객센터 <b>${CS_PHONE}</b></p>` : ""}
    `;
  }

  /* ── 미리보기 머리 아래 상태 띠 — 네 버튼이 잠긴 이유(거래 없음 · 발행 전에만) ─── */
  function stripBody() {
    const s = settle();
    /* 카드 갈래와 같은 순서 — 발행 전이 먼저(주문 0건인 이번 달도 '발행 전' · 결정 D). */
    if (s.status === "SCHEDULED") return html`<p class="iv-strip">발행 전이라 내려받을 수 없습니다. ${fmtKoShortTime(s.issueAt)}에 발급됩니다</p>`;
    if (s.empty) return html`<p class="iv-strip">거래가 없는 달이라 PDF · EXCEL · 열람링크를 쓸 수 없습니다</p>`;
    return "";
  }

  /* ── 알림 링크 도착 한 줄 ─────────────────────────────── */
  function arrivalBar() {
    const a = state.arrival;
    if (!a) return "";
    const label = `${periodLabel(ym())} 귀속`;
    /* '로그인 뒤에도' 는 로그인 화면을 거쳐 왔을 때만 붙인다 — 이미 로그인돼 있었으면 거짓이 된다. */
    const [t, b] = a.ok
      ? ["카톡 알림에서 바로 열었습니다.", a.viaLogin ? `로그인 뒤에도 알림이 가리킨 ${label} 명세서를 그대로 열었습니다.` : `알림이 가리킨 ${label} 명세서를 열었습니다.`]
      : ["알림 주소의 달을 찾지 못했습니다.", `가장 최근 명세서(${label})를 열었습니다.`];
    return html`
      <div class="iv-arrive" role="status" data-slot="arrive">
        <span class="iv-arrive__t"><b>${t}</b> <span>${b}</span></span>
        <button type="button" class="iv-arrive__x" data-action="arrive-x" aria-label="알림 닫기">${icon("x", { size: 13 })}</button>
      </div>`;
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-invoice">
          ${pageHead({
            imgSrc: "./assets/nav-invoice.png",
            title: "거래명세서 조회",
            desc: "달을 골라 내려받거나 발급에 동의합니다",
          })}
          ${arrivalBar()}
          <div class="iv-cols">
            <!-- DOM 은 레일이 먼저 — order 로 자리만 바꾼다. Tab 순서가
                 '기간 고르기 → 동의 → 문서 보기' 가 되어 읽는 순서와 맞는다. -->
            <aside class="iv-rail">
              <div class="iv-card iv-listcard">
                <div class="iv-year">
                  <button type="button" class="iv-ystep" data-action="prev-year" aria-label="이전 해">‹</button>
                  <div class="iv-year__l"><b data-slot="year">${state.year}년</b><span>귀속 연도</span></div>
                  <button type="button" class="iv-ystep" data-action="next-year" aria-label="다음 해">›</button>
                </div>
                <div class="iv-months" data-slot="months" role="group" aria-label="귀속 월">${monthsBody()}</div>
              </div>
              <div class="iv-card iv-sum">
                <div class="iv-sum__top" data-slot="sumtop">${sumTop()}</div>
                <!-- 동의 카드는 **살아 있는 영역**이다 — 동의하면 버튼이 사라지고 결과 문구가 들어온다.
                     요소를 갈아끼우지 않고 안쪽만 바꿔야 aria-live 가 읽는다(그래서 sumtop 과 슬롯이 따로다). -->
                <div class="iv-agree" data-slot="agree" aria-live="polite" aria-atomic="true">${agreeBody()}</div>
              </div>
            </aside>

            <div class="iv-doc">
              <div class="iv-card iv-doccard">
                <div class="iv-doc__hd">
                  <div class="iv-doc__hdl">
                    <h2>명세서 미리보기</h2>
                    <span class="iv-pill" data-slot="pages">A4</span>
                    <div class="iv-zoom" role="group" aria-label="미리보기 배율">
                      <button type="button" data-action="zoom-fit" aria-pressed="true">맞춤</button>
                      <button type="button" data-action="zoom-100" aria-pressed="false">100%</button>
                    </div>
                  </div>
                  <div class="iv-doc__acts">
                    <button type="button" class="iv-dbtn iv-dbtn--pdf" data-action="pdf">PDF 다운로드</button>
                    <button type="button" class="iv-dbtn iv-dbtn--xls" data-action="excel">EXCEL</button>
                    <button type="button" class="iv-dbtn iv-dbtn--link" data-action="link">열람링크</button>
                  </div>
                </div>
                <div class="iv-strip-slot" data-slot="strip" role="status">${stripBody()}</div>
                <div class="iv-doc__view" data-slot="view">
                  <div class="iv-doc__fit" data-fit>
                    <div class="iv-doc__scale" data-scale><div data-doc-host></div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    );
    renderActs();
  }

  /* ── 부분 갱신 ───────────────────────────────────────────── */
  function renderDoc() {
    const host = qs(root, "[data-doc-host]");
    if (!host) return;
    host.innerHTML = invoiceDoc(docData());
    const n = qsa(host, ".invoice-page").length;
    const pill = qs(root, "[data-slot='pages']");
    if (pill) pill.textContent = `A4 · ${n}장`;
    applyScale();
  }
  /** PDF·EXCEL·열람링크 잠금 + 상태 띠. 거래 없음 · 발행 전이면 내려받을 것도, 보낼 링크도 없다. */
  function renderActs() {
    const locked = docsLocked(settle());
    qsa(root, ".iv-dbtn").forEach((b) => { b.disabled = locked; });
    const strip = qs(root, "[data-slot='strip']");
    if (strip) setHTML(strip, stripBody());
  }
  const renderSum = () => {
    const top = qs(root, "[data-slot='sumtop']");
    if (top) setHTML(top, sumTop());
    const ag = qs(root, "[data-slot='agree']");
    if (ag) setHTML(ag, agreeBody());
  };
  /** 선택 달이 바뀌거나 그 달의 상태가 바뀌었을 때 — 목록은 그 줄만, 나머지는 슬롯만. */
  function renderMonth() {
    renderSum();
    renderActs();
    renderDoc();
  }
  /* 월만 바뀌면 목록을 **다시 그리지 않는다** — 다시 그리면 스크롤 위치가 날아간다. */
  function markMonth() {
    qsa(root, ".iv-month").forEach((b) => {
      const on_ = b.dataset.month === state.month;
      b.classList.toggle("is-sel", on_);
      b.setAttribute("aria-current", on_ ? "true" : "false");
    });
  }
  function renderYear() {
    const y = qs(root, "[data-slot='year']");
    if (y) y.textContent = `${state.year}년`;
    const list = qs(root, "[data-slot='months']");
    if (list) setHTML(list, monthsBody());
    userScrolled = false; /* 목록이 새로 그려졌으니 다시 가운데로 맞춘다 */
    centerMonth();
  }

  /* ── 배율 ────────────────────────────────────────────────
     transform 은 레이아웃 박스를 줄이지 않는다 — 감싼 칸의 폭·높이를 JS 가 직접 맞춰야
     아래에 빈 공간이 남지 않는다. */
  function applyScale() {
    const view = qs(root, "[data-slot='view']");
    const fit = qs(root, "[data-fit]");
    const inner = qs(root, "[data-scale]");
    if (!view || !fit || !inner) return;
    const avail = view.clientWidth - 48; /* .iv-doc__view 좌우 패딩(24px × 2) */
    const s = state.fit && avail > 0 ? Math.min(1, avail / DOC_W) : 1;
    inner.style.transform = `scale(${s})`;
    const h = inner.scrollHeight; /* scrollHeight 는 transform 의 영향을 받지 않는다 */
    fit.style.width = `${Math.round(DOC_W * s)}px`;
    fit.style.height = `${Math.round(h * s)}px`;
    qsa(root, ".iv-zoom button").forEach((b) => {
      b.setAttribute("aria-pressed", (b.dataset.action === "zoom-fit") === state.fit ? "true" : "false");
    });
  }

  /* ── 월 자동 가운데 정렬 ─────────────────────────────────
     레이아웃 전(높이 0)에 계산하면 엉뚱한 곳으로 튄다 — 잴 수 있을 때까지 미룬다. */
  function centerMonth() {
    if (userScrolled) return;
    const list = qs(root, "[data-slot='months']");
    const child = list && qs(list, ".iv-month.is-sel");
    if (!list || !child) return;
    if (!list.clientHeight || !child.offsetHeight) { requestAnimationFrame(centerMonth); return; }
    const lr = list.getBoundingClientRect();
    const cr = child.getBoundingClientRect();
    const delta = (cr.top - lr.top) - (list.clientHeight - cr.height) / 2;
    const max = list.scrollHeight - list.clientHeight;
    list.scrollTop = Math.max(0, Math.min(max, list.scrollTop + delta));
  }

  /* ── EXCEL — 현행 로직 그대로(서식 있는 .xlsx) ───────────── */
  function downloadExcel() {
    const m = invoiceMonth(currentClient(), ym());
    const label = periodLabel(ym());
    const rows = [];
    const merges = [];
    const rowHeights = {};
    let R = 0;
    const push = (cells) => { rows.push(cells); R += 1; return R; };
    const mr = (a, z) => merges.push(`${a}${R}:${z}${R}`);
    const bl = (s) => ({ v: "", s });
    const band = (t) => { push([{ v: t, s: XS.section }, bl(XS.section), bl(XS.section), bl(XS.section), bl(XS.section)]); mr("A", "E"); };
    const meta = (l, v) => { push([{ v: l, s: XS.mlabel }, { v, s: XS.mvalue }, bl(XS.mvalue), bl(XS.mvalue), bl(XS.mvalue)]); mr("B", "E"); };
    const foot = (l, v) => { push([{ v: l, s: XS.flabel }, { v, s: XS.fvalue }, bl(XS.fvalue), bl(XS.fvalue), bl(XS.fvalue)]); mr("B", "E"); };

    const buyer = buyerOf();
    push([{ v: "거래명세서", s: XS.title }, bl(XS.title), bl(XS.title), bl(XS.title), bl(XS.title)]); mr("A", "E"); rowHeights[R] = 34;
    push([{ v: `${label} 귀속 · ${buyer.summary}`, s: XS.sub }, bl(XS.sub), bl(XS.sub), bl(XS.sub), bl(XS.sub)]); mr("A", "E"); rowHeights[R] = 18;
    push([]);
    band("■ 공급받는자");
    meta("회사명", buyer.company);
    meta("사업자등록번호", buyer.bizNumber);
    meta("대표자", buyer.ceo);
    meta("소재지", buyer.address);
    meta("청구 항목", buyer.summary);
    push([]);
    band("■ 공급자");
    meta("회사명", SUPPLIER.company);
    meta("사업자등록번호", SUPPLIER.bizNumber);
    meta("대표자", SUPPLIER.ceo);
    meta("E-MAIL", SUPPLIER.email);
    meta("FAX", SUPPLIER.fax);
    push([]);
    band("■ 거래 내역");
    push([{ v: "배송요청일시", s: XS.th }, { v: "발송인", s: XS.th }, { v: "배송지", s: XS.th }, { v: "주문상품", s: XS.th }, { v: "결제금액", s: XS.th }]); rowHeights[R] = 24;
    if (!m.empty) {
      m.rows.forEach((r, i) => {
        const z = i % 2 === 1;
        push([{ v: r[0], s: xCenter(z) }, { v: r[1], s: xCenter(z) }, { v: r[2], s: xLeft(z) }, { v: r[3], s: xLeft(z) }, { v: r[4], s: xMoney(z) }]);
      });
      push([{ v: "합계", s: XS.tlabel }, bl(XS.tlabel), bl(XS.tlabel), bl(XS.tlabel), { v: m.total, s: XS.tmoney }]); mr("A", "D");
    } else {
      push([{ v: "해당 월의 거래 내역이 없습니다", s: XS.empty }, bl(XS.empty), bl(XS.empty), bl(XS.empty), bl(XS.empty)]); mr("A", "E");
    }
    push([]);
    foot("입금 계좌", ACCOUNT);

    try {
      const bytes = sheetToXlsx({ sheetName: label, rows, cols: [18, 11, 46, 20, 14], merges, rowHeights });
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `거래명세서_${state.year}_${state.month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("EXCEL 파일을 다운로드했습니다");
    } catch (err) {
      console.error("EXCEL 생성 오류:", err);
      toast("EXCEL 생성 중 오류가 발생했습니다", "warn");
    }
  }

  /* ── 계산서 발급 동의 — 체크 게이트 ──────────────────────
     되돌릴 수 없는 동작이라 주문서·거래처 삭제와 같은 마찰을 준다. 다만
     `openDeleteConfirm` 은 쓰지 않는다 — 빨간 danger 버튼·휴지통 아이콘·삭제 문구라
     '발급 동의'에 맞지 않는다. 공용 `.dlg-check` 만 빌려 쓴다.
     안내 상자는 카드와 같은 갈래를 따른다 — 보류 달에는 '…까지 동의하지 않아도 자동 동의' 를 말하지 않는다. */
  function openAgree() {
    const m = invoiceMonth(currentClient(), ym());
    const s = settle();
    if (m.empty || s.status !== "AWAITING_AGREEMENT" || dlg) return;
    const now = new Date();
    const shown = m.total; /* 화면이 보여 준 금액 — 동의 요청에 함께 싣는다(명세 3.4 '마감 전 수정' 5 · 6.6) */
    const period = `${periodLabel(ym())} 귀속`;
    let ack = false;
    const HINT_OFF = "확인에 체크해야 발급됩니다";
    const HINT_ON = "동의하면 바로 발급을 시작합니다";
    const line = s.autoAgreeHold
      ? ["자동 동의되지 않은 명세서", "마감이 지나 자동 동의되지 않은 명세서입니다. 지금 동의하시면 계산서가 발급됩니다."]
      : ["자동 동의", `${fmtKoShortTime(s.deadline)}까지 동의하지 않아도 그 시각에 자동 동의됩니다.`];
    /* 창의 작성일자는 **지금 동의하면 실제로 찍힐 날짜**다(2026-10-16 결정) — 11~25일 그룹은 동의한 날 = 오늘.
       카드는 시안 문장 그대로('동의한 날 · 자동이면 …')지만, 동의 버튼을 누르기 직전의 창이 '자동이면 10월 28일' 이라고
       말하면 오늘 동의하는 사람에게 다른 날짜를 보여 주게 된다. 1~7일 그룹은 귀속월 말일 그대로(동의 시점과 무관). */
    const writtenNow = s.group === "early" ? writtenOf(s, now) : `${fmtKoShort(now)} · 동의한 날(오늘)`;
    dlg = openDialog({
      eyebrow: `${period} · ${won(shown)}`,
      title: "계산서 발급에 동의할까요?",
      width: 520,
      bodyClass: "iv-agdlg",
      body: html`
        <p class="dlg-desc"><b>동의 후에는 되돌릴 수 없습니다.</b> 이 금액 그대로 계산서(면세)가 발급되고,
          명세서 내용은 더 이상 바뀌지 않습니다.</p>
        <div class="iv-recap">
          <div><span>귀속</span><b>${period}</b></div>
          <div><span>거래 건수</span><b class="num">${m.count}건</b></div>
          <div><span>작성일자</span><b>${writtenNow}</b></div>
          <div class="iv-recap__total"><span>발급 금액</span><b class="num">${won(shown)}</b></div>
        </div>
        <div class="iv-line"><b>${line[0]}</b>${line[1]}</div>
        <button type="button" class="dlg-check" data-action="ack" role="checkbox" aria-checked="false">
          <span class="dlg-check__box" aria-hidden="true"></span>
          <span>금액을 확인했고 되돌릴 수 없음에 동의합니다</span>
        </button>`,
      hint: HINT_OFF,
      hintBlock: true,
      actions: dlgActions({ ok: "동의하고 발급", disabled: true }),
      onClose: () => { dlg = null; },
    });
    const p = dlg.panel;
    const chk = qs(p, "[data-action='ack']");
    const go = qs(p, "[data-action='ok']");
    on(p, "click", "[data-action='ack']", () => {
      ack = !ack;
      chk.classList.toggle("is-on", ack);
      chk.setAttribute("aria-checked", ack ? "true" : "false");
      go.disabled = !ack;
      /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다. */
      dlg.setHint(ack ? HINT_ON : HINT_OFF, !ack);
    });
    on(p, "click", "[data-action='ok']", () => {
      if (!ack) return;
      /* store 가 같은 규칙·같은 시계로 다시 판정한다 — 다이얼로그를 열어 둔 채 마감(13:00)이 지나면
         기록하지 않고 null 을 돌려주고, 그 달은 자동 동의로 그려진다.
         화면이 보여 준 금액을 함께 보낸다 — 다이얼로그를 열어 둔 사이 직원이 그 달 주문을 고쳤으면 기록하지 않고
         거부한다(SETTLEMENT_AMOUNT_CHANGED). 거부 전용 표시는 디자이너 몫이라(운영자 결정 1) 지금처럼 토스트로 말하고
         카드·목록·문서를 새 금액으로 다시 그려 다시 확인받는다. */
      const res = agreeSettlement(clientRec(), ym(), shown);
      dlg.close();
      dlg = null;
      renderMonth();
      refreshMonthRow();
      /* 다이얼로그가 돌려준 포커스 자리(동의 버튼)는 방금 다시 그려져 문서에서 떨어졌다 — body 로 떨어지면 키보드
         사용자가 자리를 잃는다. 다시 확인할 수 있으면 새 동의 버튼으로, 아니면 카드 제목으로 옮긴다. */
      const refocus = (preferBtn) => {
        const btn = preferBtn && qs(root, "[data-action='agree']:not([disabled])");
        const el = btn || qs(root, "[data-agree-title]");
        if (el) el.focus();
      };
      if (res && res.error === "SETTLEMENT_AMOUNT_CHANGED") {
        toast(`금액이 바뀌었습니다. 다시 확인해 주세요 · 지금 ${won(res.amount)}`, "warn");
        refocus(true);
        return;
      }
      if (!res) {
        toast(settle().mode === "auto" ? "동의 마감이 지나 자동 동의로 처리되었습니다" : "동의할 수 없는 상태로 바뀌었습니다", "warn");
        refocus(false);
        return;
      }
      toast("계산서 발급에 동의했습니다");
      refocus(false);
    });
  }

  /* ── 기동 ────────────────────────────────────────────────── */
  render();
  renderDoc();
  centerMonth();

  const view = qs(root, "[data-slot='view']");
  if (view && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => applyScale());
    ro.observe(view);
  }

  const offMonths = on(root, "wheel", "[data-slot='months']", () => { userScrolled = true; });
  const offDown = on(root, "pointerdown", "[data-slot='months']", () => { userScrolled = true; });

  const off = on(root, "click", "[data-action], [data-month]", (e, t) => {
    if (t.dataset.month) {
      if (t.dataset.month === state.month) return;
      state.month = t.dataset.month;
      markMonth();
      renderMonth();
      return;
    }
    const a = t.dataset.action;
    if (a === "prev-year" || a === "next-year") {
      state.year = String(Number(state.year) + (a === "next-year" ? 1 : -1));
      renderYear();
      renderMonth();
      return;
    }
    if (a === "arrive-x") {
      state.arrival = null;
      const bar = qs(root, "[data-slot='arrive']");
      if (bar) bar.remove();
      /* 누른 버튼이 사라졌다 — body 로 떨어지지 않게 지금 열린 달로 옮긴다. */
      const sel = qs(root, ".iv-month.is-sel");
      if (sel) sel.focus();
      return;
    }
    if (a === "zoom-fit" || a === "zoom-100") { state.fit = a === "zoom-fit"; applyScale(); return; }
    if ((a === "pdf" || a === "excel" || a === "link") && docsLocked(settle())) return;
    if (a === "pdf") {
      const docEl = qs(root, ".invoice-doc");
      /* ⚠️ 인쇄는 **새 창에 자기 스타일로 다시 쓴다** — 미리보기의 배율(transform)이
         따라가지 않는다. 축소해서 보고 있어도 인쇄물은 원본 크기다. */
      try { printInvoiceDoc(docEl, `거래명세서_${state.year}_${state.month}`); }
      catch (err) { console.error("PDF 생성 오류:", err); toast("PDF 생성 중 오류가 발생했습니다", "warn"); }
      return;
    }
    if (a === "excel") return downloadExcel();
    if (a === "link") {
      const d = docData();
      const token = issueLink({
        clientId: clientRec().id, bizNumber: buyerOf().bizNumber,
        doc: { title: d.title, period: d.period, buyer: d.buyer, supplier: d.supplier, items: d.items, account: d.account, total: d.total },
      });
      const url = publicInvoiceUrl(token);
      /* 토큰 자체가 열람 권한(capability URL)이라 본인확인이 없다 — 복사한 그 자리에서 알린다. */
      const ok = () => toast("열람링크를 복사했습니다 · 링크만으로 접속이 가능해요");
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok).catch(() => window.prompt("거래명세서 열람링크 (복사하세요)", url));
      else window.prompt("거래명세서 열람링크 (복사하세요)", url);
      return;
    }
    if (a === "agree") openAgree();
  });

  return () => {
    off();
    offMonths();
    offDown();
    if (ro) ro.disconnect();
    if (dlg) dlg.close();
    toast.destroy();
  };
}
