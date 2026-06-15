# 올해의경조사 — 시스템 가이드라인

> 이 문서는 AI 또는 인간 개발자가 프로젝트를 이어받아 유지보수 및 확장할 수 있도록
> 시스템의 전체 구조, 설계 원칙, 워크플로를 기술합니다.
>
> **최종 업데이트**: 2026-06-15 (React → 순수 HTML/CSS/바닐라 JS 전면 재작성)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | 올해의경조사 (Years of Event) |
| 목적 | 기업 경조사 꽃배달 주문·정산·관리 시스템 (B2B) |
| 호스팅 | GitHub Pages (`/Yearseventfigma/`) |
| 기술 스택 | **순수 HTML5 · CSS3 · 바닐라 JS (ES 모듈)** — 프레임워크·빌드 도구 없음 |
| 라우팅 | 직접 구현한 해시 라우터 (`js/router.js`) |
| 상태관리 | 경량 pub/sub 스토어 + `localStorage` 영속 (`js/store.js`) |
| 아이콘 | 인라인 SVG `<symbol>` 스프라이트 (`js/icons.js`, lucide 기반) |
| 폰트 | Pretendard (CDN, `index.html` `<link>`) |
| 백엔드 | 없음 — 데이터는 목업 + localStorage |

> **빌드리스**: npm/Vite/Tailwind/React 없음. 네이티브 ES 모듈 + 손수 작성 CSS.
> 로컬 실행은 정적 서버만 있으면 됩니다 (`node serve.mjs`).

---

## 2. 디렉토리 구조

```
Yearseventfigma/
├── index.html                  # 진입점: CSS 링크 + #app + <script type="module" src="./js/main.js">
├── .nojekyll                   # GitHub Pages Jekyll 처리 방지
├── serve.mjs                   # 의존성 0 로컬 정적 서버 (node serve.mjs)
├── css/
│   ├── tokens.css              # :root 디자인 토큰 — hex 리터럴은 여기에만 존재
│   ├── base.css                # 리셋·타이포·:focus-visible 링·아이콘
│   ├── components.css          # 재사용 클래스 (btn/card/input/badge/modal/table-grid/toggle…)
│   ├── shell.css               # 헤더 + 사이드바
│   └── pages/                  # 페이지별 스타일 (auth/order/orders/invoice/settlement/profile/products)
├── js/
│   ├── main.js                 # store.hydrate() → buildSprite() → router.start()
│   ├── router.js               # 해시 라우터: 라우트표, mount/unmount 생명주기, nav()
│   ├── store.js                # 전역 상태 + localStorage (profiles/contacts/favorites) + ALL_PRODUCTS
│   ├── shell.js                # 앱 셸(헤더+사이드바) 렌더, 활성 메뉴, 로그아웃
│   ├── dom.js                  # html`` 태그(XSS 이스케이프) · el · on(위임) · qs/qsa · setHTML
│   ├── icons.js                # 32+ lucide 아이콘 SVG 스프라이트 + icon(name,{size,cls})
│   ├── ui.js                   # pageTitle · tableGrid · openModal(포커스트랩) · simpleModal
│   ├── util/date.js            # RealTimeOrders 날짜 파서/범위 헬퍼 (순수 함수)
│   └── pages/                  # 페이지 모듈 (login/register/order/orders/invoice/settlement/profile/products)
├── assets/                     # 이미지 (PNG, 의미있는 파일명)
├── guidelines/                 # 이 문서가 위치한 곳
│   ├── Guidelines.md           # 시스템 가이드라인 (현재 문서)
│   ├── Database.md             # 데이터 구조 명세
│   └── API_guide.md            # Barobill API 연동 가이드 (미구현, 향후)
├── .github/workflows/deploy.yml # 무빌드 정적 업로드 (GitHub Pages)
└── README.md
```

**페이지 모듈 계약**: 각 `js/pages/*.js`는 `export function mount(root, ctx) → cleanup`을 노출합니다.
라우터가 라우트 전환 시 직전 페이지의 `cleanup()`을 호출해 타이머·리스너·모달을 정리합니다.

---

## 3. 라우팅 구조 (해시 기반)

```
#/                → #/login 리다이렉트
#/login           → 로그인          (셸 없음)
#/register        → 회원가입        (셸 없음)

#/app             → 셸(헤더+사이드바) + 경조상품 주문
  ├── #/app/orders     → 실시간 주문처리 내역
  ├── #/app/invoice    → 거래명세서 조회
  ├── #/app/settlement → 정산회계 조회
  ├── #/app/profile    → 프로필 저장공간
  └── #/app/products   → 상품 규격 안내
```

- 미지정/미존재 해시는 `#/login`으로 리다이렉트.
- 셸(`shell.js`)은 `/app/*` 진입 시 **한 번만** 마운트되고 페이지 본문만 교체됩니다.
- 활성 메뉴 규칙: `#/app`은 정확히 일치할 때만 활성, 나머지는 해당 라우트.
- 프로그램 이동은 `nav(hash)` (router.js export) — `useNavigate` 대체.
- 해시는 클라이언트 전용이라 GitHub Pages 404 폴백이 필요 없고, 모든 에셋은 상대 경로(`./...`).

**사이드바 메뉴 그룹:**
- 사용자 메뉴: 경조상품 주문, 실시간 주문내역
- 정산관련메뉴: 거래명세서 조회, 정산회계 조회
- 회사관련메뉴: 프로필 저장공간, 상품 규격 안내

---

## 4. 페이지별 기능 명세

### 4.1 Login (`js/pages/login.js`)

**레이아웃**: 좌측 다크 패널(#111118, ≥1024px만) + 우측 폼 패널(#f5f5f7)

| 영역 | 내용 |
|------|------|
| 좌측 패널 | 로고, `Enterprise Service` 레이블, 헤드카피, 실적 지표 3가지 |
| 우측 패널 | 흰 카드, 아이디 입력, 비밀번호(눈 아이콘 토글), 로그인 버튼, 회원가입 링크 |
| 에러 처리 | 빈 입력 시 인라인 에러 배너(`role=alert`) |

> 실제 인증 없음 — 비어있지 않으면 `#/app`으로 이동.

### 4.2 Register (`js/pages/register.js`)

**레이아웃**: 좌측 다크 패널 + 우측 3단계 스텝 위저드

| 단계 | 입력 항목 |
|------|----------|
| 1 — 계정 설정 | 접속 아이디, 비밀번호(강도 표시), 비밀번호 확인(일치 표시) |
| 2 — 담당자 정보 | 담당자명, 부서·직위, 연락처 |
| 3 — 사업자 정보 | 사업자번호, 회사명, 대표자명, 사업장 소재지, 계산서 이메일, 전자서명 |
| 완료 | 가입 정보 요약 카드, 무료 혜택 안내 |

- 단계 전환 전 인라인 유효성 검사. 이메일 정규식 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- 비밀번호 강도: 4단계 (너무짧음 <4 / 약함 <8 / 강함 8자+영문+숫자+특수 / 보통).
- 텍스트 입력은 uncontrolled, 단계 전환 시 `state.form`에서 값 복원.

### 4.3 OrderPage (`js/pages/order.js`)

- 담당자 선택 → 주문 양식 작성 멀티스텝. 프로필/연락처/상품을 `store`에서 조회.
- 리본 모달(경조사 유형별 상용구 + 직접 입력), 보내는분 모달, 간편접수 모달(부고/청첩).
- **간편접수**: URL 입력 → `setTimeout 1800ms` 모의 조회(`MOCK_URL_DB`) → 주소·받는분 자동입력.
- **즉시배송**: `Date.now() + 4*60*60*1000` → "YYYY년 MM월 DD일 HH시 mm분 전으로 배송됩니다".
- **배송완료 알림 수신 패널**: 받는분·보내는분·담당자 토글(`role=switch`), `홍길동(010-0000-0000)` 형식.

### 4.4 RealTimeOrders (`js/pages/orders.js`)

- 필터: 상태(접수대기/주문접수/배송완료), 사진 유무, 날짜범위(프리셋+계산), 검색 3종.
- 날짜 로직은 `js/util/date.js`(순수 함수)로 분리. `tableGrid` 렌더, 상태 뱃지, 상세 모달.

### 4.5 InvoiceView (`js/pages/invoice.js`)

- A4 규격(794×1123px) 문서 + 우측 컨트롤 패널.
- **A4 문서는 인라인 스타일**(`S` 객체)로 작성 — `window.print()`가 outerHTML을 복사해 새 창에 넣으므로 CSS 클래스가 아닌 인라인이어야 인쇄 시 동일하게 렌더됨.
- **PDF**: `window.print()` (§9). 기간 변경·계산서 동의 모달.
- 인포 테이블(`infoTable`): 6열, `valueColSpan`으로 셀 병합.

### 4.6 SettlementView (`js/pages/settlement.js`)

- 회사 정보(페이지 로컬 상태) + 9열 정산 내역 표.
- 뱃지: 계산서발급(동의하기 주황/발급완료 초록), 정산확인(정산필요 빨강/정산완료 초록).
- 회사정보 수정 모달(7필드, 저장 시 900ms "저장 완료!" 피드백 후 닫힘).

### 4.7 ProfileStorage (`js/pages/profile.js`)

- 프로필 + 담당자 두 섹션, 각각 `tableGrid` + 추가/수정/삭제 모달.
- 자동 인사말: `올해의경조사 {role} {name}`.
- `store.setProfiles`/`setContacts`로 쓰기 → **localStorage 영속**.

### 4.8 ProductGuide (`js/pages/products.js`)

- 카테고리 필터(전체/경조화환/관엽화분/동서양란/생화).
- 즐겨찾기 체크박스 → `store.toggleFavorite` → **localStorage 영속**. 저장 피드백 2000ms.
- 샘플 사진 모달(카테고리별 Unsplash 이미지).

---

## 5. 전역 상태 (`js/store.js`)

경량 pub/sub 스토어. `localStorage` 키 `yeop.store.v1`에 영속.

```js
store.hydrate()                 // 부팅 시 1회 (main.js) — localStorage 복원, 손상 시 기본값
store.get()                     // { profiles, contacts, favorites }
store.subscribe(fn) → unsub     // 변경 구독
store.setProfiles(next)         // next는 값 또는 (prev)=>next
store.setContacts(next)
store.setFavorites(next)
store.toggleFavorite(key)       // favorites Set 토글
// + ALL_PRODUCTS, productKey export
```

**데이터 타입 요약** (상세는 `Database.md`):

| 타입 | 주요 필드 |
|------|----------|
| `Product` | category, product, price, description, icon |
| `Profile` | no, name, role, phone, greeting |
| `Contact` | no, name, role, phone, message |

- favorites `Set`은 저장 시 `[...set]`(배열), 복원 시 `new Set(arr)`.
- **초기 데이터**: 상품 20개 · 프로필 5개 · 연락처 3개 (목업).
- 영속 범위: profiles/contacts/favorites. 인증·회사정보(SettlementView)는 비영속(페이지 로컬).

---

## 6. 디자인 시스템

### 6.1 색상 팔레트 (`css/tokens.css`)

모든 hex는 `tokens.css`의 `:root` CSS 변수로 일원화. 나머지 CSS는 `var(--…)` 참조.

| 용도 | 색상 | HEX | 토큰 |
|------|------|-----|------|
| 주 액션/CTA | 오렌지 | `#f15a2a` | `--c-orange` |
| 보조 액션/링크 | 블루 | `#4169e1` | `--c-blue` |
| 완료/성공 | 그린 | `#4caf50` | `--c-success` |
| 오류/미결제 | 레드 | `#f44336` | `--c-danger` |
| 대기/경고 | 옐로 | `#ff9800` | `--c-warn` |
| 텍스트 (진/보조) | 다크/그레이 | `#222`…`#aaa` | `--c-text*` |
| 테두리 | 라이트그레이 | `#e0e0e0` 등 | `--c-border*` |
| 배경 (폼/카드) | 라이트그레이/화이트 | `#f5f5f7`/`#fff` | `--c-surface*` |
| 사이드바 활성 | 핑크/잉크 | `#ffe9e9`/`#d94000` | `--c-sidebar-active-*` |
| 다크 패널 | 네이비블랙 | `#111118` | `--c-dark` |

### 6.2 타이포그래피

- 폰트: **Pretendard** (CDN, `index.html`). `base.css`에서 `body`에 전역 적용 — 컴포넌트별 명시 불필요.
- 기본 12–15px, 굵기 400/500/600/700, 행간 1.4–1.6.

### 6.3 레이아웃

| 항목 | 값 | 토큰 |
|------|-----|------|
| 헤더 높이 | 62px | `--header-h` |
| 사이드바 너비 | 220px | `--sidebar-w` |
| 다크 브랜드 패널 | 400px (xl 440px) | — |
| 페이지 패딩 | 24px | — |
| 카드 둥글기 | 6–8px | `--r-md`/`--r-lg` |
| 카드 그림자 | `0 1px 6px rgba(0,0,0,.04)` | `--sh-card` |

### 6.4 로그인·회원가입 공통 패턴 (`css/pages/auth.css`)

두 페이지는 좌우 분할 레이아웃(`.auth__brand` 다크 패널 + `.auth__panel` 폼 패널)을 공유.
다크 패널은 `@media (min-width:1024px)`에서만 표시. 입력은 `.auth-field__input`/`.rf__input`.

---

## 7. 공용 UI 팩토리 (`js/ui.js`)

문자열 템플릿을 반환하는 순수 팩토리 + 모달 헬퍼.

### 7.1 tableGrid (DataTable 대체)
CSS Grid 기반 표. `columns[{label, headerLabel?, width?, align?, render(row,i)}]`, `rows`, `rowKey`, `compact?`, `fitContent?`.

### 7.2 openModal / simpleModal
- `openModal({panelClass, body, labelledBy, onClose}) → {panel, close, render}` — 오버레이+패널, ESC·백드롭·**포커스트랩**(`role=dialog aria-modal`). 상태 모달은 `render(newBody)`로 본문 교체.
- `simpleModal({title, body, …})` — 제목바(+X) 포함 표준 모달 래퍼.

### 7.3 pageTitle
`pageTitle({icon|imgSrc, title, action})` → 페이지 최상단 제목.

### 7.4 InvoiceView — infoTable
6열(label|value ×3). `valueColSpan`으로 값 셀 병합.

---

## 8. 스타일링 규칙

- **손수 작성 CSS** + `tokens.css` 변수. Tailwind/CSS-in-JS 없음.
- `components.css`의 재사용 클래스 우선, 페이지 고유 스타일은 `css/pages/*.css`(루트 클래스로 스코프, 예: `.page-order`).
- **예외 — A4 인보이스**: `window.print()`가 outerHTML만 복사하므로 문서 내부는 **인라인 스타일**(`S` 객체) 유지. 인쇄 팝업은 자체 `@page` 인라인 `<style>`.
- 색상은 토큰만 사용(`var(--c-…)`). 페이지 1회성 음영만 리터럴 hex 허용(해당 page CSS 내).

---

## 9. PDF 생성 (InvoiceView)

### 방식: `window.print()` (브라우저 네이티브)

```
[다운로드] → window.open 새 창 → .invoice-doc outerHTML 삽입
→ Pretendard 로드 → print() → 사용자가 "PDF로 저장"
```

**주의사항:**
- A4 문서는 **인라인 스타일**이어야 함(새 창은 CSS 클래스를 모름).
- `@page { size: A4; margin: 0; }` + `print-color-adjust: exact`.
- 이미지 src 절대화(`resolveAbsoluteUrls`: `img.src = img.src`).
- 팝업 차단 시 `alert` 안내.
- (이전 폐기 방식: html2canvas + jsPDF.)

---

## 10. 에셋·아이콘 관리

- **이미지**: `assets/`에 의미있는 파일명 PNG. 상대 경로 참조(`./assets/logo.png`).
- **아이콘**: `js/icons.js`가 lucide 기반 SVG `<symbol>` 스프라이트를 1회 주입.
  `icon('bell', {size, cls})` → `<svg><use href="#i-bell"/></svg>`. `currentColor`로 색/크기 제어.
- 외부 이미지(ProductGuide 샘플): Unsplash URL 직접 사용.

---

## 11. 개발 워크플로

### 11.1 로컬 실행 (빌드 없음)
```bash
node serve.mjs            # http://localhost:8000 (의존성 0)
# 또는 npx serve . / python -m http.server 8000
```
> ES 모듈은 `file://`에서 안 되므로 정적 서버 필요. 루트 접속 시 `#/login`.

### 11.2 새 페이지 추가
1. `js/pages/new.js` 작성 (`mount(root, ctx) → cleanup` 계약).
2. `css/pages/new.css` 작성, `index.html`에 `<link>` 추가.
3. `js/router.js` 라우트표에 항목 추가.
4. `js/shell.js`의 `MENU`에 사이드바 항목 추가(필요 시).
5. 전역 상태가 필요하면 `js/store.js`에 추가.

### 11.3 렌더링 패턴
- `dom.js`의 `html`` ` 태그로 템플릿 작성(보간값 자동 이스케이프, SVG/중첩은 `raw()`).
- 이벤트는 **교체되지 않는 부모**에 `on(parent, type, selector, fn)`으로 위임.
- 클릭/변경 등 비-타이핑 이벤트 → 전체/영역 재렌더. 텍스트 입력 → 상태만 갱신 + 의존 영역 타겟 갱신(포커스 보존).
- 타이머·리스너·모달은 `cleanup()`에서 해제.

### 11.4 인보이스 수정 시
- A4 폭 794px − 좌우패딩 88px = 706px 기준 컬럼 합산. 인포 라벨 100px×3 = 300px.
- 인라인 스타일 유지(인쇄 호환).

---

## 12. 알려진 제약사항

| 항목 | 상태 | 비고 |
|------|------|------|
| 백엔드 연동 | 미구현 | 데이터 목업 (`API_guide.md`는 향후 Barobill 연동 가이드) |
| 인증/인가 | 미구현 | 로그인 폼은 있으나 실제 검증 없음 |
| 영속성 | localStorage | profiles/contacts/favorites만 (`yeop.store.v1`) |
| 반응형 | 부분 | 로그인/회원가입만 반응형, `/app/*`는 데스크톱(1280px+) 전용 |
| i18n | 미지원 | 한국어 전용 |
| 테스트 | 없음 | 자동화 테스트 없음 (Playwright 수동 검증) |

---

## 13. 코딩 컨벤션

- **페이지 모듈**: `export function mount(root, ctx) → cleanup`. 지역 상태는 클로저 `state` 객체.
- **DOM/템플릿**: `dom.js`의 `html`` `/`raw`/`setHTML`/`on`/`qs`. 직접 `innerHTML` 문자열 결합 지양(XSS).
- **상태**: 페이지 로컬은 클로저, 전역은 `store`(localStorage 영속).
- **아이콘**: `icon('name', {size, cls})` (icons.js). 새 아이콘은 `icons.js`의 `P` 맵에 추가.
- **접근성**: 클릭 요소는 `<button>`/`<a>`, 라벨은 `<label for>`, 모달은 `role=dialog`+포커스트랩, 토글은 `role=switch`.
- **날짜 형식**: `YYYY년 MM월 DD일` (한국식). **금액**: `000,000원`.
- **이름+연락처**: `홍길동(010-0000-0000)` (미입력 시 "미입력"/"미선택").
- **즉시배송 시간**: `Date.now() + 4*60*60*1000` → 한국어 포맷.
