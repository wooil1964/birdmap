import subprocess
import unittest
from unittest.mock import patch
from pathlib import Path
from report_archive_contract import (without_report_archive, automatic_data_base,
                                     BUTTON, BLOCKS, HOOK, BASEMAP_HEAD,
                                     BASEMAP_INITIALIZATION, BASEMAP_ORIGINAL_INITIALIZATION,
                                     BASEMAP_FOLLOWING_CONTEXT, BASEMAP_SIGNATURES)

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

    def test_duplicate_or_missing_boundaries_fail_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for literal in [BUTTON, HOOK] + [value for block in BLOCKS for value in block]:
            for modified in [current.replace(literal, '', 1), current + literal]:
                with self.assertRaises(ValueError):
                    without_report_archive(modified)

    def test_old_baseline_without_archive_remains_unchanged(self):
        self.assertEqual(without_report_archive('existing engine\n'), 'existing engine\n')

    def test_exact_basemap_islands_restore_original_initialization_and_whitespace(self):
        before = '<head>\n</head>\nexisting engine\n' + BASEMAP_ORIGINAL_INITIALIZATION + BASEMAP_FOLLOWING_CONTEXT
        candidate = '<head>\n' + BASEMAP_HEAD + '</head>\nexisting engine\n' + BASEMAP_INITIALIZATION + BASEMAP_FOLLOWING_CONTEXT
        self.assertEqual(without_report_archive(candidate), before)
        self.assertEqual(without_report_archive(candidate.replace('\n', '\r\n')), before)

    def test_missing_duplicate_or_altered_basemap_islands_fail_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for island in (BASEMAP_HEAD, BASEMAP_INITIALIZATION):
            self.assertEqual(current.count(island), 1)
            variants = [current.replace(island, '', 1), current + island]
            for line in island.splitlines(keepends=True):
                # Delete, repeat, or alter each exact approved line separately.
                variants.extend(current.replace(island, island.replace(line, replacement, 1), 1)
                                for replacement in ('', line + line, line.replace('    ', '   ', 1)))
            for number, modified in enumerate(variants):
                with self.subTest(island=island.splitlines()[0], variant=number):
                    with self.assertRaises(ValueError):
                        without_report_archive(modified)

    def test_stray_basemap_fragments_outside_approved_islands_fail_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for signature in BASEMAP_SIGNATURES:
            with self.subTest(signature=signature):
                with self.assertRaises(ValueError):
                    without_report_archive(current + signature + '\n')

    def test_basemap_normalization_keeps_unrelated_changes_detectable(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for old, new in [('"minZoom": 4,', '"minZoom": 5,'),
                         ('min-height:var(--ctlH)', 'min-height:1px'),
                         ('function reportMapClick(e){', 'function reportMapClick(e){throw new Error("tampered");')]:
            self.assertIn(old, current)
            self.assertNotEqual(without_report_archive(current.replace(old, new, 1)), without_report_archive(current))

    def test_automatic_file_base_uses_merge_parent_or_main_ancestor(self):
        with patch('report_archive_contract.subprocess.check_output', return_value=b'commit parent1 parent2\n') as read:
            self.assertEqual(automatic_data_base(ROOT), 'HEAD^1')
            self.assertEqual(read.call_count, 1)
        with patch('report_archive_contract.subprocess.check_output', side_effect=[b'commit parent\n', 'base-main\n']) as read:
            self.assertEqual(automatic_data_base(ROOT), 'base-main')
            self.assertEqual(read.call_args.args[0], ['git', 'merge-base', 'HEAD', 'origin/main'])


if __name__ == '__main__':
    unittest.main()
