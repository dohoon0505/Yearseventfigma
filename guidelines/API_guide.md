# 올해의경조사 — API 연동 가이드

> 바로빌(Barobill) SDK (`BaroService_Nodejs`) 기반으로 작성된 실제 연동 가이드입니다.
> SDK 파일 위치: `BaroService_Nodejs/` (Node.js SOAP 방식)
>
> **공식 레퍼런스**: https://dev.barobill.co.kr/docs/references
> **최종 업데이트**: 2026-04-14

---

## 목차

1. [공통 환경 설정](#1-공통-환경-설정)
2. [세금계산서 API](#2-세금계산서-api)
3. [계좌조회 API](#3-계좌조회-api)
4. [카카오톡전송 API](#4-카카오톡전송-api)
5. [프로젝트 연동 흐름](#5-프로젝트-연동-흐름)
6. [에러 처리](#6-에러-처리)

---

## 1. 공통 환경 설정

### 1.1 패키지 설치

```bash
npm install soap
```

### 1.2 서버 엔드포인트

| 구분 | 도메인 |
|------|--------|
| **테스트** | `https://testws.baroservice.com` |
| **운영** | `https://ws.baroservice.com` |

### 1.3 인증 방식

모든 API 호출 시 `CERTKEY` (바로빌 인증키) + `CorpNum` (사업자번호) 필수.

```javascript
const certKey = process.env.BAROBILL_CERT_KEY   // 바로빌 관리자 콘솔에서 발급
const corpNum = process.env.BAROBILL_CORP_NUM    // 사업자번호 (하이픈 없이 10자리)
```

### 1.4 환경 변수 (.env)

```env
BAROBILL_CERT_KEY=발급받은_인증키
BAROBILL_CORP_NUM=사업자번호10자리
BAROBILL_ENV=test           # test | production
```

### 1.5 인증키 유효성 확인 (`CheckCERTIsValid`)

> SDK: `바로빌-공통/CheckCERTIsValid.js`

```javascript
const soap = require('soap');

const client = await soap.createClientAsync(
  'https://testws.baroservice.com/TI.asmx?WSDL'
  // 운영: 'https://ws.baroservice.com/TI.asmx?WSDL'
);

const response = await client.CheckCERTIsValidAsync({
  CERTKEY: certKey,
  CorpNum: corpNum,
});

const result = response[0].CheckCERTIsValidResult;
// result >= 1 : 유효
// result  < 0 : 오류 (에러 코드)
```

---

## 2. 세금계산서 API

> **공식 레퍼런스**: https://dev.barobill.co.kr/docs/references/세금계산서-API
> **WSDL (테스트)**: `https://testws.baroservice.com/TI.asmx?WSDL`
> **WSDL (운영)**: `https://ws.baroservice.com/TI.asmx?WSDL`
> **사용 목적**: 정산 완료 후 제휴기업에 전자 세금계산서 자동 발행

---

### 2.1 `RegistAndIssueTaxInvoice` — 세금계산서 즉시 발행

> SDK: `세금계산서/RegistAndIssueTaxInvoice.js`
> 레퍼런스: `…/세금계산서-API#RegistAndIssueTaxInvoice`

세금계산서를 등록하고 즉시 국세청으로 전송합니다.

#### 요청

```javascript
const client = await soap.createClientAsync('https://testws.baroservice.com/TI.asmx?WSDL');

const taxInvoice = {
  // ── 문서 기본 정보 ──────────────────────────────
  IssueDirection : 1,      // 발행 방향 (1: 정발행, 2: 역발행)
  TaxInvoiceType : 1,      // 계산서 유형 (1: 세금계산서, 2: 수정세금계산서)
  ModifyCode     : '',     // 수정 사유 코드 (수정 시만 사용)
  TaxType        : 1,      // 과세 유형 (1: 과세, 2: 영세, 3: 면세)
  TaxCalcType    : 1,      // 세액 계산 방식 (1: 직접입력, 2: 자동계산)
  PurposeType    : 2,      // 영수/청구 구분 (1: 영수, 2: 청구)
  WriteDate      : '20260414',  // 작성일자 (YYYYMMDD)

  // ── 금액 정보 ──────────────────────────────────
  AmountTotal    : '100000',   // 공급가액 합계
  TaxTotal       : '10000',    // 세액 합계
  TotalAmount    : '110000',   // 합계금액
  Cash           : '',
  ChkBill        : '',
  Note           : '',
  Credit         : '',
  Remark1        : '2026년 04월 꽃배달 이용금 청구',
  Remark2        : '',
  Remark3        : '',
  Kwon           : '',
  Ho             : '',
  SerialNum      : '',

  // ── 공급자 (올해의경조사) ───────────────────────
  InvoicerParty: {
    MgtNum     : 'YEVENT-20260414-001', // 자체 관리번호
    CorpNum    : '1234567890',          // 공급자 사업자번호
    TaxRegID   : '',
    CorpName   : '올해의경조사',
    CEOName    : '대표자명',
    Addr       : '서울시 강남구 ...',
    BizClass   : '서비스업',
    BizType    : '꽃배달',
    ContactID  : '',
    ContactName: '담당자명',
    TEL        : '02-0000-0000',
    HP         : '',
    Email      : 'admin@yevent.co.kr',
  },

  // ── 공급받는자 (제휴기업) ──────────────────────
  InvoiceeParty: {
    MgtNum     : '',
    CorpNum    : '9876543210',     // 제휴기업 사업자번호
    TaxRegID   : '',
    CorpName   : '제휴기업명',
    CEOName    : '대표자명',
    Addr       : '사업장 소재지',
    BizClass   : '',
    BizType    : '',
    ContactID  : '',
    ContactName: '경조사 담당자명',
    TEL        : '',
    HP         : '01012345678',
    Email      : 'invoice@company.com',  // users.invoice_email 값
  },

  BrokerParty: { MgtNum:'', CorpNum:'', TaxRegID:'', CorpName:'', CEOName:'',
                  Addr:'', BizClass:'', BizType:'', ContactID:'', ContactName:'',
                  TEL:'', HP:'', Email:'' },

  // ── 품목 ────────────────────────────────────
  TaxInvoiceTradeLineItems: {
    TaxInvoiceTradeLineItem: [
      {
        PurchaseExpiry: '20260430',   // 공급 기간 (YYYYMMDD)
        Name          : '꽃배달 서비스',
        Information   : '2026년 04월',
        ChargeableUnit: '1',
        UnitPrice     : '100000',
        Amount        : '100000',
        Tax           : '10000',
        Description   : '',
      },
    ]
  },
};

const response = await client.RegistAndIssueTaxInvoiceAsync({
  CERTKEY   : certKey,
  CorpNum   : taxInvoice.InvoicerParty.CorpNum,
  Invoice   : taxInvoice,
  SendSMS   : true,    // 발행 알림 SMS 전송 여부
  ForceIssue: false,   // 지연 발행 강제 처리 여부
  MailTitle : '',      // 이메일 제목 (빈값이면 기본 제목 사용)
});
```

#### 응답

```javascript
const result = response[0].RegistAndIssueTaxInvoiceResult;

if (result < 0) {
  // 오류 (에러 코드 섹션 참고)
  console.error('발행 실패:', result);
} else {
  // 성공: result = 바로빌 문서 고유번호 (MgtKey로 이후 조회에 사용)
  console.log('발행 성공, MgtKey:', result);
}
```

---

### 2.2 `GetTaxInvoiceStateEX` — 세금계산서 상태 조회

> SDK: `세금계산서/GetTaxInvoiceStateEX.js`

발행된 세금계산서의 처리 상태를 조회합니다.

```javascript
const response = await client.GetTaxInvoiceStateEXAsync({
  CERTKEY: certKey,
  CorpNum: corpNum,
  MgtKey : mgtKey,   // RegistAndIssueTaxInvoice 응답값
});

const result = response[0].GetTaxInvoiceStateEXResult;

if (result.BarobillState < 0) {
  console.error('조회 실패:', result.BarobillState);
} else {
  console.log(result); // 상태 정보 (레퍼런스 참고)
}
```

**`BarobillState` 주요 값**

| 값 | 상태 |
|----|------|
| `100` | 등록 |
| `200` | 발행 완료 (국세청 전송 전) |
| `300` | 국세청 전송 완료 |
| `400` | 국세청 승인 |
| `-` 음수 | 오류 |

---

### 2.3 프로젝트 적용 위치 (세금계산서)

| 화면 | 트리거 | 호출 API |
|------|--------|---------|
| `SettlementView` → "동의하기" 클릭 | 사용자 동의 확인 후 | `RegistAndIssueTaxInvoice` |
| `SettlementView` → 목록 로드 | 페이지 진입 시 | `GetTaxInvoiceStateEX` |
| `InvoiceView` → 발급 상태 뱃지 | 페이지 진입 시 | `GetTaxInvoiceStateEX` |

---

## 3. 계좌조회 API

> **공식 레퍼런스**: https://dev.barobill.co.kr/docs/references/계좌조회-API
> **WSDL (테스트)**: `https://testws.baroservice.com/BANKACCOUNT.asmx?WSDL`
> **WSDL (운영)**: `https://ws.baroservice.com/BANKACCOUNT.asmx?WSDL`
> **사용 목적**: 정산 기한 내 제휴기업의 입금 여부 자동 확인

---

### 3.1 `RegistBankAccountEx` — 계좌 등록

> SDK: `계좌조회/RegistBankAccountEx.js`

조회할 계좌를 바로빌에 사전 등록합니다. **최초 1회만 실행.**

```javascript
const client = await soap.createClientAsync(
  'https://testws.baroservice.com/BANKACCOUNT.asmx?WSDL'
);

const response = await client.RegistBankAccountExAsync({
  CERTKEY        : certKey,
  CorpNum        : corpNum,
  CollectCycle   : 1,             // 수집 주기 (1: 1시간, 3: 3시간, 6: 6시간, 12: 12시간, 24: 24시간)
  Bank           : '088',         // 은행코드 (아래 표 참고)
  BankAccountType: 1,             // 계좌 유형 (1: 입출금, 2: 적금, 3: 외화)
  BankAccountNum : '123456789012',// 계좌번호 (하이픈 없이)
  BankAccountPwd : '****',        // 인터넷뱅킹 비밀번호
  WebId          : '',            // 인터넷뱅킹 ID (일부 은행 필요)
  WebPwd         : '',            // 인터넷뱅킹 비밀번호 (일부 은행 필요)
  IdentityNum    : '',            // 주민번호 / 사업자번호 (일부 은행 필요)
  foreignCurrencyCodes: ['', ''], // 외화 코드 (외화계좌만 입력)
  Alias          : '올해의경조사 수납계좌',
  Usage          : 1,             // 사용 여부 (1: 사용)
});

const result = response[0].RegistBankAccountExResult;
// result >= 1 : 성공
// result  < 0 : 오류
```

**은행 코드 주요 목록**

| 코드 | 은행명 | 코드 | 은행명 |
|------|--------|------|--------|
| `002` | KDB산업은행 | `081` | KEB하나은행 |
| `004` | KB국민은행 | `088` | 신한은행 |
| `011` | NH농협은행 | `089` | K뱅크 |
| `020` | 우리은행 | `090` | 카카오뱅크 |
| `023` | SC제일은행 | `092` | 토스뱅크 |
| `027` | 씨티은행 | `031` | 대구은행 |
| `032` | 부산은행 | `039` | 경남은행 |

---

### 3.2 `GetBankAccountEx` — 등록 계좌 목록 조회

> SDK: `계좌조회/GetBankAccountEx.js`

```javascript
const response = await client.GetBankAccountExAsync({
  CERTKEY  : certKey,
  CorpNum  : corpNum,
  AvailOnly: 1,   // 1: 사용 계좌만 조회, 0: 전체 조회
});

const result = response[0].GetBankAccountExResult;
const accounts = result ? result.BankAccount : [];

for (const account of accounts) {
  console.log(account); // 계좌 정보 (레퍼런스 참고)
}
```

---

### 3.3 `GetPeriodBankAccountTransLog` — 기간별 거래 내역 조회

> SDK: `계좌조회/GetPeriodBankAccountTransLog.js`

특정 기간의 입출금 내역을 페이지네이션으로 조회합니다.

```javascript
const response = await client.GetPeriodBankAccountTransLogAsync({
  CERTKEY       : certKey,
  CorpNum       : corpNum,
  ID            : '',              // 바로빌에서 부여한 계좌 ID
  BankAccountNum: '123456789012',  // 계좌번호
  StartDate     : '20260401',      // 조회 시작일 (YYYYMMDD)
  EndDate       : '20260430',      // 조회 종료일 (YYYYMMDD)
  TransDirection: 1,               // 거래 방향 (0: 전체, 1: 입금, 2: 출금)
  CountPerPage  : 100,             // 페이지당 건수 (최대 500)
  CurrentPage   : 1,               // 현재 페이지
  OrderDirection: 1,               // 정렬 방향 (0: 오름차순, 1: 내림차순)
});

const result = response[0].GetPeriodBankAccountTransLogResult;

if (result.CurrentPage < 0) {
  console.error('조회 실패:', result.CurrentPage);
} else {
  console.log('전체 건수:', result.MaxIndex);
  console.log('전체 페이지:', result.MaxPageNum);

  const logs = result.BankAccountLogList
    ? result.BankAccountLogList.BankAccountTransLog
    : [];

  for (const log of logs) {
    console.log(log); // 거래 내역 (레퍼런스 참고)
  }
}
```

**응답 필드 요약**

| 필드 | 타입 | 설명 |
|------|------|------|
| `CurrentPage` | int | 현재 페이지 (음수 = 오류) |
| `CountPerPage` | int | 페이지당 건수 |
| `MaxPageNum` | int | 전체 페이지 수 |
| `MaxIndex` | int | 전체 거래 건수 |
| `BankAccountLogList.BankAccountTransLog[]` | array | 거래 내역 목록 |

---

### 3.4 프로젝트 적용 위치 (계좌조회)

| 화면 | 트리거 | 호출 API |
|------|--------|---------|
| `SettlementView` → 정산확인 상태 갱신 | 정산 기한 도래 시 (배치) | `GetPeriodBankAccountTransLog` |
| `SettlementView` → 입금자 자동 확인 | 목록 로드 시 | `GetPeriodBankAccountTransLog` |
| 초기 설정 (1회) | 계좌 사전 등록 | `RegistBankAccountEx` |

---

## 4. 카카오톡전송 API

> **공식 레퍼런스**: https://dev.barobill.co.kr/docs/references/카카오톡전송-API
> **WSDL (테스트)**: `https://testws.baroservice.com/Kakaotalk.asmx?WSDL`
> **WSDL (운영)**: `https://ws.baroservice.com/Kakaotalk.asmx?WSDL`
> **사용 목적**: 배송완료 시 담당자·받는분·보내는분에게 알림톡(AT) 자동 발송

---

### 4.1 `SendATKakaotalk` — 알림톡 단건 전송

> SDK: `카카오톡전송/SendATKakaotalk.js`

```javascript
const client = await soap.createClientAsync(
  'https://testws.baroservice.com/Kakaotalk.asmx?WSDL'
);

const response = await client.SendATKakaotalkAsync({
  CERTKEY     : certKey,
  CorpNum     : corpNum,
  SenderID    : 'barobill_sender_id',   // 바로빌 카카오 채널 발신 프로필 ID
  TemplateName: 'DELIVERY_COMPLETE',    // 사전 승인된 템플릿 코드
  SendDT      : '',                     // 예약 전송 일시 (YYYYMMDDHHMMSS, 빈값=즉시)
  SmsReply    : 0,                      // SMS 대체 발송 여부 (0: 미사용, 1: SMS, 2: LMS)
  SmsSenderNum: '0200000000',           // SMS 대체 발송 시 발신번호
  KakaotalkMessage: {
    ReceiverNum : '01012345678',        // 수신자 휴대폰번호 (하이픈 없이)
    ReceiverName: '홍길동',              // 수신자명
    Title       : '배송완료 안내',       // 알림톡 제목 (일부 템플릿 사용)
    Message     : '[올해의경조사] 배송이 완료되었습니다.\n\n■ 상품명: 3단화환(기본형)\n■ 완료일시: 2026-04-14 13:37',
    SmsSubject  : '[올해의경조사] 배송완료',   // SMS 대체 발송 제목 (LMS 시)
    SmsMessage  : '[올해의경조사] 배송이 완료되었습니다.',  // SMS 대체 발송 본문
  },
});

const result = response[0].SendATKakaotalkResult;

if (/^-[0-9]{5}$/.test(result)) {
  console.error('전송 실패:', result);  // -XXXXX 형태 에러코드
} else {
  console.log('전송 성공, SendKey:', result);  // 이후 결과 조회에 사용
}
```

---

### 4.2 `SendATKakaotalks` — 알림톡 대량 전송

> SDK: `카카오톡전송/SendATKakaotalks.js`

여러 수신자에게 동시 전송. 배송완료 시 ON 설정된 모든 대상에게 한 번에 발송합니다.

```javascript
const kakaotalkMessages = [
  // 받는분 (notifyRecipient = true)
  {
    ReceiverNum : '01011111111',
    ReceiverName: '홍길동',
    Title       : '배송완료 안내',
    Message     : '[올해의경조사] 안녕하세요, 홍길동님.\n주문하신 상품이 배송 완료되었습니다.',
    SmsSubject  : '[올해의경조사] 배송완료',
    SmsMessage  : '[올해의경조사] 배송이 완료되었습니다.',
  },
  // 보내는분 (notifySender = true)
  {
    ReceiverNum : '01022222222',
    ReceiverName: '(주)올해의경조사 대표이사 홍길동',
    Title       : '배송완료 안내',
    Message     : '[올해의경조사] 발송하신 상품이 배송 완료되었습니다.',
    SmsSubject  : '[올해의경조사] 배송완료',
    SmsMessage  : '[올해의경조사] 발송하신 상품이 배송 완료되었습니다.',
  },
  // 담당자 (notifyManager = true)
  {
    ReceiverNum : '01033333333',
    ReceiverName: '오임찬',
    Title       : '배송완료 안내',
    Message     : '[올해의경조사] 담당자님, 주문하신 상품이 배송 완료되었습니다.',
    SmsSubject  : '[올해의경조사] 배송완료',
    SmsMessage  : '[올해의경조사] 배송이 완료되었습니다.',
  },
];

const response = await client.SendATKakaotalksAsync({
  CERTKEY          : certKey,
  CorpNum          : corpNum,
  SenderID         : 'barobill_sender_id',
  TemplateName     : 'DELIVERY_COMPLETE',
  SendDT           : '',
  SmsReply         : 1,
  SmsSenderNum     : '0200000000',
  KakaotalkMessages: { KakaotalkATMessage: kakaotalkMessages },
});

const result = response[0].SendATKakaotalksResult.string;

if (/^-[0-9]{5}$/.test(result[0])) {
  console.error('전송 실패:', result[0]);
} else {
  // 각 수신자별 SendKey 반환
  for (const sendKey of result) {
    console.log('전송 성공, SendKey:', sendKey);
  }
}
```

---

### 4.3 `GetSendKakaotalk` — 전송 결과 조회

> SDK: `카카오톡전송/GetSendKakaotalk.js`

```javascript
const response = await client.GetSendKakaotalkAsync({
  CERTKEY: certKey,
  CorpNum: corpNum,
  SendKey: sendKey,   // SendATKakaotalk / SendATKakaotalks 응답값
});

const result = response[0].GetSendKakaotalkResult;

if (result.SendStatus < 0) {
  console.error('조회 실패:', result.SendStatus);
} else {
  console.log(result); // 전송 결과 상세 (레퍼런스 참고)
}
```

**`SendStatus` 주요 값**

| 값 | 상태 |
|----|------|
| `0` | 전송 대기 |
| `1` | 전송 중 |
| `2` | 전송 완료 |
| `3` | 전송 실패 (SMS 대체 발송 시도) |
| `4` | SMS 대체 발송 완료 |
| 음수 | 오류 |

---

### 4.4 알림톡 템플릿 목록

> 카카오 비즈니스 채널 검수 후 바로빌에 등록 필요 (검수 2~3 영업일 소요)

| TemplateName | 발송 시점 | 수신 대상 |
|-------------|----------|----------|
| `ORDER_RECEIVED` | 주문 접수 완료 | 담당자 |
| `DELIVERY_COMPLETE` | 배송완료 상태 변경 | 받는분 / 보내는분 / 담당자 (ON 설정된 대상) |
| `INVOICE_ISSUED` | 세금계산서 발급 완료 | 담당자 |

---

### 4.5 프로젝트 적용 위치 (카카오톡)

| 화면 / 이벤트 | 수신 대상 결정 기준 | 호출 API |
|-------------|------------------|---------|
| `OrderPage` → "주문 접수하기" 클릭 | 담당자 (고정) | `SendATKakaotalk` |
| `RealTimeOrders` → 상태 "배송완료" 변경 | `notifyRecipient` / `notifySender` / `notifyManager` 토글 ON 여부 | `SendATKakaotalks` |
| `SettlementView` → 계산서 발급 완료 | 담당자 (고정) | `SendATKakaotalk` |

> 수신 대상은 `OrderPage` **배송완료 알림 수신** 패널의 토글 상태로 결정됩니다.

---

## 5. 프로젝트 연동 흐름

### 5.1 배송완료 시나리오

```
[관리자] RealTimeOrders → 주문 상태 "배송완료"로 변경
    │
    ├─► [계좌조회 API] GetPeriodBankAccountTransLog
    │       → 해당 정산 건 입금 확인
    │       → 입금 확인 시: SettlementView 정산확인 "정산완료"로 업데이트
    │
    └─► [카카오톡 API] SendATKakaotalks
            → notifyRecipient=ON  → 받는분(toPhone) 알림톡
            → notifySender=ON     → 보내는분(sender.phone) 알림톡
            → notifyManager=ON    → 담당자(contact.phone) 알림톡
            TemplateName: 'DELIVERY_COMPLETE'
```

### 5.2 계산서 발급 시나리오

```
[관리자] SettlementView → "동의하기" 클릭
    │
    ├─► [세금계산서 API] RegistAndIssueTaxInvoice
    │       → InvoiceeParty.Email = users.invoice_email
    │       → 응답 MgtKey 저장
    │       → 계산서발급 뱃지 "발급완료"로 업데이트
    │
    └─► [카카오톡 API] SendATKakaotalk
            → 담당자(contact.phone)에게 발급 완료 알림
            TemplateName: 'INVOICE_ISSUED'
```

---

## 6. 에러 처리

### 6.1 응답 코드 체계

| 범위 | 의미 |
|------|------|
| `1` 이상 (양수) | **성공** |
| `0` | 시스템 일시 오류, 재시도 |
| `-1` | 인증키(`CERTKEY`) 오류 |
| `-2` | 잔여 건수 부족 (바로빌 포인트 충전 필요) |
| `-10 ~ -19` | 요청 파라미터 오류 |
| `-100 ~ -199` | 사업자 정보 오류 |
| `-200 ~ -299` | 계좌/수신 정보 오류 |
| `-XXXXX` (5자리) | 카카오톡 전송 실패 코드 |
| `-9000` | 서비스 점검 중 |

### 6.2 공통 에러 핸들러 패턴

```javascript
// utils/barobill.js
const soap = require('soap');

const WSDL = {
  TI         : process.env.BAROBILL_ENV === 'production'
                 ? 'https://ws.baroservice.com/TI.asmx?WSDL'
                 : 'https://testws.baroservice.com/TI.asmx?WSDL',
  BANKACCOUNT: process.env.BAROBILL_ENV === 'production'
                 ? 'https://ws.baroservice.com/BANKACCOUNT.asmx?WSDL'
                 : 'https://testws.baroservice.com/BANKACCOUNT.asmx?WSDL',
  KAKAOTALK  : process.env.BAROBILL_ENV === 'production'
                 ? 'https://ws.baroservice.com/Kakaotalk.asmx?WSDL'
                 : 'https://testws.baroservice.com/Kakaotalk.asmx?WSDL',
};

async function createClient(type) {
  return await soap.createClientAsync(WSDL[type]);
}

function handleResult(result) {
  const code = typeof result === 'object' ? result.BarobillState ?? result.CurrentPage ?? result : result;
  const num  = Number(code);

  if (num >= 1) return { success: true };

  const messages = {
    '-1'  : '인증키(CERTKEY)가 유효하지 않습니다.',
    '-2'  : '바로빌 포인트가 부족합니다. 충전 후 다시 시도해주세요.',
    '-9000': '바로빌 서비스 점검 중입니다. 잠시 후 다시 시도해주세요.',
  };

  const msg = messages[String(num)] ?? `API 오류 (코드: ${num})`;
  console.error('[Barobill]', msg);
  throw new Error(msg);
}

module.exports = { createClient, handleResult, WSDL };
```
