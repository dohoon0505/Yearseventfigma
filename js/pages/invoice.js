/* ============================================================
   invoice.js — 거래명세서 조회 (#/app/invoice)
   시안: claude.ai/design '거래명세서 조회 - 리모델링.dc.html' → 'S-02 포털 거래명세서 동의.dc.html'
        (1차 이식 2026-10-16 오전 · 2차 이식 2026-10-16 오후)

   좌: 미리보기 카드(머리 = 제목 · 'A4 · N장' · 맞춤/100% · PDF · EXCEL · 열람링크 / 상태 띠 / A4 문서)
   우: 340px 레일 = [연도 스테퍼 + 12개월 목록(월 · 거래 N건 · 금액 · 상태 알약)] + [요약·동의 카드].

   예전엔 우측이 연·월 **드롭다운 2개 + 월 스테퍼**라 "6월 얼마였지"를 보려면 드롭다운을
   두 번 여닫아야 했다. 지금은 12개월이 펼쳐져 달마다 건수·금액·상태가 함께 보인다 —
   **고르는 동작이 곧 비교**가 된다.

   S-02 1차 이식으로 바뀐 것:
   ─ PDF·EXCEL·열람링크가 레일에서 **미리보기 머리**로 올라갔다(시안 — 금액을 한 줄로 줄여 월 목록이 3달 이상 보이게).
     배율 토글(맞춤/100%)은 운영자 결정으로 남겼다(1366 창에선 A4 794px 가 안 들어간다).
   ─ 동의 카드는 **배지 + 제목 + 설명 + 사실 줄 + 버튼** 갈래다. 갈래는 `settlementOf` 값으로만 고른다
     (화면이 날짜로 상태를 짐작하지 않는다 — 명세 6.6).
   ─ 발행 전 달도 네 버튼을 잠근다(예전엔 거래 없는 달만). 잠긴 이유는 미리보기 머리 아래 상태 띠가 말한다.
   ─ 알림 링크로 오면 페이지 머리 아래에 닫을 수 있는 한 줄 안내(main.js 가 남긴 도착 표시를 읽고 지운다).

   S-02 2차 이식(추가 요청 ②④⑤⑥⑩)으로 바뀐 것:
   ─ ② 금액이 바뀐 달 — 큰 금액 바로 아래 '발급 때 X원 → 지금 Y원 (M월 D일 수정)'(amountChangeLine — S-01·S-03 과 같은 문장).
     동의·발급 뒤에도 남는다. 동의 전이면 카드가 '금액이 바뀌었습니다. 확인하고 동의해 주세요' 갈래가 된다.
     월 목록에는 따로 표시하지 않는다(시안 — 알약은 넷뿐).
   ─ 발급 뒤 고쳐서 0원이 된 달(zeroEdited) — 동의 버튼 없이 '마감에 계산서 없이 닫힙니다'.
   ─ ④ 동의 확인 창 — 창을 열어 둔 사이 금액이 바뀌어 거부되면 **창을 닫지 않고** 새 금액으로 다시 체크를 받는다
     (시안 d-reject). 다음 '동의하고 발급' 은 창이 새로 보여 준 금액을 싣는다. 0원이 되면 창을 닫고 0원 갈래 + 토스트.
   ─ ⑤ 동의 전 문서 표기 — 미리보기·PDF·열람링크는 문서 머리 태그 + 장마다 바닥 줄, EXCEL 은 2행(출력 시각과 함께),
     미리보기 위에는 노란 띠. 찍는 달은 settlementOf().docStamp(명세서가 나갔고 · 동의 전이고 · **수정 마감 전** —
     사용자 답 1). 문서 데이터는 util/invoice-data `invoiceDocData` 한 곳에서 만든다(관리자 PDF·공개 링크와 같은 함수).
   ─ ⑥ 취소 수수료 줄 — 회색 줄 · '… 취소' 날짜 · 어느 주문의 수수료인지(문서 빌더가 만든다) · 요약 '수수료 N건'.
   ─ ⑩ 월 목록 최소 높이 250 → 160px(1440x900 알림 도착 + 보류 갈래에서 고객센터 줄이 잘리던 것).
   ─ 낱말 — '귀속 연도' → '배송한 달 기준' · '귀속월 말일' → '배송한 달 말일' · 부제 '배송한 달을 골라 …'.
   ⚠️ 시안에는 2026-10-15 에 폐지된 '내역 고침' 체계의 갈래가 1차에 있었고 2차에서 빠졌다 — 옮기지 않았다.
   ⚠️ 시안 머리(26px '거래명세서' · 고정 배율 · 연도 끝 토스트)는 1차 결정대로 따르지 않는다 — pageHead · 맞춤/100% ·
      아무 해로나 이동. 고객센터 번호는 CS_PHONE(시안의 손으로 적은 번호가 아니다).

   ⚠️ **`js/invoice-doc.js` 는 예외 세 가지(계산서 발행 칸 낱말 · 동의 전 표기 · 수수료 줄)만 데이터로 연다.**
      A4 서식과 **여러 장 분할**(paginateItems · 페이지 번호 푸터)은 거기 있고, 공개 열람 링크 페이지(`invoice/`)와
      관리자 정산 화면이 같은 모듈을 쓴다. 이 화면은 그 결과물을 감싸는 껍데기만 담당한다.
   ⚠️ PDF·EXCEL·열람링크는 **진짜로 동작한다**(시안은 토스트만 띄우는 목업이다) —
      인쇄창 · 서식 있는 .xlsx 생성 · 공개 토큰 발급 + 클립보드. PDF·EXCEL 은 **누르는 순간** 문서를 다시 만든다
      (미리보기 DOM 을 복사하면 미리보기를 그린 시각이 출력 시각으로 찍힌다).
   ============================================================ */
import { setHTML, on, qs, qsa, html } from "../dom.js";
import { icon } from "../icons.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { issueLink, publicInvoiceUrl, DOC_STAMP } from "../data/invoice-links.js";
import { fmtAt, fmtKoShortY, fmtKoShortTimeY, periodLabel, periodEnd } from "../data/settlement-rules.js";
import { CS_PHONE } from "../data/contact.js";
import { currentClient } from "../util/client.js";
import { takeFocusSection } from "../session.js";
import { pageHead } from "../ui.js";
import { openDialog, dlgActions } from "../util/dialog.js";
import { makeToast } from "../toast.js";
import { sheetToXlsx } from "../util/xlsx.js";
/* 명세서 행·달 목록·동의는 B2B 주문(배송일시의 달)에서 파생한다(2026-10-16 — 주문과 정산 연결). 예전엔 정적 목데이터
   (invoice-mock)를 읽어 주문을 고쳐도 명세서가 그대로였다. */
import {
  INVOICE_YM_KEY, settlementsFor, monthsOf, invoiceMonth, latestInvoiceKey, agreeSettlement,
  settlementOf, amountChangeLine, holdPendingOf,
} from "../util/settlement.js";
/* 문서 데이터의 단일 빌더 — 미리보기 · PDF · EXCEL 이 같은 값을 본다(예전 이 파일의 docData 와 관리자 buildDoc 두 벌). */
import { invoiceDocData, invoiceDocElement } from "../util/invoice-data.js";

const DOC_W = 794; /* A4 폭(px) — invoice-doc.js 의 .invoice-page 와 같은 값 */
const ASSET = "./assets/";
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
/* 고객센터 줄의 앞말(시안) — 보류 3종은 '문의', 금액이 바뀐 달·고쳐서 0원이 된 달은 '내역이 다르면'. 그 밖의 갈래에는 없다. */
const HELP_ASK = "문의 · 고객센터";
const HELP_DIFF = "내역이 다르면 고객센터";

/* ── 엑셀 스타일 팔레트(ARGB) · tokens.css 브랜드값 미러링 ────────
   워크시트 색상은 CSS 토큰을 참조할 수 없어 브랜드 hex 를 ARGB(FF+hex)로 옮겨 둔다(xlsx 예외 — CLAUDE.md).
   동의 전 표기 행(stamp*)·수수료 줄(fee*)은 S-02 시안 값 그대로다(문서 서식 invoice-doc.js 의 같은 줄과 같은 색). */
const XA = {
  orange: "FFF15A2A", orangeSoft: "FFFFF1EC", orangeInk: "FFD94000",
  white: "FFFFFFFF", ink: "FF111111", text2: "FF444444", muted: "FF888888",
  label: "FFF5F5F5", zebra: "FFFAFBFC", total: "FFFFF6EF",
  stampBg: "FFFFF3D6", fee: "FFF3F3F3", feeInk: "FF555555",
};
const MONEY_FMT = '#,##0"원"';
const XS = {
  title:   { bold: true, size: 18, color: XA.orangeInk, fill: XA.orangeSoft, align: "center", valign: "center" },
  stamp:   { bold: true, size: 10.5, color: XA.orangeInk, fill: XA.stampBg, align: "left", valign: "center", wrap: true },
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
/* 수수료 줄 — 회색이 지브라보다 앞선다(시안 x-excel). 주문상품 칸만 굵게. */
const xFee = (align, extra = {}) => ({ size: 10.5, color: XA.feeInk, fill: XA.fee, align, valign: "center", wrap: align === "left", border: true, ...extra });

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
  /* 화면을 떠나는 중 — 정리(cleanup)가 닫는 동의 창이 사라질 화면으로 포커스를 옮기지 않게 한다. */
  let leaving = false;

  const ym = () => `${state.year}-${state.month}`;
  const clientRec = () => currentClient() || { id: "" };
  /* 그릴 때마다 다시 파생한다 — 동의 기록은 거래처별이고, 마감(13:00)이 지나면 같은 달이 자동 동의로 바뀐다.
     상태의 단일 소스는 util/settlement.js `settlementOf`(발행 전 · 동의대기 · 보류 · 발급 중 · 발급 완료 · 0원 · 고쳐서 0원). */
  const settle = (key = ym(), now = new Date()) => settlementOf(clientRec(), key, now);
  /** 내려받을 문서가 없는 달 — 발행 시각이 지났는데 거래가 없거나(NONE) 아직 발행 전이다(네 버튼 잠금 · 상태 띠).
   *  ⚠️ `s.empty` 로 보면 안 된다 — 발행 뒤 취소·삭제로 줄이 다 빠진 달(고쳐서 0원)도 empty 지만 거래처가 받은 명세서가 있다. */
  const docsLocked = (s) => s.status === "NONE" || s.status === "SCHEDULED";
  /** 그 달에 보여 줄 거래가 없다고 말할 달 — 거래가 없는 달(발행 전·NONE). 고쳐서 0원이 된 달은 '거래 0건' 이다. */
  const noTrade = (s) => s.empty && !s.zeroEdited;

  /* ── 현재 선택 월 → invoice-doc.js 문서 데이터(util/invoice-data 한 곳) ─────────
     문서의 '계산서 발행' 칸 · 발행일 칸 · 동의 전 표기(stamp — docStamp 일 때만, 출력 시각 = now) · 수수료 줄(kind:'fee')이
     모두 거기서 정해진다. 미리보기는 그린 순간, PDF·EXCEL 은 누른 순간의 now 를 넘긴다. */
  const docData = (now = new Date()) => {
    const c = currentClient();
    return c ? invoiceDocData(c, ym(), now) : null;
  };

  /* ── 월 목록 ─────────────────────────────────────────────
     상태 알약은 시안이 고른 넷뿐이다 — 동의 필요 · 발급 중 · 발행 전 · 0원. 발급 완료·내역 없음은 표시하지 않는다
     (조용한 달은 조용히 두어야 표시가 있는 달이 눈에 띈다). '금액 바뀜' 은 알약을 달지 않는다(시안 선택 — 요약 줄이 말한다). */
  function markOf(s) {
    /* 거래가 없는 달은 발행 전이어도 알약을 달지 않는다 — 시안 규칙 '내역 없음은 표시하지 않습니다'(줄에 '내역 없음' 이 이미
       보인다). 그래서 이번 달·다음 달처럼 주문 0건인 발행 전 달은 줄이 조용하고, 고르면 카드가 '발행 전' 갈래로 말한다(결정 D 는
       카드 갈래의 순서다). 알약이 없다는 것은 '거래 없음' 을 주장하지 않는다 — 발행 시각이 지난 NONE 달도 알약이 없다. */
    if (s.status === "SCHEDULED") return s.empty ? null : ["발행 전", "gray"];
    if (s.status === "NONE") return null;
    /* 발급 때부터 0원 · 고쳐서 0원(마감 전 동의대기여도) — 둘 다 '0원'(시안 p-zero-now 의 월 알약). */
    if (s.zero || s.zeroEdited) return ["0원", "gray"];
    if (s.status === "AWAITING_AGREEMENT") return ["동의 필요", "orange"];
    if (s.status === "AGREED") return ["발급 중", "gray"];
    return null;
  }
  const monthInner = (m) => {
    const s = settle(`${state.year}-${m.mm}`);
    const mk = markOf(s);
    const none = noTrade(s);
    return html`
      <span class="iv-month__l">
        <b>${m.mm}월</b>
        <span>${none ? "내역 없음" : `거래 ${s.count}건`}</span>
      </span>
      <span class="iv-month__r">
        <span class="iv-month__amt">${none ? "-" : won(s.amount)}</span>
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
    setHTML(btn, monthInner({ mm }));
  }
  /** 열두 줄의 안쪽을 지금 값으로(같은 수법 — 스크롤·포커스가 남는다). 화면을 연 채 발행(10:00)·마감(13:00) 시각이 지나면
   *  줄은 옛 알약('발행 전'·'동의 필요')인데 그 달을 고르면 카드는 새 갈래를 말했다(2026-10-17 실측) — 달을 고를 때마다 맞춘다. */
  const refreshMonthRows = () => qsa(root, ".iv-month").forEach((b) => refreshMonthRow(b.dataset.month));

  /* ── 요약(금액 한 줄 + 금액이 바뀐 달이면 '발급 때 → 지금' 한 줄) ─────────────────
     건수·금액은 settlementOf 의 count(주문만) · feeCount · amount 다(월 목록·카드·확인 창과 같은 값 — 모두 지금 값). */
  function sumTop() {
    const s = settle();
    const meta = noTrade(s)
      ? "거래 내역 없음"
      : `거래 ${s.count}건${s.feeCount ? ` · 수수료 ${s.feeCount}건` : ""} · ${fmtKoShortY(s.issueAt)} 발행`;
    const chg = amountChangeLine(s);
    return html`
      <div class="iv-sum__row">
        <div class="iv-sum__l">
          <p class="iv-sum__k">${periodLabel(ym())} 귀속</p>
          <p class="iv-sum__meta">${meta}</p>
        </div>
        <b class="iv-sum__amt">${won(s.amount)}</b>
      </div>
      ${chg ? html`<p class="iv-sum__chg">${chg}</p>` : ""}
    `;
  }

  /* ── 계산서 발급 동의 카드 — 갈래 ───────────────────────
     작성일자 규칙: 1~7일 그룹 = 배송한 달 말일(동의 시점과 무관), 11~25일 그룹 = 동의한 날(자동이면 마감일).
     보류 달(11~25 그룹)에는 '자동이면 …' 이 거짓이다(그 달은 자동 동의되지 않는다) — 오늘 동의하면 며칠인지 말한다
     (시안은 '자동이면 …' 이지만 1차 자동 결정을 지킨다).
     ⚠️ html`` 은 Date 를 String(date) 로 찍는다 — 반드시 포맷해서 넣는다. */
  function writtenOf(s, now) {
    if (s.group === "early") return `${fmtKoShortY(periodEnd(s.period), now)} · 배송한 달 말일`;
    if (s.agreedAt) return `${fmtKoShortY(s.agreedAt, now)} · 동의한 날`;
    /* 마감 전이어도 이대로면 보류가 잡힐 달(holdPendingOf — 관리자 정산회계와 같은 예측)은 '자동이면 …' 을 단정하지 않는다(검토 9) */
    if (s.autoAgreeHold || holdPendingOf(s)) return `동의한 날 · 오늘 동의하면 ${fmtKoShortY(now)}`;
    return `동의한 날 · 자동이면 ${fmtKoShortY(s.deadline, now)}`;
  }
  /** 정산 상태 → 카드 갈래. btn: "on"(동의 가능) · "off"(잠금 — 이유는 제목·설명이 말한다) · "none"(버튼 없음).
   *  help: 고객센터 줄의 앞말(없으면 그 줄이 없다).
   *  갈래 순서(시안): 발행 전 · 거래 없음 → 0원(발급 때부터) → 고쳐서 0원 → 보류 → 금액이 바뀐 달 / 보통 열림 → 발급 중 → 발급 완료.
   *  보류이면서 금액이 바뀐 달은 **보류 갈래가 이긴다**(요약의 '발급 때 → 지금' 줄만 붙는다). */
  function cardOf(s, now) {
    /* ⚠️ 발행 전과 거래 없음(NONE)은 서로 겹치지 않는다(NONE = 발행 시각이 지났는데 거래가 없는 달). 주문이 아직 0건인 이번 달도
       '발행 전' 이다(2026-10-16 결정 D — 관리자·포털 정산회계가 이미 그렇게 말한다). */
    if (s.status === "SCHEDULED") {
      return {
        badge: ["발행 전", "gray"], title: "아직 발행 전입니다",
        body: `이 달의 거래명세서는 ${fmtKoShortTimeY(s.issueAt, now)}에 발급됩니다. 발급되면 내용을 확인하고 동의할 수 있습니다.`, btn: "off",
      };
    }
    if (s.status === "NONE") {
      return { badge: ["해당 없음", "gray"], title: "이 달은 거래가 없습니다", body: "배송한 주문이 없는 달은 발급할 계산서가 없습니다.", btn: "off" };
    }
    /* 발급 때부터 0원 — 명세서는 발급되지만 동의·계산서·입금 없이 닫힌다(명세 3.4 예외표 · 10.4 Q21 잠정 ①). */
    if (s.zero && !s.zeroEdited) {
      return {
        badge: ["0원 · 계산서 없음", "gray"], title: "이 달은 청구 금액이 0원입니다",
        body: "0원 주문만 있어 계산서 발급 동의가 필요 없습니다. 입금할 금액도 없습니다.",
        facts: [["거래", `${s.count}건 · 모두 0원 주문`]], btn: "none",
      };
    }
    /* 발급 뒤 고쳐서 0원 — 마감까지 동의대기(동의는 받지 않는다 · open:false), 마감에 계산서 없이 닫힌다(시안 c-zero-now).
       닫힌 뒤(PAID)는 시안에 없는 상태라 같은 갈래를 과거형으로 말한다. 줄이 다 빠진 달(취소·삭제)도 이 갈래다 —
       '거래 없음' 이라고 하면 거래처가 받은 명세서가 사라진 것처럼 읽힌다(DATA.md Q3 — '남은 거래 0건'). */
    if (s.zeroEdited) {
      const closed = s.status === "PAID";
      const when = fmtKoShortTimeY(s.zeroCloseAt, now);
      return {
        badge: ["0원 · 계산서 없음", "gray"], title: "고쳐져서 청구 금액이 0원이 되었습니다",
        body: `발급 뒤 내역이 고쳐져 이 달은 계산서 발급 동의가 필요 없습니다. ${when} 마감에 계산서 없이 ${closed ? "닫혔습니다" : "닫힙니다"}.`,
        facts: [["남은 거래", s.count ? `${s.count}건 · 0원 주문` : "0건"], ["마감", `${when} · 계산서 없이 닫힘`]],
        btn: "none", help: HELP_DIFF,
      };
    }
    if (s.status === "AWAITING_AGREEMENT" && s.autoAgreeHold) {
      /* 마감이 지났지만 자동 동의되지 않은 달 — '…까지 동의가 없으면 자동 동의' 는 이 달에 거짓이다. 이유를 말하고 지금 받는다. */
      return {
        badge: ["동의 필요", "orange"], title: HOLD_TITLE[s.autoAgreeHold] || "마감이 지났지만 자동 동의되지 않았습니다",
        body: "그래서 자동 동의되지 않았습니다. 내용을 확인하시고 동의해 주세요. 마감이 지났어도 지금 동의할 수 있습니다.",
        facts: [["동의 마감", `${fmtKoShortTimeY(s.deadline, now)} · 지남`], ["작성일자", writtenOf(s, now)]],
        btn: "on", help: HELP_ASK,
      };
    }
    if (s.status === "AWAITING_AGREEMENT") {
      const left = s.deadline.getTime() - now.getTime();
      /* 마감 24시간 전부터 남은 시간을 빨갛게(시안 · S-01·S-03 과 같은 기준). */
      const due = ["동의 마감", `${fmtKoShortTimeY(s.deadline, now)} · ${spanText(left)} 남음`, left <= DAY];
      /* '마감까지 동의가 없으면 · 그 시각에 자동 동의' 는 이대로면 보류가 잡힐 달(고지 미도달 예정 — 마감 하루 전 안내가 닿지 않았다)에
         거짓이다 — 관리자 정산회계가 같은 달에 '자동 동의됩니다' 를 피하는 판정(holdPendingOf)으로 그 줄을 뺀다(새 문장은 짓지 않는다 ·
         보류 사정은 마감이 지나 보류가 잡히면 보류 갈래가 말한다 · 2026-10-19 검토 9). */
      const auto = holdPendingOf(s) ? null : ["마감까지 동의가 없으면", "그 시각에 자동 동의"];
      const written = ["작성일자", writtenOf(s, now)];
      const lock = fmtKoShortTimeY(s.editLockAt, now);
      if (s.changed) {
        /* 금액이 바뀐 달(시안 c-changed-before). 수정 마감이 지난 뒤는 시안에 없는 상태라 같은 사실을 지난 일로 말한다. */
        return {
          badge: ["동의 필요", "orange"], title: "금액이 바뀌었습니다. 확인하고 동의해 주세요",
          body: `발급 뒤 내역이 고쳐졌습니다. 지금 금액으로 계산서(면세)가 발급되며, ${s.editable
            ? `수정 마감(${lock}) 뒤에는 금액이 더 바뀌지 않습니다.`
            : `수정 마감(${lock})이 지나 금액이 더 바뀌지 않습니다.`}`,
          facts: [["발급 때 금액", won(s.issuedAmount)], due, auto, written].filter(Boolean),
          btn: "on", help: HELP_DIFF,
        };
      }
      return {
        badge: ["동의 필요", "orange"], title: "금액을 확인하고 동의해 주세요",
        /* 수정 마감 전이면 직원이 아직 금액을 고칠 수 있다는 사실을 덧붙인다(editable = now < editLockAt — 시안 lockLeft > 0). */
        body: `동의하면 이 금액으로 계산서(면세)가 발급됩니다. 동의 후에는 내용을 바꿀 수 없습니다.${s.editable ? ` 수정 마감(${lock})까지는 금액이 바뀔 수 있습니다.` : ""}`,
        facts: [due, auto, written].filter(Boolean),
        btn: "on",
      };
    }
    const auto = s.mode === "auto";
    const agreed = s.agreedAt ? `${fmtKoShortTimeY(s.agreedAt, now)} · ${auto ? "자동 동의" : "직접 동의"}` : "-";
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
      ${c.help ? html`<p class="iv-help">${c.help} <b>${CS_PHONE}</b></p>` : ""}
    `;
  }

  /* ── 미리보기 머리 아래 상태 띠 ─────────────────────────────
     회색 — 네 버튼이 잠긴 이유(발행 전 · 거래 없음). 노란 — 동의 전 문서 표기가 찍히는 달(docStamp — 명세서가 나갔고 ·
     동의 전이고 · 수정 마감 전 · 사용자 답 1). 수정 마감 뒤(보류 달 포함)에는 띠도 표기도 없다(문서 '계산서 발행' 칸이
     '발급대기 · 동의 후 발급' 이라 동의 전인 것은 보인다). 금액이 바뀐 달이면 '발급 때 → 지금' 줄을 붙인다(시안). */
  function stripBody() {
    const s = settle();
    if (s.status === "SCHEDULED") return html`<p class="iv-strip">발행 전이라 내려받을 수 없습니다. ${fmtKoShortTimeY(s.issueAt)}에 발급됩니다</p>`;
    if (s.status === "NONE") return html`<p class="iv-strip">거래가 없는 달이라 PDF · EXCEL · 열람링크를 쓸 수 없습니다</p>`;
    if (s.docStamp) {
      const chg = amountChangeLine(s);
      return html`<p class="iv-strip iv-strip--draft">${DOC_STAMP} — PDF · EXCEL · 열람링크에 출력 시각과 함께 찍힙니다${chg ? ` · ${chg}` : ""}</p>`;
    }
    return "";
  }

  /* ── 알림 링크 도착 한 줄 ─────────────────────────────── */
  function arrivalBar() {
    const a = state.arrival;
    if (!a) return "";
    const label = `${periodLabel(ym())} 귀속`;
    /* '로그인 뒤에도' 는 로그인 화면을 거쳐 왔을 때만 붙인다 — 이미 로그인돼 있었으면 거짓이 된다.
       못 찾았을 때 연 달은 latestInvoiceKey — 오늘이 속한 달까지 중 가장 최근 명세서다(시안 문장). */
    const [t, b] = a.ok
      ? ["카톡 알림에서 바로 열었습니다.", a.viaLogin ? `로그인 뒤에도 알림이 가리킨 ${label} 명세서를 그대로 열었습니다.` : `알림이 가리킨 ${label} 명세서를 열었습니다.`]
      : ["알림 주소의 달을 찾지 못했습니다.", `오늘이 속한 달까지 중 가장 최근 명세서(${label})를 열었습니다.`];
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
            desc: "배송한 달을 골라 내려받거나 발급에 동의합니다",
          })}
          ${arrivalBar()}
          <div class="iv-cols">
            <!-- DOM 은 레일이 먼저 — order 로 자리만 바꾼다. Tab 순서가
                 '기간 고르기 → 동의 → 문서 보기' 가 되어 읽는 순서와 맞는다. -->
            <aside class="iv-rail">
              <div class="iv-card iv-listcard">
                <div class="iv-year">
                  <button type="button" class="iv-ystep" data-action="prev-year" aria-label="이전 해">‹</button>
                  <div class="iv-year__l"><b data-slot="year">${state.year}년</b><span>배송한 달 기준</span></div>
                  <button type="button" class="iv-ystep" data-action="next-year" aria-label="다음 해">›</button>
                </div>
                <div class="iv-months" data-slot="months" role="group" aria-label="배송한 달">${monthsBody()}</div>
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
    const d = docData();
    host.innerHTML = d ? invoiceDoc(d, ASSET) : "";
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
  /** 선택 달이 바뀌거나 그 달의 상태가 바뀌었을 때 — 목록은 줄 안쪽만(다시 그리지 않는다), 나머지는 슬롯만. */
  function renderMonth() {
    refreshMonthRows();
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

  /* ── EXCEL — 서식 있는 .xlsx. 내용은 문서 빌더(invoiceDocData)의 items·stamp 를 그대로 쓴다 ──────
     동의 전 달(docStamp)이면 제목 바로 아래 2행에 '동의 전 — 금액이 바뀔 수 있습니다 · YYYY-MM-DD HH:mm 출력'
     (+ 금액이 바뀐 달이면 '발급 때 → 지금' 줄 — 시안 x-excel). 동의된 달·수정 마감 뒤에는 그 행이 아예 없다.
     수수료 줄은 회색. 그 밖의 서식(부제 · 공급받는자·공급자 구역 · '합계')은 그대로다(EXCEL 서식은 범위 밖). */
  function downloadExcel() {
    const now = new Date();
    const d = docData(now);
    if (!d) return;
    const label = periodLabel(d.ym);
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

    const buyer = d.buyer;
    const sup = d.supplier;
    push([{ v: "거래명세서", s: XS.title }, bl(XS.title), bl(XS.title), bl(XS.title), bl(XS.title)]); mr("A", "E"); rowHeights[R] = 34;
    if (d.stamp) {
      /* 시각은 'YYYY-MM-DD HH:mm'(시안 x-excel 의 자리 규격 — PDF 의 'M월 D일 HH:mm' 과 다르다). */
      const chg = amountChangeLine(d.settlement);
      push([{ v: `${d.stamp.text} · ${fmtAt(now)} 출력${chg ? ` · ${chg}` : ""}`, s: XS.stamp }, bl(XS.stamp), bl(XS.stamp), bl(XS.stamp), bl(XS.stamp)]);
      mr("A", "E"); rowHeights[R] = 20;
    }
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
    meta("회사명", sup.company);
    meta("사업자등록번호", sup.bizNumber);
    meta("대표자", sup.ceo);
    meta("E-MAIL", sup.email);
    meta("FAX", sup.fax);
    push([]);
    band("■ 거래 내역");
    push([{ v: "배송요청일시", s: XS.th }, { v: "발송인", s: XS.th }, { v: "배송지", s: XS.th }, { v: "주문상품", s: XS.th }, { v: "결제금액", s: XS.th }]); rowHeights[R] = 24;
    /* 거래가 없는 달의 자리표시 줄(value 없음)은 표 줄이 아니다. */
    const lines = d.items.filter((it) => typeof it.value === "number");
    if (lines.length) {
      lines.forEach((it, i) => {
        if (it.kind === "fee") {
          push([{ v: it.date, s: xFee("center") }, { v: it.sender, s: xFee("center") }, { v: it.address, s: xFee("left") },
            { v: it.product, s: xFee("left", { bold: true }) }, { v: it.value, s: xFee("right", { numFmt: MONEY_FMT }) }]);
          return;
        }
        const z = i % 2 === 1;
        push([{ v: it.date, s: xCenter(z) }, { v: it.sender, s: xCenter(z) }, { v: it.address, s: xLeft(z) }, { v: it.product, s: xLeft(z) }, { v: it.value, s: xMoney(z) }]);
      });
      push([{ v: "합계", s: XS.tlabel }, bl(XS.tlabel), bl(XS.tlabel), bl(XS.tlabel), { v: d.settlement.amount, s: XS.tmoney }]); mr("A", "D");
    } else {
      push([{ v: "해당 월의 거래 내역이 없습니다", s: XS.empty }, bl(XS.empty), bl(XS.empty), bl(XS.empty), bl(XS.empty)]); mr("A", "E");
    }
    push([]);
    foot("입금 계좌", d.account);

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
      toast(d.stamp ? `EXCEL을 내려받습니다 · 2행에 '${d.stamp.text} · 출력 시각'` : "EXCEL 파일을 내려받았습니다");
    } catch (err) {
      console.error("EXCEL 생성 오류:", err);
      toast("EXCEL 생성 중 오류가 발생했습니다", "warn");
    }
  }

  /** 동의 창이 닫혀 포커스가 body 로 떨어졌을 때(돌려줄 자리 — 동의 버튼 — 가 다시 그려져 문서에서 떨어졌다) 키보드 사용자가
   *  자리를 잃지 않게 한다. 다시 확인할 수 있으면 새 동의 버튼으로, 아니면 카드 제목으로 옮긴다. */
  function refocus(preferBtn) {
    if (leaving || !root.isConnected) return;
    const btn = preferBtn && qs(root, "[data-action='agree']:not([disabled])");
    const el = btn || qs(root, "[data-agree-title]");
    if (el) el.focus();
  }

  /* ── 계산서 발급 동의 — 체크 게이트 ──────────────────────
     되돌릴 수 없는 동작이라 주문서·거래처 삭제와 같은 마찰을 준다. 다만
     `openDeleteConfirm` 은 쓰지 않는다 — 빨간 danger 버튼·휴지통 아이콘·삭제 문구라
     '발급 동의'에 맞지 않는다. 공용 `.dlg-check` 만 빌려 쓴다.
     안내 상자는 카드와 같은 갈래를 따른다 — 보류 달에는 '…까지 동의하지 않아도 자동 동의' 를 말하지 않는다.
     금액이 바뀐 달은 요약에 '발급 때 금액'(지운 글씨)과 '지금 금액' 을 함께 보인다(시안 d-changed).
     창을 열어 둔 사이 금액이 바뀌어 거부되면(SETTLEMENT_AMOUNT_CHANGED) **창을 닫지 않는다**(시안 d-reject) — 맨 위에 경고 상자,
     요약·체크 문구·머리를 새 금액으로 바꾸고 체크를 풀어 다시 받는다. 다음 요청은 **창이 새로 보여 준 금액**을 싣는다
     (명세 6.6 '화면이 보여 준 금액' — 시안 목업이 옛 금액을 다시 보내는 부분은 따르지 않는다). 새 금액이 0원이면 동의할 것이
     없으니 창을 닫고 카드를 0원 갈래로 다시 그린 뒤 토스트로 알린다(DATA.md Q5). */
  function openAgree() {
    const s0 = settle();
    if (dlg) return;
    if (s0.status !== "AWAITING_AGREEMENT" || !s0.open) {
      /* 화면을 연 채 마감(13:00)이 지나 카드가 옛 갈래('동의 필요' + 살아 있는 버튼)로 남아 있었다 — 눌러도 아무 일이 없었다
         (2026-10-17 실측). 지금 값으로 다시 그리고, 창을 연 사이 마감이 지났을 때와 같은 말로 알린다. */
      renderMonth();
      toast(s0.mode === "auto" ? "동의 마감이 지나 자동 동의로 처리되었습니다" : "동의할 수 없는 상태로 바뀌었습니다", "warn");
      refocus(false);
      return;
    }
    const now = new Date();
    let shown = s0.amount; /* 창이 보여 주는 금액 — 동의 요청에 함께 싣는다(명세 3.4 '마감 전 수정' 5 · 6.6) */
    let err = null;        /* 거부된 뒤: { was: 동의하려던 금액, at: 바뀐 시각 } */
    let ack = false;
    const period = `${periodLabel(ym())} 귀속`;
    const HINT_OFF = "확인에 체크해야 발급됩니다";
    const HINT_ERR = "새 금액에 다시 체크해야 발급됩니다";
    const HINT_ON = "동의하면 바로 발급을 시작합니다";
    /* 이대로면 보류가 잡힐 달(holdPendingOf)은 '자동 동의' 안내 상자를 두지 않는다 — 카드와 같은 판정(검토 9) */
    const line = s0.autoAgreeHold
      ? ["자동 동의되지 않은 명세서", "마감이 지나 자동 동의되지 않은 명세서입니다. 지금 동의하시면 계산서가 발급됩니다."]
      : holdPendingOf(s0) ? null
      : ["자동 동의", `${fmtKoShortTimeY(s0.deadline, now)}까지 동의하지 않아도 그 시각에 자동 동의됩니다.`];
    /* 창의 작성일자는 **지금 동의하면 실제로 찍힐 날짜**다(2026-10-16 결정) — 11~25일 그룹은 동의한 날 = 오늘.
       카드는 시안 문장 그대로('동의한 날 · 자동이면 …')지만, 동의 버튼을 누르기 직전의 창이 '자동이면 10월 28일' 이라고
       말하면 오늘 동의하는 사람에게 다른 날짜를 보여 주게 된다. 1~7일 그룹은 배송한 달 말일 그대로(동의 시점과 무관). */
    const writtenNow = s0.group === "early" ? writtenOf(s0, now) : `${fmtKoShortY(now)} · 동의한 날(오늘)`;
    const recapBody = (s) => html`
      <div><span>귀속 · 배송한 달</span><b>${period}</b></div>
      <div><span>거래 건수</span><b class="num">${s.count}건</b></div>
      <div><span>작성일자</span><b>${writtenNow}</b></div>
      ${err
        ? html`<div class="iv-recap__was"><span>동의하려던 금액</span><b class="num">${won(err.was)}</b></div>`
        : s.changed ? html`<div class="iv-recap__was"><span>발급 때 금액</span><b class="num">${won(s.issuedAmount)}</b></div>` : ""}
      <div class="iv-recap__total"><span>${err ? "지금 금액 · 다시 확인" : s.changed ? "지금 금액" : "발급 금액"}</span><b class="num">${won(shown)}</b></div>`;
    const ackLabel = () => (err ? `새 금액 ${won(shown)}을 확인했고 되돌릴 수 없음에 동의합니다` : "금액을 확인했고 되돌릴 수 없음에 동의합니다");
    const errBox = () => html`
      <div class="iv-agerr" role="alert">
        <b class="iv-agerr__t">금액이 바뀌었습니다. 다시 확인해 주세요</b>
        <p class="iv-agerr__p">동의하려던 금액 ${won(err.was)} → 지금 ${won(shown)}${err.at ? ` (${fmtKoShortTimeY(err.at, now)} 수정)` : ""}. 새 금액을 확인하고 다시 체크해 주세요.</p>
      </div>`;
    let closingByCode = false;
    dlg = openDialog({
      eyebrow: `${period} · ${won(shown)}`,
      title: "계산서 발급에 동의할까요?",
      width: 520,
      /* 패널 높이 상한을 시안대로 '오버레이 안쪽 전체'로(invoice.css `.modal-panel--ivagree`) — 공용 88vh 면 1280x720 거부 창에서
         경고 상자 윗줄이 스크롤 밖으로 밀렸다(실측 21px). */
      panelClass: "modal-panel--ivagree",
      bodyClass: "iv-agdlg",
      body: html`
        <div data-slot="agerr" hidden></div>
        <p class="dlg-desc"><b>동의 후에는 되돌릴 수 없습니다.</b> 이 금액 그대로 계산서(면세)가 발급되고,
          명세서 내용은 더 이상 바뀌지 않습니다.</p>
        <div class="iv-recap" data-slot="recap">${recapBody(s0)}</div>
        ${line ? html`<div class="iv-line"><b>${line[0]}</b>${line[1]}</div>` : ""}
        <button type="button" class="dlg-check" data-action="ack" role="checkbox" aria-checked="false">
          <span class="dlg-check__box" aria-hidden="true"></span>
          <span data-slot="acklabel">${ackLabel()}</span>
        </button>`,
      hint: HINT_OFF,
      hintBlock: true,
      actions: dlgActions({ ok: "동의하고 발급", disabled: true }),
      onClose: () => {
        dlg = null;
        /* 취소·✕·ESC 로 닫았는데 돌려줄 자리(동의 버튼)가 거부 뒤 다시 그려져 사라졌으면 body 로 떨어진다 — 새 버튼으로. */
        if (!closingByCode && (!document.activeElement || document.activeElement === document.body)) refocus(true);
      },
    });
    const p = dlg.panel;
    const chk = qs(p, "[data-action='ack']");
    const go = qs(p, "[data-action='ok']");
    const closeByCode = () => { closingByCode = true; dlg.close(); dlg = null; };
    on(p, "click", "[data-action='ack']", () => {
      ack = !ack;
      chk.classList.toggle("is-on", ack);
      chk.setAttribute("aria-checked", ack ? "true" : "false");
      go.disabled = !ack;
      /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다. */
      dlg.setHint(ack ? HINT_ON : err ? HINT_ERR : HINT_OFF, !ack);
    });
    on(p, "click", "[data-action='ok']", () => {
      if (!ack) return;
      /* store 가 같은 규칙·같은 시계로 다시 판정한다 — 다이얼로그를 열어 둔 채 마감(13:00)이 지나면
         기록하지 않고 null 을 돌려주고, 그 달은 자동 동의로 그려진다. */
      const res = agreeSettlement(clientRec(), ym(), shown);
      /* 저장 공간 부족 — 동의가 기록되지 않았다(store 가 되돌렸다). 동의한 척하지 않고 창·체크를 그대로 둔다
         (발급 처리·입금 확인 창과 같은 규칙 — 다시 누르면 된다). */
      if (res && res.error === "STORAGE_FULL") {
        toast("저장하지 못했습니다 · 브라우저 저장 공간이 부족합니다", "warn");
        return;
      }
      if (res && res.error === "SETTLEMENT_AMOUNT_CHANGED") {
        /* 창 뒤(카드·월 목록·미리보기)도 새 금액으로. 바뀐 시각은 거부 응답에 없다 — settlementOf 를 다시 읽는다(명세 6.6). */
        renderMonth(); /* 월 목록 줄도 같이(refreshMonthRows) */
        const s1 = settle();
        if (s1.amount === 0 || !s1.open) {
          closeByCode();
          toast("금액이 0원이 되어 동의가 필요 없습니다", "warn");
          refocus(false);
          return;
        }
        err = { was: shown, at: s1.amountChangedAt };
        shown = s1.amount;
        ack = false;
        chk.classList.remove("is-on");
        chk.classList.add("is-err");
        chk.setAttribute("aria-checked", "false");
        go.disabled = true;
        const slot = qs(p, "[data-slot='agerr']");
        setHTML(slot, errBox());
        slot.hidden = false;
        const recap = qs(p, "[data-slot='recap']");
        setHTML(recap, recapBody(s1));
        recap.classList.add("is-err");
        /* 평문은 textContent 로 — setHTML 에 평문 문자열을 넘기면 이스케이프 없이 innerHTML 이 된다(규약). */
        qs(p, "[data-slot='acklabel']").textContent = ackLabel();
        const eb = qs(p, ".dlg-hd__eyebrow");
        if (eb) eb.textContent = `${period} · ${won(shown)}`;
        dlg.setHint(HINT_ERR, true);
        /* 경고 상자가 보이게 본문을 맨 위로 두고, 다음 할 일(다시 체크)로 포커스를 옮긴다. 포커스를 받은 칸이 가려지면 안 되므로
           체크 칸이 보이는 데까지만 내린다 — 패널 상한을 오버레이 안쪽 전체로 넓힌 뒤(.modal-panel--ivagree)로는 1280x720 에서도
           둘 다 보여 내리지 않는다(실측 — 본문 517px 에 경고 제목 32~54 · 체크 칸 472~517, 일곱 자리 금액도 두 줄). 더 낮은 창에서만
           경고 상자 윗부분이 올라간다. */
        const body = qs(p, ".dlg-body");
        if (body) body.scrollTop = 0;
        chk.focus({ preventScroll: true });
        chk.scrollIntoView({ block: "nearest" });
        return;
      }
      closeByCode();
      renderMonth();
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
      /* ⚠️ 누르는 순간의 시각으로 문서를 **다시 만든다** — 동의 전 표기의 출력 시각이 미리보기를 그린 시각이면 안 된다.
         인쇄는 새 창에 자기 스타일로 다시 쓴다 — 미리보기의 배율(transform)이 따라가지 않는다(인쇄물은 원본 크기). */
      try {
        const d = docData(new Date());
        const el = d && invoiceDocElement(d, ASSET);
        if (!el) throw new Error("invoice doc not rendered");
        /* 팝업이 막히면 printInvoiceDoc 이 경고창을 띄우고 false — '내려받습니다' 토스트를 함께 띄우면 거짓이 된다. */
        if (printInvoiceDoc(el, `거래명세서_${state.year}_${state.month}`) === false) return;
        toast(d.stamp ? `PDF를 내려받습니다 · '${d.stamp.text} · ${d.stamp.printedAt} 출력'이 찍힙니다` : "PDF 다운로드를 시작했습니다");
      } catch (err) { console.error("PDF 생성 오류:", err); toast("PDF 생성 중 오류가 발생했습니다", "warn"); }
      return;
    }
    if (a === "excel") return downloadExcel();
    if (a === "link") {
      const c = currentClient();
      if (!c) return;
      /* 토큰은 본문을 싣지 않는다 — (거래처, 사업자번호, 귀속월)만. 공개 페이지가 **열 때** 지금 값으로 만든다(명세 3.5). */
      const token = issueLink({ clientId: c.id, bizNumber: c.bizNumber, ym: ym() });
      const url = publicInvoiceUrl(token);
      /* 토큰 자체가 열람 권한(capability URL)이라 본인확인이 없다 — 복사한 그 자리에서 알린다. */
      const msg = `열람링크를 복사했습니다 · 링크만으로 접속이 가능해요${settle().docStamp ? " · 열 때의 지금 금액과 동의 전 표기를 보여 줍니다" : ""}`;
      const ok = () => toast(msg);
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
    leaving = true;
    if (dlg) dlg.close();
    toast.destroy();
  };
}
