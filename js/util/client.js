/* ============================================================
   client.js — "지금 로그인한 거래처"를 한 곳에서 결정한다.

   셸 배지·거래명세서 공급받는자·정산회계 조회가 각자 다른 거래처를 들고 있어
   한 계정으로 들어가도 화면마다 회사가 달라 보이던 결함이 있었다(구 시스템 대조 d0).
   세 화면 모두 이 함수를 쓴다 — 새 화면도 반드시 여기를 경유할 것.

   폴백: 세션에 거래처 id 가 없거나(관리자 계정·딥링크) 그 거래처가 삭제됐으면
   목록의 첫 거래처. 데모에서 빈 화면이 뜨지 않게 하기 위함이다.
   ⚠️ 이 폴백은 **관리자 몫**이다. 거래처 계정이 여기로 떨어지면 남의 명세서를 본다 — 그래서
   거래처 세션은 로그인(login.js)과 화면 이동(router.js)이 `portalBlock` 으로 먼저 걸러 낸다.
   ============================================================ */
import { store } from "../store.js";
import { getClientId } from "../session.js";
import { sharedBizKeys, displayName } from "./biz.js";
import { CS_PHONE } from "../data/contact.js";
import { WITHDRAWN } from "../data/admin-mock.js";

/** @returns {object|null} 로그인한 거래처 레코드(없으면 첫 거래처, 그마저 없으면 null) */
export function currentClient() {
  const clients = store.get().clients;
  const id = getClientId();
  return clients.find((c) => c.id === id) || clients[0] || null;
}

/** 거래처 상태 '탈퇴'(2026-10-22 운영자 답 A — '정지' 를 없애고 둔 상태). 계정을 닫고 기록은 남긴다 · 되돌리지 않는다.
 *  낱말의 정본은 data/admin-mock.js `WITHDRAWN`(store·b2b-mock 도 읽는 바닥층) — 화면 층은 여기서 받는다.
 *  탈퇴를 막는 판정(끝나지 않은 정산)은 util/withdraw.js `withdrawBlockOf` 다. `isWithdrawn` 을 이 파일에 두는 까닭 —
 *  withdraw.js 는 util/settlement.js 를, util/settlement.js 는 이 파일을 부른다(여기서 withdraw.js 를 부르면 순환). */
export { WITHDRAWN };
export const isWithdrawn = (client) => !!client && client.status === WITHDRAWN;

/** 이 거래처 계정이 포털을 쓸 수 없으면 그 이유(로그인 화면에 띄울 문구), 쓸 수 있으면 null.
 *  승인대기·반려·탈퇴는 **로그인 자체를 막는다**(2026-09-25 사용자 결정 · 명세 3.1 · 탈퇴는 2026-10-22 결정 A). 로그인 시점(login.js)과
 *  이미 열린 세션(router.js — 로그인 뒤 관리자가 탈퇴 처리·반려했거나 지웠을 때)이 이 판정 하나를 쓴다.
 *  탈퇴 문구는 **자격 증명이 맞은 뒤에만** 보인다(login.js) — 아이디를 다시 쓸 수 없다는 말이 남의 계정을 알아내는 통로가 되지 않는다.
 *  탈퇴한 계정의 접속 아이디는 그대로 '쓰는 중' 이다(store.accountIdTaken) — 그래서 '다른 아이디로' 새로 가입하라고 말한다. */
export function portalBlock(client) {
  if (!client) return "계정 정보를 찾을 수 없습니다. 다시 로그인해 주세요.";
  switch (client.status || "활성") {
    case "활성":
      return null;
    case "승인대기":
      return "가입 승인 심사 중입니다. 승인 안내를 받은 뒤 로그인할 수 있습니다.";
    case "반려":
      return `가입이 반려되었습니다${client.rejectReason ? ` (사유: ${client.rejectReason})` : ""}. 고객센터(${CS_PHONE})로 문의해 주세요.`;
    case WITHDRAWN:
      return `탈퇴한 계정입니다. 다시 이용하시려면 다른 아이디로 새로 가입해 주세요. 궁금한 점은 고객센터(${CS_PHONE})로 문의해 주세요.`;
    default:
      return `지금은 이용할 수 없는 계정입니다. 고객센터(${CS_PHONE})로 문의해 주세요.`;
  }
}

/** 아직 약관에 동의하지 않은 거래처인가(관리자가 등록하고 첫 로그인 전 · 약관 게이트를 지나지 않은 계정).
 *  처음 동의 시각(termsFirstAgreedAt)이나 마지막 동의 시각(termsAgreedAt) 중 하나라도 있으면 동의한 것이다 —
 *  자동 동의 판정(store.agreementOf)과 같은 두 칸을 본다. 약관 버전이 올라 재동의를 기다리는 계정은 여기 들지 않는다.
 *  **탈퇴한 거래처는 들지 않는다**(2026-10-22 결정 A) — 다시 로그인하지 않으므로 '약관 동의 전' 표시·배너·대쉬보드 경고·
 *  '약관 동의 전만 보기' 가 그 계정을 부르면 할 수 없는 일을 하라고 말하게 된다(끝나지 않은 정산이 있으면 탈퇴할 수 없어
 *  기다리는 달도 없다). 자동 동의 판정은 이 함수를 보지 않는다(store.agreementOf 가 두 칸을 직접 본다). */
export const termsPending = (client) => !!client && !isWithdrawn(client) && !(client.termsFirstAgreedAt || client.termsAgreedAt);

/** 표시용 회사명. 사업자번호를 공유하는 거래처끼리만 부서를 병기한다. */
export function currentClientName() {
  const c = currentClient();
  if (!c) return "";
  return displayName(c, sharedBizKeys(store.get().clients));
}
