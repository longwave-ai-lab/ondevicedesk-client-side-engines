/**
 * Bank Statement Table Reconstruction Worker
 * Performs spatial column reconstruction from PDF text spans into structured financial records,
 * with CSV and Excel table exports.
 */
import { extractTextSpansFromPdf, type TextSpanBox } from './pdf-redact.worker.js';

export interface BankTransaction {
  date: string;
  description: string;
  inflow: number | null;
  outflow: number | null;
  amount: number;
  balance: number | null;
  rawText?: string;
}

export interface BankStatementSummary {
  title: string;
  transactions: BankTransaction[];
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  openingBalance: number | null;
  closingBalance: number | null;
}

/**
 * Standard Date Patterns commonly found in financial statements:
 * - ISO: 2026-10-01
 * - US/EU: 10/01/2026, 01/10/2026, 10-01-2026
 * - Textual: Oct 01 2026, 01 Oct 2026, October 1, 2026
 */
const DATE_START_REGEX = /^(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:,?\s*\d{2,4})?|\d{1,2}\s+[A-Za-z]{3,9}(?:,?\s*\d{2,4})?)\b/;

/**
 * Parses numeric monetary values from text, handling symbols (+, -, $, EUR), commas, and parenthesized negatives.
 */
export function parseMonetaryAmount(text: string): number | null {
  const clean = text.trim();
  if (!clean || clean === '-' || clean === 'N/A') return null;

  // Handle parenthesized negatives: (150.00) -> -150.00
  const parenMatch = clean.match(/^\(?\s*[-+$€£¥]?\s*([\d,]+\.?\d*)\s*\)?$/);
  const isParenNegative = clean.startsWith('(') && clean.endsWith(')');
  const isMinusNegative = clean.includes('-');

  const numPart = clean.replace(/[^0-9.-]/g, '');
  if (!numPart) return null;

  let val = parseFloat(numPart);
  if (isNaN(val)) return null;

  if (isParenNegative || (isMinusNegative && val > 0)) {
    val = -Math.abs(val);
  }
  return Number(val.toFixed(2));
}

/**
 * Reconstructs bank transactions from single-line text statements.
 */
export function parseStatementLine(line: string): BankTransaction | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const dateMatch = trimmed.match(DATE_START_REGEX);
  if (!dateMatch) return null;

  const dateStr = dateMatch[1];
  const remainder = trimmed.slice(dateMatch[0].length).trim();

  // Find all currency/number tokens at the end of remainder
  // e.g. "Payroll Direct Deposit         +5,000.00      12,450.00"
  const tokens = remainder.split(/\s{2,}|\t/);
  if (tokens.length >= 2) {
    const desc = tokens[0].trim();
    const numTokens = tokens.slice(1).map((t) => parseMonetaryAmount(t)).filter((n): n is number => n !== null);

    if (numTokens.length >= 1) {
      let inflow: number | null = null;
      let outflow: number | null = null;
      let amount = 0;
      let balance: number | null = null;

      if (numTokens.length === 1) {
        amount = numTokens[0];
        if (amount >= 0) inflow = amount;
        else outflow = Math.abs(amount);
      } else if (numTokens.length === 2) {
        amount = numTokens[0];
        balance = numTokens[1];
        if (amount >= 0) inflow = amount;
        else outflow = Math.abs(amount);
      } else if (numTokens.length >= 3) {
        // e.g. Inflow, Outflow, Balance
        const first = numTokens[0];
        const second = numTokens[1];
        balance = numTokens[2];
        if (first > 0 && second === 0) {
          inflow = first;
          amount = first;
        } else if (second > 0) {
          outflow = second;
          amount = -second;
        } else {
          amount = first;
          if (amount >= 0) inflow = amount;
          else outflow = Math.abs(amount);
        }
      }

      return {
        date: dateStr,
        description: desc,
        inflow,
        outflow,
        amount,
        balance,
        rawText: trimmed,
      };
    }
  }

  // Fallback: match via regex for Description + Amount + Balance
  const fallbackMatch = remainder.match(/^(.*?)\s+([+-]?\$?[\d,]+\.\d{2})\s+(\$?[\d,]+\.\d{2})$/);
  if (fallbackMatch) {
    const desc = fallbackMatch[1].trim();
    const amt = parseMonetaryAmount(fallbackMatch[2]) || 0;
    const bal = parseMonetaryAmount(fallbackMatch[3]);

    return {
      date: dateStr,
      description: desc,
      inflow: amt >= 0 ? amt : null,
      outflow: amt < 0 ? Math.abs(amt) : null,
      amount: amt,
      balance: bal,
      rawText: trimmed,
    };
  }

  return null;
}

/**
 * Spatial column reconstruction algorithm.
 * Groups PDF text spans into tabular rows by baseline Y, sorts columns horizontally by X,
 * and extracts Date, Description, Inflow, Outflow, Balance columns.
 */
export function reconstructTransactionsFromSpans(spans: TextSpanBox[]): BankTransaction[] {
  if (spans.length === 0) return [];

  // 1. Group spans into rows by Y coordinate tolerance (<= 3pt)
  const sorted = [...spans].sort((a, b) => (Math.abs(a.y - b.y) <= 3.0 ? a.x - b.x : b.y - a.y));
  const rows: TextSpanBox[][] = [];

  for (const sp of sorted) {
    if (!sp.str || !sp.str.trim()) continue;
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].y - sp.y) <= 3.0) {
      lastRow.push(sp);
    } else {
      rows.push([sp]);
    }
  }

  const transactions: BankTransaction[] = [];

  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);

    // Concatenate row spans into a composite line with gap detection
    let compositeLine = '';
    for (let i = 0; i < row.length; i++) {
      const sp = row[i];
      if (i > 0) {
        const prev = row[i - 1];
        const gap = sp.x - (prev.x + prev.width);
        if (gap > 10) {
          compositeLine += '    '; // column separator
        } else if (gap > 2) {
          compositeLine += ' ';
        }
      }
      compositeLine += sp.str;
    }

    const tx = parseStatementLine(compositeLine);
    if (tx) {
      transactions.push(tx);
    }
  }

  return transactions;
}

/**
 * Extracts and reconstructs bank transactions directly from raw PDF bytes.
 */
export async function extractBankStatementFromPdf(
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<BankStatementSummary> {
  const pageResults = await extractTextSpansFromPdf(pdfBytes);
  const allSpans: TextSpanBox[] = [];

  let title = 'Bank Account Statement';
  for (const p of pageResults) {
    for (const sp of p.spans) {
      allSpans.push(sp);
      if (/STATEMENT|ACCOUNT|BANK/i.test(sp.str) && !DATE_START_REGEX.test(sp.str)) {
        title = sp.str.trim();
      }
    }
  }

  const transactions = reconstructTransactionsFromSpans(allSpans);

  let totalInflow = 0;
  let totalOutflow = 0;
  for (const tx of transactions) {
    if (tx.inflow) totalInflow += tx.inflow;
    if (tx.outflow) totalOutflow += tx.outflow;
  }

  const netChange = Number((totalInflow - totalOutflow).toFixed(2));
  const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : null;
  const openingBalance =
    transactions.length > 0 && transactions[0].balance !== null
      ? Number((transactions[0].balance - transactions[0].amount).toFixed(2))
      : null;

  return {
    title,
    transactions,
    totalInflow: Number(totalInflow.toFixed(2)),
    totalOutflow: Number(totalOutflow.toFixed(2)),
    netChange,
    openingBalance,
    closingBalance,
  };
}

/**
 * Formats a single CSV field, escaping quotes if commas or quotes are present.
 */
function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Exports reconstructed transactions to clean RFC 4180 CSV table.
 */
export function exportTransactionsToCsv(transactions: BankTransaction[]): string {
  const headers = ['Date', 'Description', 'Inflow', 'Outflow', 'Amount', 'Balance'];
  const lines: string[] = [headers.join(',')];

  for (const tx of transactions) {
    const row = [
      escapeCsvCell(tx.date),
      escapeCsvCell(tx.description),
      escapeCsvCell(tx.inflow !== null ? tx.inflow.toFixed(2) : ''),
      escapeCsvCell(tx.outflow !== null ? tx.outflow.toFixed(2) : ''),
      escapeCsvCell(tx.amount.toFixed(2)),
      escapeCsvCell(tx.balance !== null ? tx.balance.toFixed(2) : ''),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Exports transactions to standard Microsoft Excel XML Spreadsheet format (SpreadsheetML 2003).
 */
export function exportTransactionsToExcelXml(
  transactions: BankTransaction[],
  sheetName = 'Bank Statement'
): string {
  const rowsXml: string[] = [];

  // Header row
  rowsXml.push(`
    <Row ss:StyleID="HeaderStyle">
      <Cell><Data ss:Type="String">Date</Data></Cell>
      <Cell><Data ss:Type="String">Description</Data></Cell>
      <Cell><Data ss:Type="String">Inflow</Data></Cell>
      <Cell><Data ss:Type="String">Outflow</Data></Cell>
      <Cell><Data ss:Type="String">Amount</Data></Cell>
      <Cell><Data ss:Type="String">Balance</Data></Cell>
    </Row>`);

  for (const tx of transactions) {
    rowsXml.push(`
    <Row>
      <Cell><Data ss:Type="String">${escapeXml(tx.date)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(tx.description)}</Data></Cell>
      <Cell>${tx.inflow !== null ? `<Data ss:Type="Number">${tx.inflow}</Data>` : ''}</Cell>
      <Cell>${tx.outflow !== null ? `<Data ss:Type="Number">${tx.outflow}</Data>` : ''}</Cell>
      <Cell><Data ss:Type="Number">${tx.amount}</Data></Cell>
      <Cell>${tx.balance !== null ? `<Data ss:Type="Number">${tx.balance}</Data>` : ''}</Cell>
    </Row>`);
  }

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
      <Borders/>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="HeaderStyle">
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#12141C" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(sheetName)}">
    <Table>
      <Column ss:Width="90"/>
      <Column ss:Width="240"/>
      <Column ss:Width="90"/>
      <Column ss:Width="90"/>
      <Column ss:Width="90"/>
      <Column ss:Width="90"/>
      ${rowsXml.join('')}
    </Table>
  </Worksheet>
</Workbook>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', async (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'parseStatement') {
        const { pdfBytes } = data;
        const result = await extractBankStatementFromPdf(pdfBytes);
        (self as any).postMessage({ id, result });
      } else if (action === 'exportCsv') {
        const { transactions } = data;
        const result = exportTransactionsToCsv(transactions);
        (self as any).postMessage({ id, result });
      } else if (action === 'exportExcel') {
        const { transactions, sheetName } = data;
        const result = exportTransactionsToExcelXml(transactions, sheetName);
        (self as any).postMessage({ id, result });
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}
