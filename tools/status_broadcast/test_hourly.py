import unittest
from datetime import datetime, timezone, timedelta
from guard import ReviewRequired, VN, render
from hourly import parse_board, due_hour, next_hour


BOARD = '''<html><table id="GridViewTournament">
<tr><th>NAME</th><th>TABLE</th><th>SEATS</th><th>ENTRIES</th><th>STATUS</th></tr>
<tr><td>CLASH 5 No.6</td><td>4</td><td>123</td><td>9 / 9</td><td>IN PROGRESS LEVEL 2</td></tr>
<tr><td>CLASH 5 No.5</td><td>5</td><td>123</td><td>9 / 9</td><td>IN PROGRESS LEVEL 2</td></tr>
<tr><td>CLASH 5 No.4</td><td>12</td><td>123</td><td>9 / 9</td><td>IN PROGRESS LEVEL 4</td></tr>
<tr><td>CLASH 5 No.7</td><td>13</td><td>123</td><td>9 / 9</td><td>IN PROGRESS LEVEL 1</td></tr>
<tr><td>CLASH 5 No.8</td><td>2</td><td>123</td><td>9 / 9</td><td>PAUSED LEVEL 1</td></tr>
<tr><td>THURSDAY THUNDER</td><td>10</td><td>123</td><td>28 / 59</td><td>IN PROGRESS LEVEL BREAK</td></tr>
</table></html>'''


class HourlyTests(unittest.TestCase):
    def test_html_to_dream_only_announcement(self):
        now = datetime(2026, 10, 22, 19, tzinfo=VN)
        body, _ = render({'url': 'http://192.168.1.9:8080/', 'observed_at': now,
                          'rows': parse_board(BOARD)}, now)
        self.assertIn('19:00 기준', body)
        self.assertIn('4테이블 진행 중', body)
        self.assertIn('대기 없이 참여하실 수 있습니다.', body)
        self.assertNotIn('MILLION', body)

    def test_wrong_missing_or_duplicate_table_blocks(self):
        for html in ('', BOARD.replace('GridViewTournament', 'different'), BOARD + BOARD):
            with self.subTest(html=html[:20]), self.assertRaises(ReviewRequired):
                parse_board(html)

    def test_reordered_columns_work(self):
        html = '<table id="GridViewTournament"><tr><td>STATUS</td><td>NAME</td><td>TABLE</td></tr>'
        html += '<tr><td>IN PROGRESS LEVEL 1</td><td>CLASH 5 No.1</td><td>4</td></tr></table>'
        self.assertEqual(parse_board(html)[0]['table'], '4')

    def test_column_mismatch_blocks(self):
        with self.assertRaises(ReviewRequired):
            parse_board(BOARD.replace('<td>4</td><td>123</td>', '<td>4</td>', 1))

    def test_only_exact_hour_window_runs(self):
        now = datetime(2026, 10, 22, 19, tzinfo=VN)
        self.assertEqual(due_hour(now + timedelta(seconds=10)), now)
        self.assertIsNone(due_hour(now + timedelta(seconds=30)))
        self.assertIsNone(due_hour(now + timedelta(minutes=20)))

    def test_vietnam_timezone_independent_of_system_timezone(self):
        utc = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)
        self.assertEqual(due_hour(utc).hour, 19)
        self.assertEqual(next_hour(utc).hour, 20)

    def test_midnight_rollover(self):
        late = datetime(2026, 10, 22, 23, 59, tzinfo=VN)
        self.assertEqual(next_hour(late), datetime(2026, 10, 23, tzinfo=VN))


if __name__ == '__main__':
    unittest.main()
