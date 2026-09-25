/* ============================================================
   client.js — "지금 로그인한 거래처"를 한 곳에서 결정한다.

   셸 배지·거래명세서 공급받는자·정산 간편조회가 각자 다른 거래처를 들고 있어
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

/** @returns {object|null} 로그인한 거래처 레코드(없으면 첫 거래처, 그마저 없으면 null) */
export function currentClient() {
  const clients = store.get().clients;
  const id = getClientId();
  return clients.find((c) => c.id === id) || clients[0] || null;
}

/** 이 거래처 계정이 포털을 쓸 수 없으면 그 이유(로그인 화면에 띄울 문구), 쓸 수 있으면 null.
 *  승인대기·반려·정지는 **로그인 자체를 막는다**(2026-09-25 사용자 결정 · 명세 3.1). 로그인 시점(login.js)과
 *  이미 열린 세션(router.js — 로그인 뒤 관리자가 정지했거나 지웠을 때)이 이 판정 하나를 쓴다. */
export function portalBlock(client) {
  if (!client) return "계정 정보를 찾을 수 없습니다. 다시 로그인해 주세요.";
  switch (client.status || "활성") {
    case "활성":
      return null;
    case "승인대기":
      return "가입 승인 심사 중입니다. 승인 안내를 받은 뒤 로그인할 수 있습니다.";
    case "반려":
      return `가입이 반려되었습니다${client.rejectReason ? ` (사유: ${client.rejectReason})` : ""}. 고객센터로 문의해 주세요.`;
    case "정지":
      return "이용이 정지된 계정입니다. 고객센터로 문의해 주세요.";
    default:
      return "지금은 이용할 수 없는 계정입니다. 고객센터로 문의해 주세요.";
  }
}

/** 표시용 회사명. 사업자번호를 공유하는 거래처끼리만 부서를 병기한다. */
export function currentClientName() {
  const c = currentClient();
  if (!c) return "";
  return displayName(c, sharedBizKeys(store.get().clients));
}
