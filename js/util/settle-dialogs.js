/* ============================================================
   settle-dialogs.js — 관리자 정산회계(S-01)의 작은 창 2종
     ① 계산서 발급 처리 — 다시 시도 / 직접 입력(바로빌 콘솔에서 손으로 낸 계산서의 승인번호·발급 시각)
     ② 입금 확인 — 전액만(부분 입금은 받지 않는다 · 명세 3.4 예외표)
   시안 'S-01 관리자 정산회계' 의 창(560px · 머리 · 1.5px 구역 룰 · 푸터 '왜 못 누르는지' + 필 버튼)을
   공용 셸 `openDialog`(js/util/dialog.js) 로 그린다 — 새 다이얼로그를 손으로 짜지 않는다(CLAUDE.md '작은 다이얼로그는 한 규격').

   쓰기는 util/settlement.js 의 `issueEinvoiceFor`·`confirmPaymentFor` 만 지난다(상태를 settlementOf 로 한 번 더 거른다).
   ⚠️ 서버 거부(409 이미 발급·이미 입금 / 400 승인번호 형식 · 시각)는 **창 안에서** 말하고 입력값을 버리지 않는다(명세 6.6).
      409 문구는 처리자가 기록된 경우 누가 했는지 말한다(2차 시안 · util/actor `actorLabel` — 자동 발급 파생은 처리자가 없다).
   ⚠️ 입력 중에는 본문을 다시 그리지 않는다 — 슬롯(data-slot)과 푸터 힌트만 갈아 끼운다(커서가 날아간다).

   데모 한정 —
   · 다시 시도: 서버 대역(store.issueEinvoice)은 늘 성공한다. 그러면 '실패' 갈래(시안 d — 바로빌 오류를 그대로 보이고
     상태는 동의완료 · 발급 전에 남는다)를 볼 길이 없어, **자동 발급이 실패해 있던 달(einvoiceFail 시드)의 첫 다시 시도는
     그 오류 문구 그대로 실패**하게 했다(두 번째부터 성공). 새로고침하면 다시 처음부터다. 실서비스는 바로빌 응답을 그대로 쓴다.
   · '진행 중' 은 1.2초다(응답 대기 흉내). 그동안 창을 닫을 수 없다(✕·취소 잠금 · ESC · 바깥 클릭 무시) — 초점도 패널에
     붙잡아 두고 Tab·Shift+Tab 이 창 밖으로 나가지 않게 막는다(누를 수 있는 것이 없다).
   ============================================================ */
import { html, on, qs, qsa, setHTML } from "../dom.js";
import { icon } from "../icons.js";
import { store, EINVOICE_NO_RE } from "../store.js";
import { openDialog, dlgRule, dlgRow, dlgPick, bindPick } from "./dialog.js";
import { settlementOf, issueEinvoiceFor, confirmPaymentFor } from "./settlement.js";
import { actorLabel } from "./actor.js";
import { sharedBizKeys, normalizeBiz } from "./biz.js";
import {
  periodLabel, splitPeriod, invoiceDayFor, fmtKoShort, fmtKoShortTime, parseAt,
} from "../data/settlement-rules.js";

const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
const pad = (n) => String(n).padStart(2, "0");
const DAY = 864e5;
const RETRY_MS = 1200;
/* 저장 공간 부족(store 가 { error: "STORAGE_FULL" } 을 돌려준다 — 기록이 남지 않았다). 주문 화면과 같은 말 · 창과 입력은 그대로 둔다. */
const SAVE_FAIL = "저장하지 못했습니다 · 브라우저 저장 공간이 부족합니다";
const storageFull = (r) => !!r && r.error === "STORAGE_FULL";
/* 데모: 자동 발급이 실패해 있던 달의 첫 다시 시도는 실패한다(위 머리 주석). 키 = "거래처|귀속월". */
const RETRIED = new Set();
let seq = 0;

/** 사업자번호를 다른 계정과 공유하는 거래처이고 계정 구분이 있다(표의 이름 옆 칩과 같은 규칙). */
const splitAccount = (client) =>
  !!client.department && sharedBizKeys(store.get().clients).has(normalizeBiz(client.bizNumber));
/** 창 머리 윗줄 — 어느 거래처 · 어느 달인지. 계정 구분은 사업자번호를 공유하는 거래처에만(표와 같은 규칙). */
function headOf(client, ym) {
  return `${client.companyName}${splitAccount(client) ? ` · ${client.department}` : ""} · ${periodLabel(ym)} 귀속`;
}
/** 토스트에 쓰는 거래처 이름 — admin-settlement.js `rowName` 과 같은 규칙. 회사명만 쓰면 한빛과학(주)(C001)과
 *  한빛과학(주) 연구소 계정(C027) · 법무법인 한결 두 계정의 입금 확인 토스트가 한 글자도 다르지 않았다(실측). */
const nameOf = (client) => (splitAccount(client) ? `${client.companyName} ${client.department}` : client.companyName);
/** 정산·회계 담당자와 알림(T6)이 닿는지. 연락처가 비면 '보냈습니다' 라고 말하지 않는다. */
function recipientOf(client) {
  const ct = store.getBillingContactOf(client.id);
  const ok = !!ct && !!String(ct.phone || "").trim();
  return { ct, ok, who: ok ? `${ct.name} 님` : "" };
}
/** "2026-10-05" + "14:40" → Date(달력 검증) 또는 null */
function parseDateTime(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || "").trim());
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (h > 23 || mi > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi);
  /* 2026-02-30 같은 날은 Date 가 다음 달로 넘겨 버린다 — 되돌려 비교해 거른다. */
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** 1~10 그룹의 지연발급 경계 — 발급월 11일 00:00(이 시각부터 발급하면 '발급월 10일을 넘긴' 발급이다 · 명세 3.4 ⚠ · N02 ⓐ).
 *  11~28 그룹은 해당 없음(null). 발급월 = 귀속월 다음 달. */
function lateIssueAt(client, ym) {
  if (invoiceDayFor(client, ym) > 10) return null;
  const { y, m1 } = splitPeriod(ym);
  return new Date(y, m1, 11, 0, 0, 0, 0);
}

/* ── 본문 조각 ─────────────────────────────────────────────── */
const kvGrid = (items) => html`
  <div class="dlg-kv">
    ${items.map((k) => html`<div class="dlg-kv__i"><p class="dlg-kv__k">${k.k}</p><p class="dlg-kv__v ${k.warn ? "is-warn" : ""}">${k.v}</p></div>`)}
  </div>`;
const noteBox = (tone, title, body) => html`
  <div class="dlg-note ${tone ? `dlg-note--${tone}` : ""}">
    <b class="dlg-note__t">${title}</b>${body ? html`<p class="dlg-note__b">${body}</p>` : ""}
  </div>`;
const errBox = (e) => html`
  <div class="dlg-box dlg-box--err" role="alert">
    <b class="dlg-box__t">${e.title}</b>
    ${(e.body || []).map((b) => html`<p class="dlg-box__b">${b}</p>`)}
  </div>`;
const okBox = (title, body) => html`
  <div class="dlg-box dlg-box--ok" role="status"><b class="dlg-box__t">${title}</b><p class="dlg-box__b">${body}</p></div>`;

/** 슬롯 하나를 채우거나 비운다 — 빈 슬롯은 `hidden` 으로 감춘다(섹션 gap 이 빈 자식에도 한 번 먹어 유령 간격이 남는다). */
function fill(panel, slot, body) {
  const el = qs(panel, `[data-slot='${slot}']`);
  if (!el) return;
  setHTML(el, body || "");
  el.hidden = !body;
}
/** 진행 중에는 닫지 못한다 — ✕·취소는 disabled, 바깥 클릭은 막고, ESC 는 onEsc 가 false 를 돌려준다. */
function lockClose(panel, busy) {
  qsa(panel, "[data-action='close']").forEach((b) => { b.disabled = busy; });
  const bd = panel.parentElement && panel.parentElement.querySelector(".modal-overlay__backdrop");
  if (bd) bd.style.pointerEvents = busy ? "none" : "";
}

/* ══ ① 계산서 발급 처리 ═══════════════════════════════════════
   진입점은 하나이고(M38 ①) 안에서 '다시 시도' / '직접 입력' 을 고른다. AGREED(동의완료 · 발급 전)에서만 연다. */
/**
 * @param {object} o
 * @param {object} o.client   거래처 레코드
 * @param {string} o.ym       귀속월 "YYYY-MM"
 * @param {Function} o.onDone ({ type: "issue", rec }) — 쓰기가 성공했거나(rec) 서버가 거부해 줄을 다시 읽어야 할 때(rec 없음).
 *                            호출부가 그 줄만 다시 그린다.
 * @param {Function} o.toast  페이지 토스트(makeToast 인스턴스)
 * @param {Function} o.onClose 창이 닫힌 뒤(포커스 되돌리기 등)
 */
export function openIssueDialog({ client, ym, onDone, toast, onClose } = {}) {
  const s0 = settlementOf(client, ym, new Date());
  const rc = recipientOf(client);
  const day = invoiceDayFor(client, ym);
  const late = day > 10;
  const lateAt = lateIssueAt(client, ym);
  const id = ++seq;
  const st = { mode: "retry", step: "idle", err: null, failDetail: "", okRec: null, no: "", date: "", time: "", noTouched: false, noServerBad: false, timeServerBad: false };
  let timer = 0;

  const kv = [
    { k: "동의", v: s0.agreedAt ? `${fmtKoShortTime(s0.agreedAt)} · ${s0.mode === "auto" ? "자동" : "수동"}` : "-" },
    { k: "작성일자", v: s0.docDate ? (late ? `${fmtKoShort(s0.docDate)} · 발급일과 같아야 함` : fmtKoShort(s0.docDate)) : "-" },
    { k: "받는 사람", v: !rc.ct ? "없음 · 알림을 보낼 수 없습니다" : rc.ok ? `${rc.ct.name} · ${rc.ct.role || "정산·회계"}` : `${rc.ct.name} · 연락처 없음`, warn: !rc.ok },
    { k: "발급일 그룹", v: `매월 ${day}일` },
  ];
  const noId = `sdlg-no-${id}`;

  const d = openDialog({
    eyebrow: `${headOf(client, ym)} · ${won(s0.amount)}`,
    eyebrowNum: true,
    title: "계산서 발급 처리",
    width: 560,
    panelClass: "modal-panel--sdlg",
    bodyClass: "dlg-body--sections",
    body: html`
      <div data-slot="alert" hidden></div>
      <section>${dlgRule({ t: "발급 근거", cap: "계산서(면세)" })}${kvGrid(kv)}</section>
      <section>
        ${dlgRule({ t: "처리 방식", cap: "둘 중 하나를 고릅니다" })}
        <div class="dlg-grid2 sdlg-modes" role="radiogroup" aria-label="처리 방식">
          ${dlgPick({ v: "retry", name: "다시 시도", sub: "바로빌에 다시 요청합니다", sel: true })}
          ${dlgPick({ v: "manual", name: "직접 입력", sub: "콘솔에서 낸 계산서를 기록" })}
        </div>
      </section>
      <div class="dlg-busy" role="status" data-slot="busy" hidden>
        ${icon("loader", { size: 18, cls: "icon--spin" })}
        <span><b>바로빌에 발급을 요청하고 있습니다</b><span>보통 몇 초 안에 끝납니다 · 끝날 때까지 창을 닫을 수 없습니다</span></span>
      </div>
      <section data-slot="manual" hidden>
        ${dlgRule({ t: "직접 입력", cap: "바로빌 콘솔에서 발급한 계산서" })}
        <div class="dlg-rows">
          ${dlgRow({
            k: "승인번호", req: true, top: true, htmlFor: noId,
            v: html`<div class="sdlg-stack">
              <input id="${noId}" class="ord-in ord-in--num" data-f="no" inputmode="numeric" autocomplete="off" spellcheck="false"
                     placeholder="20261005-41000001-12345678" aria-required="true" aria-describedby="${noId}-h" disabled />
              <p class="dlg-hintline" id="${noId}-h" data-slot="nohint"></p>
            </div>`,
          })}
          ${dlgRow({
            k: "발급 시각", req: true, top: true,
            v: html`<div class="sdlg-stack">
              <div class="sdlg-inline">
                <input class="ord-in ord-in--num sdlg-date" data-f="date" inputmode="numeric" autocomplete="off" placeholder="2026-10-05"
                       aria-label="발급 날짜" aria-required="true" aria-describedby="${noId}-t" disabled />
                <input class="ord-in ord-in--num sdlg-time" data-f="time" inputmode="numeric" autocomplete="off" placeholder="14:40"
                       aria-label="발급 시각" aria-required="true" aria-describedby="${noId}-t" disabled />
                <button type="button" class="dlg-minibtn" data-action="now" disabled>지금</button>
              </div>
              <p class="dlg-hintline" id="${noId}-t" data-slot="timehint"></p>
            </div>`,
          })}
        </div>
      </section>
      <div class="sdlg-notes" data-slot="notes" hidden></div>`,
    hint: "",
    actions: html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--primary" data-action="ok">다시 시도</button>`,
    onEsc: () => st.step !== "busy",
    onClose: () => {
      if (timer) { clearTimeout(timer); timer = 0; }
      document.removeEventListener("keydown", trapBusy, true);
      onClose && onClose();
    },
  });
  const p = d.panel;
  /** 진행 중 Tab 붙잡기(아래 등록부 주석) — 함수 선언이라 위 onClose 에서도 같은 참조를 뗀다. */
  function trapBusy(e) {
    if (e.key !== "Tab" || st.step !== "busy") return;
    e.preventDefault();
    if (document.activeElement !== p) p.focus({ preventScroll: true });
  }
  const okBtn = qs(p, "[data-action='ok']");
  const cancelBtn = qs(p, ".dlg-ft [data-action='close']");
  const inNo = qs(p, "[data-f='no']");
  const inDate = qs(p, "[data-f='date']");
  const inTime = qs(p, "[data-f='time']");

  /** 이미 발급된 달(409 SETTLEMENT_ALREADY_ISSUED) — 창을 연 사이 다른 곳에서 발급됐다. 적은 값은 그대로 둔다. */
  function alreadyErr() {
    const s = settlementOf(client, ym, new Date());
    if (s.einvoice) {
      /* 처리자가 기록된 발급(다시 시도·직접 입력)이면 누가 했는지 말한다(시안 j — 자동 발급 파생은 by 가 없다) */
      const who = s.einvoice.mode !== "auto" ? actorLabel(s.einvoice.by) : "";
      return {
        title: "이미 발급된 달입니다",
        body: [`${fmtKoShortTime(s.einvoice.at)}에 ${who ? `${who} 님이 발급 처리했습니다` : "발급 처리됐습니다"} · 승인번호 ${s.einvoice.no}${s.einvoice.mode === "manual" ? " · 직접 입력" : ""}.${st.mode === "manual" ? " 적은 값은 그대로 두었습니다." : ""}`],
      };
    }
    return { title: "지금은 계산서를 발급 처리할 수 없는 달입니다", body: ["표에서 이 달의 상태를 다시 확인하세요."] };
  }

  /** 지금 입력으로 판정 — 저장 가능 여부 · 막는 이유 · 칸별 오류. 렌더는 sync 가 한다. */
  function manualView(now) {
    const no = st.no.trim();
    const fmtOk = EINVOICE_NO_RE.test(no);
    /* 입력할 때 거절한다(M38 ⓐ · 400 EINVOICE_NO_INVALID) — 숫자·하이픈 밖의 글자, 다 적었는데(26자↑) 꼴이 다름,
       칸을 떠났는데 꼴이 다름. 지우지 않고 그대로 둔 채 표시만 한다(금액 칸과 같은 '거부형' — 조용히 다른 값이 되지 않게). */
    const noErr = st.noServerBad || (!!no && !fmtOk && (st.noTouched || no.length >= 26 || /[^\d-]/.test(no)));
    const dt = parseDateTime(st.date, st.time);
    const dtTyped = !!st.date.trim() && !!st.time.trim();
    const future = !!dt && dt.getTime() > now.getTime();
    const timeErr = st.timeServerBad || future;
    const mismatch = late && !!dt && !future && !!s0.agreedAt && !sameDay(dt, s0.agreedAt);
    let block = "";
    if (!no || !st.date.trim() || !st.time.trim()) block = "승인번호와 발급 시각을 모두 적어야 저장됩니다";
    else if (!fmtOk) block = "승인번호 형식을 고쳐야 저장됩니다";
    else if (!dt) block = "발급 시각을 2026-10-05 · 14:40처럼 적어 주세요";
    else if (timeErr) block = "발급 시각을 고쳐야 저장됩니다";
    return { no, fmtOk, noErr, dt, dtTyped, future, timeErr, mismatch, block };
  }

  function sync() {
    const now = new Date();
    const busy = st.step === "busy";
    const done = st.step === "ok";
    const locked = busy || done || !!st.err;
    lockClose(p, busy);
    qsa(p, "[data-pickrow]").forEach((b) => { b.disabled = locked; });

    /* 방식 — 직접 입력 칸은 숨길 때 disabled 도 건다. 처음엔 openModal 트랩이 hidden 을 몰라서였고 지금은(2026-10-17 `tabbables()`)
       트랩이 숨은 칸을 스스로 빼 겹치는 안전장치다. 성공(done) 뒤 보이는 칸을 잠그는 것은 이 줄의 본래 일이다. */
    const manual = st.mode === "manual";
    const mSec = qs(p, "[data-slot='manual']");
    mSec.hidden = !manual;
    [inNo, inDate, inTime, qs(p, "[data-action='now']")].forEach((x) => { x.disabled = !manual || done; });

    /* 상자(오류·성공) */
    let alert = "";
    if (st.err) alert = errBox(st.err);
    else if (st.mode === "retry" && st.step === "fail") {
      alert = errBox({
        title: "다시 시도했지만 발급되지 않았습니다",
        body: [st.failDetail, "상태는 '동의완료 · 발급 전'에 그대로 남습니다. 원인을 고친 뒤 다시 시도하거나, 바로빌 콘솔에서 발급하고 직접 입력으로 기록하세요."],
      });
    } else if (done && st.okRec) {
      alert = okBox("발급되었습니다", `승인번호 ${st.okRec.no} · ${fmtKoShortTime(parseAt(st.okRec.at))} · ${rc.ok ? `계산서 발급 안내를 ${rc.who}에게 보냈습니다` : "알림 수신자가 없어 계산서 발급 안내는 보내지 못했습니다"}`);
    }
    fill(p, "alert", alert);
    qs(p, "[data-slot='busy']").hidden = !busy;

    /* 안내 면 */
    const notes = [];
    const mv = manual ? manualView(now) : null;
    if (manual) {
      if (mv.mismatch) notes.push(noteBox("amber", `동의일(${fmtKoShort(s0.agreedAt)})과 발급일(${fmtKoShort(mv.dt)})이 다릅니다`, "이 거래처는 작성일과 발급일이 같은 날이어야 합니다. 손 발급은 동의 당일에 처리하는 것이 원칙입니다."));
    }
    /* 1~10 그룹이 발급월 10일을 넘겨 발급되면 지연발급(명세 3.4 ⚠ · 세무사 답 대기) — 다시 시도는 지금, 직접 입력은 적은 시각 기준 */
    const issueAt = manual ? (mv.dt && !mv.future ? mv.dt : now) : now;
    if (lateAt && !done && issueAt.getTime() >= lateAt.getTime()) {
      notes.push(noteBox("amber", "발급월 10일을 넘겨 발급되면 지연발급이 됩니다", "발급 전에 세무 확인이 필요합니다 · 세무사 답변에 따라 문구가 바뀔 수 있습니다."));
    }
    if (!done && !st.err) {
      if (manual) notes.push(noteBox("", "저장하면 발급완료가 됩니다", rc.ok ? `계산서 발급 안내가 ${rc.who}에게 나갑니다.` : "알림 수신자가 없어 계산서 발급 안내는 나가지 않습니다."));
      else if (st.step === "idle") notes.push(noteBox("", "같은 내용으로 바로빌에 발급을 다시 요청합니다", rc.ok ? `성공하면 발급완료가 되고 계산서 발급 안내가 ${rc.who}에게 나갑니다.` : "성공하면 발급완료가 됩니다. 알림 수신자가 없어 발급 안내는 나가지 않습니다."));
    }
    fill(p, "notes", notes.length ? notes : "");

    /* 직접 입력 칸의 오류 표시 — 칸은 다시 그리지 않는다 */
    if (manual) {
      inNo.classList.toggle("is-bad", mv.noErr);
      inNo.setAttribute("aria-invalid", mv.noErr ? "true" : "false");
      const nh = qs(p, "[data-slot='nohint']");
      nh.textContent = mv.noErr ? "승인번호 형식이 맞지 않습니다. 숫자 8자리-8자리-8자리로 적어 주세요" : "예) 20261005-41000001-12345678 · 형식은 확정 전 예시 기준";
      nh.classList.toggle("is-bad", mv.noErr);
      [inDate, inTime].forEach((x) => { x.classList.toggle("is-bad", mv.timeErr); x.setAttribute("aria-invalid", mv.timeErr ? "true" : "false"); });
      const th = qs(p, "[data-slot='timehint']");
      th.textContent = mv.timeErr
        ? `발급 시각은 지금보다 뒤일 수 없습니다. 지금은 ${fmtKoShortTime(now)}입니다`
        : mv.dtTyped && !mv.dt ? "날짜 2026-10-05 · 시각 14:40 (24시간)처럼 적어 주세요" : "날짜 2026-10-05 · 시각 14:40 (24시간)";
      th.classList.toggle("is-bad", mv.timeErr || (mv.dtTyped && !mv.dt));
    }

    /* 푸터 — 주 버튼 + 왜 못 누르는지 */
    cancelBtn.textContent = done || st.err ? "닫기" : "취소";
    /* ⚠️ `hidden` 속성으로는 안 숨는다 — `.hm-btn` 의 display:inline-flex 가 UA 의 [hidden] 을 이긴다(실측). */
    okBtn.hidden = done;
    okBtn.style.display = done ? "none" : "";
    okBtn.classList.toggle("hm-btn--primary", !manual);
    okBtn.classList.toggle("hm-btn--ink", manual);
    if (manual) {
      setHTML(okBtn, html`발급완료로 저장`);
      if (st.err) { okBtn.disabled = true; d.setHint("다시 저장할 필요가 없습니다", true); }
      else if (mv.block) { okBtn.disabled = true; d.setHint(mv.block, true); }
      else { okBtn.disabled = false; d.setHint(mv.mismatch ? "날짜가 달라도 저장됩니다. 세무 확인 뒤 저장하세요" : "저장하면 되돌릴 수 없습니다", false); }
    } else if (busy) {
      setHTML(okBtn, html`${icon("loader", { size: 15, cls: "icon--spin" })}요청 중`);
      okBtn.disabled = true;
      d.setHint("바로빌 응답을 기다리고 있습니다", false);
    } else if (done) {
      d.setHint("발급완료로 바뀌었습니다", false);
    } else {
      setHTML(okBtn, html`다시 시도`);
      okBtn.disabled = !!st.err;
      if (st.err) d.setHint("다시 요청할 필요가 없습니다", true);
      else if (st.step === "fail") d.setHint("상태는 동의완료 · 발급 전에 그대로 남습니다", true);
      else d.setHint("누르면 바로 요청합니다", false);
    }
  }

  /* 진행 중(busy)에는 Tab·Shift+Tab 을 창 안(패널)에 붙잡는다. 그동안 창 안의 조작이 전부 disabled 다.
     ⚠️ 지금은 openModal 트랩과 **겹친다**(해는 없다 — 둘 다 패널에 둔다). 2026-10-17 1차에 이 리스너를 둘 때는 트랩이 선택된
     방식 행(tabindex=0 · disabled — 옛 FOCUSABLE 이 [tabindex] 로 잡았다)을 처음이자 마지막으로 보고 '초점이 그 행일 때만' 막아,
     패널·body 에 있는 초점이 뒤 화면(주문 고치기·PDF 버튼 등)으로 나갔다(실측). 같은 날 2차에 트랩(ui.js `trapTab`)이 disabled·
     tabindex=-1 을 빼고 닿을 곳이 없으면 패널에 붙잡게 되어(배경을 눌러 body 로 빠진 초점도 — 문서 capture) 같은 일을 한다.
     트랩이 먼저 등록돼 먼저 돌고 이 리스너는 뒤에서 한 번 더 막는다. 창이 닫히면 onClose 가 뗀다. */
  document.addEventListener("keydown", trapBusy, true);

  bindPick(p, (v) => {
    if (v === st.mode) return;
    st.mode = v;
    if (st.step === "fail") st.step = "idle";
    /* 포커스는 고른 행에 둔다 — 화살표로 방식을 옮기는 중에 입력 칸으로 끌어가면 그룹 안에서 되돌아갈 수 없다(실측). */
    sync();
  });

  function retry() {
    st.step = "busy";
    sync();
    /* 누른 버튼이 잠기면 포커스가 문서 밖(body)으로 빠진다 — 창 안(패널)에 붙잡아 둔다. 끝나면 결과 쪽 버튼으로 옮긴다. */
    p.focus({ preventScroll: true });
    timer = setTimeout(() => {
      timer = 0;
      const key = `${client.id}|${ym}`;
      const fail = store.einvoiceFailOf(client.id, ym);
      if (fail && !RETRIED.has(key)) {
        RETRIED.add(key);
        st.step = "fail";
        st.failDetail = fail.detail;
        sync();
        okBtn.focus();
        return;
      }
      const r = issueEinvoiceFor(client, ym, { mode: "retry" }, new Date());
      if (storageFull(r)) {
        st.step = "idle";
        sync();
        toast && toast(SAVE_FAIL, "warn");
        okBtn.focus();
        return;
      }
      if (!r || r.error) {
        st.step = "idle";
        st.err = alreadyErr();
        sync();
        onDone && onDone({ type: "issue" });
        cancelBtn.focus();
        return;
      }
      st.step = "ok";
      st.okRec = r;
      sync();
      onDone && onDone({ type: "issue", rec: r });
      cancelBtn.focus();
    }, RETRY_MS);
  }

  function saveManual() {
    const now = new Date();
    const mv = manualView(now);
    if (mv.block) { sync(); return; }
    const r = issueEinvoiceFor(client, ym, { mode: "manual", no: mv.no, at: mv.dt }, now);
    if (!r) {
      st.err = alreadyErr();
      sync();
      onDone && onDone({ type: "issue" });
      return;
    }
    if (storageFull(r)) { toast && toast(SAVE_FAIL, "warn"); return; } // 적은 값은 그대로 둔다
    if (r.error === "EINVOICE_NO_INVALID") { st.noServerBad = true; sync(); inNo.focus(); return; }
    if (r.error === "EINVOICE_AT_INVALID") { st.timeServerBad = true; sync(); inDate.focus(); return; }
    /* 성공 — 줄을 먼저 다시 그리고(호출부) 창을 닫는다. 닫힐 때 포커스는 onClose 가 그 줄로 되돌린다. */
    onDone && onDone({ type: "issue", rec: r });
    toast && toast(`발급완료로 저장했습니다. ${rc.ok ? `계산서 발급 안내를 ${rc.who}에게 보냈습니다` : "알림 수신자가 없어 계산서 발급 안내는 보내지 못했습니다"}`);
    d.close();
  }

  on(p, "click", "[data-action='ok']", () => {
    if (okBtn.disabled) return;
    if (st.mode === "retry") retry();
    else saveManual();
  });
  on(p, "click", "[data-action='now']", () => {
    const n = new Date();
    st.date = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
    st.time = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    inDate.value = st.date;
    inTime.value = st.time;
    st.timeServerBad = false;
    sync();
  });
  on(p, "input", "[data-f]", (e, t) => {
    const f = t.dataset.f;
    st[f] = t.value;
    if (f === "no") st.noServerBad = false;
    else st.timeServerBad = false;
    sync();
  });
  on(p, "focusout", "[data-f='no']", () => {
    if (st.no.trim()) { st.noTouched = true; sync(); }
  });
  /* Enter 로 저장 — 입력 칸에서만(버튼 위 Enter 는 그 버튼의 클릭이다) */
  on(p, "keydown", "[data-f]", (e) => {
    if (e.key === "Enter" && !e.isComposing && !okBtn.disabled && !okBtn.hidden) { e.preventDefault(); okBtn.click(); }
  });

  sync();
  /* 첫 포커스는 '다시 시도' 행(선택된 라디오) — 셸은 첫 포커스 가능 요소(✕)에 둔다. */
  const sel = qs(p, "[data-pickrow].is-sel");
  if (sel) sel.focus();
  return d;
}

/* ══ ② 입금 확인 ═══════════════════════════════════════════════
   계산서가 나간 미입금 달(ISSUED·OVERDUE)에서만 연다. 금액 입력 없이 **전액만**(부분 입금 받지 않음).
   되돌릴 수 없어 체크 게이트(.dlg-check)를 지나야 주 버튼(검정)이 살아난다. */
export function openPaymentDialog({ client, ym, onDone, toast, onClose } = {}) {
  const now0 = new Date();
  const s0 = settlementOf(client, ym, now0);
  const od = s0.status === "OVERDUE";
  const days = od ? Math.max(1, Math.floor((now0 - s0.overdueAt) / DAY)) : 0;
  const ev = s0.einvoice;
  const st = { ack: false, err: null };
  const M = Number(ym.slice(5, 7));
  /* 기한 지남 안내(T8)도 알림 수신자가 있어야 나간다 — 없으면 '이미 나갔습니다' 라고 말하지 않는다(발급 처리 창과 같은 판정). */
  const rc = recipientOf(client);

  const kv = [
    { k: "금액", v: `${won(s0.amount)} · 전액` },
    { k: "정산기한", v: fmtKoShort(s0.dueAt) },
    { k: "기한", v: od ? `기한 초과 · ${days}일 지남` : `${fmtKoShortTime(s0.overdueAt)} 전까지 기한 안`, warn: od },
    { k: "계산서", v: ev ? `작성 ${fmtKoShort(s0.docDate)} · ${ev.mode === "manual" ? "직접 입력" : "자동 발급"}` : "-" },
  ];
  const notes = [
    od
      ? noteBox("red", `${fmtKoShortTime(s0.overdueAt)}부터 기한 초과입니다`, rc.ok
        ? "입금 기한 지남 안내가 이미 나갔습니다. 확인하면 입금완료로 닫힙니다."
        : "알림 수신자가 없어 입금 기한 지남 안내는 보내지 못했습니다. 확인하면 입금완료로 닫힙니다.")
      : noteBox("", `${fmtKoShortTime(s0.overdueAt)} 전에 확인하면`, "이 달은 기한 초과와 입금 기한 지남 안내 대상에서 빠집니다."),
    noteBox("", "부분 입금은 받지 않습니다", "전액이 들어온 경우에만 확인합니다. 금액이 다르면 거래처에 먼저 연락하세요."),
  ];
  const HINT_OFF = "확인에 체크해야 입금 확인할 수 있습니다";

  const d = openDialog({
    eyebrow: headOf(client, ym),
    title: "전액 입금을 확인할까요?",
    width: 560,
    panelClass: "modal-panel--sdlg",
    bodyClass: "dlg-body--sections",
    body: html`
      <div data-slot="alert" hidden></div>
      <section>${dlgRule({ t: "확인할 금액", cap: "부분 입금은 받지 않습니다" })}${kvGrid(kv)}</section>
      <div class="sdlg-notes">${notes}</div>
      <button type="button" class="dlg-check" data-action="ack" aria-pressed="false">
        <span class="dlg-check__box" aria-hidden="true"></span>
        <span>통장에 ${won(s0.amount)} 전액이 들어온 것을 확인했습니다</span>
      </button>`,
    hint: HINT_OFF,
    hintBlock: true,
    actions: html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--ink" data-action="ok" disabled>입금 확인</button>`,
    onClose,
  });
  const p = d.panel;
  const okBtn = qs(p, "[data-action='ok']");
  const chk = qs(p, "[data-action='ack']");
  const cancelBtn = qs(p, ".dlg-ft [data-action='close']");

  function sync() {
    chk.classList.toggle("is-on", st.ack);
    chk.setAttribute("aria-pressed", st.ack ? "true" : "false");
    chk.disabled = !!st.err;
    fill(p, "alert", st.err ? errBox(st.err) : "");
    cancelBtn.textContent = st.err ? "닫기" : "취소";
    if (st.err) { okBtn.disabled = true; d.setHint("다시 확인할 필요가 없습니다", true); }
    else if (!st.ack) { okBtn.disabled = true; d.setHint(HINT_OFF, true); }
    else { okBtn.disabled = false; d.setHint("확인하면 입금완료로 닫힙니다", false); }
  }

  on(p, "click", "[data-action='ack']", () => { if (st.err) return; st.ack = !st.ack; sync(); });
  on(p, "click", "[data-action='ok']", () => {
    if (okBtn.disabled) return;
    const r = confirmPaymentFor(client, ym, undefined, new Date());
    if (storageFull(r)) { toast && toast(SAVE_FAIL, "warn"); return; } // 입금 확인이 기록되지 않았다 — 창은 그대로
    if (!r) {
      /* 409 — 창을 연 사이 다른 곳에서 입금 확인됐다(또는 상태가 바뀌었다). 줄도 다시 읽는다. */
      const s = settlementOf(client, ym, new Date());
      const who = actorLabel(s.paidBy);
      st.err = s.status === "PAID" && s.paidAt
        ? { title: "이미 입금 확인된 달입니다", body: [`${fmtKoShortTime(s.paidAt)}에 ${who ? `${who} 님이 확인했습니다` : "확인됐습니다"}. 표의 이 줄도 입금완료로 바꿔 두었습니다.`] }
        : { title: "지금은 입금을 확인할 수 없는 달입니다", body: ["표에서 이 달의 상태를 다시 확인하세요."] };
      sync();
      onDone && onDone({ type: "pay" });
      cancelBtn.focus();
      return;
    }
    onDone && onDone({ type: "pay", rec: r });
    toast && toast(`입금을 확인했습니다. ${nameOf(client)} ${M}월 귀속이 입금완료가 되었습니다`);
    d.close();
  });

  sync();
  chk.focus();
  return d;
}
