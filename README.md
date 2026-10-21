# Dream Poker Operations

예약, 회계, 환전을 각각의 Telegram 계정과 업무방으로 운영하는 Next.js 애플리케이션입니다. 기존 예약 사이트·직원 화면·Supabase·Google Sheets 연결을 함께 사용합니다.

## 업무별 구성

| 에이전트 | 담당 업무 | 사용 화면 / 경로 |
| --- | --- | --- |
| Dream Buy-in Desk | 실시간 예약, TD 연속 참가자 수, 데스크 임시 확보, 실명 교체, 캐셔 확인 | 기존 예약/직원 화면, `/api/reservations/webhook` |
| Dream Poker Accounting | 게임·F&B 입력, 캐셔 근거 대사, 기간별 정산 초안, 선택적인 Google Sheets 초안 | 전용 정산방, `/api/accounting/webhook` |
| Dream Poker Exchange | 통화별 시제, 완료된 환전·수수료·비용 기록, 취득원가, 실현손익 | 전용 환전방, `/api/exchange/webhook` |

관리자는 `/agents`에서 실제 봇 계정·업무방·일반 메시지 수신·웹훅 연결 상태를 확인할 수 있습니다. 연결 작업은 운영 주소에서 관리자 인증 후에만 가능합니다.

## 실행과 검증

Node.js 20.9 이상이 필요합니다. 로컬 검증에는 Node.js 24를 사용했습니다.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

개발 실행은 `npm run dev`입니다. `.env.example`을 참고하여 같은 Supabase 프로젝트의 공개 키와 서버 전용 설정을 환경변수에 넣습니다. 서비스 키, 봇 토큰, 웹훅 인증값은 저장소에 넣지 않습니다.

`npm test`는 금액 계산·좌석 처리·주간 대사·역할 인증·중복 처리와 PGlite에서 실행한 실제 SQL 결과를 확인합니다. 테스트에는 합성 데이터만 사용하며 운영 장부에 쓰지 않습니다. 로컬 검증은 운영 환경의 웹훅 왕복 및 다중 연결 부하 검증과 구분합니다.

## 운영 적용

코드를 배포하는 것만으로 전용 봇이 활성화되지는 않습니다. 명시적인 환경변수, 검토된 SQL, 전용 업무방, 웹훅 연결이 필요합니다. Accounting의 기본 모드는 `legacy`이며 기존 회계 업무가 자동으로 전환되지 않습니다.

- [세 에이전트 적용 순서](docs/agent-rollout.md)
- [예약 데스크 동작과 명령](docs/reservation-desk.md)
- [회계 처리·주간 대사·시트 초안](docs/accounting-agent.md)
- [환전 기록·시제·수익 계산](docs/exchange-agent.md)

새 테이블은 RLS를 사용하고 원장/RPC 쓰기는 서버 역할로 제한합니다. 고객 예약과 임시 확보를 구분하며, 금융 원금과 수익도 구분합니다. 확정되지 않은 근거·외화 원가·기간은 보고서에 미확인으로 남깁니다.
