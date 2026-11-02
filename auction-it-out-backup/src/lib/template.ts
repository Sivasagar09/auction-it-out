import { ROLE } from './rules';
import type { Player } from './types';

async function xlsx() {
  return import('xlsx').catch(() => { throw new Error('The spreadsheet tool could not load. Reload the page and try again.'); });
}

const HOW_TO = [
  ['How to fill in the player list'],
  [''],
  ['Required columns: Player, Role, Base price.'],
  ['Role: Batter, Bowler, All-rounder or Wicketkeeper (BAT, BOWL, AR, WK also work).'],
  ['Base price: a plain number is lakh (5 = Rs 5 L, 150 = Rs 1.5 Cr). You can also write "2 Cr" or "50 L".'],
  ['Order: the order players come up in the auction. Leave it empty to use the row order.'],
  ['Team: the player\'s country or club, shown on the player card. Optional.'],
  ['Photo: a web link to a picture. A Google Drive link works if the file is shared with "Anyone with the link". Optional.'],
  ['Any other column (Matches, Runs, Wickets, Average...) is shown on the player card as a stat. Add, rename or delete these freely.'],
  [''],
  ['Only the first sheet (Players) is read. Delete the example rows before uploading.'],
];

function widths(n: number[]) { return n.map(wch => ({ wch })); }

/** Blank template with three example rows and instructions. */
export async function downloadTemplate() {
  const X = await xlsx();
  const ws = X.utils.aoa_to_sheet([
    ['Order', 'Player', 'Role', 'Base price', 'Team', 'Photo', 'Matches', 'Runs', 'Wickets'],
    [1, 'Example Batter', 'Batter', '2 Cr', 'India', '', 120, 4200, 0],
    [2, 'Example All-rounder', 'All-rounder', '1.5 Cr', 'West Indies', '', 90, 1500, 61],
    [3, 'Example Bowler', 'Bowler', '50 L', 'India', '', 64, 210, 80],
  ]);
  ws['!cols'] = widths([7, 24, 14, 11, 14, 40, 9, 8, 9]);
  const help = X.utils.aoa_to_sheet(HOW_TO);
  help['!cols'] = widths([110]);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Players');
  X.utils.book_append_sheet(wb, help, 'How to fill');
  X.writeFile(wb, 'Auction It Out - player list template.xlsx');
}

/** The auction's current player list in the same format, ready to edit and upload again. */
export async function downloadPlayers(players: Player[], auctionName: string) {
  const X = await xlsx();
  const statLabels: string[] = [];
  players.forEach(p => (p.stats || []).forEach(s => { if (!statLabels.includes(s.label)) statLabels.push(s.label); }));
  const price = (l: number) => (l >= 100 ? `${+(l / 100).toFixed(2)} Cr` : `${l} L`);
  const rows = [
    ['Order', 'Player', 'Role', 'Base price', 'Team', 'Photo', ...statLabels],
    ...[...players].sort((x, y) => x.order_no - y.order_no).map(p => [
      p.order_no, p.name, ROLE[p.role], price(p.base_price), p.country || '', p.photo_url || '',
      ...statLabels.map(l => p.stats?.find(s => s.label === l)?.value ?? ''),
    ]),
  ];
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths([7, 24, 14, 11, 14, 40, ...statLabels.map(() => 10)]);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Players');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(HOW_TO), 'How to fill');
  const safe = auctionName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Auction';
  X.writeFile(wb, `${safe} - players.xlsx`);
}
