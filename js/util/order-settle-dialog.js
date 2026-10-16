/* ============================================================
   order-settle-dialog.js — '저장 전 금액 변경 확인' 작은 창 (시안 'S-06 B2B 주문 상세 금액 잠금' · 2026-10-16 ⑦)

   명세서가 나간 달(발급됨 · 아직 고칠 수 있음)의 금액이 **실제로 바뀌는** 저장에만 뜬다(명세 3.4 '마감 전 수정' 8).
   리본 문구처럼 정산과 무관한 저장, 발행 전 달만 바뀌는 저장은 확인 없이 바로 된다. 판정은 호출부가
   `settlementImpactOf(...).confirm` 으로 한다 — 이 창은 그 결과를 보여 주고 사유(선택)를 받을 뿐이다.

   공용 셸 `openDialog`(js/util/dialog.js) 위에 짓는다 — 손수 `.hm__head` 를 짜지 않는다(CLAUDE.md '작은 다이얼로그는 한 규격').
   ⚠️ 주 버튼을 누르는 순간 **한 번 더 판정한다**(`recheck` — 서버 409 SETTLEMENT_PERIOD_LOCKED 의 데모 대역). 창을 열어 둔 사이
      수정 마감이 지났거나 거래처가 동의했으면 창 안에 빨간 안내를 띄우고 주 버튼을 잠근다(취소 → '닫기'). 사유와 적은 값은
      버리지 않는다 — 닫힌 뒤 무엇을 할지는 호출부의 `onLockedClose` 가 정한다(금액·상품 되돌림 + 저장 줄 메모 · 사용자 답 2).
   ⚠️ 저장이 실패하면(`onConfirm` 이 false — 브라우저 저장 공간 한도) 창을 닫지 않는다(적은 사유를 잃지 않게 · DATA.md 1.6).
   ⚠️ 이 창은 상세 창·등록 위저드 **위에 스택**된다 — 핸들을 페이지의 단일 `activeModal` 에 담지 말 것(거부 사유 다이얼로그 함정).
   짝 스타일: css/components.css 의 `.sdlg-*`(S-06 블록) + 공용 `.dlg-box--err`·`.dlg-note*`·`.hm-btn--ink`.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { openDialog, dlgRule, dlgActions } from "./dialog.js";

const num = (n) => Number(n || 0).toLocaleString("ko-KR");
/** 달 줄의 증감 — '+70,000'(초록) · '−60,000'(빨강) · '변동 없음'(회색). */
function deltaOf(before, after) {
  const d = Number(after || 0) - Number(before || 0);
  if (!d) return { text: "변동 없음", cls: "is-zero" };
  return { text: `${d < 0 ? "−" : "+"}${num(Math.abs(d))}`, cls: d < 0 ? "is-down" : "is-up" };
}
/** 달 한 줄 — 왼쪽 '9월 명세서' + 보조줄, 오른쪽 '앞 → 뒤 증감'. 시안 '바뀌는 정산 금액'. */
export const sdlgMonthRow = (m) => {
  const dl = deltaOf(m.before, m.after);
  return html`
    <div class="sdlg-m">
      <span class="sdlg-m__l"><b class="sdlg-m__t">${m.label}</b><span class="sdlg-m__sub">${m.sub}</span></span>
      <span class="sdlg-m__v">
        <span class="sdlg-m__before">${num(m.before)}원</span><span class="sdlg-m__arrow" aria-hidden="true">→</span>
        <b class="sdlg-m__after">${num(m.after)}원</b><span class="sdlg-m__delta ${dl.cls}">${dl.text}</span>
      </span>
    </div>`;
};
/** '바뀌는 정산 금액' 구역 — 확인 창·삭제 확인 창이 같이 쓴다. */
export const sdlgMonths = ({ months, what }) => html`
  <section>
    ${dlgRule({ t: "바뀌는 정산 금액", cap: "거래처가 보는 금액" })}
    <div class="sdlg-ms">${months.map(sdlgMonthRow)}</div>
    ${what ? html`<p class="sdlg-what"><b>바뀌는 것 · </b>${what}</p>` : ""}
  </section>`;
/** 회색(기본)·빨강 안내 면 — 공용 `.dlg-note`(제목 줄 + 본문). */
export const sdlgNote = ({ title, body, tone }) => html`
  <div class="dlg-note ${tone ? `dlg-note--${tone}` : ""}">
    <b class="dlg-note__t">${title}</b>${body ? html`<p class="dlg-note__b">${body}</p>` : ""}
  </div>`;
/** 서버 거부(409) 상자 — 공용 `.dlg-box--err`(role=alert). */
export const sdlgErr = ({ title, body = [] }) => html`
  <div class="dlg-box dlg-box--err" role="alert">
    <b class="dlg-box__t">${title}</b>
    ${body.map((b) => html`<p class="dlg-box__b">${b}</p>`)}
  </div>`;

export const REASON_MAX = 200; // 명세 6.4 settlementNote 1~200자(빈 값은 '사유 없음')
let seq = 0;

/**
 * @param {object} o
 * @param {string}   o.eyebrow    'B2B-0123 · 한빛과학(주) · 저장 전 확인'
 * @param {string}   o.title      '명세서 금액이 바뀝니다. 저장할까요?'
 * @param {object[]} o.months     [{ label, sub, before, after }]
 * @param {string}   o.what       '주문금액 60,000원 → 130,000원 · 직접 고침'
 * @param {object[]} o.notes      [{ title, body }] — 회색 안내
 * @param {string}   o.okLabel    '저장하고 명세서에 반영'
 * @param {string}   o.hint       푸터 힌트
 * @param {Function} o.recheck    () → null | { title, body[], hint } — 누르는 순간 막혔으면 창 안에 그릴 것
 * @param {Function} o.onConfirm  (note) → boolean — false 면 창을 닫지 않는다(저장 실패)
 * @param {Function} o.onLockedClose () — 거부된 뒤 창이 닫힐 때(호출부가 칸을 잠그고 저장 줄에 메모를 남긴다)
 */
export function openSettleConfirm(o) {
  const id = ++seq;
  const reasonId = `sdlg-reason-${id}`;
  let failed = false;
  const d = openDialog({
    eyebrow: o.eyebrow,
    eyebrowNum: true,
    title: o.title,
    width: 560,
    panelClass: "modal-panel--sdlg6",
    bodyClass: "dlg-body--sections",
    body: html`
      <div data-slot="alert" hidden></div>
      ${sdlgMonths({ months: o.months, what: o.what })}
      <section data-slot="reason">
        ${dlgRule({ t: html`사유 <span class="sdlg-opt">(선택)</span>`, cap: "정산 금액 변경 기록에 남습니다 · 거래처에는 안 보임" })}
        <textarea class="sdlg-reason" id="${reasonId}" rows="2" maxlength="${REASON_MAX}" aria-label="사유 (선택)"
          placeholder="예) 10월 6일 고객센터 접수 — 전화로 줄인 주문이 청구에 그대로 들어 있음"></textarea>
      </section>
      <div class="sdlg-notes" data-slot="notes">${(o.notes || []).map(sdlgNote)}</div>`,
    hint: o.hint,
    actions: dlgActions({ cancel: "취소", ok: o.okLabel, okClass: "hm-btn--ink" }),
    onClose: () => { if (failed && o.onLockedClose) o.onLockedClose(); },
  });
  const p = d.panel;
  const ta = qs(p, `#${reasonId}`);
  const okBtn = qs(p, "[data-action='ok']");
  const cancelBtn = qs(p, ".dlg-ft [data-action='close']");
  /* 남은 글자 — 한도 가까이에서만 말한다(평소 힌트는 '바로 반영됩니다' 가 할 일이다). */
  on(p, "input", `#${reasonId}`, () => {
    const n = ta.value.length;
    d.setHint(n >= REASON_MAX - 40 ? `사유 ${n}/${REASON_MAX}자` : o.hint, false);
  });
  /** 서버 거부 모양 — 사유 칸·회색 안내를 감추고(입력은 버리지 않는다) 빨간 안내를 맨 위에 띄운다. */
  function showLocked(err) {
    failed = true;
    const alert = qs(p, "[data-slot='alert']");
    if (alert) { setHTML(alert, sdlgErr(err)); alert.hidden = false; }
    const rs = qs(p, "[data-slot='reason']");
    if (rs) { rs.hidden = true; if (ta) ta.disabled = true; }
    const ns = qs(p, "[data-slot='notes']");
    if (ns) ns.hidden = true;
    okBtn.disabled = true;
    if (cancelBtn) { cancelBtn.textContent = "닫기"; cancelBtn.focus(); }
    d.setHint(err.hint || "창을 닫으면 주문금액 칸이 잠긴 모습으로 바뀝니다", true);
  }
  on(p, "click", "[data-action='ok']", () => {
    if (okBtn.disabled) return;
    const err = o.recheck ? o.recheck() : null;
    if (err) { showLocked(err); return; }
    const ok = o.onConfirm(String(ta ? ta.value : "").trim().slice(0, REASON_MAX));
    if (ok !== false) d.close();
  });
  setTimeout(() => { if (ta && !failed) ta.focus(); }, 0);
  return d;
}
