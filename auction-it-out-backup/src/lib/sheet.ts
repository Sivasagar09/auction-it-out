import type { Role, Stat } from './types';

export interface SheetPlayer { order: number; name: string; role: Role; base: number; country: string; photo: string; stats: Stat[] }

export const TEMPLATE_CSV =
  'Order,Player,Role,Base price,Country,Photo,Matches,Runs,Wickets\n' +
  '1,Arjun Rathore,Batter,2 Cr,India,https://example.com/arjun.jpg,48,1650,0\n' +
  '2,Liam Carver,All-rounder,2 Cr,England,,52,980,41\n' +
  '3,Kabir Menon,Bowler,150,India,,39,120,57\n';

function normRole(v: unknown): Role | null {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (/^(wk|wicketkeeper|keeper)/.test(s)) return 'WK';
  if (/^(ar|allrounder|allround)/.test(s)) return 'AR';
  if (/^(bowl|bowler)/.test(s)) return 'BOWL';
  if (/^(bat|batter|batsman|batting)/.test(s)) return 'BAT';
  return null;
}

/** "2 Cr" -> 200, "50 L" -> 50, 75 -> 75 (plain numbers are lakh). */
function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const s = String(v ?? '').toLowerCase().replace(/[₹,\s]/g, '');
  const num = parseFloat(s.replace(/^rs\.?/, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  return /cr/.test(s) ? Math.round(num * 100) : Math.round(num);
}

/** Accepts a normal image link; turns a Google Drive share link into one that shows the picture. */
export function photoUrl(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  const drive = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w600`;
  return s;
}

function statValue(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(2));
  return String(v).trim();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

async function readRows(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return text.split(/\r?\n/).filter(l => l.trim()).map(splitCsvLine);
  }
  // Loaded only when someone uploads a sheet, so the rest of the app stays small.
  const XLSX = await import('xlsx').catch(() => {
    throw new Error('The spreadsheet reader could not load. Reload the page and try again.');
  });
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
}

export async function parseSheet(file: File): Promise<{ players: SheetPlayer[]; errors: string[]; warnings: string[]; statLabels: string[] }> {
  const rows = await readRows(file);
  if (!rows.length) return { players: [], errors: ['The file is empty.'], warnings: [], statLabels: [] };
  const labels = rows[0].map(h => String(h ?? '').trim());
  const head = labels.map(h => h.toLowerCase().replace(/[^a-z#]/g, ''));
  const col = (test: (h: string) => boolean) => head.findIndex(test);
  const iOrder = col(h => /^(order|auctionorder|lot|lotno|sno|slno|no|seq|sequence|#)$/.test(h));
  const iName = col(h => /^(player|playername|name)$/.test(h));
  const iRole = col(h => /^(role|type|skill|category|specialism)$/.test(h));
  const iBase = col(h => h.startsWith('base') || h === 'price');
  const iCountry = col(h => /^(country|origin|nationality|team)$/.test(h));
  const iPhoto = col(h => /^(photo|photourl|image|imageurl|picture|pic|photolink|imagelink)$/.test(h));
  const missing = [iName < 0 && 'Player', iRole < 0 && 'Role', iBase < 0 && 'Base price'].filter(Boolean);
  if (missing.length) return { players: [], errors: [`The first row must have column names. Missing: ${missing.join(', ')}.`], warnings: [], statLabels: [] };

  // Every other named column is shown as a stat, in sheet order.
  const known = new Set([iOrder, iName, iRole, iBase, iCountry, iPhoto]);
  const statCols = labels.map((l, i) => ({ l, i })).filter(c => c.l && !known.has(c.i));

  const players: SheetPlayer[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = String(r[iName] ?? '').trim();
    if (!name) { if (r.some(c => String(c ?? '').trim())) errors.push(`Row ${line}: player name is missing`); return; }
    const role = normRole(r[iRole]);
    if (!role) { errors.push(`Row ${line} (${name}): role "${r[iRole] ?? ''}" not recognised`); return; }
    const base = parseMoney(r[iBase]);
    if (!base) { errors.push(`Row ${line} (${name}): base price "${r[iBase] ?? ''}" is not a number`); return; }
    const ord = iOrder >= 0 ? parseFloat(String(r[iOrder])) : NaN;
    const rawPhoto = iPhoto >= 0 ? String(r[iPhoto] ?? '').trim() : '';
    const photo = photoUrl(rawPhoto);
    if (rawPhoto && !photo) warnings.push(`Row ${line} (${name}): photo "${rawPhoto.slice(0, 40)}" is not a web link, so no picture will show`);
    players.push({
      order: Number.isFinite(ord) ? ord : players.length + 1,
      name, role, base,
      country: iCountry >= 0 ? String(r[iCountry] ?? '').trim() : '',
      photo,
      stats: statCols.map(c => ({ label: c.l, value: statValue(r[c.i]) })).filter(s => s.value !== ''),
    });
  });
  players.sort((a, b) => a.order - b.order);
  return { players, errors, warnings, statLabels: statCols.map(c => c.l) };
}
