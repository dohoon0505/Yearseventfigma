# 올해의경조사 (Years of Event)

경조화환 주문·정산·관리 시스템. **프레임워크 없는 순수 HTML/CSS/바닐라 JS** 정적 사이트입니다.

빌드 도구·npm 의존성이 없습니다. 네이티브 ES 모듈 + 손수 작성 CSS + 인라인 SVG 아이콘으로 동작합니다.

화면은 세 갈래입니다.

| 갈래 | 대상 | 진입 |
|---|---|---|
| **거래처 포털** | 제휴기업 담당자 | `#/app/*` |
| **관리자 콘솔** | 내부 운영자 | `#/admin/*` |
| **공개 페이지** | 로그인 없이 링크로 | `delivery/` · `invoice/` |

## 로컬 실행

ES 모듈은 `file://`에서 동작하지 않으므로 정적 서버가 필요합니다.

```bash
node serve.mjs            # http://localhost:8000 (의존성 없는 내장 서버)
```

`npx serve .` 나 `python -m http.server 8000` 도 됩니다.
브라우저에서 루트로 접속하면 `#/login`으로 이동합니다.

**데모 계정** — 관리자 `admin` / `0324`.
거래처는 이관 시드에 비밀번호가 없어 **아이디만으로** 들어갑니다(비밀번호는 아무 값):
`taewonsci`(태원과학) · `homepack`(홈팩 — 거래 조건 데모) · `sejong-kds`/`sejong-lbh`
(법무법인 세종 — 같은 사업자번호 부서 분리 데모) 외 19곳. 전체 목록은 `HANDOFF.md`.

## 구조

```
index.html              # 진입점 (CSS 링크 + #app + js/main.js)
css/
  tokens.css            # 디자인 토큰 (:root CSS 변수) — hex 는 여기에만
  base.css              # 리셋·타이포·포커스링·아이콘
  components.css        # 공용 컴포넌트 (btn/card/input/modal/table-grid/주문·거래처 모달…)
  shell.css             # 헤더 + 사이드바
  pages/*.css           # 페이지별 스타일 (12개)
js/
  main.js               # store.hydrate() → buildSprite() → router.start()
  router.js             # 해시 라우터 · 화면 전환마다 closeAllModals()
  store.js              # 전역 상태 + localStorage 영속 (키 `yeop.store.v4`)
  session.js            # 로그인 세션
  shell.js              # 앱 셸(헤더/사이드바) 렌더 · 네비 정의
  dom.js                # html`` 템플릿(XSS 이스케이프) · setHTML · on() 이벤트 위임
  icons.js              # lucide 아이콘 SVG 스프라이트
  toast.js              # makeToast
  ui.js                 # pageTitle · tableGrid · rowToneLegend · openModal/closeAllModals
                        #  · simpleModal · openLightbox
                        #  · makeDropdown · makeDatepicker · makeDateTimePicker
  invoice-doc.js        # 거래명세서 인쇄창 (별도 window — tokens.css 미로드라 hex 예외)
  report-doc.js         # 리포트 인쇄창 (같은 이유로 hex 예외)
  public-delivery.js    # delivery/ 전용 — 비모듈 IIFE (쿼리스트링 → 배송완료 리포트)
  public-invoice.js     # invoice/ 전용 — ES 모듈 (dom·icons·invoice-doc·invoice-links 재사용)
  pages/*.js            # 페이지 모듈 (mount(root, { nav }) → cleanup)
  data/*.js             # 목데이터·파생 규칙 (거래처·주문·지역규칙·이력·리본문구…)
  util/*.js             # 공용 로직 — 아래 표 참조
assets/                 # 이미지 (PNG·JPG) — 로고·사이드바 아이콘·접수 가이드 사진
delivery/ invoice/      # 로그인 없는 공개 페이지 (각자 단독 index.html · 라우터 미경유)
docs/backend-spec.md    # 백엔드 연동 명세서 **정본** (docx 는 생성물, 커밋 안 함)
tools/build-docs.py     # 명세서 → Word 생성 (외부 라이브러리 없음)
serve.mjs               # 개발용 정적 서버
```

### `js/util/` 공용 모듈

| 모듈 | 역할 |
|---|---|
| `order-screen.js` | 주문 **상세** 모달(B2C·B2B 공용) · 목록 필터 카드 · 담당자/삭제 다이얼로그 |
| `order-create.js` | 주문서 **등록** 위저드 셸 (상세와 별개 모달) |
| `order-fields.js` | 두 모달이 공유하는 폼 조각 (`card`·`renderFields`·`won`·`dtpMarkup`…) |
| `order-dialogs.js` | 행 리스트 피커(`openRowPicker`) · 링크 자동작성(`openAutofill`) |
| `contacts-modal.js` | 거래처 담당자 관리 다이얼로그 |
| `cancel-modal.js` | 주문취소 사유·수수료 (B2C·B2B 공용) |
| `client.js` | 로그인 거래처 결정 **단일 소스** |
| `biz.js` | 사업자번호 정규화 · 공유 사업자번호 판정 · 표시명 |
| `date.js` | 날짜 파서·범위 · 주문 행 색(`orderRowTone`)·정렬 랭크 |
| `phone.js` · `image.js` · `postcode.js` · `xlsx.js` | 연락처 포맷 · 첨부 축소 · 주소검색 · 엑셀 |

## 라우팅

해시 기반 SPA. 셸(헤더+사이드바)은 한 번만 렌더되고 페이지 본문만 교체됩니다.

| 해시 | 화면 |
|------|--------|
| `#/` → `#/login` | 리다이렉트 |
| `#/login` · `#/register` | 로그인 · 제휴기업 회원가입(3단계) |
| **거래처 포털** | |
| `#/app` | 경조상품 주문(4단계 퍼널) |
| `#/app/orders` | 실시간 주문처리 내역 |
| `#/app/invoice` | 거래명세서 조회 (인쇄) |
| `#/app/settlement` | 정산회계 간편조회 |
| `#/app/profile` | 발송 프로필 · 담당자 저장공간 |
| `#/app/products` | 상품 규격 안내 |
| **관리자 콘솔** (`requiresRole: "admin"`) | |
| `#/admin/dashboard` | 대쉬보드 (KPI·액션 큐·추이·정산 진행) |
| `#/admin/b2c` | 통합주문관리 (B2C) |
| `#/admin/orders` | 거래처 주문관리 (B2B) |
| `#/admin` | 거래처 정보관리 |
| `#/admin/settlement` | 거래처 정산회계 |
| `#/admin/pricing` | 기업별 상품단가 |
| `#/admin/staff` | 담당자 계정·권한 |

공개 페이지는 라우터를 타지 않습니다 — `delivery/`(배송 조회)와 `invoice/`(거래명세서
공개 링크)는 각자 단독 `index.html` 입니다.

## 배포

`main` 에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 **레포 루트를 그대로**
업로드합니다(빌드 단계 없음). 공개 주소는 <https://corporate-partners.kr> 입니다.
해시 라우팅이라 서버 404 폴백이 필요 없고, 모든 에셋 경로는 상대 경로입니다.

## 참고

- 백엔드·인증은 미구현(목데이터). 로그인은 입력 검증 후 바로 진입합니다.
- 영속 데이터(거래처·담당자·발송 프로필·상품단가·즐겨찾기)는 `localStorage` 키 **`yeop.store.v4`**
  에 저장됩니다. 주문은 모듈 메모리라 새로고침하면 시드로 돌아갑니다.
- **색은 `tokens.css` 토큰만** 씁니다. raw hex 는 인쇄창 2곳(`invoice-doc.js`·`report-doc.js`)과
  엑셀 ARGB(`util/xlsx.js`)만 예외입니다 — 그 창은 `tokens.css` 를 로드하지 않습니다.
- 데스크톱 전용(관리자 콘솔·거래처 포털). 단 배송완료 리포트(`delivery/`)는 배송완료 SMS 링크로 열려 **모바일 폭 기준**이고(본문 480px), 공개 거래명세서(`invoice/`)는 고정 A4 문서라 좁은 화면에서 가로 스크롤합니다. 한국어 전용. 폰트는 Pretendard(CDN).
- 작업 규약은 [CLAUDE.md](CLAUDE.md), 세션 인계는 [HANDOFF.md](HANDOFF.md),
  백엔드 계약은 [docs/backend-spec.md](docs/backend-spec.md) 를 보세요.
