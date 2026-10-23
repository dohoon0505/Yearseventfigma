/* ============================================================
   admin-settlement.js — 거래처 정산회계 (#/admin/settlement · 시안 'S-01 관리자 정산회계' 1차 2026-10-16 → 2차 같은 날 오후)

   위에서부터: 머리글 · 필터 카드(.bf-* — 상태 탭 5개 + 건수 · 귀속월 스테퍼 · 저번달/이번달 · 거래처 검색)
   · 정산 표(머리 한 줄 요약 + 8칸 한 줄 표 + 줄 펼침) · '월간 분석' 접힘 줄(펼치면 예전 분석 블록 그대로).
   예전엔 분석 블록과 요약 카드 3장이 표 위에 있어 1440x900 에서 표가 첫 화면에 안 보였다(1,501px 지점).

   ── 규칙 ──
   · 상태는 `settlementOf`(util/settlement.js) 값만 찍는다 — 화면이 날짜로 상태를 짐작하지 않는다(명세 6.6).
     '지금 고칠 수 있는지'도 `editable`·`editLockAt`·`lockReason` 값으로만 고른다(2차 시안 ① — 네 갈래 + 고쳐서 0원).
   · 단계 셀은 공용 `settleMark`(util/settle-mark.js — ✓ 끝남 · ● 지금 · - 아직). 끝난 단계의 근거(동의 시각·수동/자동 ·
     작성일자 · 승인번호 · 처리자)는 title + .sr-only 로 남긴다 — 세무 근거라 버리지 않는다. 지금 단계의 기한·사유는 '기한 · 비고' 칸.
   · 빨간 글씨는 **수정 마감 24시간 전부터**(고칠 수 있는 달) · **동의 마감 24시간 전부터**(수정 마감이 지난 달) · 기한 초과 ·
     동의 뒤 30분 넘게 계산서가 안 나간 달(2차 시안). 호박 글씨 = 약관 동의 전(자동 동의 안 함).
   · 자동 동의를 막는 것은 약관 동의 전 하나뿐이다(2026-10-23 운영자 결정 D1 — 예전 잠정 '고지 미도달 보류'(Q19)와 마감 당일 다시
     보내기는 걷어 냈다 · 마감 하루 전 안내가 닿지 않은 사실은 진행 기록에 글자로만 남는다).
   · 조치 필요 = `needsAction`(약관 동의 전으로 마감이 지난 달 · 계산서 발급 전에 머문 달 · 기한 초과 · 알림 수신자 없음) — 대쉬보드
     '정산 진행' 카드와 같은 판정이다. 그 카드의 '연락 필요' 칩·'조치 필요 열기' 는 지난달 한 달, '기한 초과' 칩만 최근
     6개월 전체의 OVERDUE 줄을 센다(사용자 결정 B — 지난달은 정산기한이 이번 달 말일이라 기한 초과가 될 수 없다). 이 표는
     언제나 한 달씩이다. 그 줄의 발급·입금 버튼은 채운 주황(수정 마감 임박은 조치 필요가 아니다 — 시안).
   · 처리 칸(⑬) — 버튼은 하나: AGREED '발급 처리' · ISSUED·OVERDUE '입금 확인'(작은 창 — util/settle-dialogs.js) ·
     고칠 수 있는 동의대기 달 '주문 고치기'(주문관리로 — 아래 넘겨주기). 버튼이 없는 줄은 낱말 + 이유(title · .sr-only):
     발행 전 · 동의 기다림 · 거래처 연락(약관 동의 전으로 마감이 지난 달) · 마감에 닫힘(고쳐서 0원 · 수정 마감 지남) · 처리 완료 · 처리 없음.
     쓰기가 성공하면 **그 줄만** 다시 그린다(펼침 상태 보존 · 포커스는 그 줄의 펼침 버튼으로).
   · 금액이 바뀐 달(②, s.changed — 동의·발급·입금 뒤에도 남는다)은 청구금액 옆 '바뀜' 칩 + 마우스 올림 한 줄
     (util/settlement `amountChangeLine` — 포털 명세서·정산과 같은 말)이다. 펼치면 맨 위에 '정산 금액 변경 기록' 카드(③ —
     `amountChangesOf` · 관리자 전용 · 언제 · 누가 · 어느 주문 · 그 주문이 보태던 금액 전 → 뒤 · 사유)가 붙는다 — 카드는 기록 줄이
     있으면 늘(되돌려 순변동 0 인 달도 증빙으로 · DATA.md Q4), 칩과 카드 머리 오른쪽 한 줄은 금액이 다를 때만.
   · 발급 뒤 고쳐서 0원이 된 달(zeroEdited)은 세 칸을 '0원 · 계산서 없음' 한 칸으로 — 마감까지 ● 동의대기, 마감 뒤 회색 ✓.
   · 줄 아무 데나 누르면 펼친다(onRowOpen 과 같은 가드 — 안쪽 컨트롤·드래그 선택은 비켜 간다). 키보드는 줄 끝의
     펼침 버튼이 맡는다 — 줄에 tabindex 를 달면 Tab 순서에 거래처 수만큼 끼어든다.
   · 내역이 다르다는 연락은 카카오톡 채널·고객센터로 받고 직원이 그 달 주문을 바로 고친다(2026-10-15 운영자 결정 · 창구는
     2026-10-23 결정 D5 — 약관에서도 '이의' 절차를 뺐다, D4) — 이 화면에 따로 절차·상태를 두지 않는다.
   · 담당자(조회 전용) 화면·띠, 이름 옆 '관리자 등록' 칩은 넣지 않는다(운영자 결정 6 · 결정 F — 2차 시안에 남아 있어도).
   · 명세서 문서(PDF · 공개 링크)는 util/invoice-data `invoiceDocData` 한 빌더다(포털 명세서·공개 열람 페이지와 같은 문서 —
     예전 이 파일의 `buildDoc` 사본은 지웠다). 공개 링크는 귀속월만 싣고 **열 때** 다시 만든다(명세 3.5 '열 때의 지금 값').

   ── 화면 사이 넘겨주기(session.js — 꺼내면 지운다) ──
   받기: takeFocusSection("admin-settlement") 가 "action" → '조치 필요' 탭으로 연다(대쉬보드 '조치 필요 열기').
         "action:YYYY-MM" → 그 달 · '조치 필요' 탭(대쉬보드 '기한 초과 N' 칩 — 기한 초과가 있는 가장 오래된 달).
         "period:YYYY-MM" + takeFocusClient("admin-settlement") → 그 달로 옮기고 그 줄을 펼쳐 화면에 보인다(주문 상세 '정산 귀속').
         두 'YYYY-MM' 꼴 모두 6개월 창 밖의 달이면 스테퍼 범위를 그 달까지 넓힌다.
   · 표 머리 '미입금' 은 util/settlement `isUnpaid`(명세서가 나간 달 전부 · 고쳐서 0원·거래 없음·발행 전 제외) — 월간 분석·대쉬보드와 같다.
   · 0원 주문만 있는 달은 내역서를 내지 않는다 — 거래 없는 달(NONE)과 같이 '거래 없음 · 명세서 없음' 한 칸이다(2026-10-22 운영자 결정 B).
     남는 '0원' 표시는 발급 뒤 고쳐서 0원이 된 달뿐이다.
   · 탈퇴한 거래처(2026-10-22 결정 A — '정지' 를 없애고 둔 상태)는 명세서가 있는 달의 줄만 남긴다(이름 옆 '탈퇴' 칩) — 탈퇴한 뒤의 달은
     발행 전·거래 없음뿐이라 줄을 두지 않는다.
   보내기: 처리 칸 '주문 고치기' · 펼침 처리 카드 '주문 고치기' · 품목 카드 '이 거래처 · M월 주문 고치기/보기'
         → setFocusClient("orders", id) + setFocusSection("orders", "deliver:YYYY-MM")(셋 다 같은 data-action="orders").
   ============================================================ */
import { html, setHTML, on, qs, qsa, raw, won } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { makeToast } from "../toast.js";
import { USAGE_CATEGORIES, DATA_NOW, WITHDRAWN } from "../data/admin-mock.js";
/* 정산 상태·청구 근거는 B2B 주문(배송일의 달)에서 파생한다(2026-10-16 — 주문과 정산 연결). 청구금액·펼친 품목·리포트가 같은 소스. */
import {
  settlementOf, settlementsMap, usageMap, billingEntriesOf, needsAction, isUnpaid, amountChangesOf, amountChangeLine,
  EINVOICE_MODE_WORD, overdueLateOf, OVERDUE_LATE_WORD, AMOUNT_CAUSE_WORD,
} from "../util/settlement.js";
import { printInvoiceFor } from "../util/invoice-data.js";
import { actorLabel } from "../util/actor.js";
import {
  periodOf, periodLabel, shiftPeriod, fmtMd, fmtMdHm, fmtKoShort, fmtKoShortTime, HOLD_LABEL, LOCK_REASON,
} from "../data/settlement-rules.js";
import { sharedBizKeys, normalizeBiz } from "../util/biz.js";
import { termsPending } from "../util/client.js";
import { buildMonthlyReport } from "../data/report.js";
import { issueLink, publicInvoiceUrl } from "../data/invoice-links.js";
import { printInvoiceDoc } from "../invoice-doc.js";
import { reportDoc } from "../report-doc.js";
import { setFocusClient, setFocusSection, takeFocusClient, takeFocusSection } from "../session.js";
import { settleMark } from "../util/settle-mark.js";
import { openIssueDialog, openPaymentDialog } from "../util/settle-dialogs.js";

const TABS = [
  { v: "all", label: "전체" },
  { v: "action", label: "조치 필요" },
  { v: "agree", label: "동의 전" },
  { v: "billing", label: "계산서 · 입금" },
  { v: "done", label: "정산완료" },
];
const HEADERS = [
  ["거래처", "name"], ["청구금액", "amt"], ["명세서 동의", ""], ["계산서", ""], ["거래대금", ""],
  ["기한 · 비고", ""], ["처리", "act"], ["링크 · PDF", "docs"],
];
/* 도넛/범례 9색 — 항목별(상품 9종) 비중이 겹치지 않도록 인접 대비 순으로 배치 */
const DONUT_VARS = ["var(--c-orange)", "var(--c-blue)", "var(--c-success)", "var(--ch-purple)", "var(--c-warn)", "var(--ch-cyan)", "var(--ch-pink)", "var(--ch-lime)", "var(--ch-slate)"];
const pad = (n) => String(n).padStart(2, "0");
const man = (n) => Math.round(n / 10000); // 만원 단위
const DAY = 864e5, MIN = 6e4;
const YM_RE = /^\d{4}-\d{2}$/;
const TOP_ITEMS = 4; // 품목을 다 펼치면 펼침이 표를 밀어낸다 — 나머지는 한 줄로 접는다
const monthOf = (ym) => Number(ym.slice(5, 7));
const modeWord = (m) => (m === "auto" ? "자동" : "수동");
/** 남은 시간 — "2일 3시간" · "3시간 20분" · "15분" */
function span(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mi}분` : `${mi}분`;
}
/** 지난 시간 — "2일" · "3시간" · "12분" */
function ago(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  return m >= 1440 ? `${Math.floor(m / 1440)}일` : m >= 60 ? `${Math.floor(m / 60)}시간` : `${m}분`;
}

/* KPI 전월 대비 증감 배지 (▲ 증가=레드워시 · ▼ 감소=블루워시 · 중립=그레이) */
function deltaBadge(delta, suffix = "원") {
  if (delta == null) return html`<span class="kpi__delta flat">전월 데이터 없음</span>`;
  if (delta === 0) return html`<span class="kpi__delta flat">지난달과 동일</span>`;
  const up = delta > 0;
  return html`<span class="kpi__delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(delta).toLocaleString("ko-KR")}${suffix}</span>`;
}

/* ── 단계 셀 — settlementOf 값만 읽는다 ───────────────────────────────
   반환: { kind, label, tone, meta(보이는 기한·사유 — 지금 단계면 '기한 · 비고' 칸에), tip, dtip('기한 · 비고' 칸만의 title), hot, amb }
   ⚠️ 1280 에서는 '기한 · 비고' 칸이 말줄임된다 — 그 칸의 title(dtip || tip)은 **보이는 낱말부터** 다시 말한다. */
const NONE = { kind: "none" };
/* 자동 동의되지 않은 달(약관 동의 전) 줄의 설명(⑫ — 펼침 처리 카드 · 마우스 올림이 같은 말을 한다) */
const HOLD_WHY = "마감이 지났지만 거래처가 직접 동의할 수 있습니다. 오래 동의하지 않으면 운영이 연락합니다. 수정 마감이 지나 금액은 고칠 수 없습니다.";
/* ── 정산 안내(T3 명세서 발급 안내 · T4 마감 하루 전 안내)를 '보냈다 / 못 보냈다 / 닿지 않았다' 고 말하는 판정 ──
   진행 기록 · '기한 · 비고' 마우스 올림 · 펼침 '고칠 수 있음' 줄이 **같은 판정**을 쓴다(settlementOf().notice · 2026-10-19).
   · 0원 주문만 있는 달은 내역서가 없어(NONE — 2026-10-22 결정 B) 진행 기록 자체가 없다. 고쳐서 0원이 된 달은 발급 때 금액이 있어 T3 이
     나갔고 T4 가 없다.
   · 마감 하루 전 안내가 닿지 않은 달(발송 실패 기록)도 마감에 평소대로 자동 동의된다 — 닿지 않은 사실만 글자로 남긴다(2026-10-23 운영자
     결정 D1 — 예전 마감 당일 다시 보내기·고지 미도달 보류는 걷어 냈다).
   이유는 글자로 적는다(사용자 결정 — '알림 수신자 없음' 줄과 같은 자리 · 같은 말투). */
const NOT_SENT = "알림 수신자 없음 · 안내를 보내지 못했습니다";
const reachOf = (ct) => !!ct && !!String(ct.phone || "").trim();
function t3Text(s, ct) {
  return reachOf(ct) ? `발급 안내 → ${ct.name} · ${won(s.issuedAmount)}` : NOT_SENT;
}
function t4Text(s, ct) {
  const t4 = s.notice && s.notice.t4;
  if (t4 && t4.why === "UNDELIVERED") return "마감 하루 전 안내가 닿지 않았습니다";
  return reachOf(ct) ? `마감 하루 전 안내 → ${ct.name} · 최종 ${won(s.amount)}` : NOT_SENT;
}
/** '기한 · 비고' 마우스 올림에 붙이는 안내 사정(수정 마감 뒤 · 동의 전 달). 닿았으면(또는 수신자 없음 — 칩이 말한다) "". */
function noticeTip(s, now) {
  const t4 = s.notice && s.notice.t4;
  if (!t4 || now.getTime() < t4.at.getTime() || t4.why !== "UNDELIVERED") return "";
  return "마감 하루 전 안내가 닿지 않았습니다";
}
function agreeStage(client, s, now) {
  if (s.status === "SCHEDULED") {
    return {
      kind: "live", label: "발급예정", tone: "gray", meta: `${fmtMdHm(s.issueAt)} 발행 · 주문 자유롭게 고침`,
      tip: `${fmtKoShortTime(s.issueAt)}에 명세서가 발행됩니다 · 발행 전이라 이 달 주문을 자유롭게 고칩니다`,
    };
  }
  if (s.status === "AWAITING_AGREEMENT") {
    const dl = fmtKoShortTime(s.deadline);
    const lk = fmtKoShortTime(s.editLockAt);
    /* 마감이 지났는데 자동 동의되지 않은 달(명세 6.6 autoAgreeHold — 약관 동의 전 하나뿐 · 2026-10-23 결정 D1) — 낱말은
       settlement-rules HOLD_LABEL 한 벌. 약관 동의 전은 보류가 아니라 의제 조항이 없는 것이다 — 그래서 상태 낱말도 '동의대기' 다
       (2차 시안의 '동의 보류' 통일은 받지 않았다). 칸에는 시안대로 '{이유} · 마감 뒤 직접 동의 가능' 을 늘 보인다(⑫). */
    if (s.autoAgreeHold) {
      const word = HOLD_LABEL[s.autoAgreeHold];
      const meta = `${word.split(" · ")[0]} · 마감 뒤 직접 동의 가능`;
      return {
        kind: "live", label: "동의대기", tone: "amber", meta, amb: true,
        tip: `${word} · 마감 뒤 직접 동의 가능 — 마감 ${dl} 지남 · 오래 동의하지 않으면 운영이 연락합니다 · 수정 마감이 지나 금액은 고칠 수 없습니다`,
      };
    }
    /* 약관 동의 전 거래처의 마감 전 달 — 마감이 와도 자동 동의되지 않는다는 것을 미리 말한다. 고칠 수 있으면 수정 마감을,
       지나면 정본 낱말 '자동 동의 안 함' + 동의 마감을(시안의 '자동 동의 제외' 는 명세에 없는 낱말이라 받지 않았다). */
    if (termsPending(client)) {
      return {
        kind: "live", label: "동의대기", tone: "orange", amb: true,
        meta: s.editable ? `약관 동의 전 · 수정 마감 ${fmtMdHm(s.editLockAt)}` : `${HOLD_LABEL.TERMS_NOT_AGREED} · 마감 ${fmtMdHm(s.deadline)}`,
        tip: `${HOLD_LABEL.TERMS_NOT_AGREED} — 마감 ${dl} · 약관에 동의하기 전에는 마감에 자동 동의되지 않습니다 · ${s.editable ? `수정 마감 ${lk}까지 주문을 고칠 수 있습니다` : `수정 마감 ${lk} 지남 · 금액 고정`}`,
      };
    }
    /* 고칠 수 있음(동의 전 · 수정 마감 전) — 빨강은 수정 마감 24시간 전부터 */
    if (s.editable) {
      const left = s.editLockAt.getTime() - now.getTime();
      const soon = left <= DAY;
      return {
        kind: "live", label: "동의대기", tone: "orange", hot: soon,
        meta: soon ? `고칠 수 있음 · 수정 마감까지 ${span(left)}` : `고칠 수 있음 · 수정 마감 ${fmtMdHm(s.editLockAt)}`,
        tip: `고칠 수 있음 · 수정 마감 ${lk}까지 주문을 고칠 수 있습니다 · 동의 마감 ${dl}`,
      };
    }
    /* 수정 마감 지남(금액 고정) — 빨강은 동의 마감 24시간 전부터 */
    const left = s.deadline.getTime() - now.getTime();
    /* 13:00:00 정각은 아직 열려 있다(agreementState 와 같다) — 지난 것은 그 뒤부터 */
    if (left < 0) return { kind: "live", label: "동의대기", tone: "orange", meta: `마감 ${fmtMdHm(s.deadline)} 지남`, hot: true, tip: `마감 ${dl}` };
    const soon = left <= DAY;
    /* 마감 하루 전 안내가 닿지 않은 달도 마감에 자동 동의된다(2026-10-23 결정 D1) — 닿지 않은 사실만 덧붙인다 */
    const nt = noticeTip(s, now);
    return {
      kind: "live", label: "동의대기", tone: "orange", hot: soon,
      meta: soon ? `수정 마감 지남 · 동의 마감까지 ${span(left)}` : `수정 마감 지남 · 동의 마감 ${fmtMdHm(s.deadline)}`,
      tip: `수정 마감 지남 · 금액 고정 — 수정 마감 ${lk}${nt ? ` · ${nt}` : ""} · 마감 ${dl}에 자동 동의됩니다`,
    };
  }
  if (s.mode) {
    const meta = `${fmtMdHm(s.agreedAt)} · ${modeWord(s.mode)}`;
    return { kind: "done", label: "동의완료", meta, tip: `${meta} · 금액 고정 · 조정은 수정계산서로` };
  }
  return NONE;
}
function invStage(s, now) {
  if (s.status === "AGREED") {
    const d = now.getTime() - s.agreedAt.getTime();
    /* 정상이면 아주 짧게 지나간다. 30분을 넘겨 머물면 발급이 실패한 달(T15 로 알린다 — 표에 '실패' 표시는 두지 않는다 M59). */
    return d < 30 * MIN
      ? { kind: "live", label: "발급 중", tone: "gray", meta: `동의 후 ${ago(d)}` }
      : { kind: "live", label: "발급 전", tone: "amber", meta: `동의 후 ${ago(d)}`, hot: true, tip: `${fmtKoShortTime(s.agreedAt)} ${modeWord(s.mode)} 동의 · 계산서가 발급되지 않았습니다` };
  }
  if (s.einvoice) {
    const by = s.einvoice.mode !== "auto" ? actorLabel(s.einvoice.by) : "";
    /* 방식 낱말은 한 벌(EINVOICE_MODE_WORD) — 자동 발급은 따로 적지 않는다(기본), 다시 시도·직접 입력은 적는다. */
    const no = `승인번호 ${s.einvoice.no}${s.einvoice.mode !== "auto" ? ` · ${EINVOICE_MODE_WORD[s.einvoice.mode] || ""}` : ""}${by ? ` · ${by}` : ""}`;
    return { kind: "done", label: "발급완료", meta: `작성 ${fmtMd(s.docDate)} · ${no}` , vis: `작성 ${fmtMd(s.docDate)}` };
  }
  return NONE;
}
function payStage(s, now) {
  if (s.status === "PAID" && s.paidAt) {
    const by = actorLabel(s.paidBy);
    return { kind: "done", label: "입금완료", meta: `${fmtMd(s.paidAt)} 입금 확인`, tip: `${fmtKoShortTime(s.paidAt)} 입금 확인${by ? ` · ${by}` : ""}` };
  }
  /* 기한 초과가 된 시각은 overdueFrom = max(정산기한 다음 날 10:00, 계산서 발급 시각) — 계산서가 정산기한 뒤에 나온 달은 발급
     순간 기한 초과다(명세 3.4 · M39 · Q36 잠정). 'N일 지남' 도 그 시각부터 센다(입금 확인 창과 같은 값). */
  if (s.status === "OVERDUE") {
    const from = s.overdueFrom || s.overdueAt;
    const late = overdueLateOf(s);
    const days = Math.max(1, Math.floor((now.getTime() - from.getTime()) / DAY));
    return {
      kind: "live", label: "기한 초과", tone: "red", meta: `${days}일 지남`, hot: true,
      tip: `정산기한 ${fmtKoShort(s.dueAt)} · ${fmtKoShortTime(from)}부터 기한 초과${late ? ` · ${OVERDUE_LATE_WORD[late]}` : ""}`,
    };
  }
  if (s.status === "ISSUED") return { kind: "live", label: "미입금", tone: "gray", meta: `기한 ${fmtMd(s.dueAt)}`, tip: `정산기한 ${fmtKoShort(s.dueAt)} · ${fmtKoShortTime(s.overdueFrom || s.overdueAt)}부터 기한 초과` };
  return NONE;
}
/* 0원으로 닫힌 달 — 발행 뒤 고쳐서 0원(zeroEdited, 줄이 다 빠진 달 포함)이 마감에 닫힌 달. 0원 주문만 있는 달은 내역서가 없어(NONE —
   2026-10-22 결정 B) 여기 들지 않는다. */
const zeroClosed = (s) => s.zeroEdited && s.status === "PAID";
/** 세 칸 + '기한 · 비고'(지금 단계의 기한·사유 — 없으면 마지막으로 끝난 단계). 고쳐서 0원인 달·거래 없는 달은 세 칸을 한 칸으로. */
function stagesOf(client, s, now) {
  /* 거래가 없거나 0원 주문만 있는 달(NONE — 내역서를 내지 않는다) */
  if (s.status === "NONE") return { merged: { none: true, text: "거래 없음 · 명세서 없음" }, cur: null };
  if (zeroClosed(s)) {
    const meta = "고쳐서 0원 · 계산서 없이 닫힘";
    const z = { kind: "done", label: "0원 · 계산서 없음", tone: "gray", meta, tip: "동의 · 계산서 · 입금 없이 입금완료 처리된 달입니다. 실제 입금은 없습니다", dtip: `${meta} · 실제 입금은 없습니다` };
    return { merged: z, cur: z };
  }
  /* 발행 뒤 고쳐서 0원 — 마감까지 동의대기(동의는 받지 않는다), 마감에 계산서 없이 닫힌다(명세 3.4 '마감 전 수정' 9).
     세 칸은 한 칸으로만 그린다(시안 데이터는 계산서·거래대금 칸을 또 그려 다섯 칸이 됐다 — 결함이라 받지 않았다). */
  if (s.zeroEdited) {
    const meta = s.editable
      ? `${fmtMdHm(s.deadline)} 마감에 계산서 없이 닫힘 · 수정 마감 ${fmtMdHm(s.editLockAt)}`
      : `${fmtMdHm(s.deadline)} 마감에 계산서 없이 닫힘`;
    const z = { kind: "live", label: "0원 · 계산서 없음", tone: "gray", meta, tip: "발급 뒤 고쳐서 0원이 된 달입니다. 동의 · 계산서 · 입금 없이 닫힙니다", dtip: `${meta} · 발급 뒤 고쳐서 0원이 된 달입니다` };
    return { merged: z, cur: z };
  }
  const cells = [agreeStage(client, s, now), invStage(s, now), payStage(s, now)];
  const cur = cells.find((c) => c.kind === "live") || [...cells].reverse().find((c) => c.kind === "done") || null;
  return { cells, cur };
}

/** 처리 칸(⑬ — 2차 시안). 버튼은 하나(지금 상태에서 하는 일), 버튼이 없는 줄은 낱말 + 이유(tip — title · .sr-only).
 *  예전의 '연락 필요'(조치 필요 줄 전부)·'동의 후 처리'·'발행 후 처리' 는 시안 낱말로 바뀌었다 — 약관 동의 전으로 마감이 지난 달만
 *  '거래처 연락'(autoAgreeHold — 2026-10-23 결정 D1 부터 약관 하나). */
function actOf(client, s) {
  if (s.status === "AGREED") return { btn: "issue", label: "발급 처리", full: "계산서 발급 처리" };
  if (s.status === "ISSUED" || s.status === "OVERDUE") return { btn: "pay", label: "입금 확인", full: "입금 확인" };
  if (s.status === "NONE") return { text: "처리 없음", tip: "거래가 없는 달은 명세서 · 계산서 · 입금이 없습니다" };
  if (zeroClosed(s)) return { text: "처리 없음", tip: "고쳐서 0원이 된 달은 동의 · 계산서 · 입금 처리가 없습니다" };
  if (s.status === "SCHEDULED") return { text: "발행 전", tip: `${fmtKoShortTime(s.issueAt)} 발행 · 주문은 자유롭게 고칩니다` };
  if (s.status === "PAID") return { text: "처리 완료", tip: "" };
  if (s.autoAgreeHold) return { text: "거래처 연락", tip: "마감 뒤에도 거래처가 직접 동의할 수 있습니다 · 오래 동의하지 않으면 운영이 연락합니다" };
  /* 동의대기 · 수정 마감 전(고쳐서 0원인 달 포함) — 배송일이 그 달인 주문을 걸러 주문관리로 연다 */
  if (s.editable) return { btn: "orders", label: "주문 고치기", full: "주문 고치기" };
  if (s.zeroEdited) return { text: "마감에 닫힘", tip: s.lockReason };
  return {
    text: "동의 기다림",
    tip: termsPending(client)
      ? `${s.lockReason} · 약관 동의 전이라 마감에 자동 동의되지 않습니다`
      : `${s.lockReason} · ${fmtKoShortTime(s.deadline)}에 자동 동의`,
  };
}

/** 펼침 '처리' 카드 첫 줄 — 이 달을 지금 고칠 수 있는지(①). settlementOf 의 editable · editLockAt · lockReason 에서 문구만 고른다.
 *  거래 없는 달(NONE)은 줄을 두지 않는다(null). 못 고치는 이유는 정본 LOCK_REASON 그대로(화면이 지어내지 않는다). */
function editRowOf(client, s, now) {
  if (s.status === "NONE") return null;
  if (zeroClosed(s)) return { name: "0원 · 계산서 없이 닫힌 달", why: LOCK_REASON.zero, can: false };
  if (s.status === "SCHEDULED") {
    return { name: "발급 전 · 자유롭게 고침", why: `명세서 발행(${fmtKoShortTime(s.issueAt)}) 전입니다. 이 달 주문을 자유롭게 고치고, 발행 때의 값이 청구금액이 됩니다.`, can: true };
  }
  if (s.status === "AWAITING_AGREEMENT") {
    const lk = fmtKoShortTime(s.editLockAt);
    if (s.zeroEdited) {
      return s.editable
        ? { name: `0원 · 수정 마감 ${lk}까지 고칠 수 있음`, why: `지금 금액이 0원입니다. 그대로면 ${fmtKoShortTime(s.deadline)} 마감에 계산서 없이 닫힙니다. 수정 마감 전이라 주문을 고치면 금액이 다시 생길 수 있습니다.`, can: true }
        : { name: "0원 · 마감에 계산서 없이 닫힘", why: s.lockReason, can: false };
    }
    if (s.editable) {
      /* '안내를 보낸다' 는 말은 진행 기록 · 발급 처리 창과 같은 판정으로 — 알림 수신자가 없으면 '나간다' 고 말하지 않는다. */
      const notice = s.noRecipient ? "알림 수신자가 없어 마감 하루 전 안내는 나가지 않습니다." : "수정 마감 시각에 마감 하루 전 안내가 최종 금액으로 나갑니다.";
      return { name: `고칠 수 있음 · 수정 마감 ${lk}`, why: `동의 전 · 수정 마감 전입니다. 주문을 고치면 청구금액과 거래처가 보는 명세서가 바로 바뀝니다. ${notice}`, can: true };
    }
    return { name: "수정 마감 지남 · 금액 고정", why: s.lockReason, can: false };
  }
  return { name: "동의됨 · 금액 고정", why: s.lockReason || LOCK_REASON.agreed, can: false };
}

/** 펼침 '처리' 카드 — 동작마다 [할 수 있나, 그 이유]. 못 하는 이유는 글자로 그 자리에서 말한다(마우스 올림에 숨기지 않는다). */
function availOf(s) {
  let issue, pay;
  if (s.status === "NONE") issue = [false, "거래가 없는 달은 명세서가 없습니다"];
  /* 고쳐서 0원이 된 달 — 마감 전이면 '마감에 닫힌다', 닫혔으면 '계산서가 없다' */
  else if (s.zeroEdited && s.status !== "PAID") issue = [false, "0원이면 마감에 계산서 없이 닫힙니다"];
  else if (zeroClosed(s)) issue = [false, "0원 달은 계산서가 없습니다"];
  else if (s.status === "AGREED") issue = [true, `${fmtMdHm(s.agreedAt)} ${modeWord(s.mode)} 동의 · 계산서가 아직 발급되지 않았습니다`];
  else if (s.einvoice) issue = [false, `발급완료 · 승인번호 ${s.einvoice.no}${s.einvoice.mode !== "auto" ? ` · ${EINVOICE_MODE_WORD[s.einvoice.mode] || ""}` : ""}`];
  else if (s.status === "SCHEDULED") issue = [false, `명세서 발행 전입니다 — ${fmtKoShortTime(s.issueAt)}에 발급됩니다`];
  else issue = [false, "동의 전에는 계산서를 발급할 수 없습니다"];
  if (s.status === "NONE") pay = [false, "청구할 금액이 없는 달입니다"];
  else if (s.zeroEdited) pay = [false, "0원 달은 입금 없이 입금완료 처리됩니다"];
  else if (s.status === "ISSUED" || s.status === "OVERDUE") pay = [true, `${won(s.amount)} 전액 · 정산기한 ${fmtKoShort(s.dueAt)}`];
  else if (s.status === "PAID" && s.paidAt) {
    const by = actorLabel(s.paidBy);
    pay = [false, `${fmtKoShortTime(s.paidAt)} 입금 확인${by ? ` · ${by}` : ""}`];
  } else pay = [false, "계산서 발급 뒤에 입금을 확인합니다"];
  return { issue, pay };
}

/** 펼침 '진행 기록' — 발행 · 정산 금액 변경 · 수정 마감 · 마감(약관 동의 전 — 자동 동의 안 함) · 동의 · 발급 · 기한 초과 · 입금 · 고쳐서 0원 닫힘. 시간순.
 *  `lines` = amountChangesOf(…).lines(관리자 전용 — 처리자 · 전후 금액). 처리자 표기는 util/actor `actorLabel`('이름(부서)'). */
function logOf(client, s, ct, now, lines) {
  const L = [];
  const reach = reachOf(ct);
  /* 안내(T3 발급 · T4 마감 하루 전 · T6 발급 · T8 기한 지남)는 모두 같은 판정이다 — 알림 수신자가 없으면 '보냄' 이라고 말하지 않는다
     (같은 카드에서 발행 줄은 '보내지 못했습니다', 발급 줄은 '보냄' 이라고 갈리던 결함 — 2026-10-16 검토). T4 는 거기에 발송 실패
     기록을 더 본다(t4Text). 0원 주문만 있는 달은 NONE 이라 기록이 없다(2026-10-22 결정 B — 예전 '0원 달이라 발급 안내는 보내지
     않습니다' 줄은 그런 달이 표에 서지 않아 지웠다). */
  if (s.status === "SCHEDULED") L.push([s.issueAt, "명세서 발행 예정", "자동"]);
  else if (s.status === "NONE") return [];
  else L.push([s.issueAt, "명세서 발행", t3Text(s, ct)]);
  (lines || []).forEach((l) => {
    /* 배송완료 처리(명세서가 나간 뒤 배송완료가 된 주문을 그 달에 더함 — 2026-10-23 운영자 결정 D3)는 금액만으로는 까닭을 알 수 없어 낱말을 붙인다. */
    const cw = AMOUNT_CAUSE_WORD[l.cause];
    L.push([l.at, `정산 금액 변경 · ${l.orderNo}${cw ? ` · ${cw}` : ""}`, `${actorLabel(l.by) || "처리자 기록 없음"} · ${won(l.before)} → ${won(l.after)}`]);
  });
  /* 수정 마감(= T4 발송 시각) — 그 시각에 아직 동의 전이었던 달만(수정 마감 전에 직접 동의한 달은 T4 가 없다 · 명세 3.4).
     고쳐서 0원이 된 달은 T4 를 보내지 않는다(명세 3.4 예외표 — T4·T5·T6 없음). */
  if (s.issued && s.editLockAt && now.getTime() >= s.editLockAt.getTime()
      && (!s.agreedAt || s.agreedAt.getTime() >= s.editLockAt.getTime())) {
    if (s.zeroEdited) L.push([s.editLockAt, "수정 마감 · 0원 확정", "0원 달이라 마감 하루 전 안내는 보내지 않습니다"]);
    else {
      /* 닿지 않음(발송 실패 기록)은 settlementOf().notice — '기한 · 비고' 마우스 올림(noticeTip)과 같은 판정. 닿지 않았어도 다시
         보내지 않고 마감에 평소대로 자동 동의한다(2026-10-23 결정 D1 — 예전 '마감 당일 · 안내 다시 보내기' 줄은 걷어 냈다). */
      L.push([s.editLockAt, "수정 마감 · 금액 고정", t4Text(s, ct)]);
    }
  }
  /* 마감 때 약관 동의 전이라 자동 동의하지 않은 달 — `heldAtDeadline`(settlementOf 파생)으로 본다. autoAgreeHold 는 '지금 그런 달' 이라
     거래처가 마감 뒤 직접 동의하면 null 이 되고, 그것으로 그리던 때는 이 줄이 통째로 사라져 '마감 → 거래처 동의' 사이의 사정이 기록에서
     빠졌다(실측). */
  if (s.heldAtDeadline && now.getTime() > s.deadline.getTime()) {
    L.push([s.deadline, "마감 · 자동 동의 안 함", HOLD_LABEL[s.heldAtDeadline].split(" · ")[0]]);
  }
  /* 거래처 동의 줄에는 사람 이름을 적지 않는다 — 동의는 계정이 했고 누가 눌렀는지는 기록이 없다(2차 시안의 담당자 이름은 받지 않았다). */
  if (s.agreedAt) L.push([s.agreedAt, s.mode === "auto" ? "자동 동의" : "거래처 동의", s.mode === "auto" ? "마감 시각" : ""]);
  if (s.einvoice) {
    const m = s.einvoice.mode;
    const how = m === "manual" ? "직접 입력" : m === "retry" ? "다시 시도" : "자동";
    const by = m !== "auto" ? actorLabel(s.einvoice.by) : "";
    /* 직접 입력은 적은 발급 시각(at)과 기록한 시각(recordedAt)이 다르다 — 발급 안내(T6)는 기록한 순간에 나간다(M39). 다른 방식과 같은
       판정으로 T6 를 말하고(예전엔 직접 입력만 말하지 않아 창·토스트의 '계산서 발급 안내를 보냈습니다' 와 갈렸다 — 검토 10), 기록 시각이
       다르면 함께 적는다. */
    const rec = m === "manual" && s.einvoice.recordedAt && fmtMdHm(s.einvoice.recordedAt) !== fmtMdHm(s.einvoice.at)
      ? ` · ${fmtMdHm(s.einvoice.recordedAt)} 기록` : "";
    const howBy = `${how}${rec}${by ? ` · ${by}` : ""}`;
    L.push([s.einvoice.at, "계산서 발급", reach ? `${howBy} · 발급 안내 보냄` : `${howBy} · ${NOT_SENT}`]);
  }
  /* 기한 초과가 **된** 시각(overdueFrom = max(정산기한 다음 날 10:00, 계산서가 시스템에 생긴 시각 — 직접 입력은 기록한 시각)).
     계산서가 정산기한 뒤에 나온 달은 발급 순간 기한 초과라 이 줄이 '계산서 발급' 줄 뒤에 선다(예전엔 기한 초과 11-01 10:00 이 계산서
     발급 11-02 10:30 보다 앞에 섰다 — 계산서가 없는 동안에는 기한 초과가 될 수 없다 · 명세 3.4 · M39). 그때 T8 은 T6 과 함께 간다.
     직접 입력을 기한 뒤에 기록했으면 적은 발급 시각이 그 전이어도 기록한 순간이다(overdueLateOf "record" — 검토 4). */
  const ovf = s.overdueFrom;
  if (s.einvoice && ovf && now.getTime() >= ovf.getTime() && (s.status === "OVERDUE" || (s.paidAt && s.paidAt.getTime() >= ovf.getTime()))) {
    const late = overdueLateOf(s);
    const lateWord = late === "record" ? "정산기한 뒤에 기록" : "정산기한 뒤에 발급";
    L.push([ovf, "기한 초과", !reach ? NOT_SENT : late ? `${lateWord} · 입금 기한 지남 안내를 발급 안내와 함께 보냄` : "입금 기한 지남 안내 보냄"]);
  }
  if (s.paidAt) L.push([s.paidAt, "입금 확인", actorLabel(s.paidBy)]);
  if (zeroClosed(s)) L.push([s.zeroCloseAt || s.deadline, "마감 · 0원이라 계산서 없이 닫힘", "자동"]);
  return L.sort((a, b) => a[0] - b[0]).map(([t, what, who]) => ({ t: fmtMdHm(t), what, who }));
}

/** 그 달 청구 근거 — 명세서 행(billingEntriesOf)과 **같은 집합**이라 합이 곧 청구금액이다(명세 3.4).
 *  주문 줄은 품목별로 묶고, 취소 수수료 줄은 묶지 않고 **한 줄씩** 따로 세운다(⑥ — '수수료' 표지 + 주문번호 + 취소일).
 *  usageFor(도넛·리포트)의 '취소 수수료' 품목 묶음은 그대로다. */
function itemsOf(client, ym) {
  const m = new Map();
  const fees = [];
  billingEntriesOf(client, ym).forEach((e) => {
    if (e.kind === "cancelFee") { fees.push(e); return; }
    const it = m.get(e.product) || { name: e.product, count: 0, amount: 0 };
    it.count += 1;
    it.amount += e.amount;
    m.set(e.product, it);
  });
  const products = [...m.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ko"));
  return { products, fees };
}

/* 내보낼 명세서가 있는 달 — 발행 전(SCHEDULED)도 거래 없는 달(NONE)도 아니다. 포털 명세서(invoice.js `docsLocked`)와 같은 판정.
   ⚠️ `s.empty` 로 보면 안 된다 — 발행 뒤 취소·삭제로 줄이 다 빠진 달(고쳐서 0원 · zeroEdited)도 empty 지만 거래처가 받은
   명세서가 있다. 예전 `issued && !empty` 는 그 달을 '발행 전 · 명세서 발행 전입니다 — …에 발급됩니다' 라고 잘못 말하고
   PDF·링크를 잠갔다(포털은 같은 달을 내려받는다 — 2026-10-16 검토 실측). */
const hasDoc = (s) => s.status !== "SCHEDULED" && s.status !== "NONE";
/* 이 달 주문을 지금 고칠 수 있는가 — 거래 없는 달(NONE)은 editable 이어도 고칠 주문이 없다(들어오는 주문도 막힌다 · 사용자 답 3). */
const canEdit = (s) => s.editable && s.status !== "NONE";
/* 버튼 이름·토스트·PDF 파일명에 쓰는 거래처 이름 — 이름 옆 칩과 같은 규칙으로 사업자번호를 공유하는 거래처만 계정 구분을 붙인다.
   회사명만 쓰면 한빛과학(주)(C001)과 한빛과학(주) 연구소 계정(C027)의 버튼이 '한빛과학(주) 9월 입금 확인' 으로 똑같이 읽힌다. */
const rowName = (r) => (r.shared && r.client.department ? `${r.client.companyName} ${r.client.department}` : r.client.companyName);

export function mount(root, { nav }) {
  const toast = makeToast();
  const curYm = periodOf(DATA_NOW); // 목데이터 창(최근 6개월)의 기준 — 모듈은 재평가되지 않으므로 DATA_NOW 를 쓴다
  const lastYm = shiftPeriod(curYm, -1);
  /* 기본은 **저번달** — 명세서가 나가 동의·계산서·입금이 진행 중인 달이다(이번 달은 전부 발급예정). 대쉬보드 '정산 진행'
     카드와 '조치 필요' 칩도 같은 달을 센다. */
  const state = { ym: lastYm, tab: "all", q: "", expanded: new Set(), anaOpen: false };
  let minYm = shiftPeriod(curYm, -5);
  let maxYm = curYm;

  /* ── 다른 화면이 넘겨준 것(1회) ──
     "action"              → 기본 달(저번달) · '조치 필요' 탭(대쉬보드 '조치 필요 열기')
     "action:YYYY-MM"      → 그 달 · '조치 필요' 탭(대쉬보드 '기한 초과 N' 칩 — 기한 초과가 있는 가장 오래된 달)
     "period:YYYY-MM" + 거래처 → 그 달 · 그 줄 펼침(주문 상세 '정산 귀속') */
  const focusSec = takeFocusSection("admin-settlement");
  const focusCid = takeFocusClient("admin-settlement");
  let scrollTo = null;
  if (focusSec === "action") state.tab = "action";
  else if (focusSec && /^(period|action):/.test(focusSec)) {
    const [kind, ym] = focusSec.split(":");
    if (YM_RE.test(ym)) {
      state.ym = ym;
      /* 배송을 예약한 다음 달처럼 6개월 창 밖의 달도 열 수 있게 스테퍼 범위를 넓힌다. */
      if (ym < minYm) minYm = ym;
      if (ym > maxYm) maxYm = ym;
      if (kind === "action") state.tab = "action";
      else if (focusCid && store.get().clients.some((c) => c.id === focusCid)) { state.expanded.add(focusCid); scrollTo = focusCid; }
    }
  }

  /* ── 데이터 ── */
  /* 탈퇴한 거래처(2026-10-22 결정 A)는 **명세서가 있는 달**의 줄만 남긴다 — 지난 달 정산 기록은 그대로 보여야 하고(이름 옆 '탈퇴' 칩),
     탈퇴한 뒤의 달은 발행 전·거래 없음뿐이라(탈퇴는 끝나지 않은 정산이 있으면 할 수 없고 b2b-mock 은 탈퇴한 달부터 시드 주문을 만들지
     않는다) 줄을 두면 '발행 전 · M월 1일 10:00 발행' 처럼 닫힌 계정에 일어나지 않을 일을 말한다. */
  const goneRow = (c, s) => c.status === WITHDRAWN && (s.status === "SCHEDULED" || s.status === "NONE");
  function periodRows(now = new Date()) {
    const clients = store.get().clients;
    const shared = sharedBizKeys(clients);
    return clients.map((c) => {
      const s = settlementOf(c, state.ym, now);
      return goneRow(c, s) ? null : { client: c, s, need: needsAction(s), shared: shared.has(normalizeBiz(c.bizNumber)) };
    }).filter(Boolean);
  }
  const inTab = (tab, r) =>
    tab === "all"
    || (tab === "action" && r.need)
    || (tab === "agree" && (r.s.status === "SCHEDULED" || r.s.status === "AWAITING_AGREEMENT"))
    || (tab === "billing" && (r.s.status === "AGREED" || r.s.status === "ISSUED" || r.s.status === "OVERDUE"))
    || (tab === "done" && r.s.status === "PAID");
  const matchQ = (r, q) => !q || r.client.companyName.includes(q) || (r.client.department || "").includes(q);
  const visibleRows = (rows) => {
    const q = state.q.trim();
    return rows.filter((r) => inTab(state.tab, r) && matchQ(r, q));
  };
  const rowOf = (cid, now = new Date()) => {
    const c = store.get().clients.find((x) => x.id === cid);
    if (!c) return null;
    const s = settlementOf(c, state.ym, now);
    return { client: c, s, need: needsAction(s), shared: sharedBizKeys(store.get().clients).has(normalizeBiz(c.bizNumber)) };
  };

  /* 선택 월 분석 데이터 (월간 분석 · 리포트 공용) — 상태탭/검색과 무관 */
  function reportFor() {
    const cs = store.get().clients;
    const [y, m] = state.ym.split("-").map(Number);
    return buildMonthlyReport({
      year: y, month: m,
      clients: cs,
      usage: usageMap(cs), settlements: settlementsMap(cs), categories: USAGE_CATEGORIES,
    });
  }

  /* ── 월간 분석(예전 분석 블록 그대로 — 표 아래 접힌 줄로 내렸다) ── */
  function kpiCards(r) {
    return html`
      <div class="kpis">
        <div class="kpi"><span class="kpi__lbl">총 이용금액</span><div class="kpi__val num">${won(r.total)}</div>${deltaBadge(r.deltaTotal)}</div>
        <div class="kpi"><span class="kpi__lbl">주문 건수</span><div class="kpi__val num">${r.orders}건</div>${deltaBadge(r.deltaOrders, "건")}</div>
        <div class="kpi"><span class="kpi__lbl">이용 거래처</span><div class="kpi__val num">${r.activeClients}곳</div><span class="kpi__delta flat">전체 ${r.clientCount}곳 중</span></div>
        <div class="kpi"><span class="kpi__lbl">미입금액</span><div class="kpi__val num ${r.settle.unpaidAmount > 0 ? "warn" : ""}">${won(r.settle.unpaidAmount)}</div><span class="kpi__delta flat">정산 완료율 ${r.settle.paidRate}%</span></div>
      </div>
    `;
  }
  function insightCard(r) {
    const mm = monthOf(state.ym);
    let headline;
    if (r.deltaTotal == null) headline = html`<b>${mm}월</b> 총 이용금액은 <b class="num">${won(r.total)}</b>이에요`;
    else if (r.deltaTotal === 0) headline = html`총 이용금액이 지난달과 <b class="num">같아요</b> (${won(r.total)})`;
    else if (r.deltaTotal > 0) headline = html`총 이용금액이 지난달보다<br /><span class="up num">${won(r.deltaTotal)}</span> 늘었어요`;
    else headline = html`총 이용금액이 지난달보다<br /><span class="down num">${won(Math.abs(r.deltaTotal))}</span> 줄었어요`;
    const max = Math.max(...r.trend.map((t) => t.total), 1);
    return html`
      <div class="acard">
        <div class="acard__head"><b>월간 인사이트</b><span class="acard__hint">최근 6개월 · 만원</span></div>
        <div class="acard__body">
          <p class="headline">${headline}</p>
          <div class="bars" role="img" aria-label="최근 6개월 이용금액 추이">
            ${r.trend.map((t) => {
              const h = Math.max(10, Math.round((t.total / max) * 188));
              return html`<div class="bar ${t.isCurrent ? "cur" : ""}"><span class="bar__v num">${t.total === 0 ? "—" : man(t.total)}</span><span class="bar__c" style="height:${h}px"></span><span class="bar__l">${t.short}</span></div>`;
            })}
          </div>
        </div>
      </div>
    `;
  }
  /* 거래처별 이용 랭킹 — 막대 길이 = 전체 대비 이용 비중(share%) */
  function clientRankCard(r) {
    const RANK_LIMIT = 10;
    const top = r.affiliates.slice(0, RANK_LIMIT);
    const hint = r.affiliates.length > RANK_LIMIT
      ? `상위 ${RANK_LIMIT}곳 · 전체 ${r.affiliates.length}곳`
      : (r.affiliates[0] ? `최다 이용 거래처: ${r.affiliates[0].name}` : "");
    return html`
      <div class="acard">
        <div class="acard__head"><b>거래처별 이용 현황</b>${hint ? html`<span class="acard__hint">${hint}</span>` : ""}</div>
        <div class="acard__body" style="padding-top:12px;">
          ${top.map(
            (a, i) => html`
              <div class="rank">
                <span class="rank__no ${i < 3 ? "top" : ""}">${i + 1}</span>
                <span class="rank__name">${a.name}</span>
                <span class="rank__track"><span class="rank__bar" style="width:${Math.max(4, a.share)}%"></span></span>
                <span class="rank__amt num">${won(a.total)}</span>
                <span class="rank__share num">${a.share}%</span>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }
  function donutSvg(r) {
    const R = 44, CX = 62, CY = 62, SW = 24, CIRC = 2 * Math.PI * R;
    let acc = 0;
    const segs = r.catStats
      .map((c, i) => {
        const len = r.total > 0 ? (c.amount / r.total) * CIRC : 0;
        const s = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" style="stroke:${DONUT_VARS[i % DONUT_VARS.length]}" stroke-width="${SW}" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${CX} ${CY})"/>`;
        acc += len;
        return s;
      })
      .join("");
    return raw(
      `<svg width="124" height="124" viewBox="0 0 124 124" xmlns="http://www.w3.org/2000/svg" class="donut__svg" aria-hidden="true">` +
        `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" style="stroke:var(--c-divider)" stroke-width="${SW}"/>` + segs +
        `<text x="${CX}" y="${CY - 4}" text-anchor="middle" class="donut__t1">총 이용</text>` +
        `<text x="${CX}" y="${CY + 13}" text-anchor="middle" class="donut__t2">${man(r.total)}만</text>` +
        `</svg>`
    );
  }
  function categoryCard(r) {
    return html`
      <div class="acard">
        <div class="acard__head"><b>항목별 이용 비중</b></div>
        <div class="acard__body donut">
          ${donutSvg(r)}
          <div class="dleg">
            ${r.catStats.map(
              (c, i) => html`
                <div class="dleg__row">
                  <span class="dleg__l"><span class="dleg__dot" style="background:${DONUT_VARS[i % DONUT_VARS.length]}"></span><span class="dleg__name">${c.key}</span></span>
                  <span class="dleg__val num">${c.share}% · ${man(c.amount)}만</span>
                </div>
              `
            )}
          </div>
        </div>
      </div>
    `;
  }
  function progressCard(r) {
    const s = r.settle;
    const step = (lbl, done, cnt) => html`<div class="step ${cnt > 0 && done === cnt ? "done" : ""}"><b>${lbl}</b><span class="num">${done}/${cnt}</span></div>`;
    return html`
      <div class="acard">
        <div class="acard__head"><b>정산 진행 현황</b><span class="acard__hint">입금 기준 ${s.paidRate}%</span></div>
        <div class="acard__body">
          <div class="prog__track"><div class="prog__fill" style="width:${s.paidRate}%"></div></div>
          <div class="steps">
            ${step("명세서 동의", s.agreed, s.count)}
            ${step("계산서 발급", s.issued, s.count)}
            ${step("입금 완료", s.paid, s.count)}
          </div>
          <div class="prog__amts"><span>입금완료 <b class="num">${won(s.paidAmount)}</b></span><span class="warn">미입금 <b class="num">${won(s.unpaidAmount)}</b></span></div>
        </div>
      </div>
    `;
  }
  function reportCard(r) {
    return html`
      <div class="report">
        <div class="report__head"><b>월간 분석 리포트</b><span class="report__hint">A4 · PDF</span></div>
        <div class="report__body">
          <p class="report__desc">${r.label} 이용·정산 데이터를 분석한 리포트를 생성합니다.</p>
          <div class="report__list">
            <div class="report__row"><b>거래처별 이용 순위</b><span>전월 대비 증감 포함</span></div>
            <div class="report__row"><b>항목별 구성 변화</b><span>비중 · 건수</span></div>
            <div class="report__row"><b>정산 현황 · 코멘트</b><span>자동 분석 ${r.insights.length}건</span></div>
          </div>
          <p class="report__quote">"${r.insights[0] || ""}"</p>
        </div>
        <button class="report__btn" data-action="report">PDF 리포트 다운로드</button>
      </div>
    `;
  }
  function dashBody() {
    const r = reportFor();
    if (!r) return html`<div class="admin-empty">선택한 조건(${periodLabel(state.ym)})에 이용 데이터가 없습니다.</div>`;
    return html`
      <div class="adash">
        ${kpiCards(r)}
        <div class="row-main">${insightCard(r)}${clientRankCard(r)}</div>
        <div class="row-sub">${categoryCard(r)}${progressCard(r)}${reportCard(r)}</div>
      </div>
    `;
  }

  /* ── 표 ── */
  /** 표 머리 한 줄 요약 — 탭·검색과 무관하게 그 달 전체. 0원 달은 입금 없이 닫혀 입금완료 합계에서 뺀다(시안 · N20 ⓕ의 약점 —
   *  '입금이 없었는데 입금완료로 세어짐'). 미입금 = util/settlement `isUnpaid` — 명세서가 나간 달 전부(동의 전·계산서 발급 전
   *  포함 · 0원·거래 없음·발행 전 제외). 월간 분석 '미입금액'·대쉬보드 '미수금'·'정산 진행' 과 같은 판정이다(사용자 결정 A —
   *  예전엔 여기만 계산서가 나간 달(ISSUED·OVERDUE)만 세어 같은 9월을 월간 분석과 다른 금액으로 말했다 · 2차 시안도 그 계산이라
   *  받지 않았다). '0원 달 N곳' 은 **이미 닫힌** 0원 달만 센다(고쳐서 0원이 되어 마감이 지난 달 — 마감 전의 고쳐서 0원인 달은 아직
   *  닫히지 않았다 · 0원 주문만 있는 달은 내역서가 없는 NONE 이다 — 2026-10-22 결정 B). 발행된 달이면 청구 합계 = 입금완료 + 미입금 이다
   *  (발행 전 달은 청구 합계에만 들어간다). */
  function sumBody(rows) {
    const nonZero = rows.filter((r) => !r.s.zeroEdited);
    const sum = (arr) => won(arr.reduce((a, r) => a + r.s.amount, 0));
    const zeroN = rows.filter((r) => zeroClosed(r.s)).length;
    return html`
      <b>${rows.length}개 거래처</b>
      <span>청구 합계 <b>${sum(nonZero)}</b></span>
      <span>입금완료 <b>${sum(nonZero.filter((r) => r.s.status === "PAID"))}</b></span>
      <span>미입금 <b class="is-unpaid">${sum(rows.filter((r) => isUnpaid(r.s)))}</b></span>
      ${zeroN ? html`<span class="settle-sumline__note">0원 달 ${zeroN}곳은 입금 없이 닫혀 입금완료 합계에서 뺐습니다</span>` : ""}
    `;
  }
  /** isCur — '기한 · 비고' 칸이 이 단계의 근거를 이미 보이고 있다(지금 단계, 또는 다 끝난 달의 마지막 단계).
   *  그 칸이 보이는 말은 여기서 .sr-only 로 다시 싣지 않는다 — 스크린리더가 같은 말을 두 번 읽는다(settle-mark.js 계약). */
  function cellHtml(st, isCur) {
    if (st.kind === "none") return html`<div class="settle-td">${settleMark({ kind: "none" })}</div>`;
    /* 지금 단계(live)의 기한·사유는 '기한 · 비고' 칸에 보이므로 여기선 title 만 준다. 끝난 단계는 근거를 title + .sr-only 로.
       done 은 tone 을 넘기지 않는다 — settleMark 의 done 기본값이 초록 ✓ 다(회색 ✓ 는 고쳐서 0원으로 닫힌 달만). */
    return html`<div class="settle-td">${settleMark(st.kind === "live" || isCur
      ? { kind: st.kind, label: st.label, tone: st.tone, tip: st.tip || st.meta }
      : { kind: "done", label: st.label, tone: st.tone, meta: st.meta, tip: st.tip })}</div>`;
  }
  function rowHtml(r, now) {
    const { client: c, s, need } = r;
    const open = state.expanded.has(c.id);
    const ct = store.getBillingContactOf(c.id);
    const st = stagesOf(c, s, now);
    const act = actOf(c, s);
    const chips = [];
    /* 계정 구분은 사업자번호를 공유하는 거래처에만 — 전 거래처에 부서가 있어 무조건 병기하면 전 행이 노이즈다. */
    if (r.shared && c.department) chips.push(["", c.department]);
    /* 탈퇴한 거래처 — 지난 달 정산 줄에 남는다(2026-10-22 결정 A · 예전 '정지 중' 칩 자리). 정산이 다 끝난 계정이라 경고색이 아니라
       계정 구분과 같은 회색이다. */
    if (c.status === WITHDRAWN) chips.push(["", "탈퇴"]);
    /* 정산·회계 담당자가 없거나 연락처가 비면 명세서·마감 안내(T3·T4)가 닿지 않는다 — 그래도 그 달은 마감에 평소대로 자동 동의된다
       (2026-10-23 운영자 결정 D1). 정산 담당 연락처는 비울 수 없어(M52) 데이터 오류 대비 칩이다. */
    if (s.noRecipient) chips.push(["red", "알림 수신자 없음"]);
    const nameTip = ct && String(ct.phone || "").trim()
      ? `정산·회계 ${ct.name}${ct.role ? ` · ${ct.role}` : ""} · ${ct.phone}`
      : "정산·회계 담당자가 없거나 연락처가 비어 알림을 보낼 수 없습니다";
    const cur = st.cur;
    const detail = cur ? (cur.vis || cur.meta || "") : "";
    const detailTip = cur ? (cur.dtip || cur.tip || cur.meta || "") : "";
    const M = monthOf(state.ym);
    const nm = rowName(r);
    /* 청구금액 — 금액이 바뀐 달은 '바뀜' 칩(②). 한 줄('발급 때 … → 지금 … (M월 D일 수정)')은 마우스 올림과 화면 읽기용 글로. */
    const chg = amountChangeLine(s);
    const amtTip = s.changed ? `${chg} · ${s.count}건` : `${s.count}건${s.feeCount ? ` · 수수료 ${s.feeCount}건` : ""}`;
    /* 발급·입금 버튼은 조치 필요 줄이면 채운 주황. '주문 고치기' 는 늘 흰 바탕(시안 — 수정 마감 임박은 조치 필요가 아니다). */
    const hotBtn = need && (act.btn === "issue" || act.btn === "pay");
    return html`
      <div class="settle-trow ${open ? "is-open" : ""}" data-cid="${c.id}">
        <div class="settle-td settle-td--name" title="${nameTip}">
          <b class="settle-name">${c.companyName}</b>
          ${chips.map(([tone, t]) => html`<span class="settle-chip ${tone ? `settle-chip--${tone}` : ""}">${t}</span>`)}
        </div>
        <div class="settle-td settle-td--amt" title="${amtTip}">
          <span class="settle-amt">${won(s.amount)}</span>
          ${s.changed ? html`<span class="settle-chip settle-chip--chg" aria-hidden="true">바뀜</span><span class="sr-only"> · ${chg}</span>` : ""}
        </div>
        ${st.merged
          ? (st.merged.none
            ? html`<div class="settle-td settle-td--span3"><span class="settle-none">${st.merged.text}</span></div>`
            : html`<div class="settle-td settle-td--span3">${settleMark({ kind: st.merged.kind, label: st.merged.label, tone: "gray", tip: st.merged.tip })}</div>`)
          : st.cells.map((x) => cellHtml(x, x === cur && !x.vis))}
        <div class="settle-td settle-td--detail ${cur && cur.hot ? "is-hot" : cur && cur.amb ? "is-amb" : ""}" ${detailTip ? html`title="${detailTip}"` : ""}>${detail}</div>
        <div class="settle-td settle-td--act">
          ${act.btn
            ? html`<button type="button" class="settle-actbtn ${hotBtn ? "is-need" : ""}" data-action="${act.btn}" data-cid="${c.id}" aria-label="${nm} ${M}월 ${act.full}">${act.label}</button>`
            : html`<span class="settle-acttext" ${act.tip ? html`title="${act.tip}"` : ""}>${act.text}${act.tip ? html`<span class="sr-only"> · ${act.tip}</span>` : ""}</span>`}
          <button type="button" class="settle-chev" data-action="toggle" data-cid="${c.id}" aria-expanded="${open ? "true" : "false"}"
                  aria-controls="sx-${c.id}" aria-label="${nm} ${open ? "접기" : "펼치기"}"></button>
        </div>
        <div class="settle-td settle-td--docs">
          ${hasDoc(s)
            ? html`<button type="button" class="settle-icbtn" data-action="copylink" data-cid="${c.id}" aria-label="${nm} ${M}월 명세서 공개 링크 복사" title="공개 링크 복사 · 열 때의 지금 금액을 보여 줍니다">${icon("link", { size: 15 })}</button>
                   <button type="button" class="settle-icbtn" data-action="download" data-cid="${c.id}" aria-label="${nm} ${M}월 명세서 PDF 다운로드" title="PDF 다운로드">${icon("download", { size: 15 })}</button>`
            : html`<span class="settle-docsoff" title="${s.status === "NONE" ? "거래가 없는 달은 명세서가 없습니다" : `명세서 발행 전입니다 — ${fmtKoShortTime(s.issueAt)}에 발급됩니다`}">${s.status === "NONE" ? "거래 없음" : "발행 전"}</span>`}
        </div>
      </div>
      <div class="settle-exp" id="sx-${c.id}" data-slot="exp" ${open ? "" : "hidden"}>${open ? expBody(r, now) : ""}</div>
    `;
  }
  function expBody(r, now) {
    const { client: c, s } = r;
    const ct = store.getBillingContactOf(c.id);
    const { products, fees } = itemsOf(c, state.ym);
    const top = products.slice(0, TOP_ITEMS);
    const rest = products.slice(TOP_ITEMS);
    const restSum = rest.reduce((a, it) => ({ count: a.count + it.count, amount: a.amount + it.amount }), { count: 0, amount: 0 });
    const av = availOf(s);
    const ed = editRowOf(c, s, now);
    /* 정산 금액 변경 기록(③ — 관리자 전용 · 시간순). 카드는 **기록 줄이 있으면** 보인다 — 고쳤다가 되돌려 순변동 0 인 달도
       증빙으로 남긴다(DATA.md 6절 Q4 · SCREENS2 자동 결정 — '바뀜' 칩과 머리 오른쪽 '발급 때 → 지금' 줄은 금액이 다를 때만). */
    const lines = amountChangesOf(c, state.ym, now).lines;
    const log = logOf(c, s, ct, now, lines);
    const reach = ct && String(ct.phone || "").trim();
    /* 번호는 한 덩어리(.settle-ct__ph — nowrap)로 — 1280 에서 칸이 200px 로 좁아져 '010-0000-' / '0105' 로 하이픈에서 갈렸다(실측).
       꺾는 자리는 ' · ' 뿐이다(품목 카드 수수료 줄의 주문번호와 같은 수법). */
    const ctWho = ct ? `${ct.name}${ct.role ? ` · ${ct.role}` : ""}` : "";
    const ctText = !ct ? "없음 · 거래처 정보에서 지정하세요"
      : reach ? html`${ctWho} · <span class="settle-ct__ph">${ct.phone}</span>`
      : `${ctWho} · 연락처 없음`;
    const M = monthOf(state.ym);
    const editNow = canEdit(s);
    const itemRow = (name, count, amount, rest) => html`
      <div class="settle-it ${rest ? "settle-it--rest" : ""}"><span class="settle-it__n">${name}</span><span class="settle-it__q">${count.toLocaleString("ko-KR")}건</span><span class="settle-it__a">${won(amount)}</span></div>`;
    /* 취소 수수료 줄(⑥) — '수수료' 표지 + 주문번호 + 취소일(MM-DD). 합계에 들어간다. */
    const feeRow = (e) => html`
      <div class="settle-it settle-it--fee">
        <span class="settle-it__n settle-it__n--fee"><span class="settle-it__tag">수수료</span><span class="settle-it__nt"><span>취소 수수료</span> · <span>${e.orderNo}</span> · <span>${e.at.slice(5, 10)} 취소</span></span></span>
        <span class="settle-it__q">1건</span><span class="settle-it__a">${won(e.amount)}</span>
      </div>`;
    const doRow = (name, [can, why], action, btnLabel) => html`
      <div class="settle-do ${can ? "" : "is-off"}">
        <div class="settle-do__l"><b class="settle-do__n">${name}</b><p class="settle-do__w">${why}</p></div>
        ${can ? html`<button type="button" class="settle-dobtn" data-action="${action}" data-cid="${c.id}" aria-label="${rowName(r)} ${M}월 ${action === "orders" ? "주문 고치기" : name}">${btnLabel}</button>` : ""}
      </div>`;
    /* 0원 주문만 있는 달(NONE — 2026-10-22 결정 B)은 품목은 보이되 청구가 없다 — '합계 = 청구금액' 이라고 말하지 않는다.
       주문이 한 건도 없는 NONE 달은 그 줄의 낱말 그대로 '거래 없음 · 명세서 없음'(0원 주문이 있다고 말하면 틀린다 — 검증 2026-10-22). */
    const noneCap = s.count ? "0원 주문만 있어 명세서 없음" : "거래 없음 · 명세서 없음";
    const itemsCap = `${s.count.toLocaleString("ko-KR")}건${s.feeCount ? ` · 수수료 ${s.feeCount}건` : ""} · ${s.status === "NONE" ? noneCap : editNow ? "고치면 바로 다시 계산" : "합계 = 청구금액"}`;
    return html`
      ${lines.length
        ? html`
          <section class="settle-card settle-chg" aria-label="정산 금액 변경 기록">
            <div class="settle-card__hd"><b>정산 금액 변경 기록</b>${s.changed ? html`<span class="settle-chg__line">${amountChangeLine(s)}</span>` : ""}</div>
            <div class="settle-chg__tbl" role="table" aria-label="정산 금액 변경 기록 · 언제 · 누가 · 어느 주문 · 바뀌기 전 → 뒤 · 사유">
              <div class="settle-chg__row settle-chg__row--hd" role="row">
                <span role="columnheader">언제</span><span role="columnheader">누가</span><span role="columnheader">어느 주문</span>
                <span role="columnheader">바뀌기 전 → 뒤</span><span role="columnheader">사유</span>
              </div>
              ${lines.map((l) => html`
                <div class="settle-chg__row" role="row">
                  <span class="settle-chg__t" role="cell">${fmtMdHm(l.at)}</span>
                  <span class="settle-chg__by" role="cell">${actorLabel(l.by) || "처리자 기록 없음"}</span>
                  <span class="settle-chg__no" role="cell">${l.orderNo}</span>
                  <b class="settle-chg__d" role="cell">${won(l.before)} → ${won(l.after)}</b>
                  ${/* 배송완료 처리 줄(D3)은 사유 칸 앞에 원인 낱말을 둔다 — 'B2B-… 0원 → 60,000원' 만으로는 왜 늘었는지 모른다. */ ""}
                  <span class="settle-chg__r ${l.reason || AMOUNT_CAUSE_WORD[l.cause] ? "" : "is-none"}" role="cell">${[AMOUNT_CAUSE_WORD[l.cause], l.reason || "사유 없음"].filter(Boolean).join(" · ")}</span>
                </div>`)}
            </div>
          </section>`
        : ""}
      <div class="settle-exp__grid">
        <section class="settle-card" aria-label="품목별 내역">
          <div class="settle-card__hd"><b>품목별 내역</b><span class="settle-it__cap">${itemsCap}</span></div>
          ${products.length || fees.length
            ? html`${top.map((it) => itemRow(it.name, it.count, it.amount))}
                   ${rest.length ? itemRow(`그 외 ${rest.length}개 품목`, restSum.count, restSum.amount, true) : ""}
                   ${fees.map(feeRow)}
                   <div class="settle-itsum"><b>합계</b><b>${won(s.amount)}</b></div>`
            : html`<p class="settle-noit">이 달의 이용 내역이 없습니다.</p>`}
          <div class="settle-it__go">
            <button type="button" class="settle-pill ${editNow ? "settle-pill--strong" : ""}" data-action="orders" data-cid="${c.id}">이 거래처 · ${M}월 주문 ${editNow ? "고치기" : "보기"} ›</button>
            <span class="settle-it__gocap">배송일이 ${M}월인 주문</span>
          </div>
        </section>
        <section class="settle-card" aria-label="처리">
          <div class="settle-card__hd"><b>처리</b><span>이 달 상태에서 할 수 있는 일</span></div>
          <div class="settle-ct"><span class="settle-ct__k">정산·회계 담당자</span><b class="settle-ct__v ${reach ? "" : "is-warn"}">${ctText}</b></div>
          ${s.autoAgreeHold
            ? html`<div class="settle-hold"><b class="settle-hold__t">${HOLD_LABEL[s.autoAgreeHold]}</b><p class="settle-do__w">${HOLD_WHY}</p></div>`
            : ""}
          ${ed ? doRow(ed.name, [ed.can, ed.why], "orders", "주문 고치기") : ""}
          ${doRow("계산서 발급 처리", av.issue, "issue", "발급 처리")}
          ${doRow("입금 확인", av.pay, "pay", "입금 확인")}
        </section>
        <section class="settle-card" aria-label="진행 기록">
          <div class="settle-card__hd"><b>진행 기록</b><span>누가 언제</span></div>
          ${log.length
            ? log.map((l) => html`<div class="settle-log"><span class="settle-log__t">${l.t}</span><span class="settle-log__w"><b>${l.what}</b>${l.who ? html`<span>${l.who}</span>` : ""}</span></div>`)
            : html`<p class="settle-noit">거래가 없는 달이라 기록이 없습니다.</p>`}
        </section>
      </div>
    `;
  }
  function tableBody() {
    const now = new Date();
    const rows = periodRows(now);
    const vis = visibleRows(rows);
    const q = state.q.trim();
    return html`
      <div class="settle-sumline" data-slot="sum">${sumBody(rows)}</div>
      ${vis.length
        ? html`
          <div class="settle-thead">
            ${HEADERS.map(([t, k]) => html`<div class="settle-th ${k ? `settle-th--${k}` : ""}">${t}</div>`)}
          </div>
          <div data-slot="rows">${vis.map((r) => html`<div class="settle-rg" data-cid="${r.client.id}">${rowHtml(r, now)}</div>`)}</div>`
        : html`
          <div class="settle-emptyres">
            <p class="settle-emptyres__t">${q ? `선택한 조건(${periodLabel(state.ym)} · '${q}')에 정산 내역이 없습니다` : `선택한 조건(${periodLabel(state.ym)})에 정산 내역이 없습니다`}</p>
            ${q
              ? html`<p class="settle-emptyres__s">거래처 이름을 확인하거나 검색어를 지워 보세요.</p>
                     <button type="button" class="settle-pill" data-action="clearq">검색어 지우기</button>`
              : ""}
          </div>`}
    `;
  }

  /* ── 필터 카드 ── */
  function tabCounts(rows) {
    return Object.fromEntries(TABS.map((t) => [t.v, rows.filter((r) => inTab(t.v, r)).length]));
  }
  const segOf = () => [["last", "저번달", lastYm], ["this", "이번달", curYm]];
  function render() {
    const rows = periodRows();
    const cnt = tabCounts(rows);
    setHTML(
      root,
      html`
        <div class="page-admin page-settle">
          <div class="admin-inner">
            ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "거래처 정산회계", desc: "귀속월(배송일의 달)마다 명세서 동의 · 계산서 · 입금을 처리합니다" })}
            <div class="bf-card">
              <div class="bf-row bf-row--tabs">
                <div class="bf-tabs" data-slot="tabs">
                  ${TABS.map((t) => html`<button type="button" class="bf-tab ${state.tab === t.v ? "is-active" : ""}" data-action="tab" data-v="${t.v}" aria-pressed="${state.tab === t.v ? "true" : "false"}">${t.label}<span class="bf-tab__cnt ${t.v === "action" && cnt.action ? "bf-tab__cnt--alert" : ""}" data-cnt="${t.v}">${cnt[t.v]}</span></button>`)}
                </div>
                <span class="bf-flow">발행 → 수정 마감 → 동의 → 계산서 → 입금</span>
              </div>
              <div class="bf-row bf-row--main">
                <div class="settle-mstep" role="group" aria-label="귀속월">
                  <button type="button" class="settle-mstep__b" data-action="mprev" aria-label="이전 달">${icon("chevron-left", { size: 16 })}</button>
                  <span class="settle-mstep__t" data-slot="mlabel" aria-live="polite">${periodLabel(state.ym)} 귀속</span>
                  <button type="button" class="settle-mstep__b" data-action="mnext" aria-label="다음 달">${icon("chevron-right", { size: 16 })}</button>
                </div>
                <div class="bf-seg">
                  ${segOf().map(([v, label, ym]) => html`<button type="button" class="bf-seg__btn ${state.ym === ym ? "is-sel" : ""}" data-action="qmonth" data-v="${v}" aria-pressed="${state.ym === ym ? "true" : "false"}">${label}</button>`)}
                </div>
                <div class="bf-right">
                  <div class="bf-srch bf-srch--addr">
                    ${icon("search", { size: 13, cls: "bf-srch__ic" })}
                    <span class="bf-srch__lbl" aria-hidden="true">거래처</span>
                    <span class="bf-srch__dv"></span>
                    <input type="text" data-search value="${state.q}" placeholder="거래처 이름으로 검색" aria-label="거래처 이름으로 검색" />
                  </div>
                </div>
              </div>
            </div>
            <div class="settle-table" data-slot="table">${tableBody()}</div>
            <div class="settle-ana">
              <div class="settle-ana__l"><b>월간 분석</b><span>총 이용금액 · 주문 건수 · 거래처별 이용 현황 · 항목별 비중</span></div>
              <div class="settle-ana__r">
                <button type="button" class="settle-pill" data-action="report">리포트 PDF</button>
                <button type="button" class="settle-pill" data-action="ana" aria-expanded="${state.anaOpen ? "true" : "false"}" aria-controls="settle-ana-body">${state.anaOpen ? "접기" : "펼치기"}</button>
              </div>
            </div>
            <div id="settle-ana-body" data-slot="dash" ${state.anaOpen ? "" : "hidden"}>${state.anaOpen ? dashBody() : ""}</div>
          </div>
        </div>
      `
    );
    syncStepper();
  }
  /** 탭 건수·선택·월 표시만 갈아 끼운다 — 버튼을 다시 그리면 누른 버튼의 포커스가 날아간다. */
  function syncFilters(rows = periodRows()) {
    const cnt = tabCounts(rows);
    qsa(root, "[data-action='tab']").forEach((b) => {
      const on_ = b.dataset.v === state.tab;
      b.classList.toggle("is-active", on_);
      b.setAttribute("aria-pressed", on_ ? "true" : "false");
      const c = qs(b, "[data-cnt]");
      if (c) {
        c.textContent = String(cnt[b.dataset.v]);
        if (b.dataset.v === "action") c.classList.toggle("bf-tab__cnt--alert", cnt.action > 0);
      }
    });
    const ml = qs(root, "[data-slot='mlabel']");
    if (ml) ml.textContent = `${periodLabel(state.ym)} 귀속`;
    const segYm = Object.fromEntries(segOf().map(([v, , ym]) => [v, ym]));
    qsa(root, "[data-action='qmonth']").forEach((b) => {
      const sel = segYm[b.dataset.v] === state.ym;
      b.classList.toggle("is-sel", sel);
      b.setAttribute("aria-pressed", sel ? "true" : "false");
    });
    syncStepper();
  }
  function syncStepper() {
    const prev = qs(root, "[data-action='mprev']");
    const next = qs(root, "[data-action='mnext']");
    if (prev) prev.disabled = state.ym <= minYm;
    if (next) next.disabled = state.ym >= maxYm;
  }
  function refreshTable() {
    const tbl = qs(root, "[data-slot='table']");
    if (tbl) setHTML(tbl, tableBody());
  }
  function refreshAna() {
    const box = qs(root, "[data-slot='dash']");
    const btn = qs(root, "[data-action='ana']");
    if (btn) {
      btn.setAttribute("aria-expanded", state.anaOpen ? "true" : "false");
      btn.textContent = state.anaOpen ? "접기" : "펼치기";
    }
    if (!box) return;
    box.hidden = !state.anaOpen;
    setHTML(box, state.anaOpen ? dashBody() : "");
  }
  /** 달이 바뀌었다 — 펼침은 달마다 뜻이 달라 비운다. */
  function setMonth(ym) {
    if (ym === state.ym) return;
    state.ym = ym;
    state.expanded.clear();
    syncFilters();
    refreshTable();
    refreshAna();
  }
  /** 그 줄만 다시 그린다(쓰기 성공 뒤) — 펼침 상태 보존. 탭 건수·머리 요약도 같은 소스라 함께 갱신한다. */
  function refreshRow(cid) {
    const g = qs(root, `.settle-rg[data-cid='${cid}']`);
    const now = new Date();
    const r = rowOf(cid, now);
    if (g && r) setHTML(g, rowHtml(r, now));
    const rows = periodRows(now);
    const sum = qs(root, "[data-slot='sum']");
    if (sum) setHTML(sum, sumBody(rows));
    syncFilters(rows);
    if (state.anaOpen) refreshAna();
  }
  /** 창이 닫힌 뒤 포커스가 사라졌으면(줄을 다시 그려 원래 버튼이 없어졌다) 그 줄의 펼침 버튼으로 되돌린다. */
  function refocus(cid) {
    const a = document.activeElement;
    if (a && a !== document.body && document.contains(a)) return;
    const b = qs(root, `.settle-chev[data-cid='${cid}']`);
    if (b) b.focus();
  }
  function toggle(cid) {
    const g = qs(root, `.settle-rg[data-cid='${cid}']`);
    if (!g) return;
    const open = !state.expanded.has(cid);
    if (open) state.expanded.add(cid); else state.expanded.delete(cid);
    const row = qs(g, ".settle-trow");
    const chev = qs(g, ".settle-chev");
    const exp = qs(g, "[data-slot='exp']");
    const r = rowOf(cid);
    if (row) row.classList.toggle("is-open", open);
    if (chev && r) {
      chev.setAttribute("aria-expanded", open ? "true" : "false");
      chev.setAttribute("aria-label", `${rowName(r)} ${open ? "접기" : "펼치기"}`);
    }
    if (exp) {
      setHTML(exp, open && r ? expBody(r, new Date()) : "");
      exp.hidden = !open;
    }
  }

  render();

  /* 주문 상세 '정산 귀속' 에서 왔다 — 그 줄을 화면에 올린다. ⚠️ 다음 프레임에 한다: 라우터가 mount() 직후
     `scrollTop = 0` 으로 되돌린다(router.js — 프로필 저장공간의 담당자 카드와 같은 함정). */
  let raf = 0;
  if (scrollTo) {
    raf = requestAnimationFrame(() => {
      raf = 0;
      const g = qs(root, `.settle-rg[data-cid='${scrollTo}']`);
      if (!g) return;
      g.scrollIntoView({ block: "center" });
      const b = qs(g, ".settle-chev");
      if (b) b.focus({ preventScroll: true });
    });
  }

  const offs = [];
  offs.push(on(root, "click", "[data-action='tab']", (e, t) => {
    if (state.tab === t.dataset.v) return;
    state.tab = t.dataset.v;
    syncFilters();
    refreshTable();
  }));
  offs.push(on(root, "click", "[data-action='mprev']", (e, t) => {
    if (state.ym <= minYm) return;
    setMonth(shiftPeriod(state.ym, -1));
    if (t.disabled) { const n = qs(root, "[data-action='mnext']"); if (n) n.focus(); }
  }));
  offs.push(on(root, "click", "[data-action='mnext']", (e, t) => {
    if (state.ym >= maxYm) return;
    setMonth(shiftPeriod(state.ym, 1));
    /* 끝 달에 닿아 버튼이 잠기면 포커스가 사라진다 — 옆 버튼으로 옮긴다. */
    if (t.disabled) { const p = qs(root, "[data-action='mprev']"); if (p) p.focus(); }
  }));
  offs.push(on(root, "click", "[data-action='qmonth']", (e, t) => {
    setMonth(t.dataset.v === "last" ? lastYm : curYm);
  }));
  offs.push(on(root, "input", "[data-search]", (e, t) => {
    state.q = t.value;
    refreshTable();
  }));
  offs.push(on(root, "click", "[data-action='clearq']", () => {
    state.q = "";
    state.tab = "all";
    const inp = qs(root, "[data-search]");
    if (inp) inp.value = "";
    syncFilters();
    refreshTable();
    if (inp) inp.focus();
  }));
  /* 줄 아무 데나 → 펼침. onRowOpen 과 같은 가드: 안쪽 컨트롤은 비켜 가고(버튼 동작과 펼침이 둘 다 터지지 않게),
     드래그 선택 중이면 열지 않는다(금액·이름을 긁어 복사하는 흐름). */
  offs.push(on(root, "click", ".settle-trow", (e, t) => {
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    if (!window.getSelection().isCollapsed) return;
    toggle(t.dataset.cid);
  }));
  offs.push(on(root, "click", "[data-action='toggle']", (e, t) => toggle(t.dataset.cid)));
  offs.push(on(root, "click", "[data-action='ana']", () => {
    state.anaOpen = !state.anaOpen;
    refreshAna();
  }));
  /* '주문 고치기'(처리 칸 · 처리 카드) · '이 거래처 · M월 주문 고치기/보기'(품목 카드) — 주문관리를 그 거래처 · 날짜 기준 배송일 ·
     그 달 1일~말일로 연다(받는 쪽: admin-orders mount). 귀속월 = 배송일의 달이라 기본 날짜 기준(주문일)으로 넘기면 다른 주문이
     보인다(2026-10-15). 다른 달 배송분을 이 달에 취소한 수수료 줄은 그 목록에 없다 — 품목 내역에 주문번호·취소일로 보인다
     (그래서 버튼 옆 글은 '배송일이 M월인 주문' 뿐이다 · 2차 자동 결정). 잠금은 주문 화면이 다시 판정한다(settlementImpactOf). */
  offs.push(on(root, "click", "[data-action='orders']", (e, t) => {
    setFocusClient("orders", t.dataset.cid);
    setFocusSection("orders", `deliver:${state.ym}`);
    nav("#/admin/orders");
  }));
  const openFor = (kind, cid) => {
    const c = store.get().clients.find((x) => x.id === cid);
    if (!c) return;
    const opts = {
      client: c, ym: state.ym, toast,
      onDone: () => refreshRow(cid),
      onClose: () => refocus(cid),
    };
    if (kind === "issue") openIssueDialog(opts);
    else openPaymentDialog(opts);
  };
  offs.push(on(root, "click", "[data-action='issue']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || r.s.status !== "AGREED") { refreshRow(t.dataset.cid); return; }
    openFor("issue", t.dataset.cid);
  }));
  offs.push(on(root, "click", "[data-action='pay']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || (r.s.status !== "ISSUED" && r.s.status !== "OVERDUE")) { refreshRow(t.dataset.cid); return; }
    openFor("pay", t.dataset.cid);
  }));
  offs.push(on(root, "click", "[data-action='copylink']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || !hasDoc(r.s)) return; // 발행 전·거래 없는 달에는 토큰을 발급하지 않는다(서버 409)
    /* 토큰은 (거래처, 사업자번호, 귀속월)만 싣는다 — 공개 페이지가 **열 때** invoiceDocData 로 다시 만든다(명세 3.5).
       예전엔 복사한 순간의 본문을 실어 같은 토큰의 문서를 덮어썼다(포털이 보낸 링크의 내용이 바뀌던 결함 — 이제 그럴 본문이 없다). */
    const token = issueLink({ clientId: r.client.id, bizNumber: r.client.bizNumber, ym: state.ym });
    const url = publicInvoiceUrl(token);
    const done = () => toast(`${rowName(r)} ${monthOf(state.ym)}월 명세서 공개 링크를 복사했습니다 · 열 때의 지금 금액을 보여 줍니다`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(() => window.prompt("공개 링크", url));
    else window.prompt("공개 링크", url);
  }));
  /* 명세서 PDF — 누르는 순간의 시각으로 문서를 다시 만들어 인쇄창(→ PDF)을 연다(util/invoice-data printInvoiceFor — 포털과 같은
     빌더 · 동의 전이고 수정 마감 전이면 '동의 전 — 금액이 바뀔 수 있습니다' + 출력 시각이 찍힌다 · 사용자 답 1). */
  offs.push(on(root, "click", "[data-action='download']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || !hasDoc(r.s)) return; // 발행 전·거래 없는 달 명세서는 PDF 로도 내보내지 않는다
    /* 성공 통보 토스트는 두지 않는다 — 인쇄창이 열리는 것이 결과다. printInvoiceFor 가 `false` 를 돌려주면 팝업이 막힌 것이고
       그때는 invoice-doc 의 경고창이 이미 말했다(여기서 무엇을 더 띄우면 두 번 말한다). 성공 토스트를 더할 거면 `=== false` 를 거를 것. */
    try { printInvoiceFor(r.client, state.ym, `${rowName(r)}_${periodLabel(state.ym)}_거래명세서`, { now: new Date() }); }
    catch (err) { console.error("PDF 생성 오류:", err); toast("PDF를 만들지 못했습니다. 다시 시도해 주세요.", "warn"); }
  }));
  // 월간 분석 리포트: 분석 실행 → A4 리포트 렌더 → printInvoiceDoc
  offs.push(on(root, "click", "[data-action='report']", () => {
    const r = reportFor();
    if (!r) { toast(`${periodLabel(state.ym)}에는 분석할 이용 데이터가 없습니다`, "warn"); return; }
    const dt = new Date();
    const generatedAt = `${dt.getFullYear()}. ${pad(dt.getMonth() + 1)}. ${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const holder = document.createElement("div");
    setHTML(holder, reportDoc(r, generatedAt));
    const docEl = holder.querySelector(".report-doc");
    if (!docEl) return;
    const [y, m] = state.ym.split("-");
    try { printInvoiceDoc(docEl, `거래처_이용분석_리포트_${y}_${m}`); }
    catch (err) { console.error("리포트 생성 오류:", err); toast("리포트를 만들지 못했습니다. 다시 시도해 주세요.", "warn"); }
  }));

  return () => {
    if (raf) cancelAnimationFrame(raf);
    offs.forEach((off) => off());
    toast.destroy();
  };
}
