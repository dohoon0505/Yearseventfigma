# 올해의경조사 — API 연동 가이드

> 본 서비스는 **바로빌(Barobill)** 플랫폼의 3가지 API를 사용합니다.
> 공식 레퍼런스: https://dev.barobill.co.kr/docs/references
>
> **최종 업데이트**: 2026-04-14

---

## 목차

1. [공통 인증 · 환경 설정](#1-공통-인증--환경-설정)
2. [세금계산서 API](#2-세금계산서-api)
3. [계좌조회 API](#3-계좌조회-api)
4. [카카오톡전송 API](#4-카카오톡전송-api)
5. [프로젝트 연동 포인트](#5-프로젝트-연동-포인트)
6. [에러 코드 공통 처리](#6-에러-코드-공통-처리)

---

## 1. 공통 인증 · 환경 설정

### 1.1 공식 문서

| API | 공식 레퍼런스 URL |
|-----|-----------------|
| 세금계산서 | https://dev.barobill.co.kr/docs/references/세금계산서-API |
| 계좌조회 | https://dev.barobill.co.kr/docs/references/계좌조회-API |
| 카카오톡전송 | https://dev.barobill.co.kr/docs/references/카카오톡전송-API |

### 1.2 인증 방식

바로빌 API는 **SOAP (XML Web Service)** 기반이며, 모든 요청에 인증키(`CERT_KEY`)가 필요합니다.

```
프로토콜: SOAP 1.1 / SOAP 1.2
인증:     CERT_KEY (바로빌 관리자 콘솔에서 발급)
```

### 1.3 엔드포인트 (테스트 / 운영)

| 구분 | 도메인 |
|------|--------|
| 테스트(개발) | `https://testbarobill.co.kr` |
| 운영(프로덕션) | `https://barobill.co.kr` |

> **주의**: 테스트 환경과 운영 환경의 `CERT_KEY`는 별도로 발급됩니다.

### 1.4 환경 변수 설정 (예정)

백엔드 연동 시 아래 환경 변수를 사용할 것을 권장합니다.

```env
# .env
BAROBILL_CERT_KEY=발급받은_인증키
BAROBILL_CORP_NUM=사업자번호_10자리
BAROBILL_API_ENV=test   # test | production
BAROBILL_BASE_URL=https://testbarobill.co.kr
```

---

## 2. 세금계산서 API

> **공식 문서**: https://dev.barobill.co.kr/docs/references/세금계산서-API
> **사용 목적**: 정산 완료 후 거래처에 전자 세금계산서를 자동 발행

### 2.1 WSDL 주소

```
https://barobill.co.kr/TaxInvoice/TaxInvoice_v3.4.asmx?WSDL
```

### 2.2 주요 메서드

#### `RegistIssue` — 즉시 발행

세금계산서를 작성하고 즉시 국세청에 전송합니다.

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `CERT_KEY` | string | ✅ | 바로빌 인증키 |
| `CorpNum` | string | ✅ | 공급자 사업자번호 (하이픈 없이 10자리) |
| `UserID` | string | ✅ | 바로빌 회원 ID |
| `TaxinvoiceXML` | string | ✅ | 세금계산서 정보 (XML) |
| `WriteDate` | string | ✅ | 작성일자 (YYYYMMDD) |
| `ForceIssue` | boolean | - | 지연 발행 여부 (기본 false) |
| `MemoForIssue` | string | - | 발행 메모 |

**TaxinvoiceXML 주요 필드**

```xml
<TaxInvoice>
  <!-- 공급자 정보 -->
  <InvoicerCorpNum>1234567890</InvoicerCorpNum>       <!-- 공급자 사업자번호 -->
  <InvoicerCorpName>올해의경조사</InvoicerCorpName>    <!-- 공급자 상호 -->
  <InvoicerCEOName>대표자명</InvoicerCEOName>
  <InvoicerAddr>사업장 주소</InvoicerAddr>

  <!-- 공급받는자 정보 -->
  <InvoiceeCorpNum>9876543210</InvoiceeCorpNum>       <!-- 수신 사업자번호 -->
  <InvoiceeCorpName>제휴기업명</InvoiceeCorpName>
  <InvoiceeCEOName>대표자명</InvoiceeCEOName>
  <InvoiceeEmail1>invoice@company.com</InvoiceeEmail1> <!-- 계산서 수신 이메일 -->

  <!-- 공급가액 정보 -->
  <TaxType>과세</TaxType>                              <!-- 과세/영세/면세 -->
  <TotalAmount>110000</TotalAmount>                   <!-- 합계금액 -->
  <TaxAmount>10000</TaxAmount>                        <!-- 세액 -->
  <SupplyAmount>100000</SupplyAmount>                 <!-- 공급가액 -->

  <!-- 품목 -->
  <DetailList>
    <TaxInvoiceDetail>
      <Seria>1</Seria>
      <ItemName>꽃배달 서비스</ItemName>
      <Qty>1</Qty>
      <UnitCost>100000</UnitCost>
      <Spec>2026년 04월</Spec>
      <Supply>100000</Supply>
      <Tax>10000</Tax>
    </TaxInvoiceDetail>
  </DetailList>
</TaxInvoice>
```

**응답**

```xml
<RegistIssueResult>
  <Code>1</Code>             <!-- 1: 성공, 음수: 오류 -->
  <Message>정상처리</Message>
  <MgtKey>관리번호</MgtKey>  <!-- 이후 조회/취소에 사용 -->
</RegistIssueResult>
```

---

#### `GetInfo` — 세금계산서 단건 조회

발행된 세금계산서의 상태를 조회합니다.

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `CERT_KEY` | string | ✅ | 바로빌 인증키 |
| `CorpNum` | string | ✅ | 사업자번호 |
| `UserID` | string | ✅ | 바로빌 회원 ID |
| `MgtKey` | string | ✅ | 관리번호 (`RegistIssue` 응답값) |

**응답 주요 필드**

| 필드 | 설명 |
|------|------|
| `ItemKey` | 바로빌 문서 고유 키 |
| `StateCode` | 상태코드 (100: 발행, 200: 승인, 300: 취소) |
| `StateDT` | 상태 변경 일시 |
| `NTSConfirmNum` | 국세청 승인번호 |

---

#### `Cancel` — 세금계산서 취소

```
메서드: Cancel
파라미터: CERT_KEY, CorpNum, UserID, MgtKey, Memo(취소사유)
```

---

### 2.3 프로젝트 적용 위치

| 화면 | 트리거 | 호출 메서드 |
|------|--------|------------|
| `SettlementView` — 계산서발급 "동의하기" 클릭 | 사용자 동의 확인 후 | `RegistIssue` |
| `SettlementView` — 발급 상태 조회 | 페이지 로드 시 | `GetInfo` |
| `InvoiceView` — 거래명세서 페이지 | 발급완료 뱃지 표시 | `GetInfo` |

---

## 3. 계좌조회 API

> **공식 문서**: https://dev.barobill.co.kr/docs/references/계좌조회-API
> **사용 목적**: 제휴기업의 결제 입금 여부를 자동으로 확인

### 3.1 WSDL 주소

```
https://barobill.co.kr/AccountCheck/AccountCheck.asmx?WSDL
```

### 3.2 주요 메서드

#### `GetBalance` — 계좌 잔액 조회

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `CERT_KEY` | string | ✅ | 바로빌 인증키 |
| `CorpNum` | string | ✅ | 사업자번호 |
| `BankCode` | string | ✅ | 은행코드 (아래 표 참고) |
| `AccountNum` | string | ✅ | 계좌번호 (하이픈 없이) |

**은행코드 주요 목록**

| 코드 | 은행명 |
|------|--------|
| `004` | KB국민은행 |
| `011` | NH농협은행 |
| `020` | 우리은행 |
| `023` | SC제일은행 |
| `027` | 씨티은행 |
| `032` | 부산은행 |
| `039` | 경남은행 |
| `081` | KEB하나은행 |
| `088` | 신한은행 |
| `090` | 카카오뱅크 |
| `092` | 토스뱅크 |

**응답**

```xml
<GetBalanceResult>
  <Code>1</Code>
  <Message>정상처리</Message>
  <Balance>1500000</Balance>     <!-- 잔액 (원) -->
  <UpdateDT>20260414133700</UpdateDT>  <!-- 잔액 업데이트 일시 -->
</GetBalanceResult>
```

---

#### `GetTransactionList` — 거래 내역 조회

특정 기간의 입출금 내역을 조회합니다.

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `CERT_KEY` | string | ✅ | 바로빌 인증키 |
| `CorpNum` | string | ✅ | 사업자번호 |
| `BankCode` | string | ✅ | 은행코드 |
| `AccountNum` | string | ✅ | 계좌번호 |
| `SDate` | string | ✅ | 조회 시작일 (YYYYMMDD) |
| `EDate` | string | ✅ | 조회 종료일 (YYYYMMDD) |
| `TranType` | string | - | 거래유형 (`0`: 전체, `1`: 입금, `2`: 출금) |
| `Page` | int | - | 페이지 번호 (기본 1) |
| `PerPage` | int | - | 페이지당 건수 (기본 100, 최대 500) |

**응답 주요 필드**

```xml
<GetTransactionListResult>
  <Code>1</Code>
  <TotalCount>3</TotalCount>
  <TransactionList>
    <Transaction>
      <TranDT>20260414120000</TranDT>   <!-- 거래일시 -->
      <TranType>1</TranType>            <!-- 1: 입금, 2: 출금 -->
      <TranAmt>350000</TranAmt>         <!-- 거래금액 (원) -->
      <BalanceAmt>1850000</BalanceAmt>  <!-- 거래 후 잔액 -->
      <TranRemark>올해의경조사</TranRemark>  <!-- 적요 -->
      <BranchName>강남지점</BranchName>
    </Transaction>
  </TransactionList>
</GetTransactionListResult>
```

---

#### `RegistAccountCheck` — 계좌 등록

조회할 계좌를 바로빌에 사전 등록합니다.

```
메서드: RegistAccountCheck
파라미터: CERT_KEY, CorpNum, BankCode, AccountNum, AccountName(예금주), AccountPwd(인터넷뱅킹 비밀번호)
```

> ⚠️ `AccountPwd`는 암호화 전송이 필요합니다. 바로빌 SDK의 암호화 유틸 사용 권장.

---

### 3.3 프로젝트 적용 위치

| 화면 | 트리거 | 호출 메서드 |
|------|--------|------------|
| `SettlementView` — 정산확인 상태 갱신 | 정산 기한 도래 시 자동 | `GetTransactionList` |
| `SettlementView` — 입금자 자동 확인 | 정산 목록 로드 시 | `GetTransactionList` |

---

## 4. 카카오톡전송 API

> **공식 문서**: https://dev.barobill.co.kr/docs/references/카카오톡전송-API
> **사용 목적**: 배송완료 시 담당자·받는분·보내는분에게 알림톡(KakaoTalk) 자동 발송

### 4.1 WSDL 주소

```
https://barobill.co.kr/KakaoTalk/KakaoTalk.asmx?WSDL
```

### 4.2 메시지 유형

| 유형 | 설명 | 용도 |
|------|------|------|
| **알림톡** (ATMessage) | 카카오 공식 채널 템플릿 메시지 | 배송완료 알림, 주문접수 확인 |
| **친구톡** (FTMessage) | 채널 친구에게 자유 형식 메시지 | 마케팅, 이벤트 안내 |

> 본 프로젝트는 **알림톡(ATMessage)** 만 사용합니다.

---

### 4.3 주요 메서드

#### `SendATM` — 알림톡 단건 전송

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `CERT_KEY` | string | ✅ | 바로빌 인증키 |
| `CorpNum` | string | ✅ | 사업자번호 |
| `UserID` | string | ✅ | 바로빌 회원 ID |
| `SenderKey` | string | ✅ | 카카오 채널 발신프로필 키 |
| `TemplateCode` | string | ✅ | 사전 승인된 템플릿 코드 |
| `Receiver` | string | ✅ | 수신자 휴대폰번호 (하이픈 없이) |
| `ReceiverName` | string | - | 수신자명 |
| `Message` | string | ✅ | 템플릿 변수 치환된 본문 |
| `AltSendType` | string | - | 전송 실패 시 대체문자 유형 (`0`: 없음, `1`: SMS, `2`: LMS) |
| `AltMessage` | string | - | 대체 문자 내용 |
| `ReserveDT` | string | - | 예약 전송 일시 (YYYYMMDDHHMMSS, 빈 값이면 즉시) |

**예시 요청 (배송완료 알림)**

```javascript
const params = {
  CERT_KEY: process.env.BAROBILL_CERT_KEY,
  CorpNum: process.env.BAROBILL_CORP_NUM,
  UserID: "올해의경조사_ID",
  SenderKey: "카카오채널_발신프로필키",
  TemplateCode: "DELIVERY_COMPLETE_01",   // 사전 등록된 템플릿
  Receiver: "01012345678",
  ReceiverName: "홍길동",
  Message: `[올해의경조사] 안녕하세요, 홍길동님.\n주문하신 상품이 배송 완료되었습니다.\n\n■ 상품명: 3단화환(기본형)\n■ 배송지: 서울시 강남구 ...\n■ 완료일시: 2026-04-14 13:37`,
  AltSendType: "1",   // SMS로 대체 발송
  AltMessage: "[올해의경조사] 배송이 완료되었습니다.",
};
```

**응답**

```xml
<SendATMResult>
  <Code>1</Code>
  <Message>정상처리</Message>
  <MsgID>메시지고유ID</MsgID>   <!-- 전송 결과 조회에 사용 -->
</SendATMResult>
```

---

#### `SendATM_Multi` — 알림톡 대량 전송

여러 수신자에게 동시 전송 (배열 형태).

```
메서드: SendATM_Multi
파라미터: 위 SendATM 파라미터와 동일하나 Receiver, ReceiverName, Message를 배열로 전달
최대 건수: 1,000건/1회
```

---

#### `GetATMResult` — 전송 결과 조회

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `CERT_KEY` | string | ✅ | 바로빌 인증키 |
| `CorpNum` | string | ✅ | 사업자번호 |
| `MsgID` | string | ✅ | `SendATM` 응답의 MsgID |

**응답 주요 필드**

| 필드 | 설명 |
|------|------|
| `State` | 전송 상태 (`0`: 대기, `1`: 전송 중, `2`: 완료, `3`: 실패) |
| `ResultCode` | 결과 코드 (`0`: 성공) |
| `ResultMessage` | 결과 메시지 |
| `ReceiveDT` | 수신 완료 일시 |

---

### 4.4 알림톡 템플릿 목록 (사전 등록 필요)

카카오 비즈니스 채널에서 템플릿을 미리 승인받아야 합니다.

| 템플릿코드 | 제목 | 발송 시점 | 수신 대상 |
|-----------|------|----------|----------|
| `ORDER_RECEIVED` | 주문 접수 확인 | 주문 접수 완료 시 | 담당자 |
| `DELIVERY_COMPLETE` | 배송완료 알림 | 배송완료 상태 변경 시 | 받는분 / 보내는분 / 담당자 (ON 설정된 대상) |
| `INVOICE_ISSUED` | 세금계산서 발행 안내 | 계산서 발급 완료 시 | 담당자 |
| `SETTLEMENT_DUE` | 정산 기한 안내 | 정산 기한 D-3 | 담당자 |

**`DELIVERY_COMPLETE` 템플릿 본문 예시**

```
[올해의경조사] 배송완료 안내

안녕하세요, #{수신자명}님.
#{보내는분}에서 보내드린 상품이 배송 완료되었습니다.

■ 상품명: #{상품명}
■ 배송지: #{배송지}
■ 완료일시: #{완료일시}

감사합니다.
```

---

### 4.5 프로젝트 적용 위치

| 화면 / 이벤트 | 수신 대상 | 호출 메서드 | 템플릿 |
|--------------|----------|------------|--------|
| `OrderPage` — 주문 접수하기 클릭 | 담당자 | `SendATM` | `ORDER_RECEIVED` |
| `RealTimeOrders` — 상태를 "배송완료"로 변경 | 받는분 (ON) / 보내는분 (ON) / 담당자 (ON) | `SendATM_Multi` | `DELIVERY_COMPLETE` |
| `SettlementView` — 계산서발급 완료 | 담당자 | `SendATM` | `INVOICE_ISSUED` |

> 수신 대상은 `OrderPage`의 **배송완료 알림 수신 패널** 토글 ON 여부에 따라 결정됩니다.

---

## 5. 프로젝트 연동 포인트

### 5.1 API 호출 흐름 (배송완료 시나리오)

```
[관리자] RealTimeOrders 페이지에서 주문 상태 → "배송완료" 변경
    │
    ▼
[계좌조회 API] GetTransactionList 호출
    → 해당 정산 건의 입금 여부 확인
    → 입금 확인 시 SettlementView 정산확인 → "정산완료" 업데이트
    │
    ▼
[카카오톡전송 API] SendATM_Multi 호출
    → notifyRecipient=ON  → 받는분 연락처로 알림톡 전송
    → notifySender=ON     → 보내는분 연락처로 알림톡 전송
    → notifyManager=ON    → 담당자 연락처로 알림톡 전송
```

### 5.2 API 호출 흐름 (정산 완료 → 계산서 발급 시나리오)

```
[관리자] SettlementView 페이지 → "동의하기" 클릭
    │
    ▼
[세금계산서 API] RegistIssue 호출
    → 공급받는자 이메일(users.invoice_email)로 계산서 발송
    → MgtKey 저장 (이후 상태 조회용)
    │
    ▼
[카카오톡전송 API] SendATM 호출
    → 담당자에게 발급 완료 알림톡 전송
    │
    ▼
계산서발급 뱃지 → "발급완료" 로 업데이트
```

---

## 6. 에러 코드 공통 처리

바로빌 API는 응답 `<Code>` 값으로 성공/실패를 구분합니다.

| Code | 의미 | 처리 방법 |
|------|------|----------|
| `1` 이상 | 성공 | 정상 처리 |
| `0` | 시스템 오류 | 재시도 또는 관리자 알림 |
| `-1` | 인증키 오류 | `CERT_KEY` 확인 |
| `-2` | 잔여 건수 부족 | 바로빌 포인트 충전 |
| `-10` ~ `-19` | 요청 파라미터 오류 | 입력값 검증 |
| `-100` ~ `-199` | 사업자 정보 오류 | `CorpNum` 확인 |
| `-200` ~ `-299` | 계좌/수신 정보 오류 | 계좌번호 · 수신번호 확인 |
| `-9000` | 서비스 점검 중 | 바로빌 공지 확인 |

### 권장 에러 핸들링 패턴

```typescript
async function callBarobillAPI(method: string, params: object) {
  try {
    const response = await soapClient[method](params);
    const code = parseInt(response.Code);

    if (code >= 1) {
      return { success: true, data: response };
    }

    // 인증키 오류
    if (code === -1) {
      console.error("[Barobill] 인증키가 유효하지 않습니다.");
      throw new Error("API_AUTH_FAILED");
    }

    // 잔여 건수 부족
    if (code === -2) {
      console.error("[Barobill] 바로빌 포인트가 부족합니다.");
      throw new Error("API_INSUFFICIENT_POINTS");
    }

    throw new Error(`API_ERROR_${Math.abs(code)}: ${response.Message}`);

  } catch (err) {
    // 카카오톡 전송 실패 시 SMS 대체 발송 (AltSendType: "1" 설정 시 자동)
    console.error("[Barobill API Error]", method, err);
    throw err;
  }
}
```

---

## 7. 참고 사항

| 항목 | 내용 |
|------|------|
| SDK | Node.js: `node-soap` 패키지 사용 권장 (`npm i soap`) |
| 테스트 계정 | 바로빌 개발자 콘솔(dev.barobill.co.kr)에서 테스트 인증키 발급 |
| 카카오 채널 | 카카오 비즈니스 채널 개설 후 바로빌에 `SenderKey` 등록 필요 |
| 알림톡 템플릿 | 카카오 검수 승인까지 평균 2~3 영업일 소요 |
| 세금계산서 의무 | 공급가액 합계 기준, 전자세금계산서 의무 발행 대상 확인 필요 |
| 계좌조회 이용료 | 조회 건수당 과금 (바로빌 요금표 확인) |
