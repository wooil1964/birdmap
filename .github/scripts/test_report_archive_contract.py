import subprocess
import unittest
from unittest.mock import patch
from pathlib import Path
from report_archive_contract import without_report_archive, automatic_data_base, BUTTON, BLOCKS, HOOK, SPECIES_SEARCH_HEAD
from current_location_contract import without_recent_reports_message, RECENT_REPORTS_MESSAGE_ISLANDS

ROOT = Path(__file__).resolve().parents[2]


class ArchiveScopeTests(unittest.TestCase):
    def test_original_html_outside_archive_is_exactly_preserved(self):
        before = subprocess.check_output(['git', 'show', '850b038f486db3ef32fe944daa8f8cf025b71ca1:index.html'], cwd=ROOT).decode('utf-8')
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(without_report_archive(current), before.replace('\r\n', '\n'))

    def test_unrelated_changes_survive_scope_normalization(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for old, new in [('var RECENT_REPORT_LIMIT=15;', 'var RECENT_REPORT_LIMIT=99;'),
                         ('var loadedNotices=[];', 'var loadedNotices=["tampered"];'),
                         ("PUBLICATION_MAX_AGE=5000", "PUBLICATION_MAX_AGE=99999")]:
            self.assertIn(old, current)
            self.assertNotEqual(without_report_archive(current.replace(old, new, 1)), without_report_archive(current))

    def test_recent_reports_message_reverses_only_the_exact_pr58_changes(self):
        before = subprocess.check_output(['git', 'show', '4c4988aef79df02484821ccfa39ef6c12a5e4660:index.html'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(without_recent_reports_message(current), before)
        self.assertEqual(without_recent_reports_message(current.replace('\n', '\r\n')), before)
        self.assertEqual(without_recent_reports_message(before), before)

    def test_recent_reports_message_partial_duplicate_or_old_copy_fails_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for old, new in RECENT_REPORTS_MESSAGE_ISLANDS:
            for modified in (current.replace(new, '', 1), current + new, current + old):
                with self.subTest(fragment=new[:60], modified_length=len(modified)):
                    with self.assertRaises(ValueError):
                        without_report_archive(modified)

    def test_recent_reports_message_tampered_html_or_css_fails_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        changes = (
            ('당신의 제보가 지도가 됩니다!', '당신의 제보가 지도가 됩니다?'),
            ('color:#39766f;', 'color:#ffffff;'),
            ('font-size:12px;font-weight:normal;line-height:1.35;', 'font-size:10px;font-weight:normal;line-height:1.35;'),
            ('z-index:9990;width:360px;', 'z-index:9990;width:999px;'),
            ('id="recentReportsMessage">', 'id="recentReportsMessage" onclick="alert(1)">'),
            ('id="recentReportsLabel">', 'id="recentReportsLabel" hidden>'),
            ('body #recentReportsMessage{flex-basis:100%;', 'body #recentReportsMessage{display:none;flex-basis:100%;'),
        )
        for old, new in changes:
            self.assertIn(old, current)
            with self.subTest(change=old):
                with self.assertRaises(ValueError):
                    without_report_archive(current.replace(old, new, 1))

    def test_unrelated_html_css_and_relocated_message_remain_frozen(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        expected = without_report_archive(current)
        changes = (
            ('id="recentTabs" role="tablist"', 'id="recentTabs" role="tablist" hidden'),
            ('#recentReportsHint{margin-left:auto;', '#recentReportsHint{display:none;margin-left:auto;'),
            ('#recentReportsCount{margin-left:6px;', '#recentReportsCount{margin-left:60px;'),
            ('</body>', '<div id="unapproved">unapproved HTML</div></body>'),
            ('</style>', 'body{display:none}</style>'),
        )
        for old, new in changes:
            self.assertIn(old, current)
            with self.subTest(change=old):
                self.assertNotEqual(without_report_archive(current.replace(old, new, 1)), expected)
        title = RECENT_REPORTS_MESSAGE_ISLANDS[0][1]
        self.assertNotEqual(without_report_archive(current.replace(title, '', 1) + title), expected)

    def test_duplicate_or_missing_boundaries_fail_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for literal in [BUTTON, HOOK] + [value for block in BLOCKS for value in block]:
            for modified in [current.replace(literal, '', 1), current + literal]:
                with self.assertRaises(ValueError):
                    without_report_archive(modified)

    def test_species_search_head_is_exact_and_fail_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(current.count(SPECIES_SEARCH_HEAD), 1)
        script_only = SPECIES_SEARCH_HEAD.splitlines(True)[1]
        for modified in [current.replace(SPECIES_SEARCH_HEAD, SPECIES_SEARCH_HEAD * 2, 1),
                         current.replace(SPECIES_SEARCH_HEAD, script_only, 1),
                         current.replace('</body>', script_only + '</body>', 1)]:
            with self.assertRaises(ValueError):
                without_report_archive(modified)

    def test_old_baseline_without_archive_remains_unchanged(self):
        self.assertEqual(without_report_archive('existing engine\n'), 'existing engine\n')

    def test_automatic_file_base_uses_merge_parent_or_main_ancestor(self):
        with patch('report_archive_contract.subprocess.check_output', return_value=b'commit parent1 parent2\n') as read:
            self.assertEqual(automatic_data_base(ROOT), 'HEAD^1')
            self.assertEqual(read.call_count, 1)
        with patch('report_archive_contract.subprocess.check_output', side_effect=[b'commit parent\n', 'base-main\n']) as read:
            self.assertEqual(automatic_data_base(ROOT), 'base-main')
            self.assertEqual(read.call_args.args[0], ['git', 'merge-base', 'HEAD', 'origin/main'])


if __name__ == '__main__':
    unittest.main()
