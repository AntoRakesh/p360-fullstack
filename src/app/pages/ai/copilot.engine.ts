// Hard-coded "LLM": matches the question against keyword intents and returns canned, data-driven answers.
import {
  Answer, ASSET_UTIL, ATTENDANCE, attendanceAnswer, certAnswer, CONTRACTOR_TREND, DEPTS, EMPLOYEES, empByName, EXPIRING, fmtN, HEADCOUNT_TREND,
  INCIDENTS, LOCATIONS, MONTHS, ON_SITE_NOW, OVERTIME_TREND, pct, ROOMS, SPACE_UTIL, TOTAL_EMPLOYEES, TOTAL_OVERTIME, WEEKS, ABSENTEEISM, AiStore,
} from './ai.data';

export const SUGGESTIONS = [
  ["Show today's attendance summary", 'Who is in the office right now?', 'Generate a safety incident report', 'Find available meeting rooms', 'Show asset utilization by site'],
  ['Which department has the highest overtime?', 'Who is at risk of leaving?', 'List employees with expiring certifications', 'Show absenteeism trend', 'How many contractors this month?'],
  ['Show late arrivals in Sales', 'Any anomalies today?', 'Find Ahmed Hassan', 'What should I act on today?', 'Headcount by department'],
];

interface Intent {
  re: RegExp;
  run: (q: string, s: AiStore) => Answer;
}

const INTENTS: Intent[] = [
  { re: /create (a )?task|assign/, run: (q, s) => { s.addTask(q); return { blocks: [{ t: 'text', text: `Done. I created a task: "${q}". It has been assigned to you with a due date of Friday and is now visible in Tasks & Workforce Operations.` }], actions: [{ label: 'Open Tasks', kind: 'nav', arg: '/tasks-workforce-operations/task-assignment-scheduling' }] }; } },
  { re: /set (an )?alert|notify me|monitor/, run: (q, s) => { s.alerts.update((l) => [...l, { id: s.id(), rule: q, when: 'Active · just now' }]); return { blocks: [{ t: 'text', text: `Alert rule created. I'll notify you in the app and by email when this condition is met:\n"${q}".` }, { t: 'list', items: s.alerts().map((a) => `${a.rule} — ${a.when}`) }] }; } },
  { re: /\b(hi|hello|hey|good (morning|afternoon|evening))\b/, run: () => ({ blocks: [{ t: 'text', text: 'Hello Rex! I can answer questions about attendance, people, safety, spaces and assets across all sites. Try one of these:' }], suggestions: SUGGESTIONS[0].slice(0, 3) }) },
  { re: /\b(thank|thanks|great|perfect|awesome)\b/, run: () => ({ blocks: [{ t: 'text', text: "You're welcome! Anything else you'd like to look at?" }], suggestions: ['What should I act on today?', 'Any anomalies today?'] }) },
  { re: /\b(help|what can you do|capabilit)/, run: helpAnswer },
  { re: /certif|licen[cs]e|expir/, run: () => certAnswer() },
  { re: /meeting room|available room|book.*room|free room|rooms?\b/, run: roomsAnswer },
  { re: /asset|equipment|utili[sz]ation by site/, run: assetAnswer },
  { re: /safety|incident|near.?miss|hazard/, run: safetyAnswer },
  { re: /in the office|right now|on.?site|by location|where (is|are) (everyone|people)|occupancy|who is in/, run: whoInAnswer },
  { re: /overtime|extra hours/, run: overtimeAnswer },
  { re: /risk of leaving|attrition|turnover|resign|flight risk|retention/, run: attritionAnswer },
  { re: /late|tard/, run: lateAnswer },
  { re: /absent|absenteeism|sick|no.?show/, run: absenteeismAnswer },
  { re: /anomal|unusual|odd|suspicious|alert/, run: anomalyAnswer },
  { re: /contractor|vendor/, run: contractorAnswer },
  { re: /headcount|how many (employees|people|staff)|workforce size|by department/, run: headcountAnswer },
  { re: /act on|recommend|suggest|what should|priorit|todo|to-do/, run: recAnswer },
  { re: /canteen|lunch|meal/, run: canteenAnswer },
  { re: /leave|vacation|holiday/, run: leaveAnswer },
  { re: /summari[sz]e|overview|insights?\b|brief me/, run: summaryAnswer },
  { re: /attendance|present|summary|who came/, run: (q) => (/head office|department|dept/.test(q) ? attendanceAnswer() : companyAttendance()) },
];

export function respond(raw: string, s: AiStore): Answer {
  const q = raw.toLowerCase().trim();
  const trend = trendAnswer(q);
  if (trend) return trend;
  const emp = empByName(q + ' ');
  if (emp && /find|who is|show|profile|where|about|lookup|look up/.test(q)) return personAnswer(emp.name);
  for (const it of INTENTS) if (it.re.test(q)) return it.run(q, s);
  if (emp) return personAnswer(emp.name);
  return {
    blocks: [
      { t: 'text', text: `I couldn't find an exact match for "${raw.trim()}" in People360 data yet. I can help with attendance, overtime, certifications, safety incidents, spaces, assets, anomalies and workforce risk. Here are a few things you can ask:` },
    ],
    suggestions: [SUGGESTIONS[0][0], SUGGESTIONS[1][0], SUGGESTIONS[1][1], SUGGESTIONS[2][1]],
  };
}

function summaryAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: 'Here is your workforce briefing:' },
      { t: 'kpis', items: [{ label: 'Headcount', value: fmtN(TOTAL_EMPLOYEES), color: '#7c3aed' }, { label: 'Attendance', value: pct(ATTENDANCE.present, TOTAL_EMPLOYEES) + '%', color: '#22c55e' }, { label: 'Overtime (h)', value: fmtN(TOTAL_OVERTIME), color: '#f97316' }, { label: 'High risk', value: '23', color: '#ef4444' }] },
      { t: 'list', items: ['Overtime is 31% above baseline in Operations — consider a 4th night crew.', 'Sales absenteeism is 5% higher than last week; late arrivals doubled.', `${EXPIRING.length} certifications expire within 30 days (3 gate site access).`, 'Contractor headcount grew 12% this month to 349.'] },
    ],
    actions: [{ label: 'Workforce Insights', kind: 'nav', arg: '/ai-people-intelligence/workforce-insights' }, { label: 'Recommendations', kind: 'nav', arg: '/ai-people-intelligence/recommendation-engine' }],
  };
}
function helpAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: 'I am your People360 assistant. I work on live data from every module and can:' },
      { t: 'list', items: ['Answer questions in plain language (attendance, overtime, headcount, safety…)', 'Generate reports with charts and tables you can export', 'Find people, rooms and assets across all sites', 'Take action: create tasks, send reminders, book rooms', 'Set alerts that monitor conditions for you'] },
    ],
    suggestions: SUGGESTIONS[1].slice(0, 3),
  };
}
function companyAttendance(): Answer {
  const a = ATTENDANCE;
  return {
    blocks: [
      { t: 'text', text: `Across all sites this week, ${fmtN(a.present)} of ${fmtN(TOTAL_EMPLOYEES)} employees were present on time (${pct(a.present, TOTAL_EMPLOYEES)}%). ${a.late} arrived late, ${a.absent} were absent and ${a.leave} were on leave.` },
      { t: 'donut', center: 'Total Employees', segs: [{ label: 'Present', value: a.present, color: '#22c55e' }, { label: 'Late', value: a.late, color: '#f59e0b' }, { label: 'Absent', value: a.absent, color: '#ef4444' }, { label: 'On Leave', value: a.leave, color: '#64748b' }] },
      { t: 'text', text: 'Lowest attendance: Sales (81.6%) and HR (76.2%, 5 people on planned leave).' },
    ],
    actions: [{ label: 'By Department', kind: 'prompt', arg: "Show today's attendance summary by department at Head Office" }, { label: 'Open Live Monitor', kind: 'nav', arg: '/time-attendance/live-attendance-monitor' }],
  };
}
function whoInAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: `${fmtN(ON_SITE_NOW)} people are checked in right now. Head Office has the most (428), followed by the Warehouse (312). 248 are working remotely.` },
      { t: 'bars', max: 450, rows: LOCATIONS.map((l) => ({ label: l.name, value: l.count, display: `${l.count} · ${Math.round((l.count / TOTAL_EMPLOYEES) * 100)}%`, color: l.color })) },
    ],
    actions: [{ label: 'Open Live Map', kind: 'nav', arg: '/real-time-location' }, { label: 'Export List', kind: 'csv', arg: 'location' }],
  };
}
function roomsAnswer(): Answer {
  const free = ROOMS.filter((r) => r.av);
  return {
    blocks: [
      { t: 'text', text: `${free.length} meeting rooms are free right now at Head Office. Peak usage today is ${SPACE_UTIL.meetingPeak}%, so I'd book soon.` },
      { t: 'table', cols: ['Room', 'Floor', 'Seats', 'Free', 'Equipment'], rows: ROOMS.map((r) => [r.name, r.floor, r.cap, { text: r.free, cls: r.av ? 'pill green' : 'pill amber' }, r.gear]) },
    ],
    actions: [{ label: 'Book Orion (8)', kind: 'book', arg: 'Orion', primary: true }, { label: 'Book Nova (4)', kind: 'book', arg: 'Nova' }, { label: 'Room Booking', kind: 'nav', arg: '/workplace-facility-services/meeting-room-booking' }],
  };
}
function assetAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: 'Asset utilization by site this week. The Warehouse is highest at 84%; Site B is lowest at 58% with 420 assets — a good candidate for redistribution.' },
      { t: 'column', labels: ASSET_UTIL.map((a) => a.site), series: [{ name: 'Utilization %', color: '#7c3aed', values: ASSET_UTIL.map((a) => a.util) }] },
      { t: 'table', cols: ['Site', 'Assets', 'Utilization'], rows: ASSET_UTIL.map((a) => [a.site, fmtN(a.assets), { text: a.util + '%', cls: 'pill ' + (a.util >= 75 ? 'green' : a.util >= 62 ? 'amber' : 'red') }]) },
    ],
    actions: [{ label: 'Export CSV', kind: 'csv', arg: 'assets' }, { label: 'Space Utilization', kind: 'nav', arg: '/workplace-facility-services/space-utilization' }],
  };
}
function safetyAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: 'Safety incident report — today. 2 near-miss incidents were reported at the Warehouse and 1 observation at Site A. No injuries. Near-miss rate is 2x the weekly baseline, both involving forklift movement during shift change.' },
      { t: 'kpis', items: [{ label: 'Near misses', value: '2', color: '#f59e0b' }, { label: 'Observations', value: '1', color: '#3b82f6' }, { label: 'Injuries', value: '0', color: '#22c55e' }, { label: 'Days since LTI', value: '146', color: '#7c3aed' }] },
      { t: 'table', cols: ['ID', 'Type', 'Location', 'Description', 'Time'], rows: INCIDENTS.map((i) => [i.id, { text: i.type, cls: 'pill ' + (i.sev === 'Medium' ? 'amber' : 'green') }, i.where, i.what, i.time]) },
      { t: 'text', text: 'Recommendation: add a spotter rule for reversing forklifts in Aisle 7 between 13:45 and 14:15.' },
    ],
    actions: [{ label: 'Export Report', kind: 'csv', arg: 'safety', primary: true }, { label: 'Create Task', kind: 'task', arg: 'Enforce forklift spotter rule in Aisle 7 at shift change' }, { label: 'Incident Mgmt', kind: 'nav', arg: '/safety-wellbeing/incident-management' }],
  };
}
function overtimeAnswer(): Answer {
  const top = [...DEPTS].sort((a, b) => b.overtime - a.overtime).slice(0, 6);
  const emps = [...EMPLOYEES].sort((a, b) => b.overtime - a.overtime).slice(0, 5);
  return {
    blocks: [
      { t: 'text', text: `Overtime this week totals ${fmtN(TOTAL_OVERTIME)} hours (+8% vs last week). Operations has the highest overtime at 2,140 h — 31% above its 8-week baseline.` },
      { t: 'bars', max: 2200, rows: top.map((d, i) => ({ label: d.name, value: d.overtime, display: fmtN(d.overtime) + ' h', color: i ? '#a78bfa' : '#7c3aed' })) },
      { t: 'table', cols: ['Employee', 'Department', 'Overtime (h)'], rows: emps.map((e) => [{ text: e.name, av: e.initials, color: e.avatar }, e.dept, { text: String(e.overtime), cls: e.overtime > 14 ? 'pill red' : 'pill amber' }]) },
    ],
    actions: [{ label: 'View Recommendation', kind: 'nav', arg: '/ai-people-intelligence/recommendation-engine?id=RC-05' }, { label: 'Overtime Trend', kind: 'prompt', arg: 'Show overtime trend for the last 12 weeks' }],
  };
}
function attritionAnswer(): Answer {
  const risky = EMPLOYEES.filter((e) => e.risk >= 60).sort((a, b) => b.risk - a.risk);
  return {
    blocks: [
      { t: 'text', text: `The attrition model flags 23 employees with risk above 60%. The top drivers are sustained overtime, frequent late arrivals and low engagement. Here are the highest-risk employees I can see:` },
      { t: 'table', limit: 6, cols: ['Employee', 'Department', 'Risk', 'Main drivers'], rows: risky.map((e) => [{ text: e.name, av: e.initials, color: e.avatar }, e.dept, { text: e.risk + '%', cls: 'pill ' + (e.risk >= 75 ? 'red' : 'amber') }, e.drivers]) },
    ],
    actions: [{ label: `View All (${risky.length})`, kind: 'expand' }, { label: 'Open Predictions', kind: 'nav', arg: '/ai-people-intelligence/predictive-analytics' }, { label: 'Schedule 1:1s', kind: 'task', arg: 'Retention 1:1s for high-risk employees' }],
  };
}
function lateAnswer(q: string): Answer {
  const dept = DEPTS.find((d) => q.includes(d.name.toLowerCase()));
  const list = EMPLOYEES.filter((e) => (dept ? e.dept === dept.name : true)).sort((a, b) => b.late - a.late).slice(0, 6);
  return {
    blocks: [
      { t: 'text', text: dept ? `${dept.name} has ${dept.late} late arrivals today (${pct(dept.late, dept.headcount)}% of ${dept.headcount}). These employees were late most often this month:` : `${ATTENDANCE.late} employees arrived late today (${pct(ATTENDANCE.late, TOTAL_EMPLOYEES)}%). Operations (28) and Logistics (18) have the most. Repeat late arrivals this month:` },
      { t: 'table', cols: ['Employee', 'Department', 'Site', 'Late (month)'], rows: list.map((e) => [{ text: e.name, av: e.initials, color: e.avatar }, e.dept, e.site, { text: String(e.late), cls: e.late >= 5 ? 'pill red' : 'pill amber' }]) },
    ],
    actions: [{ label: 'Export CSV', kind: 'csv', arg: 'late' }, { label: 'Review Policy', kind: 'nav', arg: '/time-attendance/attendance-policies' }],
  };
}
function absenteeismAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: 'Absenteeism has risen for 3 weeks and is now 4.8% (8-week average 4.0%). Sales is 5% higher than last week, driven by Monday/Friday unplanned absences.' },
      { t: 'line', labels: WEEKS, suffix: '%', series: [{ name: 'Absenteeism %', color: '#ef4444', values: ABSENTEEISM, area: true }] },
    ],
    actions: [{ label: 'Open Anomaly', kind: 'nav', arg: '/ai-people-intelligence/anomaly-detection?id=AN-305' }, { label: 'Set Alert > 5%', kind: 'alert', arg: 'Absenteeism above 5% for any department' }],
  };
}
function anomalyAnswer(_q: string, s: AiStore): Answer {
  const open = s.anomalies().filter((a) => a.status === 'Open');
  return {
    blocks: [
      { t: 'text', text: `I detected ${open.length} open anomalies. ${open.filter((a) => a.severity === 'High').length} are high severity and need attention first:` },
      { t: 'table', cols: ['Anomaly', 'Site', 'Severity', 'When'], rows: open.slice(0, 6).map((a) => [a.title, a.site, { text: a.severity, cls: 'pill ' + (a.severity === 'High' ? 'red' : a.severity === 'Medium' ? 'amber' : a.severity === 'Info' ? 'blue' : 'green') }, a.ago]) },
    ],
    actions: [{ label: 'Open Anomaly Detection', kind: 'nav', arg: '/ai-people-intelligence/anomaly-detection', primary: true }],
  };
}
function contractorAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: `Contractor headcount increased by 12% this month to ${CONTRACTOR_TREND.at(-1)} (from ${CONTRACTOR_TREND.at(-2)}), mainly new Warehouse logistics crews for the Q4 peak.` },
      { t: 'line', labels: MONTHS, series: [{ name: 'Contractors', color: '#ef4444', values: CONTRACTOR_TREND, area: true }] },
    ],
    actions: [{ label: 'Contractor Workforce', kind: 'nav', arg: '/contractor-vendor' }],
  };
}
function headcountAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: `Total headcount is ${fmtN(TOTAL_EMPLOYEES)} employees (+${HEADCOUNT_TREND.at(-1)! - HEADCOUNT_TREND[0]} in 12 months). Breakdown by department:` },
      { t: 'bars', max: 400, rows: DEPTS.map((d) => ({ label: d.name, value: d.headcount, display: String(d.headcount) })) },
    ],
    actions: [{ label: 'Headcount Trend', kind: 'prompt', arg: 'Show headcount trend by month' }, { label: 'Workforce Insights', kind: 'nav', arg: '/ai-people-intelligence/workforce-insights' }],
  };
}
function recAnswer(_q: string, s: AiStore): Answer {
  const open = s.recs().filter((r) => r.status === 'Open').slice(0, 4);
  return {
    blocks: [
      { t: 'text', text: 'Based on today’s data, these are the highest-impact actions for you:' },
      { t: 'list', items: open.map((r) => `${r.title} — ${r.impact} impact, ${r.confidence}% confidence`) },
    ],
    actions: [{ label: 'Open Recommendations', kind: 'nav', arg: '/ai-people-intelligence/recommendation-engine', primary: true }],
  };
}
function canteenAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: 'Canteen peak usage is between 12:00 and 1:00 PM, reaching 96% of seats (22% above usual). Average queue time is 11 minutes. Staggering lunch in three waves would reduce it to about 4 minutes.' },
      { t: 'column', labels: ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00'], series: [{ name: 'Occupancy %', color: '#0891b2', values: [34, 58, 92, 96, 74, 40, 18] }] },
    ],
    actions: [{ label: 'Apply Staggered Slots', kind: 'nav', arg: '/ai-people-intelligence/recommendation-engine?id=RC-06' }],
  };
}
function leaveAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: `${ATTENDANCE.leave} employees are on leave today. HR has the most (5), all planned annual leave. Next week 64 leave days are approved, peaking on Thursday.` },
      { t: 'donut', center: 'On Leave', segs: DEPTS.filter((d) => d.leave >= 2).map((d, i) => ({ label: d.name, value: d.leave, color: ['#7c3aed', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#0891b2', '#db2777'][i % 7] })) },
    ],
    actions: [{ label: 'Leave Calendar', kind: 'nav', arg: '/leave-absence' }],
  };
}
function personAnswer(name: string): Answer {
  const e = EMPLOYEES.find((x) => x.name === name)!;
  return {
    blocks: [{ t: 'text', text: `Here's what I found for ${e.name}:` }, { t: 'person', emp: e }],
    actions: [{ label: 'Open Profile', kind: 'nav', arg: '/people-identity/people-directory-unified-profiles' }, { label: 'Locate on Map', kind: 'nav', arg: '/real-time-location' }],
  };
}

/** Extra canned answers reachable through "prompt" actions. */
export function trendAnswer(q: string): Answer | null {
  if (/overtime trend/.test(q)) return { blocks: [{ t: 'text', text: 'Overtime hours over the last 12 weeks. The trend is +30% since W31, accelerating in the last 3 weeks.' }, { t: 'line', labels: WEEKS, series: [{ name: 'Overtime (h)', color: '#7c3aed', values: OVERTIME_TREND, area: true }] }] };
  if (/headcount trend/.test(q)) return { blocks: [{ t: 'text', text: 'Headcount grew steadily from 1,176 to 1,248 over 12 months (+6.1%).' }, { t: 'line', labels: MONTHS, series: [{ name: 'Employees', color: '#7c3aed', values: HEADCOUNT_TREND, area: true }, { name: 'Contractors', color: '#ef4444', values: CONTRACTOR_TREND }] }] };
  return null;
}
export const EXPIRING_LIST = EXPIRING;
