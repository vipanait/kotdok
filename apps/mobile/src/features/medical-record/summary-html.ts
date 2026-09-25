import type { Dictionary } from '@/i18n'
import { LAPKA_LOGO_SVG } from '@/ui/lapka-logo'
import type { SummaryView } from './summary-view'

/** Everything the owner typed goes through here: names, diagnoses, products, notes. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function table(columns: readonly string[], rows: readonly string[][], widths: readonly string[]): string {
  const head = columns.map((column, index) => `<th style="width:${widths[index]}">${escapeHtml(column)}</th>`).join('')
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/** A line with signed points: black and white keeps every value readable (spec §7.18). */
function chart(points: SummaryView['chart']): string {
  if (points.length < 2) return ''
  const width = 480
  const height = 120
  const pad = 24
  const values = points.map((point) => point.kg)
  const min = Math.min(...values) * 0.9
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (index: number) => pad + (index * (width - pad * 2)) / (points.length - 1)
  const y = (kg: number) => height - pad - ((kg - min) / span) * (height - pad * 2)
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.kg).toFixed(1)}`).join(' ')
  const dots = points
    .map(
      (point, index) =>
        `<circle cx="${x(index).toFixed(1)}" cy="${y(point.kg).toFixed(1)}" r="3.5" fill="#fff" stroke="#000" stroke-width="1.5"/>` +
        `<text x="${x(index).toFixed(1)}" y="${(y(point.kg) - 8).toFixed(1)}" text-anchor="middle" font-size="12">${escapeHtml(point.label)}</text>`,
    )
    .join('')
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><polyline points="${line}" fill="none" stroke="#000" stroke-width="1.5"/>${dots}</svg>`
}

function heading(title: string): string {
  return `<h2>${escapeHtml(title)}</h2>`
}

function empty(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`
}

/**
 * Lays the flowing content out on A4 pages in the print web view, before the
 * PDF is made: rows never split, a table continued on the next page repeats
 * its headings, a heading is not left alone at the bottom, and every page
 * carries the footer and «Стр. N / M». Printing lays the document out again
 * at A4 in CSS pixels (96 per inch), so a page is a fixed 794 × 1122 px box,
 * measured at that width whatever the web view's own size. Static: no
 * owner's text is in here.
 * Without JavaScript the flowing layout prints as it is.
 */
const PAGINATE = `(function () {
  var flow = document.getElementById('flow');
  var pages = document.getElementById('pages');
  if (!flow || !pages) return;
  var list = [];
  var body;
  function newPage() {
    var page = document.createElement('div');
    page.className = 'page';
    body = document.createElement('div');
    body.className = 'page-body';
    page.appendChild(body);
    var foot = document.createElement('div');
    foot.className = 'page-foot';
    page.appendChild(foot);
    pages.appendChild(page);
    list.push(page);
  }
  function fits() { return body.scrollHeight <= body.clientHeight + 1; }
  function carryHeading() {
    var last = body.lastElementChild;
    if (last && last.tagName === 'H2') { body.removeChild(last); return last; }
    return null;
  }
  function place(block) {
    body.appendChild(block);
    if (fits() || body.children.length === 1) return;
    body.removeChild(block);
    var heading = carryHeading();
    newPage();
    if (heading) body.appendChild(heading);
    body.appendChild(block);
  }
  function shell(table) {
    var copy = table.cloneNode(false);
    if (table.tHead) copy.appendChild(table.tHead.cloneNode(true));
    copy.appendChild(document.createElement('tbody'));
    return copy;
  }
  function placeTable(table) {
    var rows = Array.prototype.slice.call(table.tBodies[0] ? table.tBodies[0].rows : table.rows);
    var current = shell(table);
    body.appendChild(current);
    rows.forEach(function (row) {
      var tbody = current.tBodies[0];
      tbody.appendChild(row);
      if (fits()) return;
      tbody.removeChild(row);
      var heading = null;
      if (tbody.rows.length === 0) { body.removeChild(current); heading = carryHeading(); }
      newPage();
      if (heading) body.appendChild(heading);
      current = shell(table);
      body.appendChild(current);
      current.tBodies[0].appendChild(row);
    });
  }
  newPage();
  Array.prototype.slice.call(flow.children).forEach(function (block) {
    if (block.classList.contains('flow-only')) return;
    if (block.tagName === 'TABLE') placeTable(block); else place(block);
  });
  var footer = flow.getAttribute('data-footer') || '';
  var word = flow.getAttribute('data-page') || '';
  list.forEach(function (page, index) {
    page.lastChild.textContent = footer + '  ·  ' + word + ' ' + (index + 1) + ' / ' + list.length;
  });
  flow.parentNode.removeChild(flow);
})();`

/**
 * The A4 page of the summary (spec §7.18), for expo-print. Self-contained:
 * no links, no external images or fonts — the logo is inline. Urgency and
 * overdue are words, the weight a line with signed points, so black and
 * white loses nothing. Long text wraps instead of shrinking; the pages are
 * as many as it takes.
 */
export function summaryHtml(t: Dictionary, view: SummaryView): string {
  const words = t.vetSummary
  const important = view.important
    .map((fact) => `<tr><th class="label">${escapeHtml(fact.label)}</th><td>${escapeHtml(fact.value)}</td></tr>`)
    .join('')

  const blocks = [
    `<header>${LAPKA_LOGO_SVG}<h1>${escapeHtml(view.title)}</h1></header>`,
    heading(words.pet),
    ...view.pet.lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    heading(words.important),
    `<table class="facts"><tbody>${important}</tbody></table>`,
    heading(words.vaccinations),
    table(words.vaccinationColumns, view.vaccinations, ['30%', '22%', '26%', '22%']),
    heading(words.parasites),
    table(words.parasiteColumns, view.parasites, ['30%', '22%', '26%', '22%']),
    heading(words.visits),
    view.visits.length > 0 ? table(words.visitColumns, view.visits, ['16%', '14%', '34%', '36%']) : empty(words.noVisits),
    heading(words.weight),
    ...(view.weights.length > 0 ? [chart(view.chart), table(words.weightColumns, view.weights, ['50%', '50%'])] : [empty(words.noWeights)]),
    heading(words.checks),
    view.checks.length > 0 ? table(words.checkColumns, view.checks, ['18%', '22%', '60%']) : empty(words.noChecks),
    `<p class="flow-only flow-footer">${escapeHtml(view.footer)}</p>`,
  ].filter((block) => block !== '')

  return `<!DOCTYPE html>
<html lang="${words.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(view.title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.35; color: #000; overflow-wrap: anywhere; word-break: break-word; }
  #flow { width: 794px; padding: 48px 53px; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
  header svg { width: 86px; height: auto; }
  h1 { font-size: 24px; margin: 0; }
  h2 { font-size: 17px; margin: 16px 0 6px; border-bottom: 1px solid #000; padding-bottom: 3px; break-after: avoid; }
  p { margin: 3px 0; }
  .empty { color: #444; font-style: italic; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #777; padding: 4px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #eee; font-weight: 600; }
  .facts th.label { width: 32%; background: none; }
  .chart { display: block; margin: 6px 0 8px; width: 100%; height: auto; }
  .flow-footer { margin-top: 20px; font-size: 11px; color: #333; }
  .page { position: relative; width: 794px; height: 1122px; overflow: hidden; break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .page-body { position: absolute; top: 48px; left: 53px; right: 53px; bottom: 76px; overflow: hidden; }
  .page-foot { position: absolute; left: 53px; right: 53px; bottom: 32px; font-size: 11px; color: #333; border-top: 1px solid #999; padding-top: 5px; }
</style>
</head>
<body>
<div id="flow" data-footer="${escapeHtml(view.footer)}" data-page="${escapeHtml(words.page)}">
${blocks.join('\n')}
</div>
<div id="pages"></div>
<script>${PAGINATE}</script>
</body>
</html>`
}
