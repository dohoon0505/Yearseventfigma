/* ============================================================
   terms-dialog.js — 이용약관 · 개인정보 수집·이용 동의서 열람·동의 다이얼로그 (공용 dialog.js 규격).

   두 모드 — `gate:false` 는 읽기(가입 4단계의 '약관 보기' · '동의서 보기' — `doc` 로 고른다), `gate:true` 는 **동의 게이트**
   (첫 로그인 · 약관이나 동의서 버전이 올랐을 때). 게이트는 `.dlg-check` 체크 전엔 주 버튼을 잠그고 푸터가 이유를 말한다
   (계산서 발급 동의와 같은 장치). 동의 없이 닫으면 `onClose` 가 불리고 `onAgree` 는 불리지 않는다.

   개인정보 수집·이용 동의는 약관과 **따로** 받는다(2026-10-23 운영자 결정 D6 — 법무 부탁 2). 게이트는 받아야 할 것만 보인다
   (`need = { terms, privacy }` — consentNeedOf). 둘 다면 본문 둘 + 체크 둘이고, '동의하고 시작' 은 보인 체크가 모두 켜져야 열리며
   푸터가 무엇이 남았는지 이름을 대서 말한다('약관 · 개인정보 동의가 남았습니다'). 약관 체크는 예전 그대로 `data-action="ack"`
   (Playwright 로그인 스크립트가 이것을 누른다), 개인정보 체크는 `data-action="ack-privacy"` 다.
   새 모양은 없다 — 본문은 약관과 같은 `.terms-sec*`, 체크는 `.dlg-check` 그대로다. 길어지면 `.dlg-body` 만 스크롤한다(공용 규격).
   ============================================================ */
import { html, on, qs } from "../dom.js";
import { openDialog, dlgActions } from "./dialog.js";
import { TERMS, TERMS_VERSION } from "../data/terms.js";
import { PRIVACY, PRIVACY_VERSION } from "../data/privacy.js";
import { fmtAt } from "../data/settlement-rules.js";

/** 동의 시각 표기 — store 의 다른 기록(동의·이력)과 같은 "YYYY-MM-DD HH:mm" */
export const termsStamp = () => fmtAt(new Date());

/** 이 거래처가 지금 받아야 할 동의 — 버전이 다르면(기록이 없어도) 받는다. 둘 다 false 면 게이트가 없다. */
export const consentNeedOf = (c) => ({
  terms: !c || c.termsVersion !== TERMS_VERSION,
  privacy: !c || c.privacyVersion !== PRIVACY_VERSION,
});

/* 본문 조각 — 약관(조항 목록)과 개인정보 동의서(항목 이름 + 줄). 둘 다 `.terms-sec` 한 벌이다. */
const termsSecs = () => TERMS.map((sec) => html`
  <div class="terms-sec">
    <b class="terms-sec__t">${sec.title}</b>
    <ol class="terms-sec__list">${sec.items.map((t) => html`<li>${t}</li>`)}</ol>
  </div>`);
const privacySec = () => html`
  <div class="terms-sec">
    <b class="terms-sec__t">${PRIVACY.title}</b>
    <ol class="terms-sec__list">${PRIVACY.items.map(({ t, lines }) => html`
      <li><b>${t}</b> — ${lines.map((l, i) => (i ? html`<br>${l}` : l))}</li>`)}</ol>
  </div>`;
const check = (action, label) => html`
  <button class="dlg-check" data-action="${action}" aria-pressed="false">
    <span class="dlg-check__box" aria-hidden="true"></span>
    <span>${label}</span>
  </button>`;

/**
 * @param {object} o
 * @param {boolean} [o.gate]   true = 동의 게이트 · false = 읽기
 * @param {"terms"|"privacy"} [o.doc]  읽기 모드에서 보여 줄 문서
 * @param {{terms:boolean, privacy:boolean}} [o.need]  게이트가 받을 것(consentNeedOf) — 둘 다 false 면 약관만
 * @param {{terms:boolean, privacy:boolean}} [o.renew] 예전에 동의했는데 버전이 올라 다시 받는 것(설명 첫 문장만 바뀐다)
 * @param {(got:{terms:boolean, privacy:boolean}) => void} [o.onAgree] 게이트에서 동의했을 때 — got = 이번에 받은 것
 */
export function openTermsDialog({ gate = false, doc = "terms", need, renew, onAgree, onClose } = {}) {
  return gate ? openGate({ need, renew, onAgree, onClose }) : openReader({ doc, onClose });
}

/** 개인정보 수집·이용 동의서 읽기 창(가입 4단계 '동의서 보기'). */
export const openPrivacyDialog = (o = {}) => openTermsDialog({ ...o, gate: false, doc: "privacy" });

function openReader({ doc, onClose }) {
  const privacy = doc === "privacy";
  const dlg = openDialog({
    eyebrow: privacy ? `개인정보 · ${PRIVACY_VERSION}` : `이용약관 · ${TERMS_VERSION}`,
    /* 동의서 제목은 운영자가 확정한 낱말 그대로(PRIVACY.title '개인정보 수집·이용 동의' — 2026-10-23 결정 D6). 예전 '개인정보 동의서' 는
       확정 제목과 다른 말이었다. 게이트 제목('… 동의가 필요합니다')과 이 보기 창의 설명 문장은 문안 밖의 화면 문구인데, 운영자가 지금
       그대로 확정했다(2026-10-23 운영자 결정 E2). */
    title: privacy ? PRIVACY.title : "이용약관",
    width: 560,
    body: html`
      <p class="dlg-desc">${privacy
        ? "가입과 주문에 필요한 개인정보를 무엇을 모아 어디에 쓰고 얼마나 두는지 적었습니다. 이용약관과 따로 동의를 받습니다."
        : html`거래명세서·계산서 발급 동의에 관한 조항입니다. <b>법무 검토 전 초안</b>이라 문구가 바뀔 수 있습니다.`}</p>
      ${privacy ? privacySec() : termsSecs()}`,
    hint: "",
    actions: dlgActions({ cancel: "닫기", ok: "확인" }),
    onClose,
  });
  on(dlg.panel, "click", "[data-action='ok']", () => dlg.close());
  return dlg;
}

function openGate({ need, renew, onAgree, onClose }) {
  const want = need && (need.terms || need.privacy) ? { terms: !!need.terms, privacy: !!need.privacy } : { terms: true, privacy: false };
  const both = want.terms && want.privacy;
  const ack = { terms: false, privacy: false };
  let agreed = false;
  const HINT_ON = "동의하고 서비스를 시작합니다";
  /* 남은 것을 이름으로 — 버튼만 흐려 두면 무엇을 더 눌러야 하는지 찾아 헤맨다(다이얼로그 규격 '푸터 힌트'). */
  const left = () => [want.terms && !ack.terms && "약관", want.privacy && !ack.privacy && "개인정보"].filter(Boolean);
  const hintOf = () => (left().length ? `${left().join(" · ")} 동의가 남았습니다` : HINT_ON);
  /* 설명 — 약관만 받는 처음 동의는 예전 문장 그대로다. 예전에 동의했는데 버전이 올라 다시 받으면 첫 문장이 그 사실을 말한다. */
  const what = both ? "이용약관과 개인정보 수집·이용" : want.terms ? "조항" : "개인정보 수집·이용";
  const rT = !!(renew && renew.terms && want.terms);
  const rP = !!(renew && renew.privacy && want.privacy);
  const again = rT && rP ? "이용약관과 개인정보 동의서가 바뀌었습니다. " : rT ? "이용약관이 바뀌었습니다. " : rP ? "개인정보 동의서가 바뀌었습니다. " : "";
  const dlg = openDialog({
    eyebrow: both ? `이용약관 ${TERMS_VERSION} · 개인정보 ${PRIVACY_VERSION}` : want.terms ? `이용약관 · ${TERMS_VERSION}` : `개인정보 · ${PRIVACY_VERSION}`,
    title: both ? "약관·개인정보 동의가 필요합니다" : want.terms ? "약관 동의가 필요합니다" : "개인정보 동의가 필요합니다",
    width: 560,
    body: html`
      <p class="dlg-desc">${again}서비스를 계속 이용하려면 아래 ${what}에 동의가 필요합니다. <b>한 번만</b> 받으며, ${want.terms && !want.privacy ? "약관" : "내용"}이 바뀌면 다시 안내합니다.</p>
      ${want.terms ? html`${termsSecs()}${check("ack", both ? "위 이용약관 조항을 읽었고 동의합니다" : "위 조항을 읽었고 동의합니다")}` : ""}
      ${want.privacy ? html`${privacySec()}${check("ack-privacy", "위 개인정보 수집·이용에 동의합니다")}` : ""}`,
    hint: hintOf(),
    hintBlock: true,
    actions: dlgActions({ cancel: "나중에", ok: "동의하고 시작", disabled: true }),
    onClose: () => { if (!agreed && onClose) onClose(); },
  });
  const p = dlg.panel;
  const go = qs(p, "[data-action='ok']");
  /* 체크는 다시 그리지 않고 클래스·aria 만 토글한다(누른 버튼이 DOM 에서 떨어지면 초점이 body 로 빠진다). */
  const toggle = (key, btn) => {
    ack[key] = !ack[key];
    btn.classList.toggle("is-on", ack[key]);
    btn.setAttribute("aria-pressed", ack[key] ? "true" : "false");
    go.disabled = left().length > 0;
    dlg.setHint(hintOf(), left().length > 0);
  };
  on(p, "click", "[data-action='ack']", (e, t) => toggle("terms", t));
  on(p, "click", "[data-action='ack-privacy']", (e, t) => toggle("privacy", t));
  on(p, "click", "[data-action='ok']", () => {
    if (left().length) return;
    agreed = true;
    dlg.close();
    if (onAgree) onAgree({ terms: want.terms, privacy: want.privacy });
  });
  return dlg;
}
