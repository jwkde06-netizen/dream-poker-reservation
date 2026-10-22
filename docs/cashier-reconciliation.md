# 캐셔 정산서 대조 연결

## 현재 상태

- 운영 보고방: `-5378671785`. 직원방: `-5322020390`.
- 기존 보고방 연결과 `/close YYYY-MM-DD` 수동 합계 보고는 별도 기능이다. 캐셔 대조를 통과했다는 뜻이 아니다.
- `cashier-reconciliation.ts`: 선수별 바이인/금액, 양쪽 누락, 중복, 날짜별 인쇄/실제 게임번호 대조.
- `cashier-sheet-review.ts`: `일일 입력!A:I` UNFORMATTED 스냅샷을 검증하고 대조 보고 초안을 만든다. 시트나 Telegram에 쓰지 않는다.
- `/api/accounting/cashier`에 사진 판독 초안, 대조 이력 저장, 결과 발송 경로를 구현했다. Telegram 일반 사진 메시지가 이 API를 자동 호출하는 기능은 아직 없다. Viber 수신 연동은 별도 작업 중이다.

## 수신 어댑터 API

`POST /api/accounting/cashier`는 기존 관리자 Bearer 세션 또는 서버의 기존 `ACCOUNTING_OPS_SECRET`으로 인증한다. 키를 채팅이나 프론트엔드에 넣지 않는다. URL/채팅방은 요청으로 받지 않고 서버의 기존 보고방 설정만 사용한다.

- `action:"extract", sourceId, images:[dataURL,...]`: 최대 6장, 요청 전체 4MB 미만. 사진을 기존 비전 모델로 판독해 초안을 반환한다. 모델은 페이지/코드/금액 기준 검증 권한이 없고 모든 evidence 플래그는 false다. 시트 수정·발송 없음.
- `action:"review", sourceId, statement, evidence, options`: 실제 시트 A:I와 대조하고 이력을 저장한다. id, sourceHash, 선수별 차이와 보고 초안을 반환한다.
- `action:"publish", id, sourceHash`: 기존 대조 결과를 최신 시트와 재확인한 뒤 보고방에 보낸다. 처리 중 작업, 시트 변경, 불확실한 전송은 보류한다.
- `action:"receive"`: review와 publish를 순서대로 실행한다. 검증된 수신 어댑터는 `/close` 없이 이 경로로 보고할 수 있다. 모든 조건 일치 때만 일일 합계 문구를 발송하고, 그 외에는 대조 차이/검토 사항을 발송한다.
- `GET`: 최근 대조 이력 20개. 같은 관리자 인증 필요.

`sourceId`는 원본의 안정적인 식별자를 사용한다. 정정본은 내용을 바꾼 새 검토 이력으로 저장된다. 같은 날 최종 보고는 기존 날짜 키를 사용하므로 재수신으로 중복 발송하지 않는다. 이미 수동 /close 보고가 발송된 날도 자동 재발송하지 않는다.

`evidence`의 세 필드는 원본 전체 페이지, 대상 코드 범위, I열과 동일한 금액 기준을 사람이 확인했거나 검증된 수신 어댑터가 보증할 때만 true로 전달한다. OCR 반환값을 그대로 true로 바꾸지 않는다. `options.requireGameMapping`은 기본 true이며, 인쇄/실제 번호가 같은 날이라고 확인한 경우만 false를 지정한다.

현재 캐셔 일일 선수 합계만 있고 게임별 내역이 없는 자료는 판독기가 supported:false로 반환한다. 게임별 금액을 추정해서 채우지 않는다. 실제 양식 검증 후 별도 일일 선수 합계 대조를 추가할 수 있다.

## 연결 계약

1. 영업일은 원본 정산서의 날짜를 사용한다. 새벽 수신 시각으로 날짜를 정하지 않는다.
2. 원본 파일, 발신 채팅/작성자, 원본 메시지 ID, 전체 페이지 수와 해시를 보존한다. 같은 원본은 한 번만 처리한다.
3. 판독 결과는 `Statement`로 변환한다. 금액 기준과 포함 코드가 시트 I열 및 우리 코드 범위와 같다는 검증이 필요하다. 모델이 `complete:true`를 반환했다는 이유만으로 증빙 검증을 통과시키지 않는다.
4. 캐셔 인쇄번호가 실제 게임번호와 다르면 날짜별 확정 매핑을 제공하고 `requireGameMapping:true`를 사용한다. 인쇄번호에서 일괄 1을 빼지 않는다.
5. 이름 띄어쓰기는 정규화한다. 별칭은 확인된 명단만 제공한다. JANG YOON HO와 CHANG YOON HO를 임의로 합치지 않는다.
6. 실제 테이블 회차 `13-2`와 물리 테이블 `13`은 동일한 표기가 아니다. 원본이 회차를 주지 않으면 table을 생략하고 게임번호 매핑으로 연결한다.
7. `reviewCashierAgainstSheet`에는 같은 시점의 A:I 값 전체를 전달한다. F&B는 이 금액 대조에 혼합하지 않는다.
8. `readyToReport:false`이면 차이 내역만 보고하고 원장을 자동 수정하거나 마감하지 않는다.
9. 발송 직전에 처리 중 기록과 시트 변경 여부를 재확인한다. 기존 보고 키와 전송 상태를 사용해 중복 발송을 방지한다. 전송 결과가 불확실하면 자동 재전송하지 않는다.

## 자동 마감 활성화 전 확인

실제 캐셔 원본 전체 페이지를 대상으로 OCR, 금액 기준, 코드 범위와 게임번호 매핑을 검증해야 한다. 이후 불일치/누락/중복 수신/시트 동시 수정과 일치 보고 전송을 실제 연동 경로에서 확인한다. 현재 유닛 테스트 통과는 자동 운영 완료를 의미하지 않는다.

보고 문구: `금일 총 XX게임 XX바이인 XXX동입니다.`

테스트:
```sh
./node_modules/.bin/tsc --target ES2020 --module commonjs --skipLibCheck --outDir .test-build lib/cashier-sheet-review.ts
node tests/cashier-reconciliation.cjs
node tests/cashier-sheet-review.cjs
node tests/accounting-report.cjs
```
