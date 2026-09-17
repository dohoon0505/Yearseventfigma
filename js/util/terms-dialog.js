/* ============================================================
   terms-dialog.js — 이용약관 열람·동의 다이얼로그 (공용 dialog.js 규격).

   두 모드 — `gate:false` 는 읽기(가입 3단계의 '약관 보기'), `gate:true` 는 **동의 게이트**(이관 거래처의
   첫 로그인 · 약관 버전이 올랐을 때). 게이트는 `.dlg-check` 체크 전엔 주 버튼을 잠그고 푸터가 이유를 말한다
   (계산서 발급 동의와 같은 장치). 동의 없이 닫으면 `onClose` 가 불리고 `onAgree` 는 불리지 않는다.
   ============================================================ */
import { html, on, qs } from "../dom.js";
import { openDialog, dlgActions } from "./dialog.js";
import { TERMS, TERMS_VERSION } from "../data/terms.js";
import { fmtAt } from "../data/settlement-rules.js";

/** 동의 시각 표기 — store 의 다른 기록(동의·이력)과 같은 "YYYY-MM-DD HH:mm" */
export const termsStamp = () => fmtAt(new Date());

export function openTermsDialog({ gate = false, onAgree, onClose } = {}) {
  let ack = false;
  let agreed = false;
  const HINT_OFF = "확인에 체크해야 시작할 수 있습니다";
  const HINT_ON = "동의하고 서비스를 시작합니다";
  const dlg = openDialog({
    eyebrow: `이용약관 · ${TERMS_VERSION}`,
    title: gate ? "약관 동의가 필요합니다" : "이용약관",
    width: 560,
    body: html`
      <p class="dlg-desc">${gate
        ? html`서비스를 계속 이용하려면 아래 조항에 동의가 필요합니다. <b>한 번만</b> 받으며, 약관이 바뀌면 다시 안내합니다.`
        : html`거래명세서·계산서 발급 동의에 관한 조항입니다. <b>법무 검토 전 초안</b>이라 문구가 바뀔 수 있습니다.`}</p>
      ${TERMS.map((sec) => html`
        <div class="terms-sec">
          <b class="terms-sec__t">${sec.title}</b>
          <ol class="terms-sec__list">${sec.items.map((t) => html`<li>${t}</li>`)}</ol>
        </div>`)}
      ${gate ? html`
        <button class="dlg-check" data-action="ack" aria-pressed="false">
          <span class="dlg-check__box" aria-hidden="true"></span>
          <span>위 조항을 읽었고 동의합니다</span>
        </button>` : ""}`,
    hint: gate ? HINT_OFF : "",
    hintBlock: gate,
    actions: gate ? dlgActions({ cancel: "나중에", ok: "동의하고 시작", disabled: true }) : dlgActions({ cancel: "닫기", ok: "확인" }),
    onClose: () => { if (!agreed && onClose) onClose(); },
  });
  const p = dlg.panel;
  if (gate) {
    const chk = qs(p, "[data-action='ack']");
    const go = qs(p, "[data-action='ok']");
    on(p, "click", "[data-action='ack']", () => {
      ack = !ack;
      chk.classList.toggle("is-on", ack);
      chk.setAttribute("aria-pressed", ack ? "true" : "false");
      go.disabled = !ack;
      dlg.setHint(ack ? HINT_ON : HINT_OFF, !ack);
    });
    on(p, "click", "[data-action='ok']", () => {
      if (!ack) return;
      agreed = true;
      dlg.close();
      if (onAgree) onAgree();
    });
  } else {
    on(p, "click", "[data-action='ok']", () => dlg.close());
  }
  return dlg;
}
