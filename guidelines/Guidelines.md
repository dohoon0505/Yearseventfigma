# 올해의경조사 — 시스템 가이드라인

> 이 문서는 AI 또는 인간 개발자가 프로젝트를 이어받아 유지보수 및 확장할 수 있도록
> 시스템의 전체 구조, 설계 원칙, 워크플로를 기술합니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | 올해의경조사 (Years of Event) |
| 목적 | 기업 경조사 꽃배달 주문·정산·관리 시스템 |
| 호스팅 | https://glossy-ethics-50323300.figma.site |
| 기술 스택 | React 18 · Vite 6 · React Router 7 · Tailwind CSS 4 · Radix UI |
| 폰트 | Pretendard (CDN import, 전역 적용) |
| 상태관리 | React Context API (`AppContext.tsx`) |
| 백엔드 | 없음 — 현재 모든 데이터는 정적/목업 |

---

## 2. 디렉토리 구조

```
years_event_dev/
├── src/
│   ├── main.tsx                    # 엔트리포인트
│   ├── app/
│   │   ├── App.tsx                 # AppProvider + RouterProvider
│   │   ├── routes.tsx              # 라우트 정의 (9개 경로)
│   │   ├── store/
│   │   │   └── AppContext.tsx      # 전역 상태 (프로필, 연락처, 즐겨찾기)
│   │   ├── components/
│   │   │   ├── Layout.tsx          # 헤더 + 사이드바 + Outlet (앱 셸)
│   │   │   ├── figma/
│   │   │   │   └── ImageWithFallback.tsx
│   │   │   └── ui/                 # 공용 UI 컴포넌트 (~50개)
│   │   │       ├── DataTable.tsx   # 재사용 테이블
│   │   │       ├── Modal.tsx       # 공용 모달
│   │   │       ├── PageTitle.tsx   # 페이지 제목
│   │   │       └── (Radix 기반 컴포넌트들)
│   │   └── pages/                  # 페이지 컴포넌트 (8개)
│   │       ├── Login.tsx
│   │       ├── Register.tsx
│   │       ├── OrderPage.tsx
│   │       ├── RealTimeOrders.tsx
│   │       ├── InvoiceView.tsx
│   │       ├── SettlementView.tsx
│   │       ├── ProfileStorage.tsx
│   │       ├── MessageSettings.tsx
│   │       └── ProductGuide.tsx
│   ├── assets/                     # 이미지 (PNG, Figma 해시 기반)
│   ├── imports/
│   │   ├── Desktop.tsx             # Figma 생성 레이아웃 컴포넌트
│   │   └── svg-*.ts               # SVG 경로 데이터 (아이콘)
│   └── styles/
│       ├── index.css               # 스타일 통합 (fonts → tailwind → theme)
│       ├── fonts.css               # Pretendard CDN @import
│       ├── tailwind.css            # Tailwind 설정
│       └── theme.css               # CSS 변수 (색상, radius, 다크모드)
├── guidelines/                     # 이 문서가 위치한 곳
├── index.html
├── package.json
├── vite.config.ts                  # Vite + React + Tailwind, @ 별칭
└── postcss.config.mjs
```

---

## 3. 라우팅 구조

```
/                 → /login 리다이렉트
/login            → Login.tsx           인증 (로그인)
/register         → Register.tsx        파트너사 회원가입

/app              → Layout.tsx (헤더 + 사이드바)
  ├── (index)     → OrderPage.tsx       경조상품 주문
  ├── orders      → RealTimeOrders.tsx  실시간 주문내역
  ├── invoice     → InvoiceView.tsx     거래명세서 조회
  ├── settlement  → SettlementView.tsx  정산회계 조회
  ├── profile     → ProfileStorage.tsx  프로필 저장공간
  ├── messages    → MessageSettings.tsx 메시지 수신설정
  └── products    → ProductGuide.tsx    상품 규격 안내
```

**사이드바 메뉴 그룹:**
- 사용자 메뉴: 경조상품 주문, 실시간 주문내역
- 정산 메뉴: 거래명세서 조회, 정산회계 조회
- 관리 메뉴: 프로필 저장공간, 메시지 수신설정, 상품 규격 안내

---

## 4. 페이지별 기능 명세

### 4.1 Login / Register
- **Login**: 사번/비밀번호 입력 → `/app`으로 이동. 좌측 도시 이미지 + 우측 폼.
- **Register**: 2단 폼 (로그인정보 + 사업자등록정보). 전자서명 버튼 포함.

### 4.2 OrderPage (경조상품 주문)
- 연락처 선택 → 주문 양식 → 리본 문구 편집의 멀티스텝 플로우.
- 프로필/연락처/상품 데이터를 `AppContext`에서 가져옴.
- 경조사 유형별(장례/결혼/개업/기타) 리본 상용구 제공.

### 4.3 RealTimeOrders (실시간 주문내역)
- 다중 필터: 상태(접수대기/주문접수/배송완료), 날짜범위, 검색어.
- `DataTable` 기반, 상태 뱃지 색상 구분.

### 4.4 InvoiceView (거래명세서)
- A4 규격(794×1123px) 문서 미리보기 + 우측 컨트롤 패널.
- **PDF 다운로드**: `window.print()` 방식 (브라우저 네이티브 렌더링).
- 기간 변경 모달, 계산서 발급 동의 모달.
- 인포 테이블(`InfoTableV2`): `valueColSpan` 지원으로 셀 병합 가능.

### 4.5 SettlementView (정산회계)
- 회사 정보 표시 + 정산 내역 테이블.
- 상태 뱃지: 미결제(빨강), 대기(주황), 완료(초록).

### 4.6 ProfileStorage (프로필 저장공간)
- 프로필 섹션: 이름/직함 → 자동 인사말 생성.
- 연락처 섹션: 배송 알림 수신 설정 (수신/미수신).
- `AppContext`의 `profiles`, `contacts` 상태와 연동.

### 4.7 MessageSettings (메시지 수신설정)
- 고정 메시지 편집/삭제 기능.
- `DataTable` + `Modal` 기반 CRUD.

### 4.8 ProductGuide (상품 규격 안내)
- 카테고리 필터: 전체/근조화환/관엽식물/난/생화.
- 즐겨찾기 체크박스 → `AppContext`의 `favorites` 상태 저장.
- 샘플 사진 모달.

---

## 5. 전역 상태 (AppContext)

```typescript
interface AppContextValue {
  profiles: Profile[];          // 발송인 프로필 목록
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
  contacts: Contact[];          // 배송 알림 연락처 목록
  setContacts: Dispatch<SetStateAction<Contact[]>>;
  favorites: Set<string>;       // 즐겨찾기 상품 키 (category__productName)
  setFavorites: Dispatch<SetStateAction<Set<string>>>;
}
```

**데이터 타입:**

| 타입 | 필드 |
|------|------|
| `Product` | category, product, price, description, icon |
| `Profile` | no, name, role, phone, greetingMessage |
| `Contact` | no, name, role, phone, messageReception |

**초기 데이터:** 상품 20개 · 프로필 5개 · 연락처 3개 (목업)

---

## 6. 디자인 시스템

### 6.1 색상 팔레트

| 용도 | 색상 | HEX |
|------|------|-----|
| 주 액션/강조 | 오렌지 | `#f15a2a` |
| 보조 액션/링크 | 블루 | `#4169e1` |
| 완료/성공 | 그린 | `#4caf50` |
| 오류/미결제 | 레드 | `#f44336` |
| 대기/경고 | 옐로 | `#ff9800` |
| 텍스트 (진) | 다크 | `#222`, `#333` |
| 텍스트 (보조) | 그레이 | `#555`, `#666`, `#888` |
| 테두리 | 라이트그레이 | `#d4d4d4`, `#e0e0e0` |
| 배경 (라벨) | 그레이BG | `#f5f5f5` |
| 페이지 배경 | 라이트 | `#f0f2f5` |
| 사이드바 활성 | 핑크 | `#ffe9e9` |

### 6.2 타이포그래피

| 항목 | 값 |
|------|-----|
| 폰트 | Pretendard (CDN, `fonts.css`) |
| 기본 크기 | 12-14px (본문) |
| 굵기 | 400 (일반), 500 (중간), 600-700 (강조) |
| 행간 | 1.4 (테이블 셀 기준) |

> **중요**: 모든 폰트는 반드시 `Pretendard`로 통일.
> Arial, sans-serif 등 다른 폰트 사용 금지.

### 6.3 레이아웃

| 항목 | 값 |
|------|-----|
| 헤더 높이 | 55px |
| 사이드바 너비 | 218px |
| 페이지 패딩 | 20px (`p-5`) |
| 카드 둥글기 | 6px |
| 테이블 셀 패딩 | 11px 14px (거래내역), 9px 10px (인포) |

---

## 7. 컴포넌트 패턴

### 7.1 DataTable
재사용 가능한 테이블 컴포넌트. Column 정의로 렌더링, 너비, 정렬 제어.
```tsx
<DataTable columns={[
  { key: "name", label: "이름", width: "120px" },
  { key: "status", label: "상태", render: (v) => <Badge>{v}</Badge> },
]} data={items} />
```

### 7.2 Modal
공용 다이얼로그. backdrop + 제목 + 콘텐츠 슬롯.
```tsx
<Modal open={isOpen} onClose={close} title="제목">
  <div className="p-6">내용</div>
</Modal>
```

### 7.3 PageTitle
페이지 최상단 제목 영역.

### 7.4 InvoiceView — InfoTableV2
6열 레이아웃 (label|value 3쌍). `valueColSpan` 속성으로 셀 병합 지원.
```tsx
interface InfoRow {
  label: string;
  value: string;
  valueColSpan?: number;  // 값 셀의 colSpan (기본 1)
}
```

---

## 8. 스타일링 규칙

### 8.1 일반 규칙
- **Tailwind CSS 유틸리티 클래스** 우선 사용.
- 테이블/A4 문서 등 정밀 제어가 필요한 곳은 **인라인 스타일** 사용.
- CSS 모듈, styled-components 사용 안 함.

### 8.2 InvoiceView 전용 스타일
`S` 객체에 모든 테이블 셀 스타일을 중앙 관리:

| 스타일 키 | 용도 |
|-----------|------|
| `S.table` | 테이블 공통 (border-collapse, font) |
| `S.th` | 거래내역 테이블 헤더 |
| `S.tdLabel` | 거래내역 테이블 라벨 셀 |
| `S.tdValue` | 거래내역 테이블 값 셀 (ellipsis 허용) |
| `S.tdAddress` | 배송지 정보 전용 (ellipsis 허용) |
| `S.tdInfoLabel` | 인포 테이블 라벨 (패딩 축소) |
| `S.tdInfoValue` | 인포 테이블 값 (word-break 허용) |

### 8.3 거래내역 테이블 컬럼 규격

| 컬럼 | 너비 | 정렬 | ellipsis |
|------|------|------|----------|
| 배송요청일시 | 148px | left | 불허 |
| 발송인 | 70px | **center** | 불허 |
| 배송지 정보 | auto | left | **허용** |
| 주문상품 | 128px | left | 불허 |
| 결제금액 | 92px | **center** | 불허 |

---

## 9. PDF 생성 (InvoiceView)

### 방식: `window.print()` (브라우저 네이티브)

```
[다운로드 클릭] → 새 창 열기 → 인보이스 HTML 삽입
→ Pretendard 폰트 로드 → window.print() → 사용자가 "PDF로 저장" 선택
```

**이전 방식 (폐기):** html2canvas + jsPDF — 테이블/폰트 렌더링 차이 발생.

**현재 방식의 장점:**
- 화면과 100% 동일한 출력
- 벡터 기반 (텍스트 선택 가능)
- 외부 라이브러리 불필요

**주의사항:**
- `@page { size: A4; margin: 0; }` 설정 필수
- `print-color-adjust: exact` — 배경색 보존
- 이미지 src를 절대 경로로 변환 (`resolveAbsoluteUrls`)
- 팝업 차단 시 사용자에게 안내

---

## 10. 에셋 관리

### Figma 에셋
- `figma:asset/해시값.png` 형태로 import.
- Vite가 빌드 시 실제 경로로 변환.
- 원본 이미지는 `src/assets/` 에 해시 파일명으로 저장.

### SVG 아이콘
- `src/imports/svg-*.ts` — 경로 데이터 객체로 export.
- `Desktop.tsx`에서 참조하여 아이콘 렌더링.

### 외부 아이콘
- **Lucide React**: 페이지 컴포넌트에서 주로 사용.
- **MUI Icons**: 일부 UI에서 사용.

---

## 11. 개발 워크플로

### 11.1 로컬 개발
```bash
# 의존성 설치 (pnpm 권장)
pnpm install

# 개발 서버 실행
pnpm dev
```

### 11.2 빌드
```bash
pnpm build
```

### 11.3 새 페이지 추가 절차
1. `src/app/pages/NewPage.tsx` 생성
2. `src/app/routes.tsx`에 라우트 추가 (`/app` children에)
3. `src/app/components/Layout.tsx` 사이드바에 메뉴 항목 추가
4. 필요 시 `AppContext.tsx`에 상태 추가

### 11.4 새 UI 컴포넌트 추가
- Radix UI 기반 컴포넌트는 `src/app/components/ui/`에 배치.
- `DataTable`, `Modal`, `PageTitle` 패턴을 따를 것.

### 11.5 인보이스 수정 시 주의
- `S` 스타일 객체 수정 시 → 화면 + PDF 동시 영향.
- 컬럼 너비 변경 시 → A4 폭(794px - 좌우패딩 88px = 706px) 기준 합산 확인.
- 인포 테이블 라벨 폭: 100px × 3 = 300px, 나머지 406px이 값 셀 배분.

---

## 12. 알려진 제약사항

| 항목 | 상태 | 비고 |
|------|------|------|
| 백엔드 연동 | 미구현 | 모든 데이터 목업, API 호출 없음 |
| 인증/인가 | 미구현 | 로그인 폼은 있으나 실제 검증 없음 |
| 반응형 | 미지원 | 데스크톱(1280px+) 전용 |
| 다크모드 | CSS 변수 준비됨 | 토글 UI 미구현 |
| i18n | 미지원 | 한국어 전용 |
| 테스트 | 없음 | 단위/통합/E2E 테스트 없음 |

---

## 13. 코딩 컨벤션

- **컴포넌트**: 함수형 + hooks. `export function ComponentName()` 형태.
- **상태**: 단순한 경우 `useState`, 전역은 `AppContext` 사용.
- **스타일**: Tailwind 클래스 우선, 정밀 제어 시 인라인 스타일 객체.
- **아이콘**: Lucide React (`lucide-react`) 패키지에서 import.
- **날짜 형식**: `YYYY년 MM월 DD일` (한국식).
- **금액 형식**: `000,000원` (쉼표 구분 + 원).
- **파일 구조**: 페이지당 1파일, 페이지 내부 서브컴포넌트는 같은 파일에 정의.
