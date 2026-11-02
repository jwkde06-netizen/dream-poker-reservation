# 정산봇 AI 연결 (OpenAI 직접 호출)

정산봇(`lib/accounting-agent.ts`의 사진·요청 해석 `extract`, 칩 열 읽기 `readChipColumns`)은 Vercel AI Gateway가 아니라 OpenAI API를 직접 호출합니다.

- 엔드포인트: `https://api.openai.com/v1/chat/completions`
- 인증: 서버 환경변수 `OPENAI_API_KEY` 한 가지뿐입니다. 없으면 호출하지 않고 "OpenAI 키 확인 필요"로 실패하며, Gateway나 OIDC로 우회하지 않습니다.
- 모델: 기본 `gpt-6.1-sol`. 사진용 `ACCOUNTING_VISION_MODEL`, 글자용 `ACCOUNTING_TEXT_MODEL`, 공통 `ACCOUNTING_MODEL`로 바꿀 수 있습니다. `openai/` 접두어는 무시하고, `AI_GATEWAY_MODEL`은 정산봇에서 쓰지 않습니다.
- 요청 형식: Chat Completions. `max_completion_tokens`, `reasoning_effort`, `response_format: json_object`, 이미지는 `image_url` 파트(`detail: high`).
- 실패 처리: 키 오류(401), 크레딧·한도 부족(429 `insufficient_quota`), 모델 접근 불가(403/404)는 재시도하지 않고 접수 자료를 저장한 채 직원방에 한 번 안내합니다. 일시 오류(429 속도 제한, 5xx, 시간 초과)만 한 번 재시도합니다. 원문 오류 메시지는 저장·표시하지 않습니다.
- 복구: 키나 크레딧 문제가 해결되면 저장된 사진을 `recoverGatewayPhoto`(관리 API)로 다시 처리할 수 있습니다. Gateway 시절 실패(`AI_GATEWAY:*`)와 OpenAI 실패(`AI_PROVIDER:*`) 모두 대상입니다. 시트에 쓰기 전 상태만 복구됩니다.
- 대화 제외: 사진·문서, 봇 멘션, 봇 메시지에 대한 답장, 슬래시 명령, 열려 있는 질문에 대한 본인 답변, 규칙 가르치기 표현만 AI에 보냅니다. 직원끼리의 일반 대화는 AI 호출 전에 제외합니다.

환전봇·캐셔 사진 인식·주간 정산 보고서는 이 변경 범위가 아니며 기존 Gateway 설정을 그대로 씁니다.
