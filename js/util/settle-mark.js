/* ============================================================
   settle-mark.js — 정산 단계 **한 줄 상태 셀** (시안 'S-01 관리자 정산회계' · S-03 포털 정산회계 공용)

   상태 칸(명세서 동의 · 계산서 · 거래대금)은 줄을 한 줄로 두고 단계마다 기호 하나 + 낱말 하나만 적는다.
     끝난 단계   ✓ (초록)  + 회색 낱말   — 근거(동의 시각·수동/자동 · 작성일자 · 승인번호)는 title + .sr-only 로만
     지금 단계   ● (색 점) + 진한 낱말   — 기한·사유는 호출부가 따로 보여 준다(관리자 표의 '기한 · 비고' 칸)
     안 온 단계  -
   스타일은 css/components.css 의 `.settle-mark*` 블록이다(관리자·포털 공용 — 페이지 CSS 에 두면 암시적 의존).

   ⚠️ 세무 근거(동의 일시 · 수동/자동 · 작성일자)는 낱말 한 단어로 뭉개지 않는다(명세 3.4 '배지 + 날짜·구분').
      화면에서 숨겨도 `meta` 로 넘기면 마우스 올림(title)과 스크린리더(.sr-only)로 읽힌다 — 버리지 말 것.
   ============================================================ */
import { html } from "../dom.js";
import { icon } from "../icons.js";

/* "green"(S-03 추가). tone 을 비우면 **done 은 초록 ✓, live 는 회색 점**이다(시안 — 끝난 단계 ✓ 는 초록).
   회색 ✓(muted)는 실제 처리 없이 닫힌 완료(0원 달)에만 — 그때만 tone: "gray" 를 넘긴다.
   ⚠️ 예전엔 기본값이 kind 와 무관하게 "gray" 라 tone 을 안 넘긴 관리자 표(S-01)의 ✓ 가 전부 회색이었다(2026-10-16 검토). */
const TONES = new Set(["orange", "amber", "red", "gray", "green"]);

/**
 * settleMark({ kind, label, tone, meta, tip, sr }) → Html
 * @param {"done"|"live"|"none"} kind  끝난 단계 ✓ · 지금 단계 ● · 아직 안 온 단계 -
 * @param {string} label  상태 낱말(명세 정본 — '동의대기' · '발급완료' · '기한 초과' …)
 * @param {string} tone   live 점 색 orange|amber|red|gray|green(비우면 gray). done 은 비우면 초록 ✓ 이고,
 *                        "gray" 를 주면 체크도 회색이다(0원 달처럼 실제 처리 없이 닫힌 완료).
 * @param {string} meta   보이지 않는 근거 — title 과 .sr-only 에 같이 실린다(예: "10-10 13:00 · 자동").
 * @param {string} tip    title 만 따로 줄 때(없으면 meta 가 title 이다).
 * @param {string} sr     none 의 스크린리더 낱말(기본 "아직 아님").
 */
export function settleMark({ kind = "none", label = "", tone = "", meta = "", tip = "", sr = "" } = {}) {
  if (kind === "none") {
    return html`<span class="settle-mark settle-mark--none"><span aria-hidden="true">-</span><span class="sr-only">${sr || "아직 아님"}</span></span>`;
  }
  const t = TONES.has(tone) ? tone : kind === "done" ? "green" : "gray";
  const title = tip || meta;
  const cls = kind === "done"
    ? `settle-mark settle-mark--done ${t === "gray" ? "settle-mark--muted" : ""}`
    : `settle-mark settle-mark--live settle-mark--${t}`;
  return html`<span class="${cls}" ${title ? html`title="${title}"` : ""}>
    <span class="settle-mark__ic" aria-hidden="true">${kind === "done" ? icon("check", { size: 10 }) : ""}</span>
    <span class="settle-mark__t">${label}</span>${meta ? html`<span class="sr-only"> · ${meta}</span>` : ""}
  </span>`;
}
