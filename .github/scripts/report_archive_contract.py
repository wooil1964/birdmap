"""Exclude only the approved additive archive from older whole-HTML freeze checks."""
import subprocess

BUTTON = '  <button id="reportArchiveOpen" class="contribMore" type="button" onclick="openReportArchive()">전체 보기</button>\n'
HOOK = " if(typeof clearReportArchive==='function')clearReportArchive();\n"
BLOCKS = [
    ('<!-- report-archive:modal:start -->\n', '<!-- report-archive:modal:end -->\n'),
    ('/* report-archive:styles:start */\n', '/* report-archive:styles:end */\n'),
    ('/* report-archive:script:start */\n', '/* report-archive:script:end */\n\n'),
]


def without_report_archive(text):
    text = text.replace('\r\n', '\n')
    if 'report-archive:' not in text and 'id="reportArchiveOpen"' not in text:
        return text
    for literal in (BUTTON, HOOK):
        if text.count(literal) != 1:
            raise ValueError('Archive entry/hook must occur exactly once')
        text = text.replace(literal, '', 1)
    for start, end in BLOCKS:
        if text.count(start) != 1 or text.count(end) != 1:
            raise ValueError('Archive boundaries must occur exactly once')
        before, remainder = text.split(start, 1)
        block, after = remainder.split(end, 1)
        if not block.strip():
            raise ValueError('Archive block must not be empty')
        text = before + after
    return text


def automatic_data_base(root):
    # PR merge CI uses the main parent. Local feature branches use their main base.
    parents = subprocess.check_output(['git', 'rev-list', '--parents', '-n', '1', 'HEAD'], cwd=root).split()
    if len(parents) > 2:
        return 'HEAD^1'
    return subprocess.check_output(['git', 'merge-base', 'HEAD', 'origin/main'], cwd=root, text=True).strip()
