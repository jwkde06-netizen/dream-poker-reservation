import copy
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from guard import VN, ROOM, Outbox, ReviewRequired, dream_tables, render


NOW = datetime(2026, 10, 22, 17, 0, 10, tzinfo=VN)


def snapshot(now=NOW):
    return {'url': 'http://192.168.1.9:8080/', 'observed_at': now,
            'rows': [
                {'name': 'CLASH 5 No.6', 'table': '4', 'status': 'IN PROGRESS LEVEL 1'},
                {'name': 'CLASH 5 No.1', 'table': '4', 'status': 'IN PROGRESS LEVEL BREAK'},
                {'name': 'CLASH 5 No.5', 'table': '5', 'status': 'IN PROGRESS LEVEL 1'},
                {'name': 'CLASH 5 No.4', 'table': '12', 'status': 'IN PROGRESS LEVEL 3'},
                {'name': 'CLASH 5 No.3', 'table': '13', 'status': 'IN PROGRESS LEVEL 4'},
                {'name': 'CLASH 5 No.8', 'table': '12', 'status': 'PAUSED LEVEL 1'},
                {'name': 'THURSDAY THUNDER', 'table': '10', 'status': 'IN PROGRESS LEVEL 11'}],
            'mm': {'room': 'MM 한국방', 'observed_at': now, 'notices': [
                {'game': 'time_attack', 'state': 'day_off', 'posted_at': NOW.replace(hour=16, minute=16), 'evidence_id': 'today-1616-a'},
                {'game': 'cash', 'state': 'scheduled', 'posted_at': NOW.replace(hour=16, minute=16), 'evidence_id': 'today-1616-b',
                 'start_at': NOW.replace(hour=18, minute=0), 'end_at': NOW.replace(hour=19, minute=0)},
                {'game': '5/5', 'state': 'scheduled', 'posted_at': NOW.replace(hour=16, minute=22), 'evidence_id': 'today-1622',
                 'start_at': NOW.replace(hour=19, minute=0)}]}}


def hourly(now=NOW):
    return {'kind': 'hourly', 'at': now.replace(minute=0, second=0)}


def receipt(now=NOW, message='123'):
    return {'kind': 'receipt', 'at': now, 'room': 'Dream Staff', 'staff': True,
            'document': 'buyin_receipt', 'chat_id': '-example', 'message_id': message}


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, 'outbox.sqlite')
        self.box = Outbox(self.path)

    def tearDown(self):
        self.box.db.close()
        self.temp.cleanup()

    def verified_send(self):
        self.box.enqueue(hourly(), NOW)
        send = self.box.prepare(snapshot(), NOW)
        self.box.mark_submitted(send['id'], ROOM, send['body'], NOW)
        self.box.verify(send['id'], ROOM, send['body'], 'outgoing-1', NOW)
        return send

    def test_actual_dashboard_counts_physical_tables(self):
        self.assertEqual(dream_tables(snapshot()['rows']), [4, 5, 12, 13])

    def test_empty_unknown_and_zero_require_review(self):
        for rows in ([], [{'name': 'CLASH 5 No.1', 'table': '4', 'status': 'ENDED'}],
                     [{'name': 'CLASH 5 No.1', 'table': '4', 'status': 'PAUSED LEVEL 1'}]):
            with self.subTest(rows=rows), self.assertRaises(ReviewRequired):
                dream_tables(rows)




    def test_public_message_is_dream_only(self):
        s = snapshot()
        s['mm'] = {'untrusted': '캐시게임 5/5 MILLION MAKER 밀리언메이커'}
        body, digest = render(s, NOW)
        for forbidden in ('캐시', 'cash', '5/5', 'MILLION', '밀리언', 'MM'):
            self.assertNotIn(forbidden, body)
        self.assertIn('📢 드림포커 실시간 현황', body)
        self.assertIn('17:00 기준', body)
        self.assertIn('타임어택은 미리 예약하고 방문하시면', body)
        self.assertIn('대기 없이 참여하실 수 있습니다.', body)
        del s['mm']
        self.assertEqual(render(s, NOW), (body, digest))

    def test_stale_or_future_observations_block(self):
        for delta in (-121, 1):
            s = snapshot(NOW + timedelta(seconds=delta))
            with self.subTest(delta=delta), self.assertRaises(ReviewRequired):
                render(s, NOW)

    def test_wrong_source_and_naive_clock_block(self):
        s = snapshot()
        s['url'] = 'http://wrong/'
        with self.assertRaises(ReviewRequired):
            render(s, NOW)
        with self.assertRaises(ReviewRequired):
            render(snapshot(), NOW.replace(tzinfo=None))

    def test_duplicate_hour_and_receipt_survive_restart(self):
        self.assertTrue(self.box.enqueue(hourly(), NOW))
        self.assertTrue(self.box.enqueue(receipt(), NOW))
        other = Outbox(self.path)
        try:
            self.assertFalse(other.enqueue(hourly(), NOW))
            self.assertFalse(other.enqueue(receipt(), NOW))
        finally:
            other.db.close()

    def test_untrusted_receipt_and_non_hourly_time_block(self):
        for field, value in [('staff', False), ('document', 'food_receipt'), ('room', 'Other')]:
            event = receipt()
            event[field] = value
            with self.subTest(field=field), self.assertRaises(ReviewRequired):
                self.box.enqueue(event, NOW)
        with self.assertRaises(ReviewRequired):
            self.box.enqueue({'kind': 'hourly', 'at': NOW}, NOW)

    def test_simultaneous_hour_and_receipt_make_one_message(self):
        self.box.enqueue(hourly(), NOW)
        self.box.enqueue(receipt(), NOW)
        send = self.box.prepare(snapshot(), NOW)
        self.assertTrue(send)
        with self.assertRaises(ReviewRequired):
            self.box.prepare(snapshot(), NOW)

    def test_old_trigger_and_pre_trigger_snapshot_block(self):
        self.box.enqueue(receipt(), NOW)
        with self.assertRaises(ReviewRequired):
            self.box.prepare(snapshot(NOW - timedelta(seconds=1)), NOW)
        later = NOW + timedelta(seconds=181)
        with self.assertRaises(ReviewRequired):
            self.box.prepare(snapshot(later), later)

    def test_wrong_room_changed_text_expiry_and_warning_block_send(self):
        self.box.enqueue(hourly(), NOW)
        s = self.box.prepare(snapshot(), NOW)
        args = (s['id'], ROOM, s['body'], NOW)
        variants = [(s['id'], 'Other', s['body'], NOW),
                    (s['id'], ROOM, s['body'] + 'x', NOW),
                    (s['id'], ROOM, s['body'], NOW + timedelta(seconds=61))]
        for v in variants:
            with self.subTest(v=v), self.assertRaises(ReviewRequired):
                self.box.mark_submitted(*v)
        with self.assertRaises(ReviewRequired):
            self.box.mark_submitted(*args, restriction=True)

    def test_unverified_send_blocks_replay_after_restart(self):
        self.box.enqueue(hourly(), NOW)
        s = self.box.prepare(snapshot(), NOW)
        self.box.mark_submitted(s['id'], ROOM, s['body'], NOW)
        other = Outbox(self.path)
        try:
            with self.assertRaises(ReviewRequired):
                other.prepare(snapshot(), NOW)
            with self.assertRaises(ReviewRequired):
                other.verify(s['id'], ROOM, 'not posted', 'bubble', NOW)
        finally:
            other.db.close()

    def test_same_status_receipt_suppressed_but_next_hour_still_posts(self):
        self.verified_send()
        later = NOW + timedelta(seconds=121)
        self.box.enqueue(receipt(later, 'new'), later)
        self.assertIsNone(self.box.prepare(snapshot(later), later))
        later = NOW + timedelta(hours=1)
        self.box.enqueue(hourly(later), later)
        current = snapshot(later)
        self.assertIsNotNone(self.box.prepare(current, later))

    def test_hourly_posts_even_when_status_unchanged(self):
        initial = snapshot()
        initial['mm']['notices'] = initial['mm']['notices'][:1]
        self.box.enqueue(hourly(), NOW)
        send = self.box.prepare(initial, NOW)
        self.box.mark_submitted(send['id'], ROOM, send['body'], NOW)
        self.box.verify(send['id'], ROOM, send['body'], 'outgoing-hour', NOW)
        later = NOW + timedelta(hours=1)
        current = snapshot(later)
        current['mm']['notices'] = current['mm']['notices'][:1]
        self.box.enqueue(hourly(later), later)
        self.assertIsNotNone(self.box.prepare(current, later))

    def test_second_worker_cannot_submit_claimed_send(self):
        self.box.enqueue(hourly(), NOW)
        send = self.box.prepare(snapshot(), NOW)
        other = Outbox(self.path)
        try:
            self.box.mark_submitted(send['id'], ROOM, send['body'], NOW)
            with self.assertRaises(ReviewRequired):
                other.mark_submitted(send['id'], ROOM, send['body'], NOW)
        finally:
            other.db.close()

    def test_burst_is_deferred_without_losing_changed_status(self):
        self.verified_send()
        later = NOW + timedelta(seconds=30)
        self.box.enqueue(receipt(later, 'new'), later)
        self.assertIsNone(self.box.prepare(snapshot(later), later))
        later = NOW + timedelta(seconds=121)
        changed = snapshot(later)
        changed['rows'].append({'name': 'CLASH 5 No.9', 'table': '6', 'status': 'IN PROGRESS LEVEL 1'})
        send = self.box.prepare(changed, later)
        self.assertIn('5테이블 진행 중', send['body'])


if __name__ == '__main__':
    unittest.main()
