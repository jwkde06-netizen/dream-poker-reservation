#!/bin/zsh
set -u
SCRIPT_DIR="${0:A:h}"
if [[ ! -f "$SCRIPT_DIR/hourly.py" ]]; then
  SCRIPT_DIR='/Users/jeeweonkim/Documents/Codex/2026-10-22/new-chat-3/work/dream-poker-reservation/tools/status_broadcast'
fi
if [[ ! -f "$SCRIPT_DIR/hourly.py" ]]; then
  echo '프로그램 파일을 찾을 수 없습니다. 실행 파일만 따로 이동하지 마세요.'
  read -r '?Enter를 누르면 종료합니다. '
  exit 1
fi
echo '드림 매시 정각 발송을 시작합니다. 종료하려면 이 창에서 Control+C를 누르세요.'
echo '카카오톡의 다낭 홀덤 DREAM Poker 방을 별도 창으로 열어두세요.'
echo 'macOS가 요청하면 본인이 자동화·손쉬운 사용 권한을 확인해 주세요.'
/usr/bin/caffeinate -i /usr/bin/python3 -u "$SCRIPT_DIR/hourly.py" --watch --send
result=$?
echo "프로그램이 종료되었습니다. 종료 코드: $result"
read -r '?위 오류 내용을 확인한 뒤 Enter를 누르면 종료합니다. '
exit $result
