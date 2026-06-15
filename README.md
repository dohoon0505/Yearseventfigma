# 올해의경조사 (Years of Event)

기업 경조사 꽃배달 주문·정산·관리 시스템 (B2B). **프레임워크 없는 순수 HTML/CSS/바닐라 JS** 정적 사이트입니다.

빌드 도구·npm 의존성이 없습니다. 네이티브 ES 모듈 + 손수 작성 CSS + 인라인 SVG 아이콘으로 동작합니다.

## 로컬 실행

ES 모듈은 `file://`에서 동작하지 않으므로 정적 서버가 필요합니다. 아무 정적 서버나 사용할 수 있습니다.

```bash
# Node (의존성 없는 내장 서버)
node serve.mjs            # http://localhost:8000

# 또는
npx serve .
python -m http.server 8000
```

브라우저에서 루트(`http://localhost:8000/`)로 접속하면 `#/login`으로 이동합니다.

## 구조

```
index.html              # 진입점 (CSS 링크 + #app + js/main.js)
css/
  tokens.css            # 디자인 토큰 (:root CSS 변수) — hex는 여기에만
  base.css              # 리셋·타이포·포커스링·아이콘
  components.css        # 재사용 컴포넌트 클래스 (btn/card/input/modal/table-grid…)
  shell.css             # 헤더 + 사이드바
  pages/*.css           # 페이지별 스타일
js/
  main.js               # store.hydrate() → buildSprite() → router.start()
  router.js             # 해시 라우터 (#/login, #/app/orders …)
  store.js              # 전역 상태 + localStorage 영속 (profiles/contacts/favorites)
  shell.js              # 앱 셸(헤더/사이드바) 렌더
  dom.js                # html`` 템플릿(XSS 이스케이프) · 이벤트 위임 헬퍼
  icons.js              # lucide 아이콘 SVG 스프라이트
  ui.js                 # pageTitle · tableGrid · openModal(포커스트랩) · simpleModal
  util/date.js          # 날짜 파서/범위 헬퍼
  pages/*.js            # 페이지 모듈 (mount(root, ctx) → cleanup)
assets/                 # 이미지 (PNG)
guidelines/             # 시스템·DB·API 문서
```

## 라우팅

해시 기반 SPA. 셸(헤더+사이드바)은 한 번만 렌더되고 페이지 본문만 교체됩니다.

| 해시 | 페이지 |
|------|--------|
| `#/` → `#/login` | 리다이렉트 |
| `#/login` | 로그인 |
| `#/register` | 제휴기업 회원가입 (3단계 위저드) |
| `#/app` | 경조상품 주문 |
| `#/app/orders` | 실시간 주문처리 내역 |
| `#/app/invoice` | 거래명세서 조회 (PDF 인쇄) |
| `#/app/settlement` | 정산회계 간편조회 |
| `#/app/profile` | 프로필/담당자 저장공간 |
| `#/app/products` | 상품 규격 안내 |

## 배포

GitHub Pages(`/Yearseventfigma/`)에 빌드 없이 배포됩니다 (`.github/workflows/deploy.yml`).
해시 라우팅이라 서버 404 폴백이 필요 없습니다. 모든 에셋 경로는 상대 경로입니다.

## 참고

- 백엔드·인증은 미구현(목업 데이터). 로그인은 입력 검증 후 바로 진입합니다.
- 데이터(프로필/담당자/즐겨찾기)는 `localStorage`(`yeop.store.v1`)에 영속됩니다.
- 데스크톱 전용. 한국어 전용. 폰트는 Pretendard(CDN).
