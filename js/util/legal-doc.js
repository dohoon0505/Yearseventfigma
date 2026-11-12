/* ============================================================
   legal-doc.js — 이용약관 · 개인정보 처리방침 본문을 그리는 공용 조각 (시안 'K-03 약관 전문 · 동의 창' 2026-11-11).

   같은 글 한 곳: 공개 읽는 화면(pages/legal.js — #/legal/terms · #/legal/privacy)과 동의 창의 '이용약관 전문' 탭(util/terms-dialog.js)이
   이 조각으로 그린다. 글은 data/terms.js(TERMS_DOC) · data/privacy-policy.js(PRIVACY_POLICY_DOC) — docs/legal md 에서 만든 것이다.
   - 장은 h2 · 조는 h3(장이 없는 처리방침은 조가 h2 · tabindex=-1 — 차례·요약·조 바로 가기가 초점을 옮긴다) · 굵게 보일 중요 항은 그 항 전체를 한 치수 크고 굵게 두고
     머리에 '중요 ①~⑦' 표(화면낭독기가 먼저 읽는다)를 붙인다 · '(삭제)' 조는 번호를 당기지 않고 흐린 제목으로 자리만 둔다.
   - 크기는 둘이다 — 읽는 화면(기본 15.5px) · 동의 창(`.lgd--sm` 14.5px). CSS 는 components.css 'K-03 약관 본문' 블록(.lgd-*).
   - 문장 속 회사 정보 자리표시('[회사 정보 — 게시본에서 채움: 상호]' 등)는 사이트 정보 칸과 **같은 출처**(data/site-info.js — 명세 6.10)로
     채운다(화면은 `<span data-co>` 로 감싸 그리고, 값이 늦게 오면 `applyCompany` 가 그 글자만 바꾼다 — 본문을 다시 그리지 않는다).
     그 출처에 없는 것(대표자 직함)과 그 밖의 대괄호 표지는 글 그대로 둔다(시안 그대로).

   판(이전 판 · 시행 예정 판)과 미리 알림도 여기서 고른다(`legalEditions` · `legalNotice`) — 읽는 화면 위쪽 바 · 맨 아래 '이전 판' ·
   본문 맨 위 호박색 미리 알림 카드가 같은 값을 본다. 지금은 처음 게시한 판이라 이전 판도 시행 예정 판도 없다(카드·바가 서지 않는다).
   ============================================================ */
import { html } from "../dom.js";
import { icon } from "../icons.js";
import { TERMS_DOC, TERMS_VERSION, TERMS_PAST, TERMS_NEXT } from "../data/terms.js";
import { PRIVACY_POLICY_DOC, PRIVACY_POLICY_PAST, PRIVACY_POLICY_NEXT } from "../data/privacy-policy.js";
import { CS_PHONE } from "../data/contact.js";

/* ── 회사 정보 자리표시 ─────────────────────────────────────── */
/** 자리표시 낱말 → 사이트 정보 칸의 키(명세 6.10 응답 모양). 여기 없는 낱말은 글 그대로 둔다. */
const COMPANY_KEYS = {
  "상호": "company",
  "대표자": "ceo",
  "대표자 성명": "ceo",
  "주소": "address",
  "영업소 주소": "address",
  "전화": "phone",
  "대표 전화": "phone",
  "이메일": "email",
  "대표 이메일": "email",
  "개인정보 문의 이메일": "email", // 사이트 정보 칸의 이메일 = 대표 이메일 = 개인정보 문의 이메일(B8 · site-info.js 머리 주석)
  "사업자등록번호": "bizNumber",
  "통신판매업 신고번호": "mailOrderNo",
  "호스팅": "hostingCompany",
  "호스팅 사업자": "hostingCompany",
};
const PLACEHOLDER = /\[회사 정보 — 게시본에서 채움: ([^\]]+)\]/g;

const companyValue = (info, key) => (info && key && typeof info[key] === "string" ? info[key].trim() : "");

/** 문장 속 회사 정보 자리표시를 채운다(글자) — info 가 없거나 그 값이 비면 자리표시 그대로. */
export function fillCompany(text, info) {
  if (!info || typeof text !== "string" || !text.includes("[회사 정보")) return text;
  return text.replace(PLACEHOLDER, (all, label) => companyValue(info, COMPANY_KEYS[label.trim()]) || all);
}

/** 화면에 그리는 쪽 — 채울 수 있는 자리표시는 `<span data-co="키">` 로 감싸 둔다. 사이트 정보가 늦게 오면
 *  `applyCompany` 가 **그 글자만** 바꾼다(본문을 다시 그리면 차례·조 바로 가기에 있던 초점이 body 로 빠졌다 — 2026-11-12 검증 2).
 *  채울 키가 없는 자리표시(대표자 직함 등)는 글 그대로다. */
function companyHtml(text, info) {
  if (typeof text !== "string" || !text.includes("[회사 정보")) return text;
  const out = [];
  let last = 0;
  text.replace(PLACEHOLDER, (all, label, at) => {
    const key = COMPANY_KEYS[label.trim()];
    if (!key) return all;
    out.push(text.slice(last, at), html`<span data-co="${key}" data-co-ph="${all}">${companyValue(info, key) || all}</span>`);
    last = at + all.length;
    return all;
  });
  out.push(text.slice(last));
  return out;
}

/** 늦게 온 사이트 정보로 root 안의 회사 정보 자리만 고친다(값이 비면 자리표시 그대로). */
export function applyCompany(root, info) {
  if (!root || !info) return;
  root.querySelectorAll("[data-co]").forEach((s) => {
    const v = companyValue(info, s.dataset.co) || s.dataset.coPh || s.textContent;
    if (s.textContent !== v) s.textContent = v;
  });
}

/* ── 날짜 ───────────────────────────────────────────────────── */
const ymd = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
/** "2026-10-31" → "2026년 10월 31일" */
export const fmtLongDate = (iso) => {
  const d = ymd(iso);
  return d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` : "";
};
/** "2026-12-01" → "12월 1일"(지금과 해가 다르면 연도를 붙인다 — 연도 없이 쓰면 올해로 읽힌다) */
const fmtShortDate = (iso, now) => {
  const d = ymd(iso);
  if (!d) return "";
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
};

/* ── 판 · 미리 알림 ─────────────────────────────────────────── */
const DEFAULT_SOURCE = () => ({
  terms: { current: { ver: TERMS_VERSION, doc: TERMS_DOC }, past: TERMS_PAST, next: TERMS_NEXT },
  privacy: { current: { ver: "", doc: PRIVACY_POLICY_DOC }, past: PRIVACY_POLICY_PAST, next: PRIVACY_POLICY_NEXT },
});
let source = DEFAULT_SOURCE;

/** 검증 전용 — 판 목록을 갈아 끼운다(지난 판 · 시행 예정 판 · 미리 알림 화면을 보려고). 인자 없이 부르면 되돌린다.
 *  같은 모듈 주소로 import 해야 앱과 같은 인스턴스다(?v= 를 붙이면 다른 인스턴스 — site-info.js 의 setSiteInfoSource 와 같은 약속).
 *  fn() → { terms: { current: { ver, doc }, past: [{ ver, from, to, doc }], next: { ver, effective, noticeDays, items, doc } | null }, privacy: { … } } */
export function setLegalSource(fn) {
  source = typeof fn === "function" ? fn : DEFAULT_SOURCE;
}

/** 그 글의 판들 — { current, past, next } */
export function legalEditions(kind) {
  const s = source() || DEFAULT_SOURCE();
  return s[kind] || DEFAULT_SOURCE()[kind];
}

const DAY = 86400000;
/** 시행 예정 판이 미리 알림 기간(시행 7일 · 불리하면 30일 전부터 — 약관 제5조 · T6) 안이면 그 판, 아니면 null */
function upcoming(kind, now) {
  const n = legalEditions(kind).next;
  if (!n || !n.effective) return null;
  const eff = ymd(n.effective);
  if (!eff || now >= eff) return null;
  const from = new Date(eff.getTime() - (n.noticeDays || 7) * DAY);
  return now >= from ? { ...n, left: Math.max(1, Math.ceil((eff - now) / DAY)) } : null;
}

const NAME = { terms: "이용약관", privacy: "개인정보 처리방침" };
const SHORT = { terms: "약관", privacy: "처리방침" };

/** 읽는 화면 본문 맨 위 미리 알림 카드의 값 — 미리 알릴 변경이 없으면 null(카드를 감춘다).
 *  문장은 시안 K-03(= K-5 포털 미리 알림)과 같다. 링크는 { label, to: "next"|"current", kind } — 화면이 판을 바꾸거나 주소를 옮긴다. */
export function legalNotice(kind, now = new Date()) {
  const t = upcoming("terms", now);
  const p = upcoming("privacy", now);
  if (!t && !p) return null;
  const both = !!(t && p);
  const first = t || p; // 날짜는 먼저 시행하는 쪽(둘이 같은 날인 것이 보통이다)
  const eff = t && p ? (ymd(t.effective) <= ymd(p.effective) ? t : p) : first;
  const items = both
    ? [...t.items.map((x) => `${NAME.terms} ${x}`), ...p.items.map((x) => `${NAME.privacy} ${x}`)]
    : first.items.slice();
  const day = fmtShortDate(eff.effective, now);
  /* 약관이 바뀌면 다시 동의해야 로그인한다(게이트) · 처리방침만이면 따로 동의하지 않는다(알리는 글) */
  const consent = t
    ? `${fmtShortDate(t.effective, now)}부터는 바뀐 약관에 동의해야 로그인할 수 있습니다. 동의하기 전에는 거래명세서를 고객센터(${CS_PHONE})로 확인할 수 있습니다.`
    : `바뀐 처리방침은 따로 동의하지 않아도 ${day}부터 적용됩니다.`;
  const links = [];
  const own = kind === "privacy" ? p : t;
  const other = kind === "privacy" ? t : p;
  const otherKind = kind === "privacy" ? "terms" : "privacy";
  if (own) links.push({ label: `바뀐 ${SHORT[kind]} 보기`, to: "next", kind }, { label: `지금 ${SHORT[kind]} 보기`, to: "current", kind, cur: true });
  if (other) links.push({ label: `바뀐 ${SHORT[otherKind]} 보기`, to: "next", kind: otherKind });
  if (!own) links.push({ label: `지금 ${SHORT[kind]} 보기`, to: "current", kind, cur: true });
  return {
    title: both ? "이용약관과 개인정보 처리방침이 바뀝니다" : t ? "이용약관이 바뀝니다" : "개인정보 처리방침이 바뀝니다",
    when: `${fmtLongDate(eff.effective)}부터 적용 · ${eff.left}일 남음`,
    items,
    consent,
    links,
  };
}

/** 위쪽 바 — 지난 판 · 시행 예정 판을 볼 때만. { kind: "past"|"upcoming", range } */
export function editionBar(ed, now = new Date()) {
  if (!ed || ed.view === "current") return null;
  if (ed.view === "next") return { kind: "upcoming", text: `${fmtShortDate(ed.effective, now)}부터 적용` };
  return { kind: "past", text: `${ed.from} ~ ${ed.to} 적용` };
}

/* ── 차례 ───────────────────────────────────────────────────── */
/** 차례 줄 — { key, label, chapter?, imp, deleted } (chapter 는 장 머리 줄 — 누를 수 없다) */
export function tocRows(kind, doc) {
  const out = [];
  const art = (a) => ({
    key: String(a.no),
    label: `제${a.no}조 ${a.title}`,
    imp: a.paras.some((p) => p.imp),
    deleted: !!a.deleted,
  });
  if (kind === "terms") {
    (doc.chapters || []).forEach((c) => {
      out.push({ chapter: true, label: `제${c.no}장 ${c.title}` });
      doc.articles.filter((a) => a.no >= c.from && a.no <= c.to).forEach((a) => out.push(art(a)));
    });
  } else {
    if (doc.preface && doc.preface.length) out.push({ key: "pre", label: "머리말" });
    doc.articles.forEach((a) => out.push(art(a)));
  }
  out.push({ key: "buchik", label: "부칙" });
  return out;
}

/* ── 본문 ───────────────────────────────────────────────────── */
const CIRC = "①②③④⑤⑥⑦⑧⑨⑩";
const MARK = { num: (it) => `${it.n}.`, dash: () => "•", dot: () => "·", tx: () => "" };

const itemHtml = (it, imp, info) => {
  const mark = MARK[it.k] ? MARK[it.k](it) : "";
  const text = companyHtml(it.text, info);
  const body = imp ? html`<strong>${mark ? `${mark} ` : ""}${text}</strong>` : html`${mark ? `${mark} ` : ""}${text}`;
  return html`<p class="lgd-it lgd-it--${it.k}">${body}</p>`;
};

const tableHtml = (t, info) => html`
  <table class="lgd-tbl">
    <colgroup><col class="lgd-tbl__c1"><col class="lgd-tbl__c2"><col class="lgd-tbl__c3"></colgroup>
    <thead><tr>${t.head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
    <tbody>${t.rows.map((r) => html`<tr>${r.map((c) => html`<td>${companyHtml(c, info)}</td>`)}</tr>`)}</tbody>
  </table>`;

const paraHtml = (p, info) => {
  const imp = !!p.imp;
  const text = companyHtml(p.text, info);
  const lead = p.n ? `${p.n} ` : "";
  return html`
    <div class="lgd-p${p.n ? " lgd-p--n" : ""}${imp ? " is-imp" : ""}">
      ${imp ? html`<span class="lgd-imp">중요 ${CIRC[p.imp - 1]}</span>` : ""}
      <p class="lgd-p__t">${imp ? html`<strong>${lead}${text}</strong>` : html`${lead}${text}`}</p>
      ${(p.items || []).map((it) => itemHtml(it, imp, info))}
      ${p.table ? tableHtml(p.table, info) : ""}
    </div>`;
};

/**
 * 글 전체 — 머리말(처리방침) · 장 · 조 · 부칙. 각 덩어리에 data-anchor(`{kind}-{no}` · `{kind}-pre` · `{kind}-buchik`)가 붙는다.
 * @param {"terms"|"privacy"} kind
 * @param {object} doc   TERMS_DOC · PRIVACY_POLICY_DOC 모양
 * @param {object} [o]
 * @param {object} [o.info]   사이트 정보 값(회사 정보 자리표시를 채운다)
 * @param {boolean} [o.back]  조 머리에 '차례로' 자리(읽는 화면)
 */
export function docBody(kind, doc, { info = null, back = false } = {}) {
  const parts = [];
  if (kind === "privacy" && doc.preface && doc.preface.length) {
    parts.push(html`
      <section class="lgd-pre" data-anchor="${kind}-pre" aria-label="머리말" tabindex="-1">
        ${doc.preface.map((l) => html`<p>${companyHtml(l, info)}</p>`)}
      </section>`);
  }
  doc.articles.forEach((a) => {
    if (kind === "terms") {
      const ch = (doc.chapters || []).find((c) => c.from === a.no);
      if (ch) parts.push(html`<h2 class="lgd-ch">제${ch.no}장 ${ch.title}</h2>`);
    }
    /* 머리 단계 — 약관은 장(h2) 아래 조(h3), 장이 없는 처리방침은 조가 h2 다(h1 다음이 곧 h3 이면 화면낭독기의 머리 목록이 한 단계 빈다 — 검증 2) */
    const head = html`<span class="lgd-art__no">제${a.no}조</span> <span>${a.title}</span>`;
    parts.push(html`
      <article class="lgd-art${a.deleted ? " is-deleted" : ""}" data-anchor="${kind}-${a.no}">
        <div class="lgd-art__hd">
          ${kind === "terms"
            ? html`<h3 class="lgd-art__h" tabindex="-1">${head}</h3>`
            : html`<h2 class="lgd-art__h" tabindex="-1">${head}</h2>`}
          ${back ? html`<span class="lgd-art__back" data-slot="back"></span>` : ""}
        </div>
        ${a.paras.map((p) => paraHtml(p, info))}
      </article>`);
  });
  parts.push(html`
    <section class="lgd-bu" data-anchor="${kind}-buchik">
      <h2 class="lgd-bu__h" tabindex="-1">부칙</h2>
      ${(doc.buchik || []).map((l) => html`<p>${companyHtml(l, info)}</p>`)}
    </section>`);
  return parts;
}

/** '차례로' 링크 — 읽는 화면에서 차례로 옮겨 온 조의 머리 옆에만 선다(시안). */
export const backLink = () => html`<a class="lgd-back" href="#" data-action="toc-back">차례로${icon("chevron-up", { size: 12 })}</a>`;

/** 판 · 시행일 줄 — 읽는 화면 맨 아래(시안 — 두 날짜에 뜻을 붙인다). 처리방침은 판을 매기지 않아 시행일만. */
export function footText(kind, ed) {
  const eff = fmtLongDate(ed.effective || ed.doc.effective);
  const note = kind === "terms" ? "부칙 제1조" : "부칙";
  return kind === "terms" && ed.ver
    ? html`<b>판 ${ed.ver}</b> (이 글을 게시한 날) · <b>시행일 ${eff}</b> (${note})`
    : html`<b>시행일 ${eff}</b> (${note})`;
}

/** 이전 판이 없을 때의 문장 — 처음 게시(약관) · 처음 만든 판(처리방침 — 부칙 둘째 문장과 같은 말) */
export const NO_PAST = {
  terms: "처음 게시한 판이라 이전 판이 없습니다.",
  privacy: "처음 만든 판이라 이전 판은 없습니다.",
};
