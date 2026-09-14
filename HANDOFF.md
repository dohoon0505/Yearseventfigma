# HANDOFF — 세션 인수인계

> 마지막 갱신: 2026-09-14 · HEAD `f39a0e84` · origin/main 동기화 · 작업 규약은 [CLAUDE.md](CLAUDE.md) 참조

## 현재 상태
- 배포: main 푸시 → GitHub Pages 자동(`.github/workflows/deploy.yml`, 레포 루트 전체).
- 미커밋 변경 없음. 미추적 파일(`mockups/`·`MIGRATION_GUIDE.md`·`백엔드 참고문서.docx`·삭제된 `guidelines/`)은 의도적 로컬 상태 — 건드리지 말 것.
- 개발 서버는 꺼져 있을 가능성 높음 → `node serve.mjs` (localhost:8000).

## 직전 세션(2026-09-14)에서 완료된 것 — 밀린 백로그 3덩어리 전부

### ① 데이터 유출급 버그픽스 (최우선으로 처리)
`invoice-links.js`의 토큰 논리 키가 `(사업자번호, 귀속월)` 2튜플이라 **같은 법인의 다른 부서가 한 토큰을 공유**했다(부서 B가 부서 A의 명세서를 받음). 키를 `(clientId, 사업자번호, 귀속월)` 3튜플로 확장하고 localStorage를 v2로 bump. 픽스 전후를 대구가톨릭대 비서팀/홍보팀으로 재현·검증함.
공개 명세서의 사업자번호 확인 게이트는 **제거**했다 — 사업자번호가 비밀이 아니라 방어력이 없었고 부서 간 격리도 못 했다. 토큰 자체를 capability URL로 본다.

### ② 거래처 기업 A·B·C 엣지케이스 (설계 확정 → 출시)
- **기업A**: 거래처별 `invoiceDay`(1~28일, 기본 1). 발행일 = 귀속월 다음 달 지정일, 정산기한 = 그 달 말일. 관리자 모달 드롭다운 + `#/app/settlement` 안내문·표까지 전파.
- **기업B**: 대구가톨릭대 비서팀/홍보팀 시드 추가. 거래처 목록을 **사업자번호 그룹 접기**로(자식 필드 검색 시 자동 펼침). 사업자번호 중복 시 안내 + 부서 필수 전환. 정산 표·명세서 문서·리포트 3곳에 부서 표기.
- **기업C**: 주문서 배송완료 알림에 **추가 수신자 인라인 행(최대 5명)**. `state.notify`가 처음으로 실제로 읽히는 값이 됨(접수 확인·완료 화면에 수신자 요약 표시).

### ③ 구조 개선
- **목데이터 lazy 파생**: `CLIENT_USAGE`/`CLIENT_SETTLEMENTS` 정적 맵 → `usageFor(client)`/`settlementsFor(client)`. UI로 등록한 신규 거래처가 정산 표·리포트에서 사라지던 문제 해결. 규모 계수를 배열 인덱스 → 거래처 id 기반으로.
- **`#/app/settlement`을 store에 연결** — 독립 하드코딩 목데이터 제거, `getClientId()` → `clients[0]` 폴백.
- **싱크플로를 거래처 레코드(C021)로 승격** — invoice.js `BUYER` 하드코딩이 시드에서 파생된다.

### ④ 반입가이드 이식 (H→Y 미이식 3건 중 1건)
`js/data/intake-guide.js` 신설(전국 12개 시·도 / 52행, 원본과 JSON 동일). 상품 페이지에 제목 붙은 별도 섹션 + 지역 검색창. 카테고리 연동 = 경조화환 외에는 안내 문구로 대체.

### ⑤ 레거시 정리
- 죽은 CSS(`.admin-controls*`·`.admin-checkhdr`), `FIELDS[].icon` 12개, 영구 dead placeholder 폴백, `todayStr` 중복 제거
- 빈 `onClose` 콜백 10곳 제거 · `refreshTableOnly` 분리
- `.ptbl-edit/.ptbl-del` → `components.css` 승격(admin 3페이지의 암시적 profile.css 의존 해소)
- toast 4중 복제 → `js/toast.js` + `components.css`(`.toast` 개명)
- **`.bf-*` 블록 전체를 `admin.css` → `components.css`로 이동** ← 위치가 바뀌었으니 주의
- orders 필터를 `.bf-*`로 절충 이관(카드·검색·기간만, 상태 칩은 색 의미 유지)
- **tokens.css 밖 raw hex 84건 전수 토큰화** — 신규 토큰 29개

## 보류 / 열린 항목
- **의도적 미이식(H→Y)**: `mobile-order/`(별도 마일스톤), `delivery-fees` 실데이터(운영 요율 확정 대기). 반입가이드는 이번에 완료 — 목록에서 제외됨.
- **`orders.js` 목데이터 날짜가 2026/06 고정** → 기본 필터 "이번 달"에서 표가 빈다. admin-mock처럼 NOW 상대 생성으로 바꿔야 함. (이번 세션에서 발견, 백그라운드 작업으로 등록해 둠)
- `settlement.js` 회사정보수정 모달은 아직 로컬 편집만(store write-through 없음).
- 계산서 상태를 `발행일 ≤ NOW`에서 파생하기 — 발급일이 오늘보다 뒤면 미래 발행일인데 '발급완료'로 표시되는 논리 엇갈림.
- `.ptbl-*` → `.tbl-*` 리네임(이동만으로 암시적 의존은 이미 해소됨).
- `#/app/*` 라우트 가드 부재 · `isAuthed()` 데드 API.
- `admin.css`에 빈 주석 1줄 잔존(`/* ── 정산회계: 조회 기간 빠른 선택… */` — 규칙이 없음).
- **근조화환 B2C 퍼널 사이트(공감→아코디언→구매, 장례식장 랜딩, SEO)는 이 레포 대상 아님** — 사용자가 다른 프로젝트로 보낼 요청을 잘못 전달했던 것. 이 레포에서 다시 요청받으면 대상 프로젝트를 먼저 확인할 것.

## 참조 위치
- auto-memory: `~/.claude/projects/C--Users-ehgns-Documents-GitHub-Yearseventfigma/memory/MEMORY.md` (커밋 규칙·디자인 결정·워크플로 학습)
- 이번 세션 계획서: `~/.claude/plans/refactored-sauteeing-elephant.md` (확정 결정 표 + Phase별 커밋 계획)
- B2C 모달 미리보기 아트팩트(사용자 요청 시 갱신·재게시): https://claude.ai/code/artifact/b89f6bff-be29-43a3-85ee-181df9dcfd47
- 필터 시안 정본: claude.ai/design 프로젝트 `5ad2963b-4434-40a9-bd0d-df144dd4d45b` (`DesignSync` 툴)

## 데모 계정
- 관리자: `admin` / `0324`
- 거래처: `sodamchae`/`sd1234!` · `ksanit`/`kh#3030` · `thinkflow`/`tf2026@`(싱크플로) · `cu-secretary`/`cu#1102`·`cu-pr`/`cu#2203`(대구가톨릭대 부서 2건)
