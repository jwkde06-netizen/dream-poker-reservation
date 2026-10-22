# 캐셔 정산서 대조 연결

## 현재 상태

- 운영 보고방: `-5378671785`. 직원방: `-5322020390`.
- 기존 보고방 연결과 `/close YYYY-MM-DD` 수동 합계 보고는 별도 기능이다. 캐셔 대조를 통과했다는 뜻이 아니다.
- `cashier-reconciliation.ts`: 선수별 바이인/금액, 양쪽 누락, 중복, 날짜별 인쇄/실제 게임번호 대조.
- `cashier-sheet-review.ts`: `일일 입력!A:I` UNFORMATTED 스냅샷을 검증하고 대조 보고 초안을 만든다. 시트나 Telegram에 쓰지 않는다.
- 자동 사진 수신 → 판독 → 마감 발송은 아직 연결하지 않았다. Viber 수신 연동은 별도 작업 중이다.

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
