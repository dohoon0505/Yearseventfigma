/* ============================================================
   cancel-modal.js — 주문취소 사유·수수료 입력 모달 (B2C·B2B 공용).

   구 시스템 주문 모달에는 취소수수료·취소사유가 필수 필드였는데 신규는
   「주문취소」 버튼만 있고 입력란이 없었다. 데이터 필드(cancelFee·
   cancelReason)와 저장 로직은 이미 있었고 **입력 UI 만 없어서** 값이 영원히
   0·빈문자열이었다.

   사유는 코드값으로 받는다 — 자유 텍스트로 두면 통계도 정산 근거도 안 된다.
   '기타'만 직접 입력을 연다.

   수수료는 B2B 에서 취소한 달의 정산에 가산되므로 금액이 걸린 입력이다(2026-10-15 — 주문의 귀속월은 배송한 달이라
   예약 주문을 미리 취소하면 두 달이 다르다. 명세 3.4 '마감 전 수정' 6).
   되돌릴 수 없는 동작이라 한 번 더 확인받는다(주문 접수 확인과 같은 패턴).
   수수료는 **0원부터 그 주문 금액까지**다(2026-10-19 — 명세 5.3 불변식 · 6.4 `400 CANCEL_FEE_INVALID` · 2차 답 N22 ①). 예전엔 상한이
   없어 50,000원 주문에 500,000원이 그대로 저장됐다. 넘으면 '주문 취소하기' 를 잠그고 푸터가 이유를 말한다(창 안내 문장 전체는
   디자인 요청서 O-6 시안 대기 — 여기서는 막는 힌트만 더했다).

   ⚠️ 셸은 `openDialog`(js/util/dialog.js) 하나다 — 예전에는 `simpleModal` +
      전용 `.cx-*` 클래스였는데, 같은 성격의 다이얼로그가 파일마다 제 규격을
      들고 있어 헤더 크기도 버튼 모양도 갈렸다. `.cx-*` 는 CSS 에서 사라졌다.
   ⚠️ 사유를 고를 때 **본문을 다시 그리지 않는다**(`bindPick` 이 클래스와
      `aria-checked` 만 토글한다) — 재렌더는 '기타' 칸의 커서를 날린다.
   ============================================================ */
import { html, on, qs } from "../dom.js";
import { openDialog, dlgRule, dlgRow, dlgPick, dlgActions, bindPick, linkReason } from "./dialog.js";
import { readWonInput } from "./order-fields.js";
import { cancelFeeError } from "../data/order-rules.js"; // 수수료 상한 규칙(B2B·B2C 공통 · import 0 — 쓰기 함수가 같은 함수로 한 번 더 막는다)

export const CANCEL_REASONS = [
  "고객 단순 변심",
  "중복 주문",
  "배송지 오류",
  "상품 품절",
  "업체 사정",
  "기타",
];

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
/* ⚠️ 수수료는 숫자 외 글자를 **지우지 않고 거부한다**(주문금액 칸과 같은 규칙 — order-fields.js parseWon).
   예전엔 숫자만 남기는 정형(`replace(/[^0-9]/g, "")`)이라 `12,345.67` 이 1,234,567원(100배)이 되어
   그대로 그 달 정산에 가산됐다(2026-10-15 실측). 칸 옆에 '원' 이 따로 있어 칸 안에는 단위 없이 쓴다
   — 그래서 `settleWonInput`(칸에 'N원' 을 쓴다) 대신 아래 focusout 처리가 feeText 로 되돌린다. */
const feeText = (n) => (n ? Number(n).toLocaleString("ko-KR") : "");

/* 푸터 좌측 기본 힌트(시안) — 막는 조건이 생기면 이 자리가 '왜 못 누르는지'를 말한다.
   버튼만 흐려 두면 사용자는 이유를 찾아 화면을 헤맨다. */
const HINT_BASE = "제작 착수 전이면 수수료 0원";

/**
 * @param {{orderNo:string, amount:number, settle?:string|false,
 *          onConfirm:(r:{reason:string, fee:number}) => void, onClose?:() => void}} opts
 *   amount — 수수료의 상한이기도 하다(명세 5.3 · 6.4 `400 CANCEL_FEE_INVALID` — 0원부터 그 주문 금액까지 · 0원 주문은 0원만).
 *   기준은 취소하는 순간 저장될 금액이다 — 두 상세 창(B2B·B2C)은 작성 중인 수정을 취소와 함께 저장하므로 작업본 금액을 넘긴다.
 *   넘으면 '주문 취소하기' 를 잠그고 푸터가 이유를 말한다(판정은 data/order-rules `cancelFeeError` — 쓰기 함수와 같은 함수).
 *   settle 에 달 이름('2026년 10월' — 취소한 달)을 넘기면 "그 달 정산에 가산된다"는 안내를 띄운다(B2B).
 *   달을 이름으로 말하는 이유: 수수료가 붙는 달(취소한 달)과 주문의 귀속월(배송한 달)이 다를 수 있다.
 *   onClose(선택) — 창이 닫힌 뒤(✕·돌아가기·ESC·취소 확정 모두 · 삭제 확인 창 openDeleteConfirm 의 onClose 와 같은 자리).
 *   확정은 onConfirm 이 상세 창 머리를 다시 그린 **뒤** 창을 닫으므로, 창이 돌려줄 버튼(···)이 그사이 DOM 에서 떨어져 초점이
 *   body 로 빠진다 — 호출부가 여기서 새 버튼으로 되돌린다. 안 넘기면 예전과 같다.
 * @returns 다이얼로그 인스턴스({ panel, close, setHint }) — 호출부가 닫기 책임을 진다
 */
export function openCancelModal({ orderNo, amount, settle = false, onConfirm, onClose }) {
  /* fee 는 마지막으로 받아들인 값(숫자). feeBad 는 지금 칸의 글자가 거부된 상태인지 — 그동안은 취소를 막는다
     (되돌릴 수 없는 동작이라 칸에 보이는 값과 청구될 값이 다를 수 있는 순간에 누르게 두지 않는다). */
  const form = { reason: CANCEL_REASONS[0], etc: "", fee: 0, feeBad: false };
  const isEtc = () => form.reason === "기타";
  /* 받아들인 수수료가 주문금액을 넘는가 — 칸의 글자는 그대로 두고(되돌리면 적은 값이 사라진다) 취소만 막는다. */
  const overCap = () => !!cancelFeeError(amount, form.fee);

  /* '기타' 칸은 골랐을 때만 보인다.
     ⚠️ 숨김을 행에 직접 걸 수 있는 것은 `.dlg-row[hidden] { display: none }` 을
        못박아 뒀기 때문이다 — 그 규칙이 없으면 `display: grid` 가 UA 의
        `[hidden]` 을 이겨 그대로 보인다(`.ordnew-req__man` 과 같은 함정).
     `hidden` 과 함께 입력에 `disabled` 도 건다. 처음엔 openModal 의 트랩이 `qsa(panel, FOCUSABLE)` 로 숨은 칸까지 잡아
     (`:not([disabled])` 로만 걸렀다) Tab 이 보이지 않는 칸으로 빠졌기 때문이다. 2026-10-17 부터 트랩(ui.js `tabbables()`)이
     보이지 않는 칸을 스스로 빼므로 지금은 겹치는 안전장치다. */
  const etcRow = dlgRow({
    k: "사유 입력",
    req: true,
    slot: "etcrow",
    hidden: !isEtc(),
    htmlFor: "cx-etc",
    v: html`<input class="ord-in" id="cx-etc" data-cx="etc" type="text" maxlength="60"
                   placeholder="예) 상주 요청으로 다른 업체 발주"
                   ${isEtc() ? "" : "disabled"} />`,
  });

  /* 사유는 2열 버튼 그리드 — 6개뿐이라 목록보다 한눈에 보이는 편이 낫다(시안) */
  const body = html`
    <div class="dlg-note">
      <b>취소는 되돌릴 수 없습니다.</b> 주문금액 ${won(amount)} 건입니다.
    </div>
    <div>
      ${dlgRule({ t: "취소 사유", cap: "정산 명세에 함께 남습니다" })}
      <div class="dlg-rows dlg-grid2" role="radiogroup" aria-label="취소 사유">
        ${CANCEL_REASONS.map((r) => dlgPick({ v: r, name: r, sel: r === form.reason, sm: true }))}
      </div>
      <div class="dlg-rows">
        ${etcRow}
        ${dlgRow({
          k: "취소 수수료",
    htmlFor: "cx-fee",
          v: html`<input class="ord-in ord-in--num is-right" id="cx-fee" data-cx="fee" type="text"
                         inputmode="numeric" placeholder="0" />
                  <span class="dlg-row__unit">원</span>`,
        })}
      </div>
      ${settle
        ? html`<p class="dlg-hintline">입력한 금액은 해당 거래처의 ${settle} 정산(취소한 달)에 가산됩니다.</p>`
        : ""}
    </div>
  `;

  const d = openDialog({
    eyebrow: orderNo,
    eyebrowNum: true,
    title: "주문을 취소할까요?",
    width: 480,
    bodyClass: "dlg-body--sections",
    body,
    hint: HINT_BASE,
    onClose,
    actions: dlgActions({
      cancel: "돌아가기",
      ok: "주문 취소하기",
      okClass: "hm-btn--danger",
    }),
  });

  const panel = d.panel;
  const etcRowEl = qs(panel, "[data-slot='etcrow']");
  const etcInput = qs(panel, "[data-cx='etc']");
  const goBtn = qs(panel, "[data-action='ok']");
  const feeIn = qs(panel, "[data-cx='fee']");
  const hintEl = qs(panel, "[data-slot='dlghint']");

  /* 막는 조건은 한 곳에서만 판단한다 — 버튼 비활성과 힌트 문구가 갈리면
     "왜 못 누르는지"를 말하는 푸터가 거짓말을 한다.
     수수료가 원인이면(거부된 글자 · 상한 초과) 그 이유를 **수수료 칸에 잇는다**(dialog.js linkReason — aria-invalid +
     aria-describedby = 푸터 힌트). 예전엔 상한을 넘어도 버튼만 잠겨, 화면낭독기로 칸에 있는 사람은 왜 못 누르는지 듣지 못했다.
     힌트가 다른 이유('기타' 사유)를 말하는 동안에는 잇지 않는다 — 칸의 설명이 칸과 상관없는 말이 된다. 칸이 틀린 것은 그대로 알린다. */
  function sync() {
    let feeWhy = false;
    if (!form.reason) {
      goBtn.disabled = true;
      d.setHint("취소 사유를 먼저 고르세요", true);
    } else if (isEtc() && !form.etc.trim()) {
      goBtn.disabled = true;
      d.setHint("'기타' 사유를 적어야 취소할 수 있습니다", true);
    } else if (form.feeBad) {
      goBtn.disabled = true;
      d.setHint("수수료는 숫자와 쉼표로만 적어 주세요", true);
      feeWhy = true;
    } else if (overCap()) {
      goBtn.disabled = true;
      d.setHint(`수수료는 주문금액 ${won(amount)}을 넘을 수 없습니다`, true);
      feeWhy = true;
    } else {
      goBtn.disabled = false;
      d.setHint(HINT_BASE);
    }
    linkReason(feeIn, hintEl, feeWhy);
    if (!feeWhy && overCap()) feeIn.setAttribute("aria-invalid", "true");
  }
  sync();

  /* 고를 때 행을 다시 그리지 않는다 — bindPick 이 is-sel/aria-checked 만 토글한다 */
  bindPick(panel, (v) => {
    form.reason = v;
    etcRowEl.hidden = !isEtc();
    etcInput.disabled = !isEtc();
    sync();
  });

  on(panel, "input", "[data-cx]", (e, t) => {
    if (t.dataset.cx === "fee") {
      /* 빈칸은 0원이다(수수료는 선택). 그 밖에는 공용 규칙 — 받으면 값을 쓰고, 거부하면 칸을 빨갛게 두고 값은 그대로. */
      if (!t.value.trim()) {
        t.classList.remove("is-bad");
        t.setAttribute("aria-invalid", "false");
        form.fee = 0;
        form.feeBad = false;
      } else {
        const n = readWonInput(t);
        form.feeBad = n === null;
        if (n !== null) form.fee = n;
      }
    } else {
      form.etc = t.value;
    }
    sync();
  });

  /* 칸을 떠나면 받아들인 값으로 다시 쓴다 — 거부된 원문이 남아 청구될 값과 갈리지 않게(blur 는 버블링하지 않아 focusout) */
  on(panel, "focusout", "[data-cx='fee']", (e, t) => {
    t.value = feeText(form.fee);
    t.classList.remove("is-bad");
    t.setAttribute("aria-invalid", "false");
    form.feeBad = false;
    sync();
  });

  on(panel, "click", "[data-action='ok']", () => {
    const reason = isEtc() ? form.etc.trim() : form.reason;
    if (!reason) return;
    if (form.feeBad || overCap()) return;
    onConfirm({ reason, fee: Number(form.fee) || 0 });
    d.close();
  });

  return d;
}
