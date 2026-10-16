/* ============================================================
   actor.js — 기록의 '누가' 를 한 곳에서 정한다(2026-10-16 DATA.md 1.4).

   쓰는 곳: 정산 금액 변경 기록(b2b-mock 쓰기 함수 → store.amountLog) · 계산서 다시 시도·직접 입력(store.einvoice[…].by) ·
   입금 확인(store.payments[…].by). 화면은 `by` 를 그대로 찍는다(표기 `이름(부서)` — actorLabel).

   데모 로그인은 **역할만** 남긴다(session.js — "admin" | "enterprise"). 관리자 접속 아이디는 직원 목록(staff-mock)의
   최고관리자(시스템) 계정과 같으므로 그 직원으로 본다. 실서비스는 세션의 직원 id 를 서버가 감사 로그에 남긴다(명세 8.4).
     역할 admin      → { type: "staff",  id: "s1", name: "최고관리자", dept: "시스템" }
     역할 enterprise → { type: "client", id: 거래처 id, name: 회사 표시명, dept: "" }
                      (포털은 명세서가 나간 달을 건드릴 길이 없다 — 배송일을 오늘~30일 뒤만 고른다. 그래도 기록은 정직하게)
     역할 없음       → { type: "system", id: "", name: "자동", dept: "" }
   import 방향: util/actor → store · session · staff-mock · util/biz. store·b2b-mock 은 이 모듈을 import 해도 순환이 없다
   (store 는 import 하지 않는다 — 시드 처리자는 staff-mock 의 SEED_ACTOR 를 직접 쓴다).
   ============================================================ */
import { store } from "../store.js";
import { getRole, getClientId, isReservedAccountId } from "../session.js";
import { staffList, staffActor } from "../data/staff-mock.js";
import { sharedBizKeys, displayName } from "./biz.js";

/** 사람이 아닌 처리(파생·잡) — 화면 표기 '자동'. */
export const SYSTEM_ACTOR = Object.freeze({ type: "system", id: "", name: "자동", dept: "" });

/** 지금 이 화면을 쓰는 사람. 세션 저장소를 못 읽으면(비활성) 역할 없음으로 본다. */
export function currentActor() {
  let role = null;
  try { role = getRole(); } catch { role = null; }
  if (role === "admin") {
    const s = staffList().find((x) => isReservedAccountId(x.accountId));
    return s ? staffActor(s) : { type: "staff", id: "", name: "관리자", dept: "" };
  }
  if (role === "enterprise") {
    let id = null;
    try { id = getClientId(); } catch { id = null; }
    const clients = store.get().clients;
    const c = clients.find((x) => x.id === id) || null;
    return { type: "client", id: id || "", name: c ? displayName(c, sharedBizKeys(clients)) : "", dept: "" };
  }
  return { ...SYSTEM_ACTOR };
}

/** 처리자 표기 — `이름(부서)`(부서가 없으면 이름만). by 가 없으면 "" — 화면이 '처리자 기록 없음' 등으로 채운다. */
export const actorLabel = (by) => (!by || !by.name ? "" : by.dept ? `${by.name}(${by.dept})` : by.name);
