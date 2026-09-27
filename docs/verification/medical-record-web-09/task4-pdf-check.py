"""
MW-09 Task 4: reads the summary PDFs — Chrome's (task4-print.mjs,
chrome-*.pdf) and those saved from Safari on iOS in the Simulator
(ios-safari-*.pdf) — and says what is on each A4 page: its size, whether it
is blank, how many times the footer's disclaimer is printed on it, whether
the Cyrillic text came through as text, whether any word stands in the side
margins, how many table headings it repeats, and whether a section heading
is the last thing on it (left alone at the foot of the page). The checks
are listed as printed, one line each. Each page is saved as a PNG.

    pip install pymupdf
    python docs/verification/medical-record-web-09/task4-pdf-check.py

Prints JSON.
"""

import json
import pathlib
import re

import pymupdf

HERE = pathlib.Path(__file__).parent
MM = 72 / 25.4
SIDE = 14 * MM  # the @page side margins; Safari on iOS keeps its own, a little wider
DISCLAIMER = 'Не является ветеринарным документом'
SECTIONS = ['Важно знать', 'Прививки', 'Паразиты', 'Визиты за последний год', 'Вес', 'Последние проверки']
TABLE_HEADINGS = {'vaccinations': 'Болезнь', 'visits': 'Дата / вид'}
# Safari's own page header and footer: the page's address, the date and time, «Page N of M».
SAFARI_FRAME = re.compile(r'^(http://localhost|Page \d+ of \d+|\d\d\.\d\d\.\d{4}, \d\d:\d\d)')

report = {}
for path in sorted([*HERE.glob('chrome-*.pdf'), *HERE.glob('ios-safari-*.pdf')]):
    document = pymupdf.open(path)
    pages = []
    checks = []
    for index, page in enumerate(document):
        width, height = page.rect.width, page.rect.height
        body = page.get_text()
        lines = [line.strip() for line in body.split('\n') if line.strip()]
        words = page.get_text('words')
        # The content: neither our margin footer nor Safari's frame.
        blocks = [
            block for block in page.get_text('blocks')
            if block[4].strip()
            and not SAFARI_FRAME.match(block[4].strip())
            and not re.match(r'^Страница \d+ из \d+', block[4].strip())
            and block[3] < height - 20 * MM + 2
        ]
        content = [block for block in blocks if DISCLAIMER not in block[4]]
        last = content[-1][4].strip() if content else ''
        pages.append({
            'page': index + 1,
            'size_mm': [round(width / MM), round(height / MM)],
            'blank': sum(len(block[4].split()) for block in content) < 5,
            'disclaimers': body.count(DISCLAIMER),
            'cyrillic_chars': len(re.findall(r'[А-Яа-яЁё]', body)),
            'words_outside_side_margins': [w[4] for w in words if (w[0] < SIDE - 1 or w[2] > width - SIDE + 1) and not SAFARI_FRAME.match(w[4])],
            'table_headings': {name: lines.count(word) for name, word in TABLE_HEADINGS.items() if word in lines},
            'last_content': last[:80],
            'heading_alone_at_foot': last in SECTIONS,
        })
        if 'Последние проверки' in lines:
            start = lines.index('Последние проверки') + 1
            checks = [line for line in lines[start:] if re.match(r'^\d{1,2} [а-я]+ \d{4} ·', line)]
        page.get_pixmap(dpi=90).save(HERE / f'{path.stem}-p{index + 1}.png')
    report[path.name] = {
        'pages': document.page_count,
        'blank_pages': [p['page'] for p in pages if p['blank']],
        'disclaimers_per_page': [p['disclaimers'] for p in pages],
        'headings_alone_at_foot': [p['page'] for p in pages if p['heading_alone_at_foot']],
        'checks_as_printed': checks,
        'detail': pages,
    }

print(json.dumps(report, ensure_ascii=False, indent=2))
