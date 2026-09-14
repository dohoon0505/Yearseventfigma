/* ============================================================
   staff-mock.js — 시스템 관리 > 담당자 계정·권한.
   주문(B2C·B2B)을 처리하는 내부 담당자의 마스터 목록이자,
   B2C 담당자 지정 피커가 참조하는 이름 풀의 소스(staffNames).
   모듈 레벨 가변 배열이라 세션 내 편집·추가·삭제가 유지된다(재import 없음).
   실서비스에서는 서버 API로 대체.

   notify = 카카오 알림톡 수신 허용 여부(단일 ON/OFF).
     알림 이벤트 종류(B2B/B2C 주문 도착 등)는 API 사용에 따라 유동적이므로
     이 페이지는 "이 담당자가 알림을 받을지"만 관리한다.

   accountId / role = 구 시스템 '사용자 리스트(101)'에서 이관.
     ─ 최근 로그인은 화면에 두지 않는다 — 목데이터에서는 갱신되지 않아 늘 같은
       값을 보여주게 되고, 실서비스에서는 감사 로그가 더 정확한 출처다(명세서 8.4).
     ─ accountId 가 빈 값이면 로그인 없는 수신자(문자만 받는 현장 담당)다.
     ─ system:true 는 사람이 아닌 운영 계정 → staffNames() 에서 제외해
       B2C 주문의 담당자 피커에 'admin' 같은 항목이 뜨지 않게 한다.
     ─ 비밀번호는 이관하지 않는다(임시비밀번호 발급 방식).
   ============================================================ */

export const STAFF_ROLES = ["최고관리자", "담당자"];

export const STAFF = [
  /* 구 시스템 이관 — 최근 1년 내 로그인 계정만(나머지 4계정은 폐기). */
  { id: "s1", name: "최고관리자", dept: "시스템",     phone: "010-7615-2699", notify: true,  accountId: "admin",     role: "최고관리자", system: true },
  { id: "s2", name: "개발",       dept: "시스템",     phone: "010-8714-1540", notify: false, accountId: "dev",       role: "최고관리자", system: true },
  { id: "s3", name: "메이플라워", dept: "운영",       phone: "",              notify: false, accountId: "mayflower", role: "담당자", system: true },
  /* 주문 처리 담당자 — 로그인 계정 없이 배정·알림만 받는다(구 시스템에 대응 없음). */
  { id: "s4", name: "김총무", dept: "총무팀",     phone: "010-1234-5678", notify: true,  accountId: "", role: "담당자" },
  { id: "s5", name: "박사원", dept: "영업1팀",    phone: "010-2345-6789", notify: true,  accountId: "", role: "담당자" },
  { id: "s6", name: "이대리", dept: "물류팀",     phone: "010-3456-7890", notify: false, accountId: "", role: "담당자" },
  { id: "s7", name: "최과장", dept: "고객지원팀", phone: "010-4567-8901", notify: true,  accountId: "", role: "담당자" },
  { id: "s8", name: "오임찬", dept: "영업2팀",    phone: "010-5678-9012", notify: true,  accountId: "", role: "담당자" },
];

let idSeq = STAFF.length;

export function staffList() { return STAFF; }
/* B2C 담당자 피커 등에서 쓰는 라이브 이름 목록 — 디렉터리 편집이 즉시 반영된다.
   운영 계정(system)은 사람이 아니므로 배정 대상에서 뺀다. */
export function staffNames() { return STAFF.filter((s) => !s.system).map((s) => s.name); }
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
