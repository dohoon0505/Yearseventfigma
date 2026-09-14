/* ============================================================
   client.js — "지금 로그인한 거래처"를 한 곳에서 결정한다.

   셸 배지·거래명세서 공급받는자·정산 간편조회가 각자 다른 거래처를 들고 있어
   한 계정으로 들어가도 화면마다 회사가 달라 보이던 결함이 있었다(구 시스템 대조 d0).
   세 화면 모두 이 함수를 쓴다 — 새 화면도 반드시 여기를 경유할 것.

   폴백: 세션에 거래처 id 가 없거나(관리자 계정·딥링크) 그 거래처가 삭제됐으면
   목록의 첫 거래처. 데모에서 빈 화면이 뜨지 않게 하기 위함이다.
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

/** 표시용 회사명. 사업자번호를 공유하는 거래처끼리만 부서를 병기한다. */
export function currentClientName() {
  const c = currentClient();
  if (!c) return "";
  return displayName(c, sharedBizKeys(store.get().clients));
}
