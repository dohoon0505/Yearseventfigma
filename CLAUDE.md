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
- **색은 tokens.css 토큰만** — raw hex는 tokens.css 밖 금지. **단 예외 2곳**: `invoice-doc.js`·`report-doc.js`는 `window.open`+`document.write`로 새 창에 인쇄 문서를 쓰는데 그 창은 tokens.css를 로드하지 않는다(var()로 바꾸면 PDF 색이 사라짐). `util/xlsx.js`의 ARGB도 엑셀 포맷이라 동일.
- 공용 컴포넌트: `openModal`(스택 지원 — ESC/Tab은 최상위 오버레이만), `makeDropdown`(값≠표시면 `label` 옵션), `makeDatepicker`(placeholder 지원), `tableGrid`(`rowClass` 훅), `.toggle` 스위치(`aria-checked` 상태), `makeToast`(**js/toast.js** — mount에서 생성→cleanup에서 `destroy()`), **`.bf-*` 공용 필터 카드**(**components.css** — 언더라인 탭·세그먼트·인라인 라벨 검색·접이식 상세), `.ptbl-edit/.ptbl-del` 표 행 액션(components.css), `openCancelModal`(**js/util/cancel-modal.js** — 주문취소 사유·수수료, B2C·B2B 공용), `openPostcode`/`ensurePostcode`(**js/util/postcode.js**), `attachmentOf`(**js/util/image.js** — 첨부 이미지 축소), `currentClient`/`currentClientName`(**js/util/client.js**).
- 공용 클래스는 **components.css**에 둔다 — 페이지 CSS보다 먼저 로드돼 페이지 오버라이드가 자연히 이긴다. 페이지 CSS에 두면 다른 페이지가 전역 로드에 기대는 암시적 의존이 생긴다(`.ptbl-*`·`.bf-*`가 실제로 그랬다).
- 공개(비로그인) 페이지 선례: `delivery/` = 단독 index.html + `../css/tokens.css`+`base.css` + 전용 CSS + 비모듈 IIFE JS.

## 함정 (이 프로젝트에서 실제로 겪은 것)
### html`` 태그드 템플릿
- **boolean 값을 렌더하지 않음** → 속성은 문자열로: `aria-checked="${x ? "true" : "false"}"`.

### CSS
- 파일 끝에 append 하기 전 **중괄호 균형 확인** — admin.css가 고아 `{`로 끝나 있던 전력(뒤에 추가된 블록 전체가 통째로 무효화됨). `node -e` 중괄호 카운트로 검증.
- 팝오버(datepicker·드롭다운)를 담는 컨테이너는 `overflow:visible` 필요 — 구 `.orders-filters`가 `overflow:hidden`이라 잘렸던 전력(`.bf-card`로 이관하며 해소).
- `.dd-panel`은 **위로 열린다**(`bottom: calc(100% + 6px)`). 모달 상단에 드롭다운을 두면 패널이 잘리므로 **하단부에 배치**하거나 `top` 오버라이드가 필요하다.
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
- 공개 거래명세서 토큰: 논리 키는 **(clientId, 사업자번호, 귀속월) 3튜플**. clientId를 빼면 같은 법인의 다른 부서가 한 토큰을 공유해 남의 명세서를 받는다 — `issueLink` 호출부는 반드시 clientId를 실을 것. **본인확인 게이트는 없다**(토큰 = capability URL).
- 계산서 발급일: 거래처별 `invoiceDay` **1~28일**(기본 `"1"`, 문자열로 저장 — `makeDropdown`이 문자열을 넘기고 선택 표시가 엄격 비교라 숫자면 하이라이트가 죽는다). 발행일 = 귀속월 다음 달 지정일, **정산기한 = 그 발행일이 속한 달의 말일**.
- 사업자번호 중복은 **정상 시나리오**(같은 법인의 부서 분리) — 저장을 막지 않고 안내 + 부서 필수 전환만 한다. 부서 표기는 `util/biz.js`의 `sharedBizKeys`/`displayName`으로 **사업자번호를 공유하는 거래처에만**(전 거래처에 부서가 있어 무조건 병기하면 전 행이 노이즈).
- 주문서 배송완료 알림 추가 수신자: **최대 5명**, 이름+연락처+`.toggle`+삭제 인라인 행. 동적 행은 `data-nte-*` 접두사(리셋 루프의 `[data-nt]`와 겹치면 안 됨).
- 목데이터는 **호출 시점 lazy 파생**(`usageFor`/`settlementsFor`) — 정적 맵으로 미리 구우면 UI로 등록한 거래처가 정산·리포트에서 통째로 사라진다. 메모 키에 출력에 영향을 주는 필드(개명·발급일)를 모두 넣을 것.
- UI 판단 기준: **시인성·가독성 우선**(신입/임원도 즉시 사용) — ERP식 초밀도 금지. 표준 hm-field(48px·상단 라벨)가 기본.
- **거래처·계정·지역규칙은 구 시스템(flowerdel.pe.kr/adm2)에서 이관한 실데이터다.** 임의로 바꾸지 말 것. 담당자명·이메일이 빈 것은 구 시스템에 대응 필드가 없어서다(버그 아님).
- `clientNote`(구 '거래처 참고사항')는 메모가 아니라 **거래 조건**이다((주)홈팩: "무조건 특대상품 발송"). 주문 화면에서 담당자에게 반드시 노출한다 — 목록 `!` 표시 + 상세 경고 배너.
- 지역 규칙은 **`js/data/intake-rules.js` 단일 엔진**. `type` 3종(blocked/allowlist/surcharge)이고 **평가 순서가 곧 정책**이다: blocked → 장소 allowlist → 지역 allowlist → surcharge. 밀양농협이 밀양 전역 규칙에 가리면 정상 주문이 전부 반려된다 — 회귀에 상시 포함. `delivery-fees.js`는 이 엔진에 위임하는 얇은 어댑터이며 금액만 돌려주므로 **새 코드는 `evaluateAddress()`를 직접 쓸 것**.
- **비밀번호는 화면에 표시하지 않는다.** 거래처·담당자 모달 모두 입력칸 없이 '임시비밀번호 발급'만. 이관 시드에는 비밀번호가 없어 **아이디만으로 로그인**한다(login.js 주석 참조).
- 배송완료 알림 수신자는 **한 명단**(받는분·보내는분·담당자N·추가5). 담당자는 담당자 저장공간에서 수신 ON인 사람이 `자동` 배지로 편입되고 **이 주문에서만** 끌 수 있다(`state.managerOff`). 저장공간 설정은 건드리지 않는다.
- 배송 옵션은 **2종**(날짜·시간 지정 / 즉시배송↔익일 빠른배송). 긴급·야간은 제거됨 — 되살리지 말 것.
- 대쉬보드 수치는 **전부 목록과 같은 소스에서 파생**한다. 집계 전용 목데이터를 두면 화면 간 숫자가 어긋나 아무도 안 본다. 화면 구성은 claude.ai/design 리모델안이 정본(KPI 5장 · 액션 큐 · 추이 · 승인대기 · 도넛 · 계약 통계 · 정산 진행).
- 거래처 `channel`(`일반`·`고이`)은 **매출 채널**이다. `일반`이 아니면 대쉬보드에서 B2B 합계와 분리돼 자기 KPI 카드를 갖는다. 채널을 늘리려면 `CLIENT_CHANNELS` 에 값만 추가할 것 — 화면은 따라온다.
- 날짜 포맷이 셋이다: B2C 접수 `YYYY-MM-DD HH:mm` · B2B 주문 `YYYY/MM/DD HH:mm` · B2C 배송희망 `YYYY-MM-DDTHH:mm`. 한 파서로 받으려면 `-`→`/` 와 `T`→공백을 **둘 다** 치환해야 한다(T 를 빠뜨리면 날짜가 통째로 NaN).
- 로그인 거래처 결정은 **`js/util/client.js` 단일 소스**. 셸 배지·거래명세서·정산이 모두 이걸 쓴다. 새 화면도 반드시 경유할 것(과거 화면마다 다른 회사가 보이던 결함).
- 백엔드 계약은 **`docs/backend-spec.md`가 정본**. 코드가 바뀌면 함께 고치고 `python tools/build-docs.py`로 Word를 재생성한다. `docs/*.docx`는 생성물이라 커밋하지 않는다.
