"""Fail-closed planning/outbox for a local CUA broadcaster. No network or UI actions.

Adapters must supply fresh, normalized observations and verified Telegram events.
This module does NOT install a scheduler or receipt listener.
"""
import hashlib
import json
import re
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

VN = ZoneInfo('Asia/Ho_Chi_Minh')
ROOM = '다낭 홀덤 DREAM Poker'
LINK = 'https://open.kakao.com/me/dreamcatchers'


class ReviewRequired(ValueError):
    pass


def local_time(value):
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ReviewRequired('Timezone-aware timestamp required')
    return value.astimezone(VN)


def fresh(observed_at, now, max_age=120):
    age = (local_time(now) - local_time(observed_at)).total_seconds()
    if not 0 <= age <= max_age:
        raise ReviewRequired('Observation is stale or from the future')


def dream_tables(rows):
    """Count physical CLASH 5 tables, never cumulative games or waiting rows."""
    if not isinstance(rows, list) or not rows:
        raise ReviewRequired('Empty dashboard is not proof of zero tables')
    tables = set()
    for row in rows:
        if not all(isinstance(row.get(k), str) for k in ('name', 'table', 'status')):
            raise ReviewRequired('Malformed dashboard row')
        name = row['name'].strip().upper()
        if not name.startswith('CLASH 5'):
            continue
        if not re.fullmatch(r'CLASH 5 No\.\d+', row['name'].strip(), re.I):
            raise ReviewRequired('Unrecognized CLASH 5 name')
        table = row['table'].strip()
        if not re.fullmatch(r'[1-9]\d?', table):
            raise ReviewRequired('Invalid physical table')
        status = row['status'].strip().upper()
        if re.fullmatch(r'IN PROGRESS LEVEL (?:\d+|BREAK)', status):
            tables.add(int(table))
        elif status == 'PAUSED LEVEL 1':
            pass
        else:
            raise ReviewRequired('Unrecognized CLASH 5 state: ' + status)
    if not tables:
        raise ReviewRequired('Zero active tables requires manual confirmation')
    return sorted(tables)


def render(snapshot, now):
    fresh(snapshot['observed_at'], now)
    if snapshot.get('url') != 'http://192.168.1.9:8080/':
        raise ReviewRequired('Wrong dashboard URL')
    tables = dream_tables(snapshot['rows'])
    body = ('📢 드림포커 실시간 현황\n' + local_time(now).strftime('%H:%M') + ' 기준\n\n'
            '♠️ DREAM POKER\n'
            '5M 타임어택 | %d테이블 진행 중\n\n' % len(tables)
            + '\n📌 타임어택은 미리 예약하고 방문하시면\n대기 없이 참여하실 수 있습니다.\n\n💬 참가·예약 문의\n' + LINK)
    digest = hashlib.sha256(json.dumps(tables, ensure_ascii=False).encode()).hexdigest()
    return body, digest


class Outbox:
    """Persistent single-writer claims. Uncertain sends block further dispatch.

    Caller: enqueue -> prepare -> mark_submitted BEFORE Return -> verify AFTER
    visible outgoing bubble. Never automatically repeat a submitted send.
    """
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS events(
          id TEXT PRIMARY KEY, kind TEXT NOT NULL, created REAL NOT NULL,
          handled INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sends(
          id INTEGER PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL,
          prepared REAL NOT NULL, state TEXT NOT NULL,
          verified REAL, bubble TEXT);
        ''')

    def enqueue(self, event, now):
        fresh(event['at'], now, 180)
        kind = event.get('kind')
        if kind == 'hourly':
            at = local_time(event['at'])
            if at.minute != 0 or at.second != 0:
                raise ReviewRequired('Hourly event must identify exact local hour')
            key = 'hour:' + at.strftime('%Y-%m-%dT%H')
        elif kind == 'receipt':
            if (event.get('room') != 'Dream Staff' or event.get('staff') is not True
                    or event.get('document') != 'buyin_receipt'
                    or not event.get('chat_id') or not event.get('message_id')):
                raise ReviewRequired('Unverified staff receipt event')
            key = 'receipt:%s:%s' % (event['chat_id'], event['message_id'])
        else:
            raise ReviewRequired('Unsupported trigger')
        cur = self.db.execute('INSERT OR IGNORE INTO events(id,kind,created) VALUES(?,?,?)',
                              (key, kind, local_time(event['at']).timestamp()))
        return bool(cur.rowcount)

    def prepare(self, snapshot, now):
        now_ts = local_time(now).timestamp()
        self.db.execute('BEGIN IMMEDIATE')
        try:
            if self.db.execute("SELECT 1 FROM sends WHERE state != 'verified'").fetchone():
                raise ReviewRequired('Unverified prior send: inspect room before proceeding')
            pending = self.db.execute('SELECT * FROM events WHERE handled=0').fetchall()
            if not pending:
                self.db.execute('COMMIT')
                return None
            if any(now_ts - e['created'] > 180 or now_ts < e['created'] for e in pending):
                raise ReviewRequired('Missed trigger needs manual review; do not backfill spam')
            if snapshot['observed_at'].timestamp() < max(e['created'] for e in pending):
                raise ReviewRequired('Dashboard was observed before trigger')
            body, digest = render(snapshot, now)
            last = self.db.execute('SELECT * FROM sends ORDER BY id DESC LIMIT 1').fetchone()
            # Coalesce the top-of-hour and receipt burst for two minutes.
            if last and now_ts - last['verified'] < 120:
                self.db.execute('COMMIT')
                return None  # leave pending; changed status is not lost
            if last and last['digest'] == digest and all(e['kind'] == 'receipt' for e in pending):
                self.db.execute('UPDATE events SET handled=1 WHERE handled=0')
                self.db.execute('COMMIT')
                return None  # receipt did not change public status
            cur = self.db.execute('INSERT INTO sends(body,digest,prepared,state) VALUES(?,?,?,?)',
                                  (body, digest, now_ts, 'prepared'))
            self.db.execute('UPDATE events SET handled=1 WHERE handled=0')
            self.db.execute('COMMIT')
            return {'id': cur.lastrowid, 'room': ROOM, 'body': body}
        except Exception:
            if self.db.in_transaction:
                self.db.execute('ROLLBACK')
            raise

    def mark_submitted(self, send_id, room, composer, now, restriction=False):
        row = self.db.execute('SELECT * FROM sends WHERE id=?', (send_id,)).fetchone()
        if (not row or row['state'] != 'prepared' or restriction or room != ROOM
                or composer != row['body'] or not 0 <= local_time(now).timestamp() - row['prepared'] <= 60):
            raise ReviewRequired('Unsafe, changed or expired composer; do not send')
        cur = self.db.execute("UPDATE sends SET state='submitted' WHERE id=? AND state='prepared'", (send_id,))
        if cur.rowcount != 1:
            raise ReviewRequired('Another worker already claimed submission')

    def verify(self, send_id, room, outgoing_body, bubble_id, now):
        row = self.db.execute('SELECT * FROM sends WHERE id=?', (send_id,)).fetchone()
        if (not row or row['state'] != 'submitted' or room != ROOM
                or outgoing_body != row['body'] or not bubble_id
                or local_time(now).timestamp() < row['prepared']):
            raise ReviewRequired('No matching outgoing bubble; do not retry automatically')
        self.db.execute("UPDATE sends SET state='verified', verified=?, bubble=? WHERE id=?",
                        (local_time(now).timestamp(), bubble_id, send_id))
