"""Standalone hourly runner. Dry-run by default; --send explicitly enables UI.

Run from a local macOS Terminal outside the restricted agent environment.
No Telegram subscription, bot token, cloud scheduler or MM integration.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import URLError
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.request import Request, urlopen

from guard import VN, ROOM, Outbox, ReviewRequired, render

URL = 'http://192.168.1.9:8080/'


class BoardParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.target_depth = None
        self.cell = None
        self.row = []
        self.rows = []
        self.headers = None
        self.found = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.depth += 1
            if dict(attrs).get('id') == 'GridViewTournament':
                self.target_depth = self.depth
                self.found += 1
        if self.target_depth == self.depth and self.target_depth is not None:
            if tag == 'tr':
                self.row = []
            elif tag in ('td', 'th'):
                self.cell = []
            elif tag == 'br' and self.cell is not None:
                self.cell.append(' ')

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if self.target_depth == self.depth and self.target_depth is not None:
            if tag in ('td', 'th') and self.cell is not None:
                self.row.append(' '.join(''.join(self.cell).split()))
                self.cell = None
            elif tag == 'tr' and self.row:
                if self.headers is None:
                    self.headers = [v.upper() for v in self.row]
                else:
                    if len(self.row) != len(self.headers):
                        raise ReviewRequired('Dashboard columns changed')
                    record = dict(zip(self.headers, self.row))
                    self.rows.append({'name': record.get('NAME'),
                                      'table': record.get('TABLE'),
                                      'status': record.get('STATUS')})
        if tag == 'table':
            if self.depth == self.target_depth:
                self.target_depth = None
            self.depth -= 1


def parse_board(html):
    p = BoardParser()
    p.feed(html)
    if p.found != 1 or not p.headers or not {'NAME', 'TABLE', 'STATUS'} <= set(p.headers):
        raise ReviewRequired('Expected dashboard table missing or duplicated')
    return p.rows


def fetch_snapshot():
    req = Request(URL, headers={'Cache-Control': 'no-cache', 'User-Agent': 'DreamStatus/1.0'})
    with urlopen(req, timeout=10) as response:
        if response.geturl() != URL:
            raise ReviewRequired('Unexpected dashboard redirect')
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ReviewRequired('Dashboard response too large')
        html = raw.decode(response.headers.get_content_charset() or 'utf-8')
    return {'url': URL, 'rows': parse_board(html), 'observed_at': datetime.now(VN)}


def due_hour(now):
    """No immediate startup send and no replay after waking up late."""
    now = now.astimezone(VN)
    if now.minute == 0 and now.second < 30:
        return now.replace(minute=0, second=0, microsecond=0)
    return None


def next_hour(now):
    return now.astimezone(VN).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)


def script_call(mode, body):
    # Arguments are passed separately. Never interpolate message text into code.
    result = subprocess.run(['/usr/bin/osascript', str(Path(__file__).with_name('kakao.applescript')),
                             mode, ROOM, body], capture_output=True, text=True, timeout=35)
    if result.returncode:
        raise ReviewRequired('Kakao UI check failed: ' + result.stderr.strip()[:250])
    if result.stdout.strip() != 'OK':
        raise ReviewRequired('Kakao UI verification missing')


def send_once(box, scheduled):
    now = datetime.now(VN)
    box.enqueue({'kind': 'hourly', 'at': scheduled}, now)
    snapshot = fetch_snapshot()
    plan = box.prepare(snapshot, datetime.now(VN))
    if plan is None:
        return 'already_handled'
    script_call('prepare', plan['body'])
    # Reserve BEFORE Return: timeouts and crashes must not cause automatic resend.
    box.mark_submitted(plan['id'], ROOM, plan['body'], datetime.now(VN))
    script_call('send', plan['body'])
    box.verify(plan['id'], ROOM, plan['body'],
               'local-ui:' + scheduled.isoformat(), datetime.now(VN))
    return 'verified'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--watch', action='store_true', help='Run on the next exact local hour and each hour after')
    p.add_argument('--send', action='store_true', help='Enable live Kakao UI sending (off by default)')
    p.add_argument('--state-dir', type=Path, default=Path.home() / 'Library/Application Support/DreamStatus')
    args = p.parse_args()
    if not args.watch:
        # A single invocation only previews fresh dashboard data; never sends.
        body, _ = render(fetch_snapshot(), datetime.now(VN))
        print(body)
        return
    if args.send and sys.platform != 'darwin':
        p.error('Live sender requires macOS')
    # Detect LAN/HTML problems before displaying LIVE or waiting for an hour.
    print('현황판 연결 확인 중… (카톡에는 아직 발송하지 않습니다.)', flush=True)
    body, _ = render(fetch_snapshot(), datetime.now(VN))
    print(body, flush=True)
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.state_dir, 0o700)
    with (args.state_dir / 'runner.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            p.error('Another hourly runner is already active')
        box = Outbox(str(args.state_dir / 'outbox.sqlite'))
        last = None
        print('LIVE' if args.send else 'PREVIEW ONLY', 'next:', next_hour(datetime.now(VN)).isoformat(), flush=True)
        while True:
            now = datetime.now(VN)
            scheduled = due_hour(now)
            if scheduled and scheduled != last:
                last = scheduled
                try:
                    if args.send:
                        result = send_once(box, scheduled)
                    else:
                        body, _ = render(fetch_snapshot(), datetime.now(VN))
                        print(body, flush=True)
                        result = 'preview'
                    print(json.dumps({'at': now.isoformat(), 'result': result}), flush=True)
                except Exception as exc:
                    # Stop the process. No silent retries, catch-up or post failures.
                    print('STOPPED — manual review required: ' + str(exc), file=sys.stderr, flush=True)
                    return 1
            time.sleep(1)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (URLError, OSError, ReviewRequired) as exc:
        print('실행 중단: ' + str(exc), file=sys.stderr, flush=True)
        print('현황판 접속, 같은 네트워크 연결 및 macOS 권한을 확인해 주세요. 자동발송은 시작되지 않았습니다.',
              file=sys.stderr, flush=True)
        sys.exit(1)
