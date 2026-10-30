/* ============================================================
   settlement.js — 정산회계 조회 (#/app/settlement)
   시안: claude.ai/design '정산회계 조회 - 리모델링.dc.html' (2026-10-07 이식)
       → 'S-03 포털 정산회계 간편조회.dc.html' (2026-10-16 이식 — 상태 갈래 · 한 줄 회사정보 · 4단계 문안 · 8칸 표)
       → 같은 파일 2차 시안 (2026-10-16 오후 — 금액이 바뀐 달 '바뀜' 칩 · 수정 마감 · 발급 뒤 고쳐서 0원이 된 달)

   구조: 머리글(pageHead + '회사정보 수정') · 회사정보 카드(한 줄 4칸 + 둘째 줄 주소·발급일 칩) ·
   정산 절차 4단계 + 아래 한 줄(정산 달 = 배송한 달 · 수정 마감 · 자동 동의 · 약관 동의 전에 마감이 지난 달은 직접 동의 · 기한 초과 ·
   발급일 변경 · 내역이 다르면 카카오톡 채널·고객센터) · 정산 내역 표.
   표 상태 칸은 관리자 정산회계(S-01)와 같은 한 줄 부품 `settleMark` 이고, 같은 정산 행(settlementOf)을 본다 —
   두 화면이 같은 달에 다른 상태를 말하면 안 된다.
   ⚠️ 날짜·마감·그룹은 전부 `data/settlement-rules.js` 가 계산한다. 이 파일에 날짜 산술을 두지 말 것
      (기한 초과 경과일·마감 24시간 비교는 settlementOf 가 준 시각끼리의 뺄셈뿐이다).
   2차 시안(②·①): 금액이 바뀐 달은 정산금액 옆 '바뀜' 칩(관리자 S-01 과 같은 `.settle-chip--chg`)과 한 줄
   `amountChangeLine(s)`('발급 때 X원 → 지금 Y원 (M월 D일 수정)' — 세 화면이 같은 말). 동의 전이고 수정 마감 전인 달은
   안내 칸이 '… 수정 마감 MM-DD 10:00까지 금액 바뀔 수 있음' 이라고 말한다(settlementOf 의 editable·editLockAt 그대로).
   ⚠️ 변경 기록(누가·사유 — `amountChangesOf`)은 관리자 전용이라 이 화면은 부르지 않는다. settlementOf 칸만 쓴다.

   회사정보 수정(시안 '1a · 640px 2열') — 2026-10-07 사용자 결정 셋:
   · **발급일을 포털에서 바꾼다**(명세 6.3 개정). 선택지는 `INVOICE_DAYS`(1~7·11~25일) 22개뿐이고,
     바꾸면 **다음 달 발급분부터** 적용된다 — `store.updateClient` 가 `invoiceDayLog` 를 쌓는다.
     창 안에서 첫 적용 발급일·동의 마감·작성일자 규칙을 실제 날짜로 말한다(가입 4단계와 같은 계산).
   · **필수는 회사명·사업자번호·대표자명·사업장주소**(시안의 '둘뿐'이 아니다 — 명세 4.2·관리자 거래처 창과 같다.
     대표자명은 거래명세서 공급받는자의 성명 칸에 찍힌다. 사업장주소는 2026-10-30 운영자 결정 BB1 로 더했다 — 바로빌 계산서
     발급 규격에서 공급받는자 주소가 필수 칸이라 비어 있으면 자동 발급이 거부될 수 있다). 이메일은 비워도 저장된다.
   · **사업자등록증을 포털에서 올리고 바꾼다** — 바로 반영, 재심사·관리자 표시 없음.
   시안과 다르게 한 것: 이메일 캡션 '비어 있으면 정산 담당자에게 발송' 은 쓰지 않았다 — 그런 폴백은
   명세에 없고 담당자에게는 이메일 칸 자체가 없다. 사실인 것(정산 담당은 명세서·계산서 알림톡을 받는다)만 적는다.
   담당자명·담당자연락처(managerName·contact) 입력칸은 시안대로 뺐다 — **키는 레코드에 남는다**
   (정산 명세서·주문 모달의 거래처 대표 연락처가 읽는다). 정산 담당은 담당자 저장공간이 정본이다.
   ============================================================ */
import { html, setHTML, on, qs, won } from "../dom.js";
import { pageHead, tableGrid, openLightbox } from "../ui.js";
import { settleMark } from "../util/settle-mark.js";
import { openDialog, dlgRule, dlgRow, dlgActions } from "../util/dialog.js";
import { dayPickerMarkup, makeDayPicker } from "../util/day-picker.js";
import { store } from "../store.js";
/* 정산 행은 B2B 주문(배송일시의 달)에서 파생한 금액 + store 의 정산 기록을 얹은 조합층에서 온다 — 관리자 정산과 같은 소스. */
import { settlementsFor, amountChangeLine, INVOICE_YM_KEY } from "../util/settlement.js";
import {
  INVOICE_DAYS, invoiceDayOf, invoiceDayFor, invoiceDayEffectiveFrom, deadlineDayOf, editLockDayOf,
  issueDate, agreeDeadline, shiftPeriod, periodLabel, ISSUE_HOUR, DEADLINE_HOUR,
  fmtDot, fmtMd, fmtMdHm, fmtKoShortTime, fmtKoShortY, fmtKoShortTimeY,
} from "../data/settlement-rules.js";
import { sharedBizKeys, displayName, onBizInput } from "../util/biz.js";
/* 로그인 거래처 결정은 셸 배지·거래명세서와 반드시 같아야 한다 → util/client.js 단일 소스. */
import { currentClient } from "../util/client.js";
import { attachmentOf, fileSizeLabel } from "../util/image.js";
import { CS_PHONE, CS_KAKAO, CS_KAKAO_URL } from "../data/contact.js";
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

/* 저장 게이트 — [키, 사람이 읽을 이름]. 관리자 거래처 창의 REQUIRED 와 같은 넷이다(2026-10-07 결정 셋 + 2026-10-30 BB1 사업장주소). */
const REQUIRED = [["companyName", "회사명"], ["bizNumber", "사업자번호"], ["ceoName", "대표자명"], ["address", "사업장주소"]];
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

/* ── 정산 표 셀 (시안 'S-03 포털 정산회계 간편조회' · 2026-10-16) ─────────────────────
   계산서 발급 · 정산확인 두 칸은 **한 줄**이다 — 공용 `settleMark`(util/settle-mark.js · 관리자 정산회계 S-01 과 같은 부품):
     끝난 단계 ✓ + 회색 낱말 · 지금 단계 ● + 진한 낱말 · 아직 안 온 단계 -.
   지금 단계의 기한·사유는 '안내' 칸 한 곳에 적는다(지금 단계가 없으면 마지막으로 끝난 단계의 것). 끝난 단계의
   작성일자 · 동의 방식은 마우스 올림(title)과 스크린리더(.sr-only)로만 — 세무 근거라 버리지 않는다.
   ⚠️ 상태는 settlementOf 값(status · autoAgreeHold · zeroEdited …)만 읽는다. 날짜로 상태를 짐작하지 않는다(명세 6.6).
   ⚠️ 0원 주문만 있는 달은 내역서를 내지 않는다 — 거래 없는 달(NONE)과 똑같이 '-' · '거래 없음 · 명세서 없음'(2026-10-22 운영자 결정 B).
   ⚠️ 빨간 안내는 동의 마감 24시간 전부터(금액 바뀜 문장 포함)와 기한 초과 · 호박은 마감이 지나 자동 동의되지 않은 달(시안 — 약관 동의 전 하나).
   안내 칸 갈래 순서(2차 시안): 고쳐서 0원 → 보류(약관 동의 전 — 2026-10-23 결정 D1 부터 이것 하나) → 금액 바뀜 → 수정 마감 전 → '마감 …'.
   반환: { kind, label, tone, meta(보이는 안내), title(안내·칸 마우스 올림), hot, amb, sr, chg(안내가 amountChangeLine 을 말한다) } */
const DAY = 864e5;
const howOf = (s) => (s.mode === "auto" ? "자동 동의" : "직접 동의");
/* 마감이 지났는데 자동 동의되지 않은 이유(autoAgreeHold — 약관 동의 전 하나뿐)의 **포털** 낱말. 안내 칸은 사실만 말하고, 이유는
   마우스 올림에서 거래명세서 조회(S-02) 동의 카드와 같은 말로 한다. (예전 '고지 미도달'('마감 안내가 전달되지 않아 …')은 2026-10-23
   운영자 결정 D1 로, '정지 중 마감' 은 2026-10-22 결정 A 로 지웠다 — 그런 달은 이제 마감에 평소대로 자동 동의된다.) */
const HOLD_NOTE = {
  TERMS_NOT_AGREED: "약관 동의 전 · 자동 동의 안 함",
};
const HOLD_WHY = {
  TERMS_NOT_AGREED: "약관 동의 전에 마감이 지나 자동 동의되지 않았습니다",
};
const NOT_YET = { kind: "none" };

/* 0원으로 닫히는(닫힌) 달 — 발급 뒤 고쳐서 0원(zeroEdited — 주문을 다 취소·삭제해 줄이 0개여도 이 갈래다). 0원 주문만 있는 달은
   내역서가 없어(NONE — 2026-10-22 결정 B) 여기 들지 않는다. */
const zeroish = (s) => s.zeroEdited;

/** 계산서 발급 칸 — 발행 전 · 동의 필요(마감 / 수정 마감 전 / 금액 바뀜 / 약관 동의 전 보류) · 동의 완료(발급 중) · 발급완료 ·
 *  고쳐서 0원인 달 '계산서 없음'(마감 전 ● / 닫힌 뒤 ✓) */
function invStage(s, now) {
  if (s.status === "NONE") return { kind: "none", sr: "거래 없음" };
  /* 고쳐서 0원이 되어 마감에 닫힌 달 — 동의·계산서가 없다. 회색 ✓ = 실제 처리 없이 닫힌 완료. */
  if (zeroish(s) && s.status === "PAID") {
    return {
      kind: "done", label: "계산서 없음", tone: "gray",
      meta: "고쳐서 0원 · 마감에 계산서 없이 닫힘", title: "동의가 필요 없습니다",
    };
  }
  if (s.status === "SCHEDULED") return { kind: "live", label: "발행 전", tone: "gray", meta: `${fmtMdHm(s.issueAt)} 발급`, title: "발급되면 내용을 확인하고 동의할 수 있습니다" };
  if (s.status === "AWAITING_AGREEMENT") {
    /* 발급 뒤 고쳐서 0원 — 동의를 받지 않고 마감에 계산서 없이 닫힌다(명세 3.4 '마감 전 수정' 9 · settlementOf open:false).
       정산 칸은 '-'(낼 청구서가 없다) · 처리할 달에서 뺀다(isTodo). */
    if (s.zeroEdited) {
      return {
        kind: "live", label: "계산서 없음", tone: "gray",
        meta: `고쳐서 0원 · ${fmtMdHm(s.deadline)} 마감에 닫힘`,
        title: "발급 뒤 내역이 고쳐져 0원이 되었습니다. 동의 없이 마감에 계산서 없이 닫힙니다",
      };
    }
    /* 마감이 지났는데 자동 동의하지 않은 달 — 마감을 찍으면 '곧 자동 동의된다' 로 읽힌다. 이유를 쓰고 지금 받는다. */
    if (s.autoAgreeHold) {
      return {
        kind: "live", label: "동의 필요", tone: "orange", amb: true,
        meta: HOLD_NOTE[s.autoAgreeHold] || HOLD_NOTE.TERMS_NOT_AGREED,
        title: `${HOLD_WHY[s.autoAgreeHold] || HOLD_WHY.TERMS_NOT_AGREED} · 마감이 지났어도 동의할 수 있습니다`,
      };
    }
    const hot = s.deadline.getTime() - now.getTime() <= DAY;
    /* 금액이 바뀐 달(②) — 동의 전에는 안내 칸이 '발급 때 → 지금' 을 말한다(동의한 뒤에는 지금 단계를 말하고 칩만 남는다).
       마감 하루 전 안내가 닿지 않은 달도 마감에 자동 동의된다(2026-10-23 결정 D1 — 예전엔 그 달에서 '자동 동의' 말을 뺐다). */
    const chg = amountChangeLine(s);
    if (chg) {
      return {
        kind: "live", label: "동의 필요", tone: "orange", hot, chg: true, meta: chg,
        title: `발급 뒤 내역이 고쳐졌습니다 · 마감 ${fmtMdHm(s.deadline)}까지 동의가 없으면 자동 동의됩니다`,
      };
    }
    /* 수정 마감 전(①) — 아직 금액이 바뀔 수 있다. 판정은 settlementOf 의 editable(명세 6.6 — 날짜로 짐작하지 않는다). */
    return {
      kind: "live", label: "동의 필요", tone: "orange", hot,
      meta: s.editable
        ? `마감 ${fmtMdHm(s.deadline)} · 수정 마감 ${fmtMdHm(s.editLockAt)}까지 금액 바뀔 수 있음`
        : `마감 ${fmtMdHm(s.deadline)}`,
      title: "마감까지 동의가 없으면 그 시각에 자동 동의됩니다",
    };
  }
  /* AGREED — 동의는 됐지만 계산서가 아직(발급 실패 뒤 다시 시도·직접 입력 대기). '발급완료' 라고 말하지 않는다. */
  if (s.status === "AGREED") {
    return {
      kind: "live", label: "동의 완료", tone: "gray",
      meta: `발급 중 · ${fmtMd(s.agreedAt)} 동의`, title: `${fmtMdHm(s.agreedAt)} ${howOf(s)} · 계산서를 발급하고 있습니다`,
    };
  }
  /* ISSUED · OVERDUE · PAID — 계산서가 나간 달 */
  return {
    kind: "done", label: "발급완료", tone: "green",
    meta: `작성 ${s.docDate ? fmtMd(s.docDate) : "-"} · ${howOf(s)}`, title: s.agreedAt ? `${fmtMdHm(s.agreedAt)} 동의` : "",
  };
}
/** 정산확인 칸 — 계산서가 나가기 전(발행 전 · 동의 전 · 발급 중 · 고쳐서 0원이 마감 전)은 '-'(낼 청구서가 아직 없다) */
function payStage(s, now) {
  if (s.status === "NONE") return { kind: "none", sr: "거래 없음" };
  if (zeroish(s) && s.status === "PAID") {
    return {
      kind: "done", label: "정산완료", tone: "gray",
      meta: s.count ? `0원 주문 ${s.count}건 · 입금 없음` : "0원 · 입금 없음", title: "실제 입금 없이 정산완료 처리된 달입니다",
    };
  }
  if (s.status === "PAID") return { kind: "done", label: "정산완료", tone: "green", meta: s.paidAt ? `${fmtMd(s.paidAt)} 입금 확인` : "입금 확인" };
  /* 기한 초과 = 정산기한 다음 날 10:00 부터(M44) — 계산서가 그 뒤에 나왔으면 발급 순간부터(M39 · Q36 잠정). 그 시각은 settlementOf 의
     overdueFrom 이 말한다(관리자 정산회계 · 입금 확인 창과 같은 값 — 예전 overdueAt 은 계산서가 나오기 전 시각을 '…부터' 라고 했다). */
  if (s.status === "OVERDUE") {
    const from = s.overdueFrom || s.overdueAt;
    const days = Math.max(1, Math.floor((now.getTime() - from.getTime()) / DAY));
    return {
      kind: "live", label: "기한 초과", tone: "red", hot: true,
      meta: `${days}일 지남 · ${fmtMd(from)}부터`, title: `${fmtMdHm(from)}부터 기한 초과 · 정산기한 ${fmtMd(s.dueAt)}`,
    };
  }
  if (s.status === "ISSUED") return { kind: "live", label: "정산필요", tone: "gray", meta: `기한 ${fmtMd(s.dueAt)}까지`, title: "" };
  /* 고쳐서 0원 · 마감 전 — 보이는 것은 '-'(시안). 낼 청구서가 앞으로도 없으니 '아직 아님' 이라 읽히지 않게. */
  if (s.zeroEdited) return { kind: "none", sr: "0원 · 입금 없음" };
  return NOT_YET;
}
/** 두 칸 + 안내(지금 단계 — 없으면 마지막으로 끝난 단계). 거래가 없는 달은 두 칸 모두 '-'. */
function stagesOf(s, now) {
  const cells = [invStage(s, now), payStage(s, now)];
  const cur = cells.find((c) => c.kind === "live") || [...cells].reverse().find((c) => c.kind === "done") || null;
  return { cells, cur };
}
/** 칸 하나 — 지금 단계(live)와 안내 칸이 보여 주는 단계는 meta 를 안내 칸이 이미 읽으므로 title 만 준다
 *  (스크린리더가 같은 말을 두 번 읽지 않게). 그 밖의 끝난 단계는 근거를 title + .sr-only 로. */
function markOf(st, cur) {
  if (st.kind === "none") return settleMark({ kind: "none", sr: st.sr });
  const tip = st.kind === "done" ? [st.meta, st.title].filter(Boolean).join(" · ") : st.title;
  return settleMark(st === cur
    ? { kind: st.kind, label: st.label, tone: st.tone, tip }
    : { kind: st.kind, label: st.label, tone: st.tone, meta: st.meta, tip });
}
/** '처리할 달' — 동의 필요 + 정산필요 + 기한 초과(0원 달 제외 · 시안). 발급 중(AGREED)은 거래처가 할 일이 없다.
 *  고쳐서 0원이 된 달(마감 전 AWAITING)도 뺀다 — 동의를 받지 않는 달이다. 0원 주문만 있는 달은 NONE 이라 처음부터 들지 않는다. */
const isTodo = (s) => !zeroish(s) && (s.status === "AWAITING_AGREEMENT" || s.status === "ISSUED" || s.status === "OVERDUE");

/* 표 열 폭은 `--st-*` 로 넘긴다 — tableGrid 가 grid-template-columns 를 인라인 style 로 찍어
   미디어쿼리가 못 이긴다(상품 규격 안내 `--pc-*` · 프로필 `--pf-*` 와 같은 이유). ⚠️ 폴백을 반드시 함께.
   시안 8칸: 귀속월(+문서 번호) · 발행일 · 정산 기한 · 정산금액 · 계산서 발급 · 정산확인 · 안내 · 거래명세서.
   2차 시안 폭: 정산금액 104 → 140px('905,000원' + '바뀜' 칩). 귀속월은 시안의 176px 대신 **196px 그대로**(176 이면
   '2026년 09월 C001-202609' 가 발행일 칸에 약 16px 겹친다 — 실측) · 그 대신 안내 최소 폭을 140px 로(2026-10-16 자동 결정).
   1280x720 에서도 가로 스크롤이 없다 — 고정 열 합 828px + 안내 최소 140px = 968px(1차와 같은 합). */
const COLUMNS = [
  {
    label: "귀속월", width: "var(--st-ym, 196px)",
    /* 문서 번호는 같은 줄의 '명세서 보기' 와 같은 곳으로 간다 — 탭 정거장이 줄마다 둘이 되지 않게 이쪽은 마우스 전용 */
    render: (r) => html`<span class="st-ym" title="문서 번호 ${r.id}">
      <b>${r.청구년월}</b><button type="button" class="st-docno" data-action="invoice" data-ym="${r.ym}" tabindex="-1">${r.id}</button>
    </span>`,
  },
  { label: "발행일", width: "var(--st-date, 94px)", render: (r) => html`<span class="st-num">${fmtDot(r.issueAt)}</span>` },
  { label: "정산 기한", width: "var(--st-date, 94px)", render: (r) => html`<span class="st-num">${fmtDot(r.dueAt)}</span>` },
  {
    label: "정산금액", width: "var(--st-amt, 140px)", align: "right",
    /* 거래가 없는 달은 '-'(거래명세서 조회의 월 목록과 같은 말) — 0원 주문만 있는 달도 내역서가 없어 같다(2026-10-22 결정 B).
       단 발급 뒤 주문을 고치거나 다 취소·삭제해 0원이 된 달(zeroEdited)은 거래 없는 달이 아니다 — 0원 + '바뀜'.
       금액은 늘 **지금** 금액이다. 바뀐 달(②)은 옆에 '바뀜' 칩(동의·발급·입금 뒤에도 남는다 · 관리자 S-01 과 같은 칩).
       칩은 aria-hidden 이고 문장은 마우스 올림 + .sr-only — 단 안내 칸이 이미 그 문장을 말하는 동의 전 줄은 .sr-only 를
       빼서 두 번 읽히지 않게 한다. 마우스 올림 순서(시안): 바뀐 달 문장 → '지금 금액'. */
    render: (r) => {
      if (r.empty && !r.zeroEdited) return html`<span class="st-amt is-none">-</span>`;
      const chg = amountChangeLine(r);
      const tip = chg || "지금 금액";
      const said = r.$st.cur && r.$st.cur.chg;
      return html`<span class="st-amtw" title="${tip}"><span class="st-amt">${won(r.amount)}</span>${chg
        ? html`<span class="settle-chip settle-chip--chg" aria-hidden="true">바뀜</span>${said ? "" : html`<span class="sr-only"> · ${chg}</span>`}`
        : ""}</span>`;
    },
  },
  { label: "계산서 발급", width: "var(--st-inv, 104px)", render: (r) => markOf(r.$st.cells[0], r.$st.cur) },
  { label: "정산확인", width: "var(--st-pay, 92px)", render: (r) => markOf(r.$st.cells[1], r.$st.cur) },
  {
    label: "안내", width: "var(--st-note, minmax(140px, 1fr))",
    /* 한 줄 말줄임(시안) — 1366·1280 에서 '발급 때 → 지금' · '… 수정 마감 …까지 금액 바뀔 수 있음' 이 잘린다.
       그래서 마우스 올림은 **보이는 글부터** 다시 말하고 이유를 잇는다(잘린 끝을 거기서 읽는다). 화면 읽기 프로그램은
       잘린 글도 끝까지 읽는다(글은 DOM 에 그대로 있다). */
    render: (r) => {
      const cur = r.$st.cur;
      if (!cur) return html`<span class="st-note">거래 없음 · 명세서 없음</span>`;
      const tip = [cur.meta, cur.title].filter(Boolean).join(" · ");
      return html`<span class="st-note ${cur.hot ? "is-hot" : cur.amb ? "is-amb" : ""}" ${tip ? html`title="${tip}"` : ""}>${cur.meta}</span>`;
    },
  },
  {
    label: "거래명세서", width: "var(--st-doc, 108px)", align: "right",
    /* 줄마다 같은 글자라 이름에 그 달을 싣는다(스크린리더 목록에서 '명세서 보기' 여섯 개가 구분되지 않는다) */
    render: (r) => html`<button type="button" class="st-doclink" data-action="invoice" data-ym="${r.ym}"
      aria-label="${r.청구년월} 거래명세서 보기">명세서 보기 <span aria-hidden="true">›</span></button>`,
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
    const rows = settlementsFor(client, now).map((r) => ({ ...r, $st: stagesOf(r, now) }));
    const day = invoiceDayOf(client);
    const dl = deadlineDayOf(day);
    const early = dl === 10;
    const pend = pendingOldIssue(client, now);
    const bill = store.getBillingContactOf(client.id);
    const name = displayName(client, sharedBizKeys(store.get().clients));
    const todo = rows.filter(isTodo).length;

    /* 회사정보 카드 — 시안의 한 줄 4칸(사업자번호+회사명 · 대표자명 · 정산 담당 · 계산서 이메일).
       '시안 + 기존'(운영자 결정 4): 사업장주소 · 정산 담당 연락처 · 발급일 칩 · '바꾸기 전 날짜' 칩은 같은 카드 둘째 줄에 남긴다. */
    const info = (k, v, { empty = false, warn = false, cls = "" } = {}) => html`
      <div class="st-co__cell ${cls}">
        <p class="st-co__k">${k}</p>
        <p class="st-co__v ${empty ? "is-empty" : ""} ${warn ? "is-warn" : ""}">${v}</p>
      </div>`;
    /* 연락처는 한 덩어리로 — 하이픈에서 줄이 갈리면(010- / 0000-0111) 번호를 잘못 읽는다(1280 실측) */
    const billLabel = bill
      ? html`${[bill.name, bill.role].filter(Boolean).join(" · ")}${bill.phone ? html` · <span class="st-nw">${bill.phone}</span>` : ""}`
      : "지정된 담당자 없음";

    /* 정산 절차 4단계 — 시안 제목 틀 + 숫자는 settlement-rules(발급일 그룹으로 마감·작성일자가 갈린다).
       2번 카드의 수정 마감 날은 editLockDayOf(1~7일 그룹 9일 · 11~25일 그룹 27일 — editLockAt 과 같은 규칙).
       3번 카드는 시안이 1~7일 그룹만 그렸다 — 11~25일 그룹은 작성일자가 '동의한 날' 이라 그 분기를 남긴다.
       정산기한(입금)은 발급일과 무관하게 '발행일이 속한 달의 말일'이다(dueDate).
       두 토막짜리 보조줄은 ' · ' 자리에서만 꺾는다(.st-nw) — 1280 에서 '동의 마감 / 28일 13:00' 으로 갈렸다(실측). */
    const two = (a, b) => html`<span class="st-nw">${a}</span> · <span class="st-nw">${b}</span>`;
    const steps = [
      ["명세서 발급", `매월 ${day}일 ${hm(ISSUE_HOUR)}`],
      ["내역 확인 · 동의", two(`수정 마감 ${editLockDayOf(day)}일 ${hm(ISSUE_HOUR)}`, `동의 마감 ${dl}일 ${hm(DEADLINE_HOUR)}`)],
      ["계산서(면세) 발급", two("동의하면 바로", `작성일자 ${early ? "배송한 달 말일" : "동의한 날"}`)],
      ["입금 · 정산 완료", "기한 발급월 말일"],
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
              <div class="st-co__cell st-co__id">
                <p class="st-co__biz">${client.bizNumber || "사업자번호 미등록"}</p>
                <h2 class="st-co__name">${name}</h2>
              </div>
              ${info("대표자명", client.ceoName || "미등록", { empty: !client.ceoName })}
              ${info("정산 담당", billLabel, { warn: !bill })}
              ${/* 비면 '미등록' 만 — '정산 담당자에게 발송' 같은 폴백은 명세에 없다(담당자에게는 이메일 칸이 없다) */
                info("계산서 이메일", client.email || "미등록", { empty: !client.email })}
              ${info("사업장주소", client.address || "미등록", { empty: !client.address, cls: "st-co__addr" })}
              <div class="st-co__chips">
                <span class="st-chip">매월 <b>${day}일</b> 명세서 발급</span>
                ${pend ? html`<span class="st-chip st-chip--note">이번 달은 ${fmtKoShortTime(pend.at)} · 바꾸기 전 날짜</span>` : ""}
              </div>
            </section>

            <div class="st-proc">
              <ol class="st-steps" aria-label="정산 절차">
                ${steps.map(([t, d], i) => html`
                  <li class="st-step">
                    <span class="st-step__n" aria-hidden="true">${i + 1}</span>
                    <span class="st-step__b"><b>${t}</b><span>${d}</span></span>
                  </li>`)}
              </ol>
              <p class="st-steps__note">
                ${/* 2차 시안 문안 — 정산 달 = 배송한 달(2026-10-15 결정 · 취소 수수료는 취소한 달 — 규칙이 바뀌면 이 문장도
                     같이 고친다) · 수정 마감 = 동의 마감 전날 10:00(editLockAt). */ ""}
                정산 달은 배송한 달입니다(예약 주문은 배송한 달에, 취소 수수료는 취소한 달에 듭니다).
                동의 전에는 수정 마감(동의 마감 전날 ${hm(ISSUE_HOUR)})까지 금액이 바뀔 수 있고,
                마감까지 동의가 없으면 그 시각에 자동 동의됩니다.
                ${/* 마감에 자동 동의되지 않는 달은 약관 동의 전에 마감이 지난 달 하나다(2026-10-23 운영자 결정 D1 — '보류'(고지 미도달)는
                     없어졌다 · 낱말은 거래명세서 동의 카드 HOLD_TITLE '약관 동의 전에 마감이 지났습니다' 와 같은 말). */ ""}
                <b>단, 약관 동의 전에 마감이 지난 달은 직접 동의해야 계산서가 발급됩니다.</b>
                정산기한 다음 날 ${hm(ISSUE_HOUR)}부터는 기한 초과로 표시됩니다.
                ${/* '시안 + 기존'(운영자 결정 4) — 시안 문안으로 바뀌며 빠졌던 기존 문장(2차 시안에서도 빠졌다). 발급일을 어디서
                     바꾸고 언제부터 적용되는지 말하는 곳이 이 화면에 있어야 한다(1번 카드의 '매월 N일' 이 앞으로의 값이라서). */ ""}
                발급일은 회사정보 수정에서 바꿀 수 있고, 바꾸면 다음 달 발급분부터 적용됩니다.
                ${/* 카카오톡 채널을 앞에, 고객센터 번호를 함께(2026-10-23 운영자 결정 D5 — 채널 이름은 contact.js CS_KAKAO 한 곳이고
                     그 낱말 뒤에는 조사를 붙이지 않는다 · '이의' 라는 낱말은 쓰지 않는다). 연락처 두 덩어리만 .st-nw 로 묶는다.
                     채널 낱말은 채널 1:1 채팅을 새 창으로 여는 링크다(CS_KAKAO_URL · 2026-10-28 — 마우스를 올리면 밑줄 · '명세서 보기' 와 같은 수법). */ ""}
                <span class="st-steps__cs">내역이 다르면 <a class="st-nw" href="${CS_KAKAO_URL}" target="_blank" rel="noopener" title="카카오톡 채널 채팅 열기 · 새 창">${CS_KAKAO}</a> 또는 <span class="st-nw">고객센터 ${CS_PHONE}에</span> 알려 주세요 — 수정 마감 전이면 바로 고쳐 드립니다</span>
              </p>
            </div>

            <section class="st-card st-tbl" aria-labelledby="st-tbl-t">
              <div class="st-tbl__hd">
                <div>
                  <h2 id="st-tbl-t">정산 내역 <span class="st-count">최근 6개월</span></h2>
                  <p>명세서 보기를 누르면 그 달의 거래명세서가 열립니다. 동의는 거기서 합니다.</p>
                </div>
                <span class="st-todo ${todo ? "" : "is-zero"}">처리할 달 <b>${todo}건</b></span>
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
      /* 첫 적용 발급은 다음 달이라 12월에 바꾸면 다음 해다 — 해가 다르면 연도를 붙인다(fmtKoShortTimeY). */
      return `${periodLabel(from)} 이용분부터 적용 — ${fmtKoShortTimeY(issueDate(from, d), now)} 발급 · 동의 마감 `
        + `${fmtKoShortTimeY(agreeDeadline(from, d), now)} · 작성일자 ${early ? "이용한 달의 말일" : "동의한 날"}.${keep}`;
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
            ${dlgRow({ k: "사업장주소", req: true, htmlFor: "setco-address", v: input("address", { ph: "사업자등록증 상의 주소", cls: "ord-in--plain" }) })}
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
          <p class="dlg-note setco-note">필수는 <b>회사명 · 사업자번호 · 대표자명 · 사업장주소</b>입니다 — 이메일은 비어 있어도 저장됩니다.</p>
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
        ? ` · 새 발급일은 ${fmtKoShortY(issueDate(invoiceDayEffectiveFrom(new Date()), patch.invoiceDay))} 발급분부터`
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
