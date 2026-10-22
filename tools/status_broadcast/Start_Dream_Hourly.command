#!/bin/zsh
set -eu
SCRIPT_DIR="${0:A:h}"
echo '드림 매시 정각 발송을 시작합니다. 종료하려면 이 창에서 Control+C를 누르세요.'
echo '카카오톡의 다낭 홀덤 DREAM Poker 방을 별도 창으로 열어두세요.'
echo 'macOS가 요청하면 본인이 자동화·손쉬운 사용 권한을 확인해 주세요.'
exec /usr/bin/caffeinate -i /usr/bin/python3 "$SCRIPT_DIR/hourly.py" --watch --send
