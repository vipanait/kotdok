"""
MW-07: reads the PDFs Chrome printed (verify.mjs) and says what is on each A4
page: its size, how much text, whether anything stands in the side margins,
whether the Cyrillic text came through as text, how many times the tables'
headings appear (a heading on every page a table continues onto), and saves
each page as a PNG for the report.

    pip install pymupdf
    python docs/verification/medical-record-web-07/pdf-check.py

Prints JSON.
"""

import json
import pathlib
import re

import pymupdf

HERE = pathlib.Path(__file__).parent
MM = 72 / 25.4
SIDE = 14 * MM  # the @page side margins of the summary
# A table's heading row, cell by cell: each is a line of its own in the PDF text.
HEADINGS = {'vaccinations': 'Болезнь', 'parasites': 'Последняя обработка', 'visits': 'Дата / вид'}

report = {}
for path in sorted(HERE.glob('*.pdf')):
    document = pymupdf.open(path)
    pages = []
    for index, page in enumerate(document):
        width, height = page.rect.width, page.rect.height
        words = page.get_text('words')
        body = page.get_text()
        lines = [line.strip() for line in body.split('\n')]
        # What is left once the page footer (and the summary's closing copy of it) is taken out.
        content = re.sub(r'Страница \d+ из \d+', '', re.sub(r'Составлено владельцем.*?документом\.', '', ' '.join(lines)))
        outside = [w[4] for w in words if w[0] < SIDE - 1 or w[2] > width - SIDE + 1]
        pages.append({
            'page': index + 1,
            'size_mm': [round(width / MM), round(height / MM)],
            'chars': len(body.strip()),
            'cyrillic_chars': len(re.findall(r'[А-Яа-яЁё]', body)),
            'words_outside_side_margins': outside,
            'footer': 'Составлено владельцем' in body and f'Страница {index + 1} из {document.page_count}' in body,
            'table_headings': {name: lines.count(word) for name, word in HEADINGS.items() if word in lines},
            'first_line': body.strip().split('\n')[2] if len(body.strip().split('\n')) > 2 else '',
            'blank': len(content.split()) < 5,
        })
        page.get_pixmap(dpi=90).save(HERE / f'{path.stem}-pdf-p{index + 1}.png')
    report[path.name] = {'pages': document.page_count, 'detail': pages}

print(json.dumps(report, ensure_ascii=False, indent=2))
