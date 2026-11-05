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
/usr/bin/python3 -u "$SCRIPT_DIR/hourly.py"
result=$?
echo '\n카톡에는 발송하지 않았습니다.'
if (( result != 0 )); then
  echo "미리보기에 실패했습니다. 위 오류 내용을 확인해 주세요. 종료 코드: $result"
fi
read -r '?Enter를 누르면 종료합니다. '
exit $result
