// Page data for Visitor Location & Escort (reference image: visitor location & escort.png).
export type EscortStatus = 'Active' | 'Awaiting Escort' | 'Completed';
export interface LeVisitor {
  id: string; name: string; company: string; host: string; type: string; purpose: string;
  zone: string; locLabel: string; escort: string; status: EscortStatus; onSite: number; // minutes on site
  permitted: string[]; site: string; ended?: boolean;
}
export interface LeAlert { id: string; alert: string; zone: string; severity: 'High' | 'Medium' | 'Low'; at: number; visitor: string; resolved?: boolean }
export interface LeMove { id: string; visitor: string; from: string; to: string; at: number; escort: string; dur: string; status: 'Completed' | 'In Progress' | 'Alert'; flagged?: boolean }
export interface LePlan { id: string; visitor: string; route: string[]; escort: string; start: number; status: 'Active' | 'Scheduled' | 'Completed' | 'Cancelled'; note?: string }

export const LE_ZONES = ['Main Entrance', 'Reception', 'Meeting Rooms', 'Visitor Lounge', 'Executive Floor', 'Restricted Zone', 'Cafeteria', 'Parking Gate', 'Plant Site – North Block'];

/** Zone geometry on the 900×280 live map (x, y, w, h) + label anchor. */
export const ZONE_GEO: Record<string, { x: number; y: number; w: number; h: number; fill: string; stroke: string; icon?: string }> = {
  'Meeting Rooms': { x: 160, y: 18, w: 220, h: 82, fill: 'var(--kb-e8e4ff)', stroke: 'var(--ka-8b80dd)', icon: 'vm-e-meeting' },
  'Executive Floor': { x: 400, y: 18, w: 230, h: 108, fill: 'var(--kb-ece8fb)', stroke: 'var(--ka-b4acec)', icon: 'vm-e-columns' },
  'Restricted Zone': { x: 650, y: 12, w: 190, h: 132, fill: 'hatch', stroke: 'var(--ka-ef4444)', icon: 'admin-lock' },
  'Visitor Lounge': { x: 100, y: 128, w: 190, h: 76, fill: 'var(--kb-e3e6fd)', stroke: 'var(--ka-9aa3ef)', icon: 'vm-e-sofa' },
  Reception: { x: 382, y: 134, w: 160, h: 70, fill: 'var(--kb-fff4e8)', stroke: 'var(--ka-fcc58f)', icon: 'user' },
  Cafeteria: { x: 586, y: 150, w: 150, h: 76, fill: 'var(--kb-fdf6ec)', stroke: 'var(--ka-f2d7b0)', icon: 'utensils' },
  'Main Entrance': { x: 70, y: 228, w: 170, h: 40, fill: 'var(--kb-f8f7ff)', stroke: 'var(--ka-cfcbe9)', icon: 'vm-e-door' },
  'Parking Gate': { x: 712, y: 232, w: 152, h: 38, fill: 'var(--kb-ffffff)', stroke: 'var(--ka-cfcbe9)', icon: 'w-car' },
};
/** Path waypoint for each zone (where routes pass / markers sit). */
export const ZONE_PT: Record<string, [number, number]> = {
  'Main Entrance': [150, 246], 'Visitor Lounge': [190, 182], Reception: [425, 182], 'Meeting Rooms': [215, 78],
  'Executive Floor': [515, 100], 'Restricted Zone': [705, 110], Cafeteria: [640, 200], 'Parking Gate': [760, 250], 'Plant Site – North Block': [860, 250],
};

export const VISITORS: LeVisitor[] = [
  { id: 'VIS-000784', name: 'Arjun Mehta', company: 'Tech Solutions', host: 'Priya Sharma', type: 'Business Visitor', purpose: 'Business Meeting', zone: 'Meeting Rooms', locLabel: 'Meeting Rooms – 3F', escort: 'Priya Sharma', status: 'Active', onSite: 102, permitted: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], site: 'Main Campus – Tower A' },
  { id: 'VIS-000783', name: 'Maria Santos', company: 'Global IT', host: 'Li Wei', type: 'Interview Candidate', purpose: 'Interview', zone: 'Visitor Lounge', locLabel: 'Visitor Lounge', escort: 'Li Wei', status: 'Active', onSite: 32, permitted: ['Main Entrance', 'Visitor Lounge', 'Meeting Rooms'], site: 'Main Campus – Tower A' },
  { id: 'VIS-000782', name: 'David Lee', company: 'ABC Contractors', host: 'Ramesh Kumar', type: 'Contractor', purpose: 'Site Visit', zone: 'Reception', locLabel: 'Reception', escort: 'Ramesh Kumar', status: 'Awaiting Escort', onSite: 14, permitted: ['Main Entrance', 'Reception'], site: 'Main Campus – Tower A' },
  { id: 'VIS-000778', name: 'Chen Wei', company: 'Facility Services', host: 'Fatima Ali', type: 'Vendor', purpose: 'Maintenance', zone: 'Plant Site – North Block', locLabel: 'Plant Site – North Block', escort: 'Fatima Ali', status: 'Active', onSite: 129, permitted: ['Main Entrance', 'Plant Site – North Block'], site: 'Plant Site – North Block' },
  { id: 'VIS-000781', name: 'Sarah Khan', company: 'Gulf Logistics', host: 'Ahmed Hassan', type: 'Delivery', purpose: 'Delivery', zone: 'Executive Floor', locLabel: 'Executive Floor', escort: '', status: 'Completed', onSite: 64, permitted: ['Main Entrance', 'Reception', 'Executive Floor'], site: 'Main Campus – Tower A' },
];

export const ALERTS: LeAlert[] = [
  { id: 'ZA-301', alert: 'Unauthorized entry attempt', zone: 'Restricted Zone', severity: 'High', at: 591, visitor: 'Unknown' },
  { id: 'ZA-300', alert: 'Escort not detected', zone: 'Executive Floor', severity: 'Medium', at: 578, visitor: 'Sarah Khan' },
  { id: 'ZA-299', alert: 'Visitor lingered beyond time limit', zone: 'Visitor Lounge', severity: 'Medium', at: 567, visitor: 'Maria Santos' },
];

export const MOVES: LeMove[] = [
  { id: 'MV-1', visitor: 'Arjun Mehta', from: 'Reception', to: 'Meeting Rooms – 3F', at: 582, escort: 'Priya Sharma', dur: '1h 42m', status: 'Completed' },
  { id: 'MV-2', visitor: 'Maria Santos', from: 'Main Entrance', to: 'Visitor Lounge', at: 572, escort: 'Li Wei', dur: '32m', status: 'In Progress' },
  { id: 'MV-3', visitor: 'David Lee', from: 'Visitor Lounge', to: 'Restricted Zone', at: 591, escort: '—', dur: '2m', status: 'Alert' },
  { id: 'MV-4', visitor: 'Sarah Khan', from: 'Reception', to: 'Executive Floor', at: 560, escort: '—', dur: '18m', status: 'Completed' },
  { id: 'MV-5', visitor: 'Arjun Mehta', from: 'Main Entrance', to: 'Reception', at: 576, escort: 'Priya Sharma', dur: '6m', status: 'Completed' },
  { id: 'MV-6', visitor: 'Chen Wei', from: 'Main Entrance', to: 'Plant Site – North Block', at: 500, escort: 'Fatima Ali', dur: '2h 09m', status: 'In Progress' },
];

const NAMES = ['Rohan Verma', 'Aisha Noor', 'Vikram Iyer', 'Neha Gupta', 'Karan Malik', 'Meera Clark', 'Omar Yusuf', 'Hana Brown', 'Rahul Nair', 'Sara Ahmed', 'Imran Kapoor', 'Emily Wong', 'Tom Patel'];
const ESC = ['Priya Sharma', 'Ahmed Hassan', 'Fatima Ali', 'Michael Chen', 'Rex Kumar', 'Ramesh Kumar'];
const ROUTES = [['Main Entrance', 'Reception', 'Meeting Rooms'], ['Main Entrance', 'Visitor Lounge'], ['Parking Gate', 'Reception', 'Executive Floor'], ['Main Entrance', 'Cafeteria'], ['Main Entrance', 'Reception', 'Visitor Lounge', 'Meeting Rooms']];
export const PLANS: LePlan[] = [
  { id: 'MP-1018', visitor: 'Arjun Mehta', route: ['Main Entrance', 'Reception', 'Meeting Rooms', 'Visitor Lounge', 'Main Entrance'], escort: 'Priya Sharma', start: 576, status: 'Active', note: 'Escort required at all times above ground floor.' },
  { id: 'MP-1017', visitor: 'Maria Santos', route: ['Main Entrance', 'Visitor Lounge', 'Meeting Rooms'], escort: 'Li Wei', start: 572, status: 'Active', note: 'Interview panel in Meeting Room 3B at 11:00 AM.' },
  { id: 'MP-1016', visitor: 'David Lee', route: ['Main Entrance', 'Reception'], escort: 'Ramesh Kumar', start: 610, status: 'Scheduled', note: 'Contractor – hold at Reception until escort arrives.' },
  { id: 'MP-1015', visitor: 'Chen Wei', route: ['Main Entrance', 'Plant Site – North Block'], escort: 'Fatima Ali', start: 495, status: 'Active' },
  ...NAMES.concat(['Grace Park']).map((visitor, i): LePlan => ({
    id: `MP-${1014 - i}`, visitor, route: ROUTES[i % ROUTES.length], escort: ESC[i % ESC.length],
    start: 480 + ((i * 37) % 300), status: i < 5 ? 'Completed' : i < 10 ? 'Scheduled' : 'Active',
  })),
];
