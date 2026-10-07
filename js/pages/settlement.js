/* ============================================================
   settlement.js — 정산회계 조회 (#/app/settlement)
   시안: claude.ai/design '정산회계 조회 - 리모델링.dc.html' (2026-10-07 이식)

   구조: 머리글(pageHead + '회사정보 수정') · 회사정보 카드 · 정산 절차 4단계 · 정산 내역 표.
   예전의 노란 안내문(한 문단에 발급·동의·자동 동의·작성일자·정산기한)은 **4단계 카드**로 풀었다 —
   단계마다 그 단계의 날짜가 붙고, 작성일자처럼 단계에 안 들어가는 규칙은 카드 아래 한 줄로 남겼다.
   ⚠️ 날짜·마감·그룹은 전부 `data/settlement-rules.js` 가 계산한다. 이 파일에 날짜 산술을 두지 말 것.

   회사정보 수정(시안 '1a · 640px 2열') — 2026-10-07 사용자 결정 셋:
   · **발급일을 포털에서 바꾼다**(명세 6.3 개정). 선택지는 `INVOICE_DAYS`(1~7·11~25일) 22개뿐이고,
     바꾸면 **다음 달 발급분부터** 적용된다 — `store.updateClient` 가 `invoiceDayLog` 를 쌓는다.
     창 안에서 첫 적용 발급일·동의 마감·작성일자 규칙을 실제 날짜로 말한다(가입 4단계와 같은 계산).
   · **필수는 회사명·사업자번호·대표자명**(시안의 '둘뿐'이 아니다 — 명세 4.2·관리자 거래처 창과 같다.
     대표자명은 거래명세서 공급받는자의 성명 칸에 찍힌다). 이메일·사업장주소는 비워도 저장된다.
   · **사업자등록증을 포털에서 올리고 바꾼다** — 바로 반영, 재심사·관리자 표시 없음.
   시안과 다르게 한 것: 이메일 캡션 '비어 있으면 정산 담당자에게 발송' 은 쓰지 않았다 — 그런 폴백은
   명세에 없고 담당자에게는 이메일 칸 자체가 없다. 사실인 것(정산 담당은 명세서·계산서 알림톡을 받는다)만 적는다.
   담당자명·담당자연락처(managerName·contact) 입력칸은 시안대로 뺐다 — **키는 레코드에 남는다**
   (정산 명세서·주문 모달의 거래처 대표 연락처가 읽는다). 정산 담당은 담당자 저장공간이 정본이다.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { pageHead, tableGrid, openLightbox } from "../ui.js";
import { openDialog, dlgRule, dlgRow, dlgActions } from "../util/dialog.js";
import { dayPickerMarkup, makeDayPicker } from "../util/day-picker.js";
import { store } from "../store.js";
/* 정산 행은 날짜·금액(admin-mock) + store 의 동의 기록을 얹은 조합층에서 온다 — 관리자 정산과 같은 소스. */
import { settlementsFor, INVOICE_YM_KEY } from "../util/settlement.js";
import {
  INVOICE_DAYS, invoiceDayOf, invoiceDayFor, invoiceDayEffectiveFrom, deadlineDayOf,
  issueDate, agreeDeadline, shiftPeriod, periodLabel, ISSUE_HOUR, DEADLINE_HOUR,
  fmtYmd, fmtMd, fmtMdHm, fmtKoShort, fmtKoShortTime,
} from "../data/settlement-rules.js";
import { sharedBizKeys, displayName, onBizInput } from "../util/biz.js";
/* 로그인 거래처 결정은 셸 배지·거래명세서와 반드시 같아야 한다 → util/client.js 단일 소스. */
import { currentClient } from "../util/client.js";
import { attachmentOf, fileSizeLabel } from "../util/image.js";
import { CS_PHONE } from "../data/contact.js";
import { setFocusSection } from "../session.js";
import { refreshClientBadge } from "../shell.js";
import { makeToast } from "../toast.js";

const trim = (v) => String(v ?? "").trim();
const hm = (h) => `${String(h).padStart(2, "0")}:00`;

/* 발급일 두 무리 — 동의 마감과 계산서 작성일자가 다르다(가입 4단계 optgroup 과 같은 구분·같은 말). */
const EARLY = INVOICE_DAYS.filter((d) => deadlineDayOf(d) === 10);
const LATE = INVOICE_DAYS.filter((d) => deadlineDayOf(d) !== 10);
const span = (ds) => `${ds[0]}~${ds[ds.length - 1]}일`;
const DAY_GROUPS = [
  { label: `${span(EARLY)} · 작성일자 이용한 달 말일`, days: EARLY },
  { label: `${span(LATE)} · 작성일자 동의한 날`, days: LATE },
];
/* 제한 전에 저장된 값(8~10·26~28일)은 그대로 보여 주고 조용히 바꾸지 않는다 — 그 값으로 이미 발급된 달이 있다
   (관리자 거래처 창의 발급일 드롭다운과 같은 문구). */
const dayLabel = (v) => (INVOICE_DAYS.includes(String(v)) ? `매월 ${v}일` : `매월 ${v}일 · 지금은 고를 수 없는 날`);

/* 저장 게이트 — [키, 사람이 읽을 이름]. 관리자 거래처 창의 REQUIRED 와 같은 셋이다(2026-10-07 결정). */
const REQUIRED = [["companyName", "회사명"], ["bizNumber", "사업자번호"], ["ceoName", "대표자명"]];
/* 글자 칸 — 저장 때 trim 해서 쓴다. 발급일·사업자등록증은 바뀌었을 때만 싣는다(아래 save). */
const TEXT_KEYS = ["companyName", "bizNumber", "ceoName", "address", "email"];
/* 가입 3단계와 같은 형식 검사 — 비어 있으면 검사하지 않는다(이메일은 필수가 아니다). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* 파일당 10MB(명세 9.5 — 서버가 다시 검사한다). 여기서 먼저 막아야 큰 PDF 를 고른 뒤 저장에서 실패하지 않는다. */
const MAX_FILE = 10 * 1024 * 1024;

/** 이번 달 발급이 **바꾸기 전 날짜**로 남아 있으면 그 발급 시각. 아니면 null.
 *  발급일 변경은 다음 달 발급분부터라, 이번 달에 아직 안 나간 명세서는 옛 날짜로 나간다
 *  (예: 10-07 에 15일 → 1일로 바꾸면 9월 이용분은 10-15 10:00 에 그대로 발급). 칩이 '매월 1일' 만
 *  말하면 거래처는 이번 달 명세서를 1일에 찾는다. */
function pendingOldIssue(client, now) {
  const prevP = shiftPeriod(invoiceDayEffectiveFrom(now), -1);
  const d0 = invoiceDayFor(client, prevP);
  const at = issueDate(prevP, d0);
  return d0 !== invoiceDayOf(client) && at > now ? { day: d0, at } : null;
}

/* ── 정산 표 셀 ─────────────────────────────────────────────
   계산서 칸은 배지 + 보조줄이다 — 작성일자·수동/자동·마감이 세무 근거라 한 단어로 뭉개지 않는다(관리자 표와 같은 원칙).
   ⚠️ 동의가 필요한 달만 주황(거래처가 할 일이 있는 유일한 상태), 발행 전은 회색(아직 순서가 아니다). */
const badge = (kind, text) => html`<span class="settle-badge settle-badge--${kind}">${text}</span>`;
const stack = (b, sub, warn = false) =>
  html`<span class="settle-stack">${b}${sub ? html`<span class="settle-td__sub ${warn ? "settle-td__sub--warn" : ""}">${sub}</span>` : ""}</span>`;
const invoiceCell = (r) => {
  if (r.계산서발급 === "발급완료")
    return stack(badge("ok", "발급완료"), `작성 ${fmtMd(r.작성일자)}${r.동의구분 === "auto" ? " · 자동 동의" : ""}`);
  if (!r.issued) return stack(badge("gray", "발급대기"), `명세서 ${fmtMdHm(r.발행일시)} 발급`);
  /* 약관 동의 전에 마감된 달(2026-09-29 법무 답) — 마감을 찍으면 '곧 자동 동의된다' 로 읽힌다. 이유를 쓴다. */
  if (r.약관보류) return stack(badge("need", "동의 필요"), "약관 동의 전 · 자동 동의 안 함", true);
  return stack(badge("need", "동의 필요"), `마감 ${fmtMdHm(r.마감)}`);
};
/* 정산 칸 — 명세서가 아직 안 나간 달은 '정산 필요' 가 아니다(낼 청구서가 없다). */
const payCell = (r) =>
  r.입금완료 === "입금완료" ? badge("ok", "정산완료") : !r.issued ? badge("gray", "청구 전") : badge("danger", "정산 필요");

/* 표 열 폭은 `--st-*` 로 넘긴다 — tableGrid 가 grid-template-columns 를 인라인 style 로 찍어
   미디어쿼리가 못 이긴다(상품 규격 안내 `--pc-*` · 프로필 `--pf-*` 와 같은 이유). ⚠️ 폴백을 반드시 함께. */
const COLUMNS = [
  {
    label: "문서 번호", width: "var(--st-id, 130px)",
    /* 같은 행의 '명세서 ›' 와 같은 곳으로 간다 — 탭 정거장이 행마다 둘이 되지 않게 이쪽은 마우스 전용 */
    render: (r) => html`<button type="button" class="st-docno" data-action="invoice" data-ym="${r.ym}" tabindex="-1">${r.id}</button>`,
  },
  { label: "청구 내역", width: "var(--st-desc, minmax(0, 1fr))", render: (r) => html`<span class="st-desc" title="${r.청구내역}">${r.청구내역}</span>` },
  { label: "청구서 발행일", width: "var(--st-date, 116px)", render: (r) => html`<span class="st-num">${fmtYmd(r.발행일시)}</span>` },
  { label: "정산 기한", width: "var(--st-date, 116px)", render: (r) => html`<span class="st-num">${fmtYmd(r.정산기한일)}</span>` },
  { label: "정산금액", width: "var(--st-amt, 130px)", align: "right", render: (r) => html`<span class="st-amt">${r.정산금액}</span>` },
  { label: "계산서", width: "var(--st-inv, 156px)", align: "center", render: invoiceCell },
  { label: "정산", width: "var(--st-pay, 104px)", align: "center", render: payCell },
  {
    label: "거래명세서", width: "var(--st-doc, 168px)", align: "right",
    render: (r) => html`<button type="button" class="st-doclink" data-action="invoice" data-ym="${r.ym}">${r.청구년월} 명세서 <span aria-hidden="true">›</span></button>`,
  },
];

export function mount(root, { nav }) {
  const toast = makeToast();
  let dlg = null;
  let picker = null;
  const closeDlg = () => { if (dlg) dlg.close(); };

  function render() {
    /* 매번 store 에서 다시 읽는다 — 저장하면 updateClient 가 invoiceDayLog 를 덧붙이는데, 들고 있던
       사본으로 정산 행을 그리면 그 이력이 빠져 이번 달 발행일이 옛 날짜로 남는다. */
    const client = currentClient();
    if (!client) {
      setHTML(root, html`
        <div class="page-settlement"><div class="st-inner">
          ${pageHead({ imgSrc: "./assets/nav-accounting.png", title: "정산회계 조회", rule: true })}
          <div class="admin-empty">연결된 거래처 정보가 없습니다.</div>
        </div></div>`);
      return;
    }
    const now = new Date();
    const rows = settlementsFor(client, now);
    const day = invoiceDayOf(client);
    const dl = deadlineDayOf(day);
    const pend = pendingOldIssue(client, now);
    const bill = store.getBillingContactOf(client.id);
    const name = displayName(client, sharedBizKeys(store.get().clients));
    /* 미정산 = 명세서가 나갔는데 입금이 확인되지 않은 달. 발행 전 달은 낼 청구서가 없어 세지 않는다. */
    const unpaid = rows.filter((r) => r.issued && r.입금완료 !== "입금완료").length;

    const info = (k, v, { full = false, empty = false, warn = false } = {}) => html`
      <div class="st-co__row ${full ? "is-full" : ""}">
        <span class="st-co__k">${k}</span>
        <span class="st-co__v ${empty ? "is-empty" : ""} ${warn ? "is-warn" : ""}">${v}</span>
      </div>`;
    /* 연락처는 한 덩어리로 — 하이픈에서 줄이 갈리면(010- / 0000-0111) 번호를 잘못 읽는다(1280 실측) */
    const billLabel = bill
      ? html`${[bill.name, bill.role].filter(Boolean).join(" · ")}${bill.phone ? html` · <span class="st-nw">${bill.phone}</span>` : ""}`
      : "지정된 담당자 없음";

    const steps = [
      ["명세서 발급", `매월 ${day}일 ${hm(ISSUE_HOUR)} 자동 발급`],
      ["거래 내역 확인", html`거래명세서 조회에서 품목·금액 확인 · 이의는 고객센터 <span class="st-nw">${CS_PHONE}</span>`],
      ["계산서 발급 동의", html`동의하면 바로 발급 · <span class="st-nw">${dl}일 ${hm(DEADLINE_HOUR)}</span>까지 동의가 없으면 자동 동의`],
      ["정산 완료", "명세서가 발급된 달의 말일까지 입금 · 확인되면 완료"],
    ];

    setHTML(
      root,
      html`
        <div class="page-settlement">
          <div class="st-inner">
            ${pageHead({
              imgSrc: "./assets/nav-accounting.png",
              title: "정산회계 조회",
              desc: "매월 청구서와 정산 상태를 확인하고, 명세서·계산서에 찍힐 회사정보를 관리합니다.",
              rule: true,
              action: html`<button type="button" class="st-edit" data-action="edit">회사정보 수정</button>`,
            })}

            <section class="st-card st-co" aria-label="회사정보">
              <div class="st-co__hd">
                <div class="st-co__hl">
                  <p class="st-co__biz">${client.bizNumber || "사업자번호 미등록"}</p>
                  <h2 class="st-co__name">${name}</h2>
                </div>
                <div class="st-co__chips">
                  <span class="st-chip">매월 <b>${day}일</b> 명세서 발급</span>
                  ${pend ? html`<span class="st-chip st-chip--note">이번 달은 ${fmtKoShortTime(pend.at)} · 바꾸기 전 날짜</span>` : ""}
                </div>
              </div>
              <div class="st-co__grid">
                ${info("대표자명", client.ceoName || "미등록", { empty: !client.ceoName })}
                ${info("계산서 이메일", client.email || "미등록", { empty: !client.email })}
                ${info("정산 담당", billLabel, { warn: !bill })}
                ${info("사업장주소", client.address || "미등록", { full: true, empty: !client.address })}
              </div>
            </section>

            <ol class="st-steps" aria-label="정산 절차">
              ${steps.map(([t, d], i) => html`
                <li class="st-step">
                  <span class="st-step__n" aria-hidden="true">${i + 1}</span>
                  <span class="st-step__b"><b>${t}</b><span>${d}</span></span>
                </li>`)}
            </ol>
            <p class="st-steps__note">
              계산서(면세) 작성일자는 ${day <= 10 ? "이용한 달의 말일" : `동의한 날(자동 동의면 ${dl}일)`}입니다.
              발급일은 회사정보 수정에서 바꿀 수 있고, 바꾸면 다음 달 발급분부터 적용됩니다.
            </p>

            <section class="st-card st-tbl" aria-labelledby="st-tbl-t">
              <div class="st-tbl__hd">
                <div>
                  <h2 id="st-tbl-t">정산 내역 <span class="st-count">${rows.length}</span></h2>
                  <p>최근 6개월 · 문서 번호를 누르면 해당 월 거래명세서가 열립니다.</p>
                </div>
                <span class="st-unpaid ${unpaid ? "" : "is-zero"}">미정산 <b>${unpaid}건</b></span>
              </div>
              <div class="st-table">${tableGrid({ columns: COLUMNS, rows, rowKey: (r) => r.id })}</div>
            </section>
          </div>
        </div>
      `
    );
  }

  /* ── 회사정보 수정 ─────────────────────────────────────────
     공용 다이얼로그 규격(util/dialog.js). 입력 중에는 **다시 그리지 않는다** — 값은 form 에 쓰고
     푸터 힌트·버튼, 발급일 안내, 첨부 칸만 부분 갱신한다(입력 커서가 날아간다). */
  function openEdit() {
    closeDlg();
    const client = currentClient();
    if (!client) return;
    const orig = {
      companyName: trim(client.companyName),
      bizNumber: trim(client.bizNumber),
      ceoName: trim(client.ceoName),
      address: trim(client.address),
      email: trim(client.email),
      /* 레코드에 값이 없으면 계산 기본값(1일)을 **보여 주기만** 한다 — 저장 때는 바뀐 경우에만 싣는다
         (안 그러면 열고 저장만 해도 발급일 이력에 가짜 변경이 쌓인다). */
      invoiceDay: trim(client.invoiceDay) || String(invoiceDayOf(client)),
      bizLicense: client.bizLicense || null,
    };
    const form = { ...orig };
    const name = displayName(client, sharedBizKeys(store.get().clients));

    const missing = () => REQUIRED.filter(([k]) => !trim(form[k])).map(([, l]) => l);
    const emailBad = () => !!trim(form.email) && !EMAIL_RE.test(trim(form.email));
    /* ⚠️ 사업자번호가 **다른 계정과 겹쳐도 막지도, 알리지도 않는다**(2차 결정 N17 ⓖ 와 같은 이유 — '이미 등록된
       번호' 라고 말하면 남이 우리 거래처를 알아내는 통로가 된다. 로그인한 거래처도 서로에게는 남이다).
       같은 법인의 부서 분리는 정상이고, 계정 구분은 직원이 채운다(가입과 같은 흐름). */
    const changed = () =>
      TEXT_KEYS.filter((k) => trim(form[k]) !== orig[k]).length
      + (form.invoiceDay !== orig.invoiceDay ? 1 : 0)
      + (form.bizLicense !== orig.bizLicense ? 1 : 0);
    /* 푸터 힌트 — 막혔으면 **왜** 막혔는지 이름을 대서 말한다(다이얼로그 규격). */
    const footer = () => {
      const m = missing();
      if (m.length) return { block: true, text: `필수 항목이 남았습니다 — ${m.join(" · ")}` };
      if (emailBad()) return { block: true, text: "이메일 형식을 확인해 주세요 — 예) billing@company.com" };
      const n = changed();
      return { block: false, text: n ? `수정한 항목 ${n}개 · 관리자 화면에도 함께 반영됩니다` : "관리자 화면에도 함께 반영됩니다" };
    };

    /* 발급일 안내 — 무엇이 **언제부터** 바뀌는지 실제 날짜로(가입 4단계와 같은 계산, settlement-rules.js). */
    const dayHint = () => {
      const now = new Date();
      const d = form.invoiceDay;
      const pend = pendingOldIssue(client, now);
      const keep = pend ? ` 이번 달 명세서는 바꾸기 전 날짜(${fmtKoShortTime(pend.at)})에 나갑니다.` : "";
      if (d === orig.invoiceDay)
        return `매월 ${d}일 ${hm(ISSUE_HOUR)}에 전월 이용분 명세서가 발급되고, 동의 마감은 ${deadlineDayOf(d)}일 ${hm(DEADLINE_HOUR)}입니다.${keep}`;
      const from = invoiceDayEffectiveFrom(now);
      const early = deadlineDayOf(d) === 10;
      return `${periodLabel(from)} 이용분부터 적용 — ${fmtKoShortTime(issueDate(from, d))} 발급 · 동의 마감 `
        + `${fmtKoShortTime(agreeDeadline(from, d))} · 작성일자 ${early ? "이용한 달의 말일" : "동의한 날"}.${keep}`;
    };
    const dayChip = () => html`매월 <b>${form.invoiceDay}일</b> 발급`;

    const input = (k, { ph = "", type = "text", mode, cls = "" } = {}) =>
      html`<input class="ord-in ${cls}" id="setco-${k}" data-f="${k}" type="${type}"
        inputmode="${mode || (type === "email" ? "email" : "text")}" value="${form[k]}" placeholder="${ph}" autocomplete="off" />`;

    /* 사업자등록증 칸 — 미리보기가 있으면(이미지) 눌러서 크게 본다. 없으면 버튼이 아니라 글자로 둔다 —
       관리자 창처럼 눌러도 아무 일 없는 버튼을 만들지 않는다.
       ⚠️ 'PDF' 는 **파일 형식으로** 판정한다. 미리보기가 없다는 것만으로 PDF 라 적으면, 크롬이 못 읽는
          이미지(스캐너의 .tif · 아이폰 .heic — attachmentOf 가 축소에 실패해 dataUrl 이 빈다)가 'PDF' 로 찍힌다.
          관리자가 올린 옛 첨부는 type 이 없을 수 있어 그때만 이름의 확장자를 본다. */
    const attachCell = () => {
      const a = form.bizLicense;
      if (!a) {
        return html`<span class="setco-file is-empty">첨부자료 없음</span>
          <button type="button" class="dlg-minibtn" data-action="pick-license">파일 선택</button>`;
      }
      const isPdf = a.type ? a.type === "application/pdf" : /\.pdf$/i.test(a.name || "");
      const kind = a.dataUrl ? "" : isPdf ? "PDF · " : "미리보기 없음 · ";
      const inner = html`<span class="setco-file__n">${a.name}</span>
        <span class="setco-file__m">${kind}${fileSizeLabel(a.size)}</span>`;
      return html`${a.dataUrl
        ? html`<button type="button" class="setco-file" data-action="zoom-license" title="크게 보기">${inner}</button>`
        : html`<span class="setco-file">${inner}</span>`}
        <button type="button" class="dlg-minibtn" data-action="pick-license">변경</button>`;
    };

    const bill = store.getBillingContactOf(client.id);
    const billCell = html`
      <div class="setco-stack">
        <div class="setco-inline">
          ${bill
            ? html`<span class="dlg-val">${[bill.name, bill.role].filter(Boolean).join(" · ")}</span>`
            : html`<span class="dlg-val setco-none">지정된 담당자 없음</span>`}
          <button type="button" class="dlg-minibtn" data-action="go-billing">${bill ? "변경" : "지정하기"}</button>
        </div>
        <p class="dlg-hintline">명세서·계산서·입금 기한 알림톡을 받는 사람입니다 · 프로필 저장공간에서 지정합니다</p>
      </div>`;

    const st0 = footer();
    dlg = openDialog({
      eyebrow: client.bizNumber || "회사정보",
      eyebrowNum: true,
      title: `${name} 회사정보`,
      width: 640,
      bodyClass: "dlg-body--sections",
      /* ⚠️ 이 패널은 transform 없는 등장 애니메이션이어야 한다 — 발급일 패널이 position:fixed 다(settlement.css). */
      panelClass: "modal-panel--setco",
      headExtra: html`<span class="dlg-hd__count" data-slot="daychip">${dayChip()}</span>`,
      body: html`
        <section>
          ${dlgRule({ t: "사업자 정보", cap: "거래명세서·계산서의 공급받는자로 찍힙니다" })}
          <div class="dlg-rows">
            <div class="setco-pair">
              ${dlgRow({ k: "회사명", req: true, htmlFor: "setco-companyName", v: input("companyName", { ph: "예) 주식회사 올해" }) })}
              ${dlgRow({ k: "사업자번호", req: true, htmlFor: "setco-bizNumber", v: input("bizNumber", { ph: "000-00-00000", mode: "numeric", cls: "ord-in--num" }) })}
            </div>
            ${dlgRow({ k: "대표자명", req: true, htmlFor: "setco-ceoName", v: input("ceoName", { ph: "사업자등록증 기준", cls: "ord-in--plain setco-narrow" }) })}
            ${dlgRow({ k: "사업장주소", htmlFor: "setco-address", v: input("address", { ph: "사업자등록증 상의 주소", cls: "ord-in--plain" }) })}
          </div>
        </section>
        <section>
          ${dlgRule({ t: "증빙", cap: "가입 심사와 계산서 발급의 근거" })}
          <div class="dlg-rows">
            ${dlgRow({ k: "사업자등록증", top: true, v: html`
              <div class="setco-stack">
                <div class="setco-inline" data-slot="attach">${attachCell()}</div>
                <p class="dlg-hintline">이미지 또는 PDF(10MB 이하) · 사업자번호와 대표자명이 위 입력값과 같아야 합니다</p>
              </div>` })}
          </div>
          <input type="file" hidden data-license-file accept="image/*,application/pdf" />
        </section>
        <section>
          ${dlgRule({ t: "계산서 수신", cap: "명세서 발급일과 계산서를 받을 곳" })}
          <div class="dlg-rows">
            ${dlgRow({ k: "발급일", top: true, htmlFor: "setco-day", v: html`
              <div class="setco-stack">
                ${dayPickerMarkup({ id: "setco-day", label: "발급일" })}
                <p class="dlg-hintline" data-slot="dayhint" aria-live="polite">${dayHint()}</p>
              </div>` })}
            ${dlgRow({ k: "이메일", htmlFor: "setco-email", v: input("email", { ph: "예) billing@company.com", type: "email", cls: "ord-in--plain" }) })}
            ${dlgRow({ k: "정산 담당", top: true, v: billCell })}
          </div>
          <p class="dlg-note setco-note">필수는 <b>회사명 · 사업자번호 · 대표자명</b>입니다 — 이메일과 사업장주소는 비어 있어도 저장됩니다.</p>
        </section>`,
      hint: st0.text,
      hintBlock: st0.block,
      actions: dlgActions({ ok: "변경사항 저장", disabled: st0.block }),
      /* 발급일 패널이 열려 있으면 ESC 는 패널만 닫는다 — openModal 의 ESC 가 먼저 돌아서
         피커 자신의 키 처리로는 이길 수 없다(order-create.js 의 onEsc 와 같은 수법). */
      onEsc: () => (picker && picker.isOpen() ? (picker.close({ focus: true }), false) : true),
      onClose: () => { if (picker) { picker.destroy(); picker = null; } dlg = null; },
    });
    const panel = dlg.panel;
    const d = dlg;

    const sync = () => {
      const st = footer();
      const b = qs(panel, "[data-action='ok']");
      if (b) b.disabled = st.block;
      d.setHint(st.text, st.block);
    };
    const renderDay = () => {
      const h = qs(panel, "[data-slot='dayhint']");
      if (h) h.textContent = dayHint();
      const c = qs(panel, "[data-slot='daychip']");
      if (c) setHTML(c, dayChip());
    };
    const renderAttach = () => {
      const s = qs(panel, "[data-slot='attach']");
      if (s) setHTML(s, attachCell());
    };

    picker = makeDayPicker(qs(panel, "[data-dpk]"), {
      groups: DAY_GROUPS,
      get: () => form.invoiceDay,
      set: (v) => { form.invoiceDay = v; renderDay(); sync(); },
      label: dayLabel,
    });

    on(panel, "input", "[data-f]", (e, t) => {
      const k = t.dataset.f;
      form[k] = k === "bizNumber" ? onBizInput(t) : t.value; // 사업자번호 하이픈은 관리자 창과 같은 규칙
      sync(); /* 칸을 다시 그리지 않는다 — 버튼과 힌트만 */
    });

    on(panel, "click", "[data-action='pick-license']", () => {
      const f = qs(panel, "[data-license-file]");
      if (f) f.click();
    });
    on(panel, "change", "[data-license-file]", async (e, t) => {
      const file = t.files && t.files[0];
      t.value = ""; /* 같은 파일을 다시 골라도 change 가 나게 */
      if (!file) return;
      if (file.size > MAX_FILE) { toast("10MB 이하 파일만 올릴 수 있습니다", "warn"); return; }
      try {
        /* 이미지는 축소해 dataURL 로, PDF 는 이름·크기만 남는다(image.js) */
        form.bizLicense = await attachmentOf(file);
      } catch (err) {
        console.error("[settlement] attach failed", err);
        toast("파일을 읽지 못했습니다", "warn");
        return;
      }
      /* 읽는 사이에 창이 닫혔다 — **이 창인지** 본다. ESC → Enter 로 바로 다시 열면 dlg 는 새 창이라
         `!dlg` 만 보면 통과해, 닫힌 창에 첨부하고 '첨부했습니다' 토스트만 뜬다(새 창은 '첨부자료 없음'). */
      if (dlg !== d) return;
      renderAttach();
      sync();
      /* 누른 버튼이 다시 그려지며 사라졌다 — 키보드 사용자가 제자리를 잃지 않게 새 '변경' 으로 */
      const again = qs(panel, "[data-action='pick-license']");
      if (again) again.focus();
      toast(`${form.bizLicense.name} 을 첨부했습니다 · 저장하면 반영됩니다`);
    });
    on(panel, "click", "[data-action='zoom-license']", () => {
      const a = form.bizLicense;
      if (a && a.dataUrl) openLightbox({ src: a.dataUrl, alt: "사업자등록증", caption: `${trim(form.companyName) || name} 사업자등록증` });
    });

    /* 정산 담당은 담당자 저장공간이 정본이다(정산담당 1명 불변식이 거기 있다). 화면을 옮기면 라우터가 이 창을
       닫으므로, 저장하지 않은 수정이 있으면 떠나지 않는다(관리자 거래처 창 → 단가 화면과 같은 규칙). */
    on(panel, "click", "[data-action='go-billing']", () => {
      if (changed()) { toast("저장하지 않은 수정이 있습니다 — 저장하거나 취소한 뒤 이동해 주세요", "warn"); return; }
      setFocusSection("profile", "contacts");
      nav("#/app/profile");
    });

    on(panel, "click", "[data-action='ok']", () => {
      if (footer().block) return;
      const n = changed();
      if (!n) { d.close(); toast("변경된 내용이 없습니다"); return; }
      const patch = Object.fromEntries(TEXT_KEYS.map((k) => [k, trim(form[k])]));
      /* 발급일은 바뀌었을 때만 — updateClient 가 이력({ from, day, prev, at })을 쌓고 다음 달 발급분부터 적용된다 */
      if (form.invoiceDay !== orig.invoiceDay) patch.invoiceDay = form.invoiceDay;
      if (form.bizLicense !== orig.bizLicense) patch.bizLicense = form.bizLicense;
      /* ⚠️ 포털과 관리자는 같은 레코드를 본다 — 저장하는 순간의 레코드 위에 덮는다(열 때의 사본이 아니라) */
      store.updateClient({ ...(currentClient() || client), ...patch });
      refreshClientBadge(); // 회사명을 고쳤으면 셸 배지도 같이
      const dayMsg = patch.invoiceDay
        ? ` · 새 발급일은 ${fmtKoShort(issueDate(invoiceDayEffectiveFrom(new Date()), patch.invoiceDay))} 발급분부터`
        : "";
      d.close();
      render();
      /* close() 가 포커스를 '회사정보 수정' 버튼에 돌려줬는데 render() 가 그 버튼을 새로 그려 포커스가 <body> 로
         떨어진다 — 키보드·화면 낭독기 사용자가 제자리를 잃는다. 새 버튼으로 다시 옮긴다. */
      const again = qs(root, "[data-action='edit']");
      if (again) again.focus();
      toast(`회사정보 ${n}개 항목을 저장했습니다${dayMsg}`);
    });
  }

  render();

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "edit") openEdit();
    else if (a === "invoice") {
      /* 버튼이 '2026년 07월 명세서' 라고 특정 달을 약속한다 — 그 달을 열어야 한다(받는 쪽 invoice.js 가 읽고 지운다). */
      if (t.dataset.ym) { try { sessionStorage.setItem(INVOICE_YM_KEY, t.dataset.ym); } catch { /* storage 비활성 — 기본 달로 열린다 */ } }
      nav("#/app/invoice");
    }
  });

  return () => { off(); closeDlg(); toast.destroy(); };
}
