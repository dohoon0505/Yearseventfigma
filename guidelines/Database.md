# 올해의경조사 — 데이터 구조 명세

> 현재 시스템은 백엔드 없이 React Context(`AppContext.tsx`)에 목업 데이터를 보관합니다.
> 이 문서는 현재 목업 구조와, 실제 DB로 전환 시 권장 스키마를 함께 기술합니다.
>
> **최종 업데이트**: 2026-04-14

---

## 1. 현재 데이터 아키텍처 개요

```
┌──────────────────────────────────────────────────────────┐
│                    AppContext.tsx                        │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   profiles   │  │   contacts   │  │  favorites   │  │
│  │  Profile[]   │  │  Contact[]   │  │  Set<string> │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ALL_PRODUCTS: Product[]  (정적 상수, 변경 불가)          │
└──────────────────────────────────────────────────────────┘
         ↕ useAppStore() hook으로 전 페이지에서 접근
```

- **영속성 없음**: 페이지 새로고침 시 초기값으로 리셋됨
- **API 없음**: 모든 CRUD는 `useState` setter로 메모리 내에서만 처리

---

## 2. 현재 타입 정의

### 2.1 Product (상품)

```typescript
type Product = {
  category:    string;  // 카테고리명
  product:     string;  // 상품명
  price:       string;  // 가격 (문자열, 예: "50,000원")
  description: string;  // 상품 설명
  icon:        string;  // 이모지 아이콘
};
```

**카테고리 목록 (고정값)**

| category | 설명 |
|----------|------|
| `경조화환` | 화환, 근조바구니, 평탁화 등 |
| `관엽화분` | 마니화분, 중형/대형 화분 |
| `동서양란` | 동양란, 서양란 (기본/고급/특대) |
| `생화` | 소/중/대형 꽃바구니 |

**즐겨찾기 키 생성 규칙**: `productKey(p) = "${p.category}__${p.product}"`
→ `favorites: Set<string>` 에 저장됨

---

### 2.2 Profile (발송인 프로필)

보내는분 정보. 리본 문구의 발신인으로 사용됨.

```typescript
type Profile = {
  no:       string;  // 일련번호 (예: "01", "02")
  name:     string;  // 이름 (예: "홍길동")
  role:     string;  // 직함/직위 (예: "대표이사")
  phone:    string;  // 연락처 (예: "010-0000-0000")
  greeting: string;  // 자동 생성 인사말 (리본 문구에 표시)
};
```

**인사말(greeting) 생성 규칙**: `{회사명} {role} {name}`
→ 예: `"(주)올해의경조사 대표이사 홍길동"`

**목업 초기값 (5건)**

| no | name | role | phone | greeting |
|----|------|------|-------|----------|
| 01 | 홍길동 | 대표이사 | 010-0000-0000 | (주)올해의경조사 대표이사 홍길동 |
| 02 | 정소빈 | 대표변호사 | 010-0000-0000 | 올해표현(유) 대표변호사 정소빈 |
| 03 | 임직원 | 일동 | 010-0000-0000 | (주)올해의경조사 임직원 일동 |
| 04 | 임직원 | 일동 | 010-0000-0000 | (주)올해의경조사 임직원 일동 |
| 05 | 임직원 | 일동 | 010-0000-0000 | (주)올해의경조사 임직원 일동 |

---

### 2.3 Contact (배송알림 연락처)

주문 후 배송완료 문자를 받을 담당자 목록.

```typescript
type Contact = {
  no:      string;  // 일련번호
  name:    string;  // 담당자 이름
  role:    string;  // 부서/직위
  phone:   string;  // 연락처 (문자 발송 대상)
  message: string;  // 수신 설정 메모 (UI 표시용)
};
```

**`message` 필드 값 예시**

| 값 | 의미 |
|----|------|
| `"모든 배송완료 마다에 메세지를 수신합니다"` | 수신 ON |
| `"메세지를 수신하지 않습니다."` | 수신 OFF |

**목업 초기값 (3건)**

| no | name | role | phone | message |
|----|------|------|-------|---------|
| 01 | 할다운 | 비서 | 010-0000-0000 | 모든 배송완료 마다에 메세지를 수신합니다 |
| 02 | 오임찬 | 재경부 | 010-0000-0000 | 메세지를 수신하지 않습니다. |
| 03 | 김현수 | 경리 | 010-0000-0000 | 모든 배송완료 마다에 메세지를 수신합니다 |

---

### 2.4 상품 목록 전체 (ALL_PRODUCTS — 20건)

| category | product | price |
|----------|---------|-------|
| 경조화환 | 근조바구니 | 50,000원 |
| 경조화환 | 근조오브제(단형) | 50,000원 |
| 경조화환 | 근조오브제(2단형) | 75,000원 |
| 경조화환 | 3단화환(기본형) | 50,000원 |
| 경조화환 | 3단화환(고급형) | 60,000원 |
| 경조화환 | 3단화환(특대형) | 75,000원 |
| 경조화환 | 4단화환(표준형) | 95,000원 |
| 경조화환 | 평탁화(10kg) | 75,000원 |
| 경조화환 | 평탁화(20kg) | 110,000원 |
| 관엽화분 | 박상용 마니빔분 | 50,000원 |
| 관엽화분 | 박상용 중형화분 | 80,000원 |
| 관엽화분 | 박상용 대형화분 | 100,000원 |
| 동서양란 | 동양란(기본형) | 50,000원 |
| 동서양란 | 동양란(고급형) | 100,000원 |
| 동서양란 | 서양란(기본형) | 50,000원 |
| 동서양란 | 서양란(고급형) | 80,000원 |
| 동서양란 | 서양란(특대형) | 120,000원 |
| 생화 | 소형 꽃바구니 | 50,000원 |
| 생화 | 중형 꽃바구니 | 80,000원 |
| 생화 | 대형 꽃바구니 | 120,000원 |

---

## 3. 데이터 흐름 (현재)

```
[ProfileStorage 페이지]
  → 프로필 추가/수정/삭제 → setProfiles() → AppContext 업데이트
  → 연락처 추가/수정/삭제 → setContacts() → AppContext 업데이트

[OrderPage]
  → contacts 읽기 → 담당자 선택
  → profiles 읽기 → 보내는분 선택
  → ALL_PRODUCTS 읽기 → 상품 목록 표시

[ProductGuide]
  → ALL_PRODUCTS 읽기 → 상품 목록 표시
  → favorites 읽기/쓰기 → 즐겨찾기 토글

[배송완료 알림 수신 패널 (OrderPage)]
  → toName + toPhone → "받는분" 표시 (홍길동(010-0000-0000) 형식)
  → sender.name + sender.phone → "보내는분" 표시
  → contact.name + contact.phone → "담당자" 표시
```

---

## 4. 실제 DB 전환 시 권장 스키마 (MySQL / PostgreSQL)

> 현재는 목업이지만, 추후 백엔드 연동 시 아래 구조를 권장합니다.

### 4.1 users (제휴기업 회원)

```sql
CREATE TABLE users (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
  user_id       VARCHAR(50)  NOT NULL UNIQUE,       -- 접속 아이디
  password_hash VARCHAR(255) NOT NULL,              -- bcrypt 해시
  company_name  VARCHAR(100) NOT NULL,              -- 회사명
  biz_number    VARCHAR(20)  NOT NULL UNIQUE,       -- 사업자번호
  ceo_name      VARCHAR(50)  NOT NULL,              -- 대표자명
  address       TEXT         NOT NULL,              -- 사업장 소재지
  invoice_email VARCHAR(100) NOT NULL,              -- 계산서 수신 이메일
  status        ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     ON UPDATE CURRENT_TIMESTAMP
);
```

### 4.2 managers (담당자)

```sql
CREATE TABLE managers (
  id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  department VARCHAR(100),                          -- 부서·직위
  phone      VARCHAR(20) NOT NULL,
  notify     BOOLEAN     DEFAULT TRUE,              -- 배송완료 문자 수신 여부
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 profiles (발송인 프로필 — 보내는분)

```sql
CREATE TABLE profiles (
  id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq        TINYINT      NOT NULL DEFAULT 1,        -- 순번 (no)
  name       VARCHAR(50)  NOT NULL,
  role       VARCHAR(100) NOT NULL,                  -- 직함/직위
  phone      VARCHAR(20)  NOT NULL,
  greeting   VARCHAR(255) NOT NULL,                  -- 리본 인사말
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);
```

### 4.4 products (상품 카탈로그)

```sql
CREATE TABLE products (
  id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
  category    VARCHAR(50)   NOT NULL,
  name        VARCHAR(100)  NOT NULL,
  price       INT           NOT NULL,                -- 원 단위 정수
  description TEXT,
  icon        VARCHAR(10),                           -- 이모지
  is_active   BOOLEAN       DEFAULT TRUE,
  UNIQUE KEY uq_product (category, name)
);
```

### 4.5 orders (주문)

```sql
CREATE TABLE orders (
  id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
  user_id          BIGINT       NOT NULL REFERENCES users(id),
  manager_id       BIGINT       REFERENCES managers(id),
  profile_id       BIGINT       REFERENCES profiles(id),  -- 보내는분
  product_id       BIGINT       NOT NULL REFERENCES products(id),
  recipient_name   VARCHAR(50)  NOT NULL,                 -- 받는분 성함
  recipient_phone  VARCHAR(20)  NOT NULL,                 -- 받는분 연락처
  address          TEXT         NOT NULL,                 -- 배송지 주소
  ribbon_phrase    VARCHAR(255),                          -- 리본 문구
  delivery_type    ENUM('scheduled','immediate') DEFAULT 'scheduled',
  scheduled_at     DATETIME,                             -- 배송 요청 일시
  status           ENUM('접수대기','주문접수','배송완료') DEFAULT '접수대기',
  amount           INT          NOT NULL,                 -- 결제 금액 (원)
  notify_recipient BOOLEAN      DEFAULT FALSE,
  notify_sender    BOOLEAN      DEFAULT FALSE,
  notify_manager   BOOLEAN      DEFAULT TRUE,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     ON UPDATE CURRENT_TIMESTAMP
);
```

### 4.6 invoices (거래명세서)

```sql
CREATE TABLE invoices (
  id           BIGINT      PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT      NOT NULL REFERENCES users(id),
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  total_amount INT         NOT NULL,
  issued_at    DATETIME,
  status       ENUM('미발급','발급완료') DEFAULT '미발급',
  created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP
);
```

### 4.7 settlements (정산)

```sql
CREATE TABLE settlements (
  id           BIGINT      PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT      NOT NULL REFERENCES users(id),
  invoice_id   BIGINT      REFERENCES invoices(id),
  amount       INT         NOT NULL,
  due_date     DATE,
  paid_at      DATETIME,
  status       ENUM('미결제','대기','완료') DEFAULT '미결제',
  created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP
);
```

### 4.8 favorites (즐겨찾기)

```sql
CREATE TABLE favorites (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id)
);
```

---

## 5. 테이블 관계도 (ERD 요약)

```
users ──┬── managers      (1:N)
        ├── profiles       (1:N)
        ├── orders         (1:N)
        ├── invoices       (1:N)
        ├── settlements    (1:N)
        └── favorites      (1:N)

orders ─┬── products      (N:1)
        ├── managers      (N:1)
        └── profiles      (N:1)

invoices ── settlements   (1:1)
```

---

## 6. 현재 목업 → 실제 DB 전환 체크리스트

| 항목 | 현재 | 전환 후 |
|------|------|---------|
| 프로필 저장 | `useState` (메모리) | `POST /api/profiles` |
| 연락처 저장 | `useState` (메모리) | `POST /api/managers` |
| 즐겨찾기 저장 | `Set<string>` (메모리) | `POST /api/favorites` |
| 상품 목록 | 정적 상수 배열 | `GET /api/products` |
| 주문 접수 | 로컬 상태만 변경 | `POST /api/orders` |
| 인증 | 없음 (바로 이동) | JWT + refresh token |
| 세션 유지 | 없음 | `localStorage` + API 검증 |

---

## 7. 주요 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 즉시배송 | 주문 시각 기준 +4시간 이내 배송 보장 |
| 배송완료 알림 | ON 설정된 수신자(받는분/보내는분/담당자)에게 SMS 자동 발송 |
| 인사말 자동 생성 | `{회사명} {role} {name}` 규칙으로 greeting 생성 |
| 즐겨찾기 키 | `"{category}__{product}"` 형식 (이중 언더스코어) |
| 가격 표시 | `price.toLocaleString() + "원"` 형식 |
| 담당자 표기 | `"{name}({phone})"` 형식 (미입력 시 "미입력"/"미선택") |
