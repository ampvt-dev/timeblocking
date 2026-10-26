// Reads and writes .xlsx files as the plain sheet objects used by
// src/core/grid.js.

import ExcelJS from 'exceljs';

function plain(value) {
  if (value == null) return null;
  if (value instanceof Date || typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (value.richText) return value.richText.map((r) => r.text).join('');
  if ('result' in value) return plain(value.result);
  if ('text' in value) return plain(value.text);
  return String(value);
}

export async function readXlsx(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  return wb.worksheets.map((ws) => {
    const rows = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        // Cells inside a merged range report the range's top-left value.
        const cell = ws.getCell(r, c);
        row.push(plain(cell.isMerged ? cell.master.value : cell.value));
      }
      rows.push(row);
    }
    return { name: ws.name, rows };
  });
}

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`;

export async function writeXlsx(filePath, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Timeblock';
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name);
    spec.rows.forEach((r, ri) => {
      const row = ws.addRow(r);
      if (!spec.boldFirstLine || ri === 0) return;
      // Bold the block title (first line); notes stay regular.
      row.eachCell((cell, c) => {
        if (c === 1 || typeof cell.value !== 'string' || !cell.value) return;
        const [title, ...rest] = cell.value.split('\n');
        cell.value = { richText: [{ text: title, font: { bold: true } }, ...(rest.length ? [{ text: `\n${rest.join('\n')}` }] : [])] };
      });
    });
    (spec.colWidths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    for (const [r1, c1, r2, c2] of spec.merges || []) ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1);
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        const fill = spec.fills?.[`${r - 1},${c - 1}`];
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fill) } };
        cell.alignment = { vertical: 'top', wrapText: Boolean(spec.wrap) };
        if (fill) cell.border = { top: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
      });
      if (spec.headerRow && r === 1) row.font = { bold: true };
    });
    if (spec.freeze) ws.views = [{ state: 'frozen', xSplit: spec.freeze.col, ySplit: spec.freeze.row }];
  }
  await wb.xlsx.writeFile(filePath);
}
