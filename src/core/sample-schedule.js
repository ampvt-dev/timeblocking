// Sample week (Hunter, Converge Signs). Used on first launch and as an
// example for anyone building their own.

import { normalizeSchedule } from './schedule.js';

const b = (start, end, title, notes, category, extra = {}) => ({ start, end, title, notes, category, ...extra });

const lunch = () => b('12:00', '13:00', 'Lunch / One-on-Ones', 'Upon request', 'buffer');
const closeOut = () => b('16:30', '17:30', 'Close out', 'Office hours for returning field staff, as needed', 'buffer');
const estimating = (start, end, notes = 'Heads-down: quotes and bids') => b(start, end, 'Estimating', notes, 'estimating');

export function sampleSchedule() {
  return normalizeSchedule({
    name: 'Hunter — Weekly Schedule',
    subtitle: 'Mornings: coordination · Afternoons: estimating · Wednesday: field · Friday after noon: open',
    categories: [
      { id: 'coord', name: 'Coordination / PM', color: '#dbe6f4', alerts: 'full' },
      { id: 'sales', name: 'Sales', color: '#fde6cc', alerts: 'full' },
      { id: 'estimating', name: 'Estimating (heads-down)', color: '#f2b774', alerts: 'full', focusNote: "Slack or text first unless it's urgent." },
      { id: 'field', name: 'Field', color: '#a9dccf', alerts: 'full' },
      { id: 'people', name: 'People', color: '#e5dcf2', alerts: 'full' },
      { id: 'buffer', name: 'Buffer / close out', color: '#efefeb', alerts: 'full' },
      { id: 'open', name: 'Open time', color: '#ffffff', alerts: 'full' },
    ],
    days: {
      mon: [
        b('07:30', '08:00', 'Canvases + inbox', '', 'coord'),
        b('08:00', '09:00', 'Rep / PM meeting', 'Rep To-Dos, ready for folders', 'coord'),
        b('09:00', '10:30', 'Arsalan sync', 'Week plan, crew, subs, 811', 'coord'),
        b('10:30', '12:00', 'Sales follow-ups', 'Pipeline vs. goal', 'sales'),
        lunch(),
        estimating('13:00', '15:30'),
        b('15:30', '16:30', 'Buffer', 'Escalations, shopVox notes', 'buffer'),
        closeOut(),
      ],
      tue: [
        b('07:30', '09:00', 'Inbox + Forecast prep', 'SO Tetris, Installer Forecast grid', 'coord'),
        b('09:00', '10:30', 'Forecast meeting', 'Grid build with Arsalan, Alex and Evan', 'coord'),
        b('10:30', '12:00', 'Sales follow-ups', 'Client calls, quotes out', 'sales'),
        lunch(),
        b('13:00', '14:00', 'Assets to folders', 'Tag AA', 'coord'),
        estimating('14:00', '15:30'),
        b('15:30', '16:30', 'Buffer', 'Job assets due tonight', 'buffer'),
        closeOut(),
      ],
      wed: [
        b('07:30', '08:00', 'Inbox', '', 'coord'),
        b('08:00', '08:30', 'Arsalan sync', '', 'coord'),
        b('08:30', '14:30', 'Field day',
          'Site surveys\nSite visits and loose ends\nClient meetings\nLunch on the road\nAB jobs land this morning: review them Thursday',
          'field'),
        b('14:30', '16:30', 'Write-ups', 'Survey write-ups, quote follow-ups', 'sales'),
        closeOut(),
      ],
      thu: [
        b('07:30', '08:00', 'Inbox', '', 'coord'),
        b('08:00', '09:00', 'Review AB jobs', 'Approve, move to AC by end of day', 'coord'),
        b('09:00', '09:30', 'Alex sync', '', 'coord'),
        b('09:30', '12:00', 'Sales calls', 'Client calls and site meetings', 'sales'),
        lunch(),
        estimating('13:00', '15:30'),
        b('15:30', '16:30', 'Office Hours', '', 'people'),
        closeOut(),
      ],
      fri: [
        b('07:30', '08:00', 'Inbox + Friday check', '', 'coord'),
        b('08:00', '09:00', 'Next week', 'Confirm unconfirmed jobs', 'coord'),
        b('09:00', '09:30', 'Arsalan handoff', '', 'coord'),
        estimating('09:30', '11:00', 'Get proposals out before the weekend'),
        b('11:00', '11:30', 'Evan check-in', '', 'people'),
        b('11:30', '12:00', 'Weekly close', '', 'buffer'),
        b('12:00', '17:00', 'Open time', 'Ideation / AI development\nFlexible availability', 'open'),
      ],
    },
  });
}
