#!/bin/zsh
set -eu
SCRIPT_DIR="${0:A:h}"
/usr/bin/python3 "$SCRIPT_DIR/hourly.py"
echo '\n미리보기입니다. 카톡에는 발송하지 않았습니다.'
read -r '?Enter를 누르면 종료합니다. '
