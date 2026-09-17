/* ============================================================
   invoice.js — 거래명세서 조회 (#/app/invoice)
   시안: claude.ai/design '거래명세서 조회 - 리모델링.dc.html'

   좌: A4 문서 미리보기(회색 면 + 그림자 · 자체 스크롤) / 우: 340px 레일
   (연도 스테퍼 · 12개월 목록 · 금액·버튼·동의).

   예전엔 우측이 연·월 **드롭다운 2개 + 월 스테퍼**라 "6월 얼마였지"를 보려면 드롭다운을
   두 번 여닫아야 했다. 지금은 12개월이 펼쳐져 달마다 건수·금액이 함께 보인다 —
   **고르는 동작이 곧 비교**가 된다.

   ⚠️ **`js/invoice-doc.js` 는 건드리지 않는다.** A4 서식과 **여러 장 분할**(paginateItems ·
      페이지 번호 푸터)이 이미 거기 있고, **공개 열람 링크 페이지(`invoice/`)와 관리자 정산
      화면이 같은 모듈을 쓴다**. 이 화면은 그 결과물을 감싸는 껍데기만 담당한다.
   ⚠️ PDF·EXCEL·열람링크는 **진짜로 동작한다**(시안은 토스트만 띄우는 목업이다) —
      인쇄창 · 서식 있는 .xlsx 생성 · 공개 토큰 발급 + 클립보드.
   ============================================================ */
import { setHTML, on, qs, qsa, html } from "../dom.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { issueLink, publicInvoiceUrl, SUPPLIER, ACCOUNT } from "../data/invoice-links.js";
import { monthsOf, invoiceMonth, latestInvoiceKey } from "../data/invoice-mock.js";
import { store } from "../store.js";
import { currentClient, currentClientName } from "../util/client.js";
import { pageHead } from "../ui.js";
import { openDialog, dlgActions } from "../util/dialog.js";
import { makeToast } from "../toast.js";
import { sheetToXlsx } from "../util/xlsx.js";

const DOC_W = 794; /* A4 폭(px) — invoice-doc.js 의 .invoice-page 와 같은 값 */
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

/* 공급받는자 — 로그인한 거래처에서 매번 파생한다(util/client.js).
   모듈 로드 시점에 한 번 굽지 않는 이유: 셸 배지·정산 간편조회와 같은 거래처를
   가리켜야 하고, 거래처 정보를 수정하면 문서에도 바로 반영돼야 한다. */
/* `invoiceNote`(문서의 '계산서 발행' 칸)는 **동의 여부에 따라 달라지므로** 여기서 확정하지 않는다 —
   docData() 가 그 달의 동의 기록을 보고 덮어쓴다. 기본값은 '아직 동의 전'이다. */
function buyerOf() {
  const c = currentClient();
  if (!c) return { address: "", company: "", bizNumber: "", ceo: "", summary: "꽃배달 이용료 청구", invoiceNote: "명세서 조회 후 발급" };
  const name = currentClientName();
  return {
    address: `${c.address} ${name}`, company: name,
    bizNumber: c.bizNumber, ceo: c.ceoName, summary: "꽃배달 이용료 청구", invoiceNote: "명세서 조회 후 발급",
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

export function mount(root) {
  const first = latestInvoiceKey(); /* 거래가 있는 가장 최근 달로 연다 */
  const state = { year: first.slice(0, 4), month: first.slice(5, 7), fit: true };
  const toast = makeToast();
  let dlg = null;
  let ro = null;
  /* 사용자가 월 목록을 직접 굴린 뒤에는 자동 가운데 정렬이 관여하지 않는다 —
     보던 자리를 빼앗는 건 도움이 아니라 방해다. */
  let userScrolled = false;

  const ym = () => `${state.year}-${state.month}`;
  const clientId = () => (currentClient() || {}).id || "";
  /* 그릴 때마다 store 에서 다시 읽는다 — 동의 기록은 거래처별이라 계정이 바뀌면 함께 바뀐다. */
  const agreedAt = () => store.invoiceAgreedAt(clientId(), ym());

  /* ── 현재 선택 월 → invoice-doc.js 문서 데이터 ───────────── */
  function docData() {
    const m = invoiceMonth(ym());
    const label = `${state.year}년 ${state.month}월`;
    const items = m.empty
      ? [{ date: "", sender: "", address: "해당 월의 거래 내역이 없습니다", product: "", amount: "" }]
      : m.rows.map((r) => ({ date: r[0], sender: r[1], address: r[2], product: r[3], amount: won(r[4]) }));
    return {
      _label: label, _month: m,
      title: `${state.year.slice(2)}년 ${state.month}월 꽃배달 거래명세서`,
      period: `${label} 귀속`,
      /* 동의하면 문서의 '계산서 발행' 칸이 '발급완료' 로 바뀐다 — 화면 우측 동의 카드와
         문서가 서로 다른 말을 하면 안 된다. */
      buyer: { ...buyerOf(), issueDate: m.empty ? "-" : m.issue, invoiceNote: agreedAt() ? "발급완료" : "명세서 조회 후 발급" },
      supplier: SUPPLIER,
      items,
      account: ACCOUNT,
      total: won(m.total),
    };
  }

  /* ── 마크업 조각 ─────────────────────────────────────────── */
  const monthRow = (m) => html`
    <button type="button" class="iv-month ${m.mm === state.month ? "is-sel" : ""}"
            data-month="${m.mm}" aria-current="${m.mm === state.month ? "true" : "false"}">
      <span class="iv-month__l">
        <b>${m.mm}월</b>
        <span>${m.empty ? "내역 없음" : `거래 ${m.count}건`}</span>
      </span>
      <span class="iv-month__amt">${m.empty ? "—" : won(m.total)}</span>
    </button>
  `;
  const monthsBody = () => monthsOf(state.year).map(monthRow);

  function sumBody() {
    const d = docData();
    const m = d._month;
    const at = agreedAt();
    return html`
      <div class="iv-sum__top">
        <p class="iv-sum__k">${d.period}</p>
        <p class="iv-sum__amt">${d.total}</p>
        <p class="iv-sum__meta">${m.empty ? "해당 월의 거래 내역이 없습니다" : `거래 ${m.count}건 · 명세서 발행일 ${m.issue}`}</p>
        <div class="iv-acts">
          <button class="iv-btn iv-btn--primary" data-action="pdf" ${m.empty ? "disabled" : ""}>PDF 다운로드</button>
          <div class="iv-acts__row">
            <button class="iv-btn iv-btn--dark" data-action="excel" ${m.empty ? "disabled" : ""}>EXCEL</button>
            <button class="iv-btn iv-btn--ghost" data-action="link" ${m.empty ? "disabled" : ""}>열람링크</button>
          </div>
        </div>
        ${m.empty ? html`<p class="iv-why">거래가 없는 달은 내려받거나 발급할 명세서가 없습니다.</p>` : ""}
      </div>
      <div class="iv-agree">
        ${at
          ? html`<div class="iv-agree__done">
              <span class="iv-agree__ck" aria-hidden="true">✓</span>
              <div><b>계산서 발급에 동의했습니다</b><span>${at}</span></div>
            </div>`
          : html`
              <p class="iv-agree__p">동의하면 <b>이 금액으로 세금계산서가 발급</b>됩니다. 동의 후에는 내용을 바꿀 수 없습니다.</p>
              <button class="iv-btn iv-btn--agree" data-action="agree" ${m.empty ? "disabled" : ""}>계산서 발급에 동의</button>
            `}
      </div>
    `;
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-invoice">
          ${pageHead({
            imgSrc: "./assets/nav-invoice.png",
            title: "거래명세서 조회",
            desc: "월별 명세서를 한눈에 보고, 필요한 달을 골라 내려받거나 발급에 동의합니다.",
          })}
          <div class="iv-cols">
            <!-- DOM 은 레일이 먼저 — order 로 자리만 바꾼다. Tab 순서가
                 '기간 고르기 → 문서 보기' 가 되어 읽는 순서와 맞는다. -->
            <aside class="iv-rail">
              <div class="iv-card iv-listcard">
                <div class="iv-year">
                  <button class="iv-ystep" data-action="prev-year" aria-label="이전 해">‹</button>
                  <div class="iv-year__l"><b data-slot="year">${state.year}년</b><span>귀속 연도</span></div>
                  <button class="iv-ystep" data-action="next-year" aria-label="다음 해">›</button>
                </div>
                <div class="iv-months" data-slot="months" role="group" aria-label="귀속 월">${monthsBody()}</div>
              </div>
              <div class="iv-card iv-sum" data-slot="sum">${sumBody()}</div>
            </aside>

            <div class="iv-doc">
              <div class="iv-card iv-doccard">
                <div class="iv-doc__hd">
                  <div class="iv-doc__hdl">
                    <h2>명세서 미리보기</h2>
                    <span class="iv-pill" data-slot="pages">A4</span>
                  </div>
                  <div class="iv-doc__hdr">
                    <p class="iv-doc__note">PDF로 저장하면 이 모양 그대로 나옵니다</p>
                    <div class="iv-zoom" role="group" aria-label="미리보기 배율">
                      <button data-action="zoom-fit" aria-pressed="true">맞춤</button>
                      <button data-action="zoom-100" aria-pressed="false">100%</button>
                    </div>
                  </div>
                </div>
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
  }

  /* ── 부분 갱신 ───────────────────────────────────────────── */
  function renderDoc() {
    const host = qs(root, "[data-doc-host]");
    if (!host) return;
    host.innerHTML = invoiceDoc(docData());
    const n = qsa(host, ".invoice-page").length;
    const pill = qs(root, "[data-slot='pages']");
    if (pill) pill.textContent = n > 1 ? `A4 · ${n}장` : "A4";
    applyScale();
  }
  const renderSum = () => {
    const el = qs(root, "[data-slot='sum']");
    if (el) setHTML(el, sumBody());
  };
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
    const avail = view.clientWidth - 48; /* .iv-doc__view 좌우 패딩 */
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
    const m = invoiceMonth(ym());
    const label = `${state.year}년 ${state.month}월`;
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
     '발급 동의'에 맞지 않는다. 공용 `.dlg-check` 만 빌려 쓴다. */
  function openAgree() {
    const d = docData();
    if (d._month.empty || agreedAt() || dlg) return;
    let ack = false;
    const HINT_OFF = "확인에 체크해야 발급됩니다";
    const HINT_ON = "발급을 진행할 수 있습니다";
    dlg = openDialog({
      eyebrow: `${d.period} · ${d.total}`,
      title: "계산서 발급에 동의할까요?",
      width: 520,
      body: html`
        <p class="dlg-desc"><b>동의 후에는 되돌릴 수 없습니다.</b> 위 금액 그대로 세금계산서가 발급되고,
          명세서 내용은 더 이상 변경할 수 없습니다.</p>
        <div class="iv-recap">
          <div><span>귀속</span><b>${d.period}</b></div>
          <div><span>거래 건수</span><b class="num">${d._month.count}건</b></div>
          <div class="iv-recap__total"><span>발급 금액</span><b class="num">${d.total}</b></div>
        </div>
        <button class="dlg-check" data-action="ack" aria-pressed="false">
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
      chk.setAttribute("aria-pressed", ack ? "true" : "false");
      go.disabled = !ack;
      /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다. */
      dlg.setHint(ack ? HINT_ON : HINT_OFF, !ack);
    });
    on(p, "click", "[data-action='ok']", () => {
      if (!ack) return;
      store.agreeInvoice(clientId(), ym());
      dlg.close();
      dlg = null;
      renderSum();
      renderDoc(); /* 문서의 '계산서 발행' 칸이 바뀐다 */
      toast("계산서 발급에 동의했습니다");
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
      renderSum();
      renderDoc();
      return;
    }
    const a = t.dataset.action;
    if (a === "prev-year" || a === "next-year") {
      state.year = String(Number(state.year) + (a === "next-year" ? 1 : -1));
      renderYear();
      renderSum();
      renderDoc();
      return;
    }
    if (a === "zoom-fit" || a === "zoom-100") { state.fit = a === "zoom-fit"; applyScale(); return; }
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
        clientId: clientId(), bizNumber: buyerOf().bizNumber,
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
