/* ============================================================
   staff-mock.js — 시스템 관리 > 담당자 관련설정 디렉터리.
   주문(B2C·B2B)을 처리하는 내부 담당자의 마스터 목록이자,
   B2C 담당자 지정 피커가 참조하는 이름 풀의 소스(staffNames).
   모듈 레벨 가변 배열이라 세션 내 편집·추가·삭제가 유지된다(재import 없음).
   실서비스에서는 서버 API로 대체.

   notify = 카카오 알림톡 수신 허용 여부(단일 ON/OFF).
     알림 이벤트 종류(B2B/B2C 주문 도착 등)는 API 사용에 따라 유동적이므로
     이 페이지는 "이 담당자가 알림을 받을지"만 관리한다.
   ============================================================ */

export const STAFF = [
  { id: "s1", name: "김총무", dept: "총무팀",     phone: "010-1234-5678", notify: true },
  { id: "s2", name: "박사원", dept: "영업1팀",    phone: "010-2345-6789", notify: true },
  { id: "s3", name: "이대리", dept: "물류팀",     phone: "010-3456-7890", notify: false },
  { id: "s4", name: "최과장", dept: "고객지원팀", phone: "010-4567-8901", notify: true },
  { id: "s5", name: "오임찬", dept: "영업2팀",    phone: "010-5678-9012", notify: true },
];

let idSeq = STAFF.length;

export function staffList() { return STAFF; }
/* B2C 담당자 피커 등에서 쓰는 라이브 이름 목록 — 디렉터리 편집이 즉시 반영된다. */
export function staffNames() { return STAFF.map((s) => s.name); }
export function staffNewId() { return "s" + String(++idSeq) + "_" + Date.now().toString(36); }
export function staffAdd(rec) { STAFF.push({ ...rec }); }
export function staffUpdate(rec) {
  const i = STAFF.findIndex((s) => s.id === rec.id);
  if (i >= 0) STAFF[i] = { ...rec };
}
export function staffRemove(id) {
  const i = STAFF.findIndex((s) => s.id === id);
  if (i >= 0) STAFF.splice(i, 1);
}
export function staffSetNotify(id, on) {
  const s = STAFF.find((x) => x.id === id);
  if (s) s.notify = !!on;
}
