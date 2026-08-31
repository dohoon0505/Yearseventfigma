# CLAUDE.md — 작업 규약 (모든 세션 공통)

올해의경조사(Y): 경조화환 기업/관리자 서비스. 바닐라 JS 해시 SPA, 빌드 없음, GitHub Pages(레포 루트 전체) 배포.

## 세션 시작 체크리스트
1. **개발 서버**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/` → 응답 없으면 `node serve.mjs` 백그라운드 기동. (서버는 세션 간 자주 죽어 있음)
2. **데모 로그인**: `admin` / `0324` → admin 롤. 로그인 페이지 감지 시 자동 처리 습관화.
3. **HANDOFF.md** 와 auto-memory(MEMORY.md 인덱스) 확인 — 직전 세션 상태·보류 항목.
4. 미추적 파일(`mockups/`, `MIGRATION_GUIDE.md`, `백엔드 참고문서.docx`, 삭제된 `guidelines/`)은 **의도적 로컬 상태 — 절대 커밋/복원/정리하지 말 것.**

## 작업 규칙
- **항상 커밋 & 푸시** (상시 승인, 되묻지 않기): 한국어 conventional commit + 본문 요약 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` → `git push origin main`.
- 기능 변경은 **Playwright MCP 브라우저 검증 후** 커밋. 스크린샷은 세션 scratchpad에 저장(레포에 남기지 말 것).
- UI 변경 전 사용자가 시안을 원하는지 확인 — 이 사용자는 claude.ai/design(.dc.html, `DesignSync` 툴)이나 Figma MCP로 시안을 직접 전달하는 워크플로를 씀. "디자인 적용" 요청 시 해당 소스부터 확인.
- 큰 설계 변경은 AskUserQuestion 여러 라운드 + 목업 비교가 효과적(사용자 선호).

## 아키텍처 규약
- 페이지 계약: `mount(root, { nav }) → cleanup`. 이벤트는 `on()` 위임(대상 요소에 1회) — `setHTML` 재렌더에도 생존. `makeDropdown`/`makeDatepicker` 인스턴스만 재렌더마다 `destroy()→재생성`, cleanup에서도 destroy.
- **색은 tokens.css 토큰만** — raw hex는 tokens.css 밖 금지.
- 공용 컴포넌트: `openModal`(스택 지원 — ESC/Tab은 최상위 오버레이만), `makeDropdown`, `makeDatepicker`(placeholder 지원), `tableGrid`, `.toggle` 스위치(`aria-checked` 상태), **`.bf-*` 공용 필터 카드**(admin.css — 언더라인 탭·세그먼트·인라인 라벨 검색·접이식 상세).
- 공개(비로그인) 페이지 선례: `delivery/` = 단독 index.html + `../css/tokens.css`+`base.css` + 전용 CSS + 비모듈 IIFE JS.

## 함정 (이 프로젝트에서 실제로 겪은 것)
### html`` 태그드 템플릿
- **boolean 값을 렌더하지 않음** → 속성은 문자열로: `aria-checked="${x ? "true" : "false"}"`.

### CSS
- 파일 끝에 append 하기 전 **중괄호 균형 확인** — admin.css가 고아 `{`로 끝나 있던 전력(뒤에 추가된 블록 전체가 통째로 무효화됨). `node -e` 중괄호 카운트로 검증.
- 공용 `.orders-filters`는 `overflow:hidden` — 팝오버(datepicker 등)가 잘림. 팝오버 담는 컨테이너는 `overflow:visible` 필요.
- base.css 전역 `:focus-visible` 링이 커스텀 입력 컨테이너 내부 input에 이중 테두리를 만듦 → 컨테이너가 포커스를 표시하면 내부는 `box-shadow:none; outline:none`.
- 같은 특이도 셀렉터는 나중 선언이 이김 — 페이지 한정 오버라이드는 특이도를 올려서(`.modal-panel--x .y .z`).

### Playwright MCP 검증
- 해시만 바꾸는 `goto('#/...')`는 **ES 모듈을 재로드하지 않음** → 코드 변경 검증 전 반드시 `page.reload({ waitUntil: "networkidle" })`.
- `page.reload()`는 **모듈 목데이터를 시드로 초기화** — 세션 내 편집 상태를 검증하려면 리로드 없이 해시 이동.
- 파일초저 누적 방지: 스크립트 첫 줄에 `page.on('filechooser', fc => fc.setFiles([]).catch(()=>{}))`.
- 브라우저/MCP 재연결로 상태가 자주 날아감 → **스크립트는 자기완결형**(로그인 감지→로그인→이동→검증)으로.
- `import('/js/...?v='+Date.now())`는 **별도 모듈 인스턴스** — 앱 상태 검사에 절대 사용 금지.
- ESC는 드롭다운이 아니라 **모달을 닫음**(openModal 전역 키) — dd는 바깥 클릭으로 닫기.
- 이미지 업로드 테스트는 file chooser 대신 `DataTransfer`+`new File`로 input.files 주입 후 change 디스패치.
- 모달 닫기 셀렉터는 `[data-action='close']`가 2개(X·닫기 버튼) — `.hm__x` 사용.

## 도메인 규약 (확정 사항 — 재논의 금지)
- B2C 주문 상태: `접수대기 → 주문접수 → 배송완료` + `취소`. 배송완료 시 `notified=true` 자동(알림톡).
- B2C 모달: 읽기 우선(시안 C) — 저장=모달 유지·읽기 복귀, 상태 액션(주문접수/취소)=즉시 반영, 자동 배송완료=주문접수+사진+인수자 저장 시. 값 타이포 17px bold(요청사항 제외).
- 담당자 소스: `js/data/staff-mock.js` (시스템 관리>담당자 관련설정). B2C 피커는 `staffNames()` 라이브 파생. 담당자 지정 모달 = 드롭다운 + '직접 입력…' 2단.
- 알림 설정: 담당자당 **카카오 알림톡 수신 ON/OFF 단일 토글**만(이벤트별 세분화 없음 — API 유동적).
- UI 판단 기준: **시인성·가독성 우선**(신입/임원도 즉시 사용) — ERP식 초밀도 금지. 표준 hm-field(48px·상단 라벨)가 기본.
