/* ============================================================
   terms-dialog.js — 이용약관 · 개인정보 수집·이용 동의서 동의 창과 읽기 창 (시안 'K-03 약관 전문 · 동의 창' 2026-11-11 · 공용 dialog.js 셸).

   두 모드:
   - **동의 게이트**(`gate:true` — 첫 로그인 · 약관이나 동의서 판이 올랐을 때 · login.js). 960px 두 칸이다 — 왼쪽은 글을 읽는 칸
     ('중요 내용 요약 · 이용약관 전문 · 개인정보 동의서' 탭 — 받아야 할 것만), 오른쪽은 늘 보이는 확인 칸(설명 + 체크).
     전문이 길어도 왼쪽 글 칸만 굴러가서 1280x720 에서도 체크 · '동의하고 시작' · 이유 문구가 굴리지 않고 보인다.
     체크는 셋이다 — 요약 확인 `data-action="ack-summary"` · 약관 `data-action="ack"` · 개인정보 `data-action="ack-privacy"`
     (Playwright 로그인 스크립트가 이 셋을 누른다 · role="checkbox" aria-checked · 누른 뒤 초점은 그 자리 — 다시 그리지 않는다).
     '동의하고 시작' 은 보인 체크가 모두 켜져야 열리고, 푸터가 남은 것을 이름으로 말한다('요약 확인 · 약관 · 개인정보 동의가 남았습니다').
     전문을 끝까지 내려야 체크되게 하지 않는다(시안 — 키보드·화면낭독기 사용자에게 막힘이 되고, 읽었다는 증거도 되지 않는다).
     요약 확인은 따로 저장하지 않는다 — 명세·계획에 정한 칸이 없다(약관 동의 기록 termsAgreedAt 이 같은 순간에 남는다 · 보고 2026-11-12).
   - **읽기**(`gate:false` — 가입 4단계 '약관 보기'(760px · 탭 둘: 요약 · 전문) · '동의서 보기'(560px · 탭 없음)). 체크가 없고 버튼은 '닫기' 하나다.

   처리방침은 동의받는 글이 아니라 체크가 없고, 동의서 탭 줄 오른쪽 '개인정보 처리방침'(새 창)으로 읽는 화면(#/legal/privacy)을 연다.
   글은 data/terms.js(TERMS_DOC · TERMS_SUMMARY) · data/privacy.js(동의서) — 본문 조각은 util/legal-doc.js(읽는 화면과 같은 글 · 작은 크기).
   CSS 는 components.css 'K-03 동의 창' 블록(.tdlg-*)과 'K-03 약관 본문'(.lgd-*).
   ============================================================ */
import { html, on, qs, qsa, setHTML } from "../dom.js";
import { icon } from "../icons.js";
import { openDialog } from "./dialog.js";
import { TERMS_DOC, TERMS_VERSION, TERMS_SUMMARY } from "../data/terms.js";
import { PRIVACY, PRIVACY_VERSION } from "../data/privacy.js";
import { fmtAt } from "../data/settlement-rules.js";
import { peekSiteInfo, loadSiteInfo } from "../data/site-info.js";
import { docBody, applyCompany } from "./legal-doc.js";

/** 동의 시각 표기 — store 의 다른 기록(동의·이력)과 같은 "YYYY-MM-DD HH:mm" */
export const termsStamp = () => fmtAt(new Date());

/** 이 거래처가 지금 받아야 할 동의 — 판이 다르면(기록이 없어도) 받는다. 둘 다 false 면 게이트가 없다. */
export const consentNeedOf = (c) => ({
  terms: !c || c.termsVersion !== TERMS_VERSION,
  privacy: !c || c.privacyVersion !== PRIVACY_VERSION,
});

const TAB_LABEL = { summary: "중요 내용 요약", terms: "이용약관 전문", consent: "개인정보 동의서" };
const PANE_LABEL = { summary: "중요 내용 요약", terms: "이용약관 전문", consent: "개인정보 수집·이용 동의" };

/* ── 왼쪽 글 칸의 세 가지 글 ─────────────────────────────────── */
/** 중요 내용 요약 — 약관 본문이 아님을 맨 위에 밝히고, 괄호 속 조를 누르면 전문 탭의 그 조로 간다(시안). 가입 4단계도 같은 글이다. */
const summaryPane = () => html`
  <div class="tdlg-sum">
    <div class="tdlg-sum__hd"><b>중요 내용 요약</b><span>이용약관 판 ${TERMS_VERSION}</span></div>
    <p class="tdlg-note" role="note"><b>이 요약은 약관 본문이 아닙니다.</b> 정확한 내용은 괄호 안 조의 본문을 보세요.</p>
    <ol class="tdlg-sum__list">${TERMS_SUMMARY.map((s) => html`
      <li>
        <span class="tdlg-sum__n" aria-hidden="true">${s.n}</span>
        <div class="tdlg-sum__b">
          <p class="tdlg-sum__t"><span class="sr-only">${s.n} </span>${s.title} <button type="button" class="tdlg-sum__ref" data-goto-art="${s.art}" aria-label="${`${s.ref} 본문 보기 — 이용약관 전문 탭`}">(${s.ref})</button></p>
          <p class="tdlg-sum__x">${s.text}</p>
        </div>
      </li>`)}</ol>
  </div>`;

/** 이용약관 전문 — 위에 '조 바로 가기'(고르면 그 조로 굴리고 초점은 고르는 칸에 둔다) · 본문은 읽는 화면과 같은 조각(작은 크기). */
const jumpOptions = () => {
  const out = [];
  TERMS_DOC.chapters.forEach((c) => {
    out.push(html`<optgroup label="${`제${c.no}장 ${c.title}`}">${TERMS_DOC.articles
      .filter((a) => a.no >= c.from && a.no <= c.to)
      .map((a) => html`<option value="${a.no}">제${a.no}조 ${a.title}</option>`)}</optgroup>`);
  });
  out.push(html`<option value="buchik">부칙</option>`);
  return out;
};
const termsPane = (info) => html`
  <div class="tdlg-terms">
    <div class="tdlg-jump">
      <label class="tdlg-jump__k" for="tdlg-jump-sel">조 바로 가기</label>
      <span class="tdlg-jump__box">
        <select class="tdlg-jump__sel" id="tdlg-jump-sel" data-jump>${jumpOptions()}</select>
        ${icon("chevron-down", { size: 14, cls: "tdlg-jump__ic" })}
      </span>
    </div>
    <div class="lgd lgd--sm">${docBody("terms", TERMS_DOC, { info })}</div>
  </div>`;

/** 개인정보 수집·이용 동의서 — 운영자가 확정한 문안 그대로(data/privacy.js). */
const consentPane = () => html`
  <div class="tdlg-con">
    <div class="tdlg-sum__hd"><b>${PRIVACY.title}</b><span>판 ${PRIVACY_VERSION}</span></div>
    <ol class="tdlg-con__list">${PRIVACY.items.map(({ t, lines }, i) => html`
      <li>
        <span class="tdlg-con__no">${i + 1}</span>
        <div class="tdlg-con__b">
          <p class="tdlg-con__t">${t}</p>
          ${lines.map((l) => html`<p class="tdlg-con__ln">· ${l}</p>`)}
        </div>
      </li>`)}</ol>
  </div>`;

const check = (action, label) => html`
  <button type="button" class="dlg-check" role="checkbox" aria-checked="false" data-action="${action}">
    <span class="dlg-check__box" aria-hidden="true"></span>
    <span>${label}</span>
  </button>`;

/**
 * @param {object} o
 * @param {boolean} [o.gate]   true = 동의 게이트 · false = 읽기
 * @param {"terms"|"privacy"} [o.doc]  읽기 모드에서 보여 줄 글
 * @param {{terms:boolean, privacy:boolean}} [o.need]  게이트가 받을 것(consentNeedOf) — 둘 다 false 면 약관만
 * @param {{terms:boolean, privacy:boolean}} [o.renew] 예전에 동의했는데 판이 올라 다시 받는 것(설명 첫 문장만 바뀐다)
 * @param {(got:{terms:boolean, privacy:boolean}) => void} [o.onAgree] 게이트에서 동의했을 때 — got = 이번에 받은 것
 */
export function openTermsDialog({ gate = false, doc = "terms", need, renew, onAgree, onClose } = {}) {
  return gate ? openGate({ need, renew, onAgree, onClose }) : openReader({ doc, onClose });
}

/** 개인정보 수집·이용 동의서 읽기 창(가입 4단계 '동의서 보기'). */
export const openPrivacyDialog = (o = {}) => openTermsDialog({ ...o, gate: false, doc: "privacy" });

let seq = 0;

/** 두 모드가 함께 쓰는 왼쪽 글 칸 — 탭(role=tablist · 화살표로 옮김 · 고르면 곧바로 바뀜) + 굴러가는 글 칸(tabindex=0).
 *  '개인정보 처리방침' 링크는 탭 목록 **밖** 형제다(tablist 안에는 tab 만 — 시안은 한 줄에 그렸다 · 모양은 같다).
 *  탭이 하나뿐이면(동의서만) 글 칸은 이름 붙은 region 이다(역할 없는 div 의 aria-label 은 읽지 않는 화면낭독기가 있다). */
function leftColumn({ tabs, policyLink, desc, id }) {
  const many = tabs.length > 1;
  return html`
    <div class="tdlg__l">
      ${desc ? html`<p class="tdlg__desc">${desc}</p>` : ""}
      ${many ? html`
        <div class="tdlg-tabs">
          <div class="tdlg-tablist" role="tablist" aria-label="읽을 글">
            ${tabs.map((k, i) => html`<button type="button" class="tdlg-tab" role="tab" id="${`${id}-tab-${k}`}" aria-controls="${`${id}-pane`}"
              aria-selected="${i === 0 ? "true" : "false"}" tabindex="${i === 0 ? "0" : "-1"}" data-tab="${k}">${TAB_LABEL[k]}</button>`)}
          </div>
          ${policyLink ? html`<a class="tdlg-policy" href="#/legal/privacy" target="_blank" rel="noopener" aria-label="개인정보 처리방침 (새 창)">개인정보 처리방침${icon("external-link", { size: 11, cls: "site-ext" })}</a>` : ""}
        </div>` : ""}
      <div class="tdlg-pane" id="${`${id}-pane`}" tabindex="0" ${many ? html`role="tabpanel" aria-labelledby="${`${id}-tab-${tabs[0]}`}"` : html`role="region" aria-label="${PANE_LABEL[tabs[0]]}"`} data-pane></div>
    </div>`;
}

/** 왼쪽 글 칸을 움직이는 손잡이 — 탭 전환(탭마다 굴린 자리를 기억) · 요약의 조 링크 · 조 바로 가기 · 굴리면 바로 가기 칸이 지금 조를 따라간다. */
function bindLeft(panel, tabs, id) {
  const pane = qs(panel, "[data-pane]");
  const kept = {};
  let cur = null;
  let info = peekSiteInfo();
  let raf = 0;

  const paneHtml = (k) => (k === "summary" ? summaryPane() : k === "terms" ? termsPane(info) : consentPane());
  const anchorTop = (el) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  const jumpH = () => { const j = qs(pane, ".tdlg-jump"); return j ? j.offsetHeight : 0; };

  function show(k, { keep = true } = {}) {
    if (cur && keep) kept[cur] = pane.scrollTop;
    cur = k;
    setHTML(pane, paneHtml(k));
    pane.scrollTop = keep ? kept[k] || 0 : 0;
    qsa(panel, "[data-tab]").forEach((t) => {
      const on = t.dataset.tab === k;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    if (tabs.length > 1) pane.setAttribute("aria-labelledby", `${id}-tab-${k}`);
    syncJump();
  }
  /* 전문의 조로 굴린다 — 바로 가기 칸 아래에 그 조 머리가 오게(칸이 위에 붙어 있다 · 사이는 조 사이 여백 18px — 시안) */
  function scrollToArt(key) {
    const el = qs(pane, `[data-anchor="terms-${key}"]`);
    if (!el) return null;
    pane.scrollTop = Math.max(0, anchorTop(el) - jumpH() - 18);
    return el;
  }
  /* 굴린 자리의 조 — 바로 가기 칸 바로 아래를 지난 마지막 조 */
  function syncJump() {
    const sel = qs(pane, "[data-jump]");
    if (!sel) return;
    const line = jumpH() + 24;
    let key = "1";
    qsa(pane, "[data-anchor]").forEach((el) => { if (anchorTop(el) - pane.scrollTop <= line) key = el.dataset.anchor.replace("terms-", ""); });
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) key = "buchik";
    if (sel.value !== key) sel.value = key;
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; syncJump(); }); };
  pane.addEventListener("scroll", onScroll, { passive: true });

  /* 탭 — 누르거나 화살표·Home·End 로 옮기면 곧바로 그 글(자동 활성 · 탭은 다시 그리지 않는다) */
  on(panel, "click", "[data-tab]", (e, t) => { if (t.dataset.tab !== cur) show(t.dataset.tab); });
  on(panel, "keydown", "[data-tab]", (e, t) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const list = qsa(panel, "[data-tab]");
    const i = list.indexOf(t);
    const to = e.key === "ArrowRight" ? list[(i + 1) % list.length]
      : e.key === "ArrowLeft" ? list[(i - 1 + list.length) % list.length]
        : e.key === "Home" ? list[0] : e.key === "End" ? list[list.length - 1] : null;
    if (!to) return;
    e.preventDefault();
    to.focus();
    if (to.dataset.tab !== cur) show(to.dataset.tab);
  });
  /* 요약의 '(제28조 제4항)' — 전문 탭의 그 조로 가서 조 제목에 초점(무엇을 읽게 됐는지 화면낭독기가 말한다) */
  on(panel, "click", "[data-goto-art]", (e, t) => {
    const key = t.dataset.gotoArt;
    show("terms", { keep: false });
    const el = scrollToArt(key);
    syncJump();
    const h = el && qs(el, ".lgd-art__h");
    if (h) h.focus({ preventScroll: true });
  });
  /* 조 바로 가기 — 굴리기만 하고 초점은 고르는 칸에 둔다(화살표로 훑을 때마다 초점이 본문으로 튀지 않게) */
  on(panel, "change", "[data-jump]", (e, t) => { scrollToArt(t.value); });

  /* 회사 정보 자리표시는 사이트 정보 칸과 같은 출처로 채운다 — 아직 못 읽었으면 읽은 뒤 **그 글자만** 바꾼다(전문을 다시 그리면
     조 바로 가기에 있던 초점이 body 로 빠졌다 — 2026-11-12 검증 2 · 다음에 그리는 탭은 새 값으로 그린다). */
  if (!info) loadSiteInfo().then((v) => { info = v; if (panel.isConnected) applyCompany(pane, v); }, () => {});

  show(tabs[0]);
  return () => { pane.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
}

function openReader({ doc, onClose }) {
  const privacy = doc === "privacy";
  const id = `tdlg${++seq}`;
  const tabs = privacy ? ["consent"] : ["summary", "terms"];
  let off = () => {};
  const dlg = openDialog({
    eyebrow: privacy ? `개인정보 · ${PRIVACY_VERSION}` : `이용약관 · ${TERMS_VERSION}`,
    eyebrowNum: true,
    /* 동의서 제목은 운영자가 확정한 낱말 그대로(PRIVACY.title — 2026-10-23 결정 D6). 아래 설명 문장은 문안 밖 화면 문구 — 동의서 쪽은
       2026-10-23 운영자가 지금 그대로 확정했고(E2), 약관 쪽은 시안 K-03 의 글이다. */
    title: privacy ? PRIVACY.title : "이용약관",
    width: privacy ? 560 : 760,
    panelClass: `modal-panel--terms ${privacy ? "modal-panel--terms-pv" : "modal-panel--terms-rd"}`,
    rawBody: true,
    body: html`
      <div class="tdlg tdlg--reader">
        ${leftColumn({
          tabs, id, policyLink: false,
          desc: privacy
            ? "가입과 주문에 필요한 개인정보를 무엇을 모아 어디에 쓰고 얼마나 두는지 적었습니다. 이용약관과 따로 동의를 받습니다."
            : "올해의경조사 이용약관 전문입니다. 중요한 내용은 요약으로 따로 모았습니다.",
        })}
      </div>`,
    hint: "",
    /* 시안: 읽기 창의 버튼은 '닫기' 하나다(예전 '닫기' · '확인' 은 같은 일을 했다). */
    actions: html`<button type="button" class="hm-btn hm-btn--secondary" data-action="close">닫기</button>`,
    onClose: () => { off(); if (onClose) onClose(); },
  });
  off = bindLeft(dlg.panel, tabs, id);
  return dlg;
}

function openGate({ need, renew, onAgree, onClose }) {
  const want = need && (need.terms || need.privacy) ? { terms: !!need.terms, privacy: !!need.privacy } : { terms: true, privacy: false };
  const both = want.terms && want.privacy;
  /* 받을 것 — 약관을 받으면 요약 확인도 받는다(시안 — 요약 확인과 약관 동의를 따로) */
  const keys = [want.terms && "summary", want.terms && "terms", want.privacy && "privacy"].filter(Boolean);
  const ack = { summary: false, terms: false, privacy: false };
  const tabs = [want.terms && "summary", want.terms && "terms", want.privacy && "consent"].filter(Boolean);
  const id = `tdlg${++seq}`;
  let agreed = false;
  let off = () => {};
  const HINT_ON = "동의하고 서비스를 시작합니다";
  const NAMES = { summary: "요약 확인", terms: "약관", privacy: "개인정보" };
  /* 남은 것을 이름으로 — 버튼만 흐려 두면 무엇을 더 눌러야 하는지 찾아 헤맨다(다이얼로그 규격 '푸터 힌트'). 요약 확인만 남으면 '동의' 를 붙이지 않는다(시안). */
  const left = () => keys.filter((k) => !ack[k]);
  const hintOf = () => {
    const l = left();
    if (!l.length) return HINT_ON;
    if (l.length === 1 && l[0] === "summary") return "요약 확인이 남았습니다";
    return `${l.map((k) => NAMES[k]).join(" · ")} 동의가 남았습니다`;
  };
  /* 설명 — 처음 동의면 둘째 문장부터. 예전에 동의했는데 판이 올라 다시 받으면 첫 문장이 그 사실을 말한다.
     약관만 받을 때 '아래 이용약관에'(전문이 들어와 예전 '조항' 이 맞지 않는다 — 시안 K-03). */
  const what = both ? "이용약관과 개인정보 수집·이용" : want.terms ? "이용약관" : "개인정보 수집·이용";
  const rT = !!(renew && renew.terms && want.terms);
  const rP = !!(renew && renew.privacy && want.privacy);
  const again = rT && rP ? "이용약관과 개인정보 동의서가 바뀌었습니다. " : rT ? "이용약관이 바뀌었습니다. " : rP ? "개인정보 동의서가 바뀌었습니다. " : "";
  const dlg = openDialog({
    eyebrow: both ? `이용약관 ${TERMS_VERSION} · 개인정보 ${PRIVACY_VERSION}` : want.terms ? `이용약관 · ${TERMS_VERSION}` : `개인정보 · ${PRIVACY_VERSION}`,
    eyebrowNum: true, // 판 날짜 숫자 폭을 고르게(시안)
    title: both ? "약관·개인정보 동의가 필요합니다" : want.terms ? "약관 동의가 필요합니다" : "개인정보 동의가 필요합니다",
    width: 960,
    panelClass: "modal-panel--terms modal-panel--terms-gate",
    rawBody: true,
    body: html`
      <div class="tdlg">
        ${leftColumn({ tabs, id, policyLink: want.privacy })}
        <div class="tdlg__r">
          <p class="tdlg__lead">${again}서비스를 계속 이용하려면 아래 ${what}에 동의가 필요합니다. <b>한 번만</b> 받으며, ${want.terms && !want.privacy ? "약관" : "내용"}이 바뀌면 다시 안내합니다.</p>
          <div class="tdlg-checks">
            ${want.terms ? check("ack-summary", "중요 내용 요약을 읽고 확인했습니다") : ""}
            ${want.terms ? check("ack", "이용약관 전문을 읽었고 동의합니다") : ""}
            ${want.privacy ? check("ack-privacy", "위 개인정보 수집·이용에 동의합니다") : ""}
          </div>
        </div>
      </div>`,
    hint: hintOf(),
    hintBlock: true,
    actions: html`
      <button type="button" class="hm-btn hm-btn--secondary" data-action="close">나중에</button>
      <button type="button" class="hm-btn hm-btn--primary" data-action="ok" disabled>동의하고 시작</button>`,
    onClose: () => { off(); if (!agreed && onClose) onClose(); },
  });
  const p = dlg.panel;
  const go = qs(p, "[data-action='ok']");
  /* 체크는 다시 그리지 않고 클래스·aria 만 토글한다(누른 버튼이 DOM 에서 떨어지면 초점이 body 로 빠진다 · 시안 '누른 뒤 초점은 그 자리'). */
  const toggle = (key, btn) => {
    ack[key] = !ack[key];
    btn.classList.toggle("is-on", ack[key]);
    btn.setAttribute("aria-checked", ack[key] ? "true" : "false");
    go.disabled = left().length > 0;
    dlg.setHint(hintOf(), left().length > 0);
  };
  /* 누른 채 둔 Enter 의 자동 반복은 버린다 — 버튼은 Enter keydown 마다 눌려, 꾹 누르면 반복마다 켜졌다 꺼졌다 했다(검증 2 ·
     CLAUDE.md 행 버튼 `e.repeat` 막기와 같은 부류 · 떼었다 누르면 그대로 먹힌다 · Space 는 뗄 때 한 번이라 해당 없다). */
  on(p, "keydown", ".dlg-check", (e) => { if (e.repeat && e.key === "Enter") e.preventDefault(); });
  on(p, "click", "[data-action='ack-summary']", (e, t) => toggle("summary", t));
  on(p, "click", "[data-action='ack']", (e, t) => toggle("terms", t));
  on(p, "click", "[data-action='ack-privacy']", (e, t) => toggle("privacy", t));
  on(p, "click", "[data-action='ok']", () => {
    if (left().length) return;
    agreed = true;
    dlg.close();
    if (onAgree) onAgree({ terms: want.terms, privacy: want.privacy });
  });
  off = bindLeft(p, tabs, id);
  return dlg;
}
