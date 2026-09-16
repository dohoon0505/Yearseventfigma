/* ============================================================
   cancel-modal.js — 주문취소 사유·수수료 입력 모달 (B2C·B2B 공용).

   구 시스템 주문 모달에는 취소수수료·취소사유가 필수 필드였는데 신규는
   「주문취소」 버튼만 있고 입력란이 없었다. 데이터 필드(cancelFee·
   cancelReason)와 저장 로직은 이미 있었고 **입력 UI 만 없어서** 값이 영원히
   0·빈문자열이었다.

   사유는 코드값으로 받는다 — 자유 텍스트로 두면 통계도 정산 근거도 안 된다.
   '기타'만 직접 입력을 연다.

   수수료는 B2B 에서 그 달 정산에 가산되므로 금액이 걸린 입력이다.
   되돌릴 수 없는 동작이라 한 번 더 확인받는다(주문 접수 확인과 같은 패턴).

   ⚠️ 셸은 `openDialog`(js/util/dialog.js) 하나다 — 예전에는 `simpleModal` +
      전용 `.cx-*` 클래스였는데, 같은 성격의 다이얼로그가 파일마다 제 규격을
      들고 있어 헤더 크기도 버튼 모양도 갈렸다. `.cx-*` 는 CSS 에서 사라졌다.
   ⚠️ 사유를 고를 때 **본문을 다시 그리지 않는다**(`bindPick` 이 클래스와
      `aria-checked` 만 토글한다) — 재렌더는 '기타' 칸의 커서를 날린다.
   ============================================================ */
import { html, on, qs } from "../dom.js";
import { openDialog, dlgRule, dlgRow, dlgPick, dlgActions, bindPick } from "./dialog.js";

export const CANCEL_REASONS = [
  "고객 단순 변심",
  "중복 주문",
  "배송지 오류",
  "상품 품절",
  "업체 사정",
  "기타",
];

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const numOnly = (v) => String(v).replace(/[^0-9]/g, "");

/* 푸터 좌측 기본 힌트(시안) — 막는 조건이 생기면 이 자리가 '왜 못 누르는지'를 말한다.
   버튼만 흐려 두면 사용자는 이유를 찾아 화면을 헤맨다. */
const HINT_BASE = "제작 착수 전이면 수수료 0원";

/**
 * @param {{orderNo:string, amount:number, settle?:boolean,
 *          onConfirm:(r:{reason:string, fee:number}) => void}} opts
 *   settle=true 면 "그 달 정산에 가산된다"는 안내를 띄운다(B2B).
 * @returns 다이얼로그 인스턴스({ panel, close, setHint }) — 호출부가 닫기 책임을 진다
 */
export function openCancelModal({ orderNo, amount, settle = false, onConfirm }) {
  const form = { reason: CANCEL_REASONS[0], etc: "", fee: "" };
  const isEtc = () => form.reason === "기타";

  /* '기타' 칸은 골랐을 때만 보인다.
     ⚠️ 숨김을 행에 직접 걸 수 있는 것은 `.dlg-row[hidden] { display: none }` 을
        못박아 뒀기 때문이다 — 그 규칙이 없으면 `display: grid` 가 UA 의
        `[hidden]` 을 이겨 그대로 보인다(`.ordnew-req__man` 과 같은 함정).
     ⚠️ `hidden` 과 함께 입력에 `disabled` 도 건다 — openModal 의 포커스 트랩이
        `qsa(panel, FOCUSABLE)` 로 훑어 숨은 칸까지 잡는데, 그 쿼리가
        `:not([disabled])` 로만 거른다(Tab 이 보이지 않는 칸으로 빠진다). */
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
        ? html`<p class="dlg-hintline">입력한 금액은 해당 거래처의 그 달 정산에 가산됩니다.</p>`
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

  /* 막는 조건은 한 곳에서만 판단한다 — 버튼 비활성과 힌트 문구가 갈리면
     "왜 못 누르는지"를 말하는 푸터가 거짓말을 한다. */
  function sync() {
    if (!form.reason) {
      goBtn.disabled = true;
      d.setHint("취소 사유를 먼저 고르세요", true);
    } else if (isEtc() && !form.etc.trim()) {
      goBtn.disabled = true;
      d.setHint("'기타' 사유를 적어야 취소할 수 있습니다", true);
    } else {
      goBtn.disabled = false;
      d.setHint(HINT_BASE);
    }
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
      const n = numOnly(t.value);
      t.value = n ? Number(n).toLocaleString("ko-KR") : "";
      form.fee = n;
    } else {
      form.etc = t.value;
    }
    sync();
  });

  on(panel, "click", "[data-action='ok']", () => {
    const reason = isEtc() ? form.etc.trim() : form.reason;
    if (!reason) return;
    onConfirm({ reason, fee: Number(form.fee) || 0 });
    d.close();
  });

  return d;
}
