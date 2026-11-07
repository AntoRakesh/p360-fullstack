// Meal & Canteen Management — one shared dataset + root store so actions sync across pages.
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AppState } from '../../shared/app-state';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_TIMES: Record<MealType, string> = { Breakfast: '07:00 - 10:00', Lunch: '12:00 - 15:00', Dinner: '19:00 - 22:00' };
export const MEAL_EMOJI: Record<MealType, string> = { Breakfast: '🍳', Lunch: '🍛', Dinner: '🍲' };
export const SITES = ['Head Office', 'Production', 'Warehouse', 'Remote Site'];
export const PLAN_TYPES = ['Employee Plan', 'Management Plan', 'Shift Plan', 'Contractor Plan', 'Part-Time Plan', 'Guest Plan'];
export const GROUPS = ['All Employees', 'Management', 'Operations (Shift)', 'Contractors', 'Part-Time', 'Visitors'];
export const ALLERGENS = ['Gluten', 'Dairy', 'Eggs', 'Nuts', 'Peanuts', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Celery', 'Mustard'];
export const DIETS = ['Halal', 'Vegetarian', 'Vegan', 'Gluten Free'];

export interface MealPlan {
  id: string;
  name: string;
  desc: string;
  eligibility: string;
  sites: string;
  siteList: string[];
  price: number;
  status: 'Active' | 'Inactive';
  enrolled: number;
  icon: string;
  color: string;
  donut: string;
  type: string;
  from: string;
  to: string;
  /** Day masks (Mon..Sun) per meal type. */
  meals: Record<MealType, boolean[]>;
  subsidy: number;
  grades: string[];
  carryForward: boolean;
  maxPerSlot: number;
}
const w = (s: string) => [...s].map((c) => c === '1');
export const PLAN_SEED: MealPlan[] = [
  { id: 'MP-01', name: 'Standard Plan', desc: 'Breakfast + Lunch', eligibility: 'All Employees', sites: 'All Sites', siteList: [...SITES], price: 15, status: 'Active', enrolled: 1842, icon: 'm-cutlery', color: '#7c3aed', donut: '#3b82f6', type: 'Employee Plan', from: '2026-10-01', to: '2027-12-31', meals: { Breakfast: w('1111110'), Lunch: w('1111100'), Dinner: w('0000000') }, subsidy: 60, grades: ['G1–G6'], carryForward: false, maxPerSlot: 1 },
  { id: 'MP-02', name: 'Executive Plan', desc: 'Premium menu with more options', eligibility: 'Management', sites: 'Head Office', siteList: ['Head Office'], price: 25, status: 'Active', enrolled: 412, icon: 'star', color: '#3b82f6', donut: '#14b8a6', type: 'Management Plan', from: '2026-10-01', to: '2027-12-31', meals: { Breakfast: w('1111100'), Lunch: w('1111100'), Dinner: w('0000000') }, subsidy: 80, grades: ['G7–G10'], carryForward: true, maxPerSlot: 2 },
  { id: 'MP-03', name: 'Shift Worker Plan', desc: 'Shift-based meal entitlement', eligibility: 'Operations (Shift)', sites: 'All Sites', siteList: [...SITES], price: 18, status: 'Active', enrolled: 356, icon: 'users', color: '#0ea5e9', donut: '#84cc16', type: 'Shift Plan', from: '2026-09-01', to: '2027-08-31', meals: { Breakfast: w('1111111'), Lunch: w('1111111'), Dinner: w('1111111') }, subsidy: 70, grades: ['G1–G4'], carryForward: false, maxPerSlot: 1 },
  { id: 'MP-04', name: 'Contractor Plan', desc: 'Basic meals for contractors', eligibility: 'Contractors', sites: 'All Sites', siteList: [...SITES], price: 12, status: 'Active', enrolled: 184, icon: 'm-cloche', color: '#f97316', donut: '#f97316', type: 'Contractor Plan', from: '2026-07-01', to: '2027-06-30', meals: { Breakfast: w('0000000'), Lunch: w('1111110'), Dinner: w('0000000') }, subsidy: 40, grades: ['Contract'], carryForward: false, maxPerSlot: 1 },
  { id: 'MP-05', name: 'Part-Time Plan', desc: 'Selected meal credits', eligibility: 'Part-Time', sites: 'All Sites', siteList: [...SITES], price: 10, status: 'Inactive', enrolled: 36, icon: 'user', color: '#a855f7', donut: '#ef4444', type: 'Part-Time Plan', from: '2026-01-01', to: '2026-12-31', meals: { Breakfast: w('0000000'), Lunch: w('1111100'), Dinner: w('0000000') }, subsidy: 30, grades: ['PT'], carryForward: true, maxPerSlot: 1 },
  { id: 'MP-06', name: 'Guest Plan', desc: 'Visitors and Guests', eligibility: 'Visitors', sites: 'All Sites', siteList: [...SITES], price: 30, status: 'Active', enrolled: 16, icon: 'users', color: '#22c55e', donut: '#8b5cf6', type: 'Guest Plan', from: '2026-10-01', to: '2027-12-31', meals: { Breakfast: w('0000000'), Lunch: w('1111100'), Dinner: w('0000000') }, subsidy: 100, grades: ['Visitor'], carryForward: false, maxPerSlot: 1 },
];

/** Scale so the seed plans reproduce this month's AED 46,850 bill (not every enrolee eats every working day). */
export const COST_SCALE = 46850 / PLAN_SEED.filter((p) => p.status === 'Active').reduce((a, p) => a + p.price * 22 * p.enrolled, 0);

export interface Policy {
  id: string;
  icon: string;
  color: string;
  name: string;
  value: string;
  options: string[];
}
export const POLICY_SEED: Policy[] = [
  { id: 'cutoff', icon: 'clock', color: '#2563eb', name: 'Meal Booking Cut-off', value: '2 hours before meal time', options: ['1 hour before meal time', '2 hours before meal time', '4 hours before meal time', 'Previous day 18:00'] },
  { id: 'noshow', icon: 'm-xcircle', color: '#ef4444', name: 'No Show Policy', value: '2 consecutive no-shows = 1 day block', options: ['No penalty', '2 consecutive no-shows = 1 day block', '3 no-shows / month = 1 week block', 'Charge full meal cost'] },
  { id: 'carry', icon: 'refresh', color: '#22c55e', name: 'Carry Forward', value: 'Not allowed', options: ['Not allowed', 'Up to 5 meals / month', 'Unlimited within plan validity'] },
  { id: 'guest', icon: 'users', color: '#7c3aed', name: 'Guest Access', value: 'Allowed with approval', options: ['Not allowed', 'Allowed with approval', 'Allowed (host pays)'] },
  { id: 'subsidy', icon: 'm-wallet', color: '#16a34a', name: 'Subsidy Rules', value: 'As per company policy', options: ['As per company policy', 'Flat 50% for all plans', 'Grade based'] },
  { id: 'diet', icon: 'm-leaf', color: '#22c55e', name: 'Special Diet', value: 'HALAL, Vegetarian, Vegan, Gluten Free', options: ['HALAL, Vegetarian, Vegan, Gluten Free', 'HALAL, Vegetarian', 'HALAL only'] },
  { id: 'allergen', icon: 'triangle-alert', color: '#ef4444', name: 'Allergen Alerts', value: 'Enabled', options: ['Enabled', 'Disabled'] },
  { id: 'limit', icon: 'm-gauge', color: '#ef4444', name: 'Usage Limit', value: '1 meal per slot per day', options: ['1 meal per slot per day', '2 meals per slot per day', 'Plan defined'] },
];

export interface Canteen {
  id: string;
  name: string;
  site: string;
  type: 'On-site' | 'Partner';
  operator: string;
  usage: number;
  capacity: number;
  seats: number;
  counters: number;
  hours: string;
  rating: number;
  manager: string;
  status: 'Open' | 'Closed' | 'Busy';
  color: string;
  floor: string;
  wait: number;
}
export const CANTEENS: Canteen[] = [
  { id: 'CT-01', name: 'Head Office Canteen', site: 'Head Office', type: 'On-site', operator: 'In-house F&B', usage: 1248, capacity: 1950, seats: 420, counters: 8, hours: '06:30 - 22:00', rating: 4.5, manager: 'Farah Al Hashimi', status: 'Busy', color: '#7c3aed', floor: 'Ground Floor, Tower A', wait: 6 },
  { id: 'CT-02', name: 'Production Canteen', site: 'Production', type: 'On-site', operator: 'In-house F&B', usage: 892, capacity: 1940, seats: 300, counters: 6, hours: '06:00 - 23:00', rating: 4.2, manager: 'Rajesh Nair', status: 'Open', color: '#3b82f6', floor: 'Plant 1, Block C', wait: 4 },
  { id: 'CT-03', name: 'Warehouse Canteen', site: 'Warehouse', type: 'On-site', operator: 'In-house F&B', usage: 412, capacity: 1960, seats: 160, counters: 3, hours: '06:00 - 22:00', rating: 4.0, manager: 'Omar Haddad', status: 'Open', color: '#22c55e', floor: 'Warehouse 2, Mezzanine', wait: 2 },
  { id: 'CT-04', name: 'Remote Site (Partner)', site: 'Remote Site', type: 'Partner', operator: 'Gulf Catering LLC', usage: 294, capacity: 1960, seats: 120, counters: 2, hours: '05:30 - 21:00', rating: 3.9, manager: 'Sameer Khan', status: 'Open', color: '#f97316', floor: 'Camp Facility, Ruwais', wait: 3 },
];

export interface Dish {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  category: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Beverages';
  cuisine: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  allergens: string[];
  diets: string[];
  price: number;
  rating: number;
  available: boolean;
  orders: number;
}
const d = (id: number, name: string, emoji: string, category: Dish['category'], cuisine: string, kcal: number, p: number, c: number, f: number, allergens: string[], diets: string[], price: number, rating: number, orders: number, bg = '#fef3c7'): Dish => ({ id: `D${String(id).padStart(3, '0')}`, name, emoji, bg, category, cuisine, kcal, protein: p, carbs: c, fat: f, allergens, diets, price, rating, available: true, orders });
export const DISH_SEED: Dish[] = [
  d(1, 'Full English Breakfast', '🥓', 'Breakfast', 'Continental', 720, 34, 48, 42, ['Gluten', 'Eggs'], ['Halal'], 14, 4.5, 412),
  d(2, 'Masala Omelette & Paratha', '🥚', 'Breakfast', 'Indian', 540, 24, 46, 28, ['Gluten', 'Eggs', 'Dairy'], ['Halal', 'Vegetarian'], 11, 4.6, 388),
  d(3, 'Foul Medames & Bread', '🫘', 'Breakfast', 'Arabic', 460, 19, 62, 14, ['Gluten', 'Sesame'], ['Halal', 'Vegan'], 9, 4.3, 296, '#fde68a'),
  d(4, 'Pancakes with Berries', '🥞', 'Breakfast', 'Continental', 610, 12, 92, 20, ['Gluten', 'Eggs', 'Dairy'], ['Vegetarian'], 12, 4.4, 264),
  d(5, 'Greek Yoghurt Parfait', '🥣', 'Breakfast', 'Healthy', 320, 18, 40, 9, ['Dairy', 'Nuts'], ['Vegetarian', 'Gluten Free'], 10, 4.2, 198, '#e0e7ff'),
  d(6, 'Avocado Toast', '🥑', 'Breakfast', 'Healthy', 410, 11, 38, 24, ['Gluten', 'Sesame'], ['Vegan'], 13, 4.1, 176, '#dcfce7'),
  d(7, 'Chicken Biryani', '🍛', 'Lunch', 'Indian', 820, 42, 96, 26, ['Dairy'], ['Halal'], 18, 4.7, 624),
  d(8, 'Grilled Chicken & Rice', '🍗', 'Lunch', 'Arabic', 690, 48, 72, 18, [], ['Halal', 'Gluten Free'], 18, 4.5, 512),
  d(9, 'Lamb Machboos', '🍖', 'Lunch', 'Emirati', 880, 46, 90, 32, [], ['Halal', 'Gluten Free'], 22, 4.6, 344),
  d(10, 'Vegetable Stir Fry & Noodles', '🍜', 'Lunch', 'Asian', 560, 16, 84, 16, ['Gluten', 'Soy', 'Sesame'], ['Vegan', 'Halal'], 15, 4.0, 238),
  d(11, 'Grilled Salmon Bowl', '🐟', 'Lunch', 'Healthy', 610, 40, 52, 24, ['Fish', 'Soy'], ['Halal', 'Gluten Free'], 24, 4.4, 212, '#dbeafe'),
  d(12, 'Caesar Salad', '🥗', 'Lunch', 'Continental', 420, 22, 18, 28, ['Dairy', 'Eggs', 'Fish', 'Gluten'], ['Halal'], 14, 4.1, 286, '#dcfce7'),
  d(13, 'Paneer Butter Masala', '🍲', 'Lunch', 'Indian', 720, 24, 64, 40, ['Dairy', 'Nuts'], ['Vegetarian', 'Halal'], 16, 4.5, 302),
  d(14, 'Falafel Wrap', '🌯', 'Lunch', 'Arabic', 540, 18, 70, 20, ['Gluten', 'Sesame'], ['Vegan', 'Halal'], 12, 4.3, 330),
  d(15, 'Beef Lasagne', '🍝', 'Dinner', 'Italian', 780, 38, 66, 38, ['Gluten', 'Dairy', 'Eggs', 'Celery'], ['Halal'], 19, 4.2, 188),
  d(16, 'Chicken Shawarma Plate', '🥙', 'Dinner', 'Arabic', 740, 44, 68, 30, ['Gluten', 'Sesame', 'Mustard'], ['Halal'], 17, 4.6, 402),
  d(17, 'Dal Tadka & Jeera Rice', '🍚', 'Dinner', 'Indian', 590, 20, 98, 12, [], ['Vegan', 'Halal', 'Gluten Free'], 12, 4.4, 254),
  d(18, 'Prawn Curry', '🍤', 'Dinner', 'Indian', 640, 34, 60, 26, ['Shellfish', 'Dairy'], ['Halal', 'Gluten Free'], 21, 4.3, 140, '#ffedd5'),
  d(19, 'Lentil Soup', '🥣', 'Dinner', 'Arabic', 260, 14, 38, 5, ['Celery'], ['Vegan', 'Halal', 'Gluten Free'], 8, 4.2, 210, '#fde68a'),
  d(20, 'Fresh Fruit Cup', '🍉', 'Snacks', 'Healthy', 120, 2, 28, 0, [], ['Vegan', 'Halal', 'Gluten Free'], 6, 4.5, 366, '#fee2e2'),
  d(21, 'Chicken Sandwich', '🥪', 'Snacks', 'Continental', 380, 22, 36, 14, ['Gluten', 'Eggs', 'Mustard'], ['Halal'], 9, 4.0, 290),
  d(22, 'Protein Bar', '🍫', 'Snacks', 'Healthy', 210, 15, 22, 8, ['Peanuts', 'Soy', 'Dairy'], ['Vegetarian'], 7, 3.9, 154, '#ede9fe'),
  d(23, 'Karak Chai', '☕', 'Beverages', 'Emirati', 140, 4, 22, 4, ['Dairy'], ['Vegetarian', 'Halal', 'Gluten Free'], 3, 4.8, 980, '#ffedd5'),
  d(24, 'Fresh Orange Juice', '🍊', 'Beverages', 'Healthy', 110, 2, 26, 0, [], ['Vegan', 'Halal', 'Gluten Free'], 6, 4.4, 420, '#ffedd5'),
];

/** Weekly menu: [canteenId][day][meal] -> dish ids. */
export function seedMenu(): Record<string, string[][][]> {
  const by = (cat: Dish['category']) => DISH_SEED.filter((x) => x.category === cat).map((x) => x.id);
  const b = by('Breakfast');
  const l = by('Lunch');
  const dn = by('Dinner');
  const out: Record<string, string[][][]> = {};
  CANTEENS.forEach((c, ci) => {
    out[c.id] = DAYS.map((_, di) => [
      [b[(di + ci) % b.length], b[(di + ci + 2) % b.length]],
      [l[(di + ci) % l.length], l[(di + ci + 3) % l.length], l[(di + ci + 5) % l.length]],
      [dn[(di + ci) % dn.length], dn[(di + ci + 2) % dn.length]],
    ]);
  });
  return out;
}

// ---------- People ----------
const FIRST = ['Ahmed', 'Fatima', 'Rahul', 'Maria', 'Omar', 'Aisha', 'John', 'Priya', 'Khalid', 'Sara', 'Vikram', 'Layla', 'David', 'Noura', 'Arjun', 'Hessa', 'Michael', 'Mariam', 'Imran', 'Elena', 'Yousef', 'Anjali', 'Tariq', 'Grace', 'Hamad', 'Reem', 'Sanjay', 'Lina', 'Peter', 'Zainab'];
const LAST = ['Al Mansoori', 'Khan', 'Sharma', 'Santos', 'Haddad', 'Al Ali', 'Smith', 'Nair', 'Al Suwaidi', 'Ibrahim', 'Patel', 'Hassan', 'Wilson', 'Al Shamsi', 'Menon', 'Al Ketbi', 'Brown', 'Saleh', 'Qureshi', 'Popescu'];
const DEPTS = ['Finance', 'HR', 'IT', 'Operations', 'Production', 'Logistics', 'Sales', 'Security', 'Facilities', 'Procurement'];
const COLORS = ['#7c3aed', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#14b8a6', '#eab308', '#ec4899'];

export interface Diner {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  site: string;
  planId: string;
  credits: number;
  allowance: number;
  used: number;
  cash: number;
  status: 'Active' | 'Blocked' | 'Low Balance';
  diet: string;
}
const PLAN_CUM = PLAN_SEED.reduce<number[]>((a, p) => [...a, (a[a.length - 1] ?? 0) + p.enrolled], []);
/** One wallet per enrolled user (2,846), spread across plans exactly as the enrolment counts. */
export const DINER_SEED: Diner[] = Array.from({ length: PLAN_CUM[PLAN_CUM.length - 1] }, (_, n) => {
  // Interleave plans so the first pages show a realistic mix.
  const i = (n * 389) % PLAN_CUM[PLAN_CUM.length - 1];
  const planIdx = PLAN_CUM.findIndex((c) => i < c);
  const first = FIRST[(n * 7 + Math.floor(n / 30)) % FIRST.length];
  const last = LAST[(n * 3 + Math.floor(n / 20)) % LAST.length];
  const plan = PLAN_SEED[planIdx];
  const allowance = (plan.meals.Breakfast.filter(Boolean).length + plan.meals.Lunch.filter(Boolean).length + plan.meals.Dinner.filter(Boolean).length) * 4;
  const used = Math.min(allowance, Math.round(allowance * (0.08 + ((n * 37) % 30) / 100)));
  const cash = ((n * 53) % 220) + (n % 9 === 0 ? 0 : 15);
  const blocked = n % 97 === 11;
  return {
    id: `EMP-${10240 + n}`,
    name: `${first} ${last}`,
    initials: first[0] + last.replace('Al ', '')[0],
    avatar: COLORS[n % COLORS.length],
    dept: planIdx === 3 ? 'Contractor' : planIdx === 5 ? 'Visitor' : DEPTS[(n * 3) % DEPTS.length],
    site: plan.siteList[n % plan.siteList.length],
    planId: plan.id,
    credits: allowance - used,
    allowance,
    used,
    cash,
    status: blocked ? 'Blocked' : cash < 20 ? 'Low Balance' : 'Active',
    diet: ['None', 'Vegetarian', 'None', 'Gluten Free', 'None', 'Vegan', 'None', 'None', 'Nut Allergy'][n % 9],
  };
});

export interface Txn {
  id: string;
  dinerId: string;
  at: string;
  kind: 'Meal' | 'Top-up' | 'Credit' | 'Refund' | 'Penalty';
  desc: string;
  amount: number;
  canteen: string;
}

export interface Booking {
  id: string;
  dinerId: string;
  date: string;
  meal: MealType;
  dishId: string;
  canteenId: string;
  qty: number;
  status: 'Confirmed' | 'Pending' | 'Collected' | 'Cancelled' | 'No-show';
  amount: number;
  slot: string;
}
export const iso = (offset = 0) => {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
export const fmtDay = (s: string) => new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const SLOTS: Record<MealType, string[]> = { Breakfast: ['07:00', '07:30', '08:00', '08:30', '09:00'], Lunch: ['12:00', '12:30', '13:00', '13:30', '14:00'], Dinner: ['19:00', '19:30', '20:00', '20:30'] };
function seedBookings(): Booking[] {
  const out: Booking[] = [];
  for (let i = 0; i < 72; i++) {
    const diner = DINER_SEED[(i * 7) % DINER_SEED.length];
    const offset = i < 30 ? 0 : i < 52 ? 1 : i < 62 ? -1 : 2;
    const meal: MealType = i % 5 === 0 ? 'Breakfast' : i % 7 === 0 ? 'Dinner' : 'Lunch';
    const dishes = DISH_SEED.filter((x) => x.category === meal);
    const dish = dishes[i % dishes.length];
    const canteen = CANTEENS.find((c) => c.site === diner.site) ?? CANTEENS[0];
    const status: Booking['status'] = offset < 0 ? (i % 6 === 0 ? 'No-show' : 'Collected') : offset === 0 ? (i % 3 === 0 ? 'Collected' : i % 11 === 0 ? 'Cancelled' : 'Confirmed') : i % 4 === 0 ? 'Pending' : 'Confirmed';
    out.push({ id: `BK-${20410 + i}`, dinerId: diner.id, date: iso(offset), meal, dishId: dish.id, canteenId: canteen.id, qty: 1, status, amount: dish.price, slot: SLOTS[meal][i % SLOTS[meal].length] });
  }
  return out;
}
/** Deterministic recent history for any wallet (not stored). */
export function seedTxnsFor(p: Diner): Txn[] {
  const out: Txn[] = [];
  const i = +p.id.slice(4);
  {
    for (let k = 0; k < 6; k++) {
      const dish = DISH_SEED[(i + k * 5) % DISH_SEED.length];
      const top = k === 4;
      out.push({ id: `TX-${p.id}-${k}`, dinerId: p.id, at: `${iso(-k)} ${['12:42', '08:15', '13:05', '07:48', '09:10', '12:20'][k]}`, kind: top ? 'Top-up' : k === 5 && i % 4 === 0 ? 'Credit' : 'Meal', desc: top ? 'Card top-up' : k === 5 && i % 4 === 0 ? 'Monthly meal credits' : dish.name, amount: top ? 100 : k === 5 && i % 4 === 0 ? p.allowance : -dish.price, canteen: CANTEENS[i % 4].name });
    }
  }
  return out;
}

export interface Feedback {
  id: string;
  dinerId: string;
  canteenId: string;
  dishId: string;
  rating: number;
  category: 'Taste' | 'Hygiene' | 'Service' | 'Quantity' | 'Variety';
  comment: string;
  date: string;
  status: 'New' | 'Responded' | 'Escalated';
  reply?: string;
}
const COMMENTS: [number, Feedback['category'], string][] = [
  [5, 'Taste', 'Biryani was excellent today, perfectly spiced.'],
  [4, 'Service', 'Quick service even at peak lunch time.'],
  [5, 'Variety', 'Love the new healthy bowl options!'],
  [5, 'Taste', 'Good karak chai, as always.'],
  [4, 'Quantity', 'Generous portions, good value.'],
  [5, 'Service', 'Staff were very helpful with allergen info.'],
  [5, 'Taste', 'Grilled chicken was juicy and well seasoned.'],
  [4, 'Variety', 'Would like more vegan choices at dinner.'],
  [5, 'Service', 'Pre-order was ready exactly at my slot.'],
  [4, 'Taste', 'Tasty food, but a little too salty today.'],
  [1, 'Hygiene', 'Tables near counter 3 were not cleaned.'],
  [2, 'Quantity', 'Portion size was smaller than usual.'],
  [4, 'Variety', 'Menu repeats a bit often in the week.'],
  [4, 'Service', 'Long queue at breakfast but staff were fast.'],
  [5, 'Taste', 'Best dal tadka in town!'],
  [5, 'Quantity', 'Plenty of food for night shift, thanks.'],
];
function seedFeedback(): Feedback[] {
  return Array.from({ length: 36 }, (_, i) => {
    const [rating, category, comment] = COMMENTS[i % COMMENTS.length];
    return { id: `FB-${3100 + i}`, dinerId: DINER_SEED[(i * 11) % 60].id, canteenId: CANTEENS[i % 4].id, dishId: DISH_SEED[(i * 5) % DISH_SEED.length].id, rating, category, comment, date: iso(-Math.floor(i / 4)), status: rating <= 1 ? 'Escalated' : i % 3 === 0 ? 'Responded' : 'New', reply: rating > 1 && i % 3 === 0 ? 'Thanks for the feedback — shared with the kitchen team.' : undefined };
  });
}

/** Monthly cost (AED) and avg cost per meal; last 12 months ending Sep. */
export const MONTHS12 = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
export const COST12 = [44200, 45800, 41200, 46900, 45100, 48300, 47200, 52300, 47400, 45600, 51200, 46850];
export const AVG12 = [15.2, 15.4, 15.9, 15.1, 14.9, 15.6, 16.1, 15.6, 14.6, 15.1, 15.4, 16.0];
export const MEALS12 = [38900, 40100, 34800, 41200, 40300, 42600, 41800, 43900, 42100, 40600, 43200, 42500];

export const fmt = (n: number) => n.toLocaleString('en-US');
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Injectable({ providedIn: 'root' })
export class MealStore {
  private readonly app = inject(AppState);
  readonly plans = signal<MealPlan[]>(PLAN_SEED.map((p) => structuredClone(p)));
  readonly policies = signal<Policy[]>(POLICY_SEED.map((p) => ({ ...p })));
  readonly canteens = signal<Canteen[]>(CANTEENS.map((c) => ({ ...c })));
  readonly dishes = signal<Dish[]>(DISH_SEED.map((x) => ({ ...x })));
  readonly menu = signal(seedMenu());
  readonly diners = signal<Diner[]>(DINER_SEED.map((x) => ({ ...x })));
  readonly bookings = signal<Booking[]>(seedBookings());
  /** Transactions made during this session (seed history comes from seedTxnsFor). */
  readonly txns = signal<Txn[]>([]);
  readonly feedback = signal<Feedback[]>(seedFeedback());
  /** Meals served so far today (ticks up live). */
  readonly servedToday = signal(1386);

  readonly enrolled = computed(() => this.plans().reduce((a, p) => a + p.enrolled, 0));
  readonly activePlans = computed(() => this.plans().filter((p) => p.status === 'Active').length);
  readonly avgRating = computed(() => {
    const f = this.feedback();
    return f.length ? +(f.reduce((a, x) => a + x.rating, 0) / f.length).toFixed(1) : 0;
  });

  constructor() {
    effect(() => {
      const t = this.app.tick();
      untracked(() => {
        if (!t) return;
        this.servedToday.update((n) => Math.min(1932, n + 1 + (t % 3)));
        // Occupancy wobble at canteens and a confirmed booking occasionally collected.
        this.canteens.update((l) => l.map((c, i) => ({ ...c, wait: Math.max(1, c.wait + (((t + i) % 3) - 1)) })));
        if (t % 3 === 0) {
          const b = this.bookings().find((x) => x.status === 'Confirmed' && x.date === iso(0));
          if (b) this.setBooking(b.id, 'Collected');
        }
      });
    });
  }

  txnsOf(id: string) {
    const p = this.diner(id);
    return p ? [...this.txns().filter((t) => t.dinerId === id), ...seedTxnsFor(p)] : [];
  }
  /** Average diner rating for a canteen (from feedback). */
  canteenRating(id: string) {
    const l = this.feedback().filter((f) => f.canteenId === id);
    return l.length ? (l.reduce((a, f) => a + f.rating, 0) / l.length).toFixed(1) : '—';
  }
  plan(id: string) {
    return this.plans().find((p) => p.id === id);
  }
  diner(id: string) {
    return this.diners().find((p) => p.id === id);
  }
  dish(id: string) {
    return this.dishes().find((x) => x.id === id);
  }
  canteen(id: string) {
    return this.canteens().find((x) => x.id === id);
  }

  savePlan(p: MealPlan) {
    const exists = this.plans().some((x) => x.id === p.id);
    if (exists) this.plans.update((l) => l.map((x) => (x.id === p.id ? structuredClone(p) : x)));
    else this.plans.update((l) => [...l, structuredClone(p)]);
  }
  patchPlan(id: string, ch: Partial<MealPlan>) {
    this.plans.update((l) => l.map((x) => (x.id === id ? { ...x, ...ch } : x)));
  }
  deletePlan(id: string) {
    this.plans.update((l) => l.filter((x) => x.id !== id));
  }
  nextPlanId() {
    return `MP-${String(Math.max(...this.plans().map((p) => +p.id.slice(3)), 0) + 1).padStart(2, '0')}`;
  }
  setPolicy(id: string, value: string) {
    this.policies.update((l) => l.map((p) => (p.id === id ? { ...p, value } : p)));
  }

  saveDish(x: Dish) {
    if (this.dishes().some((y) => y.id === x.id)) this.dishes.update((l) => l.map((y) => (y.id === x.id ? { ...x } : y)));
    else this.dishes.update((l) => [{ ...x }, ...l]);
  }
  setMenu(canteenId: string, day: number, meal: number, ids: string[]) {
    this.menu.update((m) => {
      const copy = structuredClone(m);
      copy[canteenId][day][meal] = ids;
      return copy;
    });
  }

  addBooking(b: Omit<Booking, 'id'>) {
    const id = `BK-${20410 + this.bookings().length + Math.floor(Math.random() * 90) + 100}`;
    this.bookings.update((l) => [{ ...b, id }, ...l]);
    const dish = this.dish(b.dishId)!;
    this.charge(b.dinerId, 'Meal', `Pre-order · ${dish.name}`, -b.amount * b.qty, this.canteen(b.canteenId)!.name);
    return id;
  }
  setBooking(id: string, status: Booking['status']) {
    const b = this.bookings().find((x) => x.id === id);
    if (!b || b.status === status) return;
    this.bookings.update((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    if (status === 'Cancelled') this.charge(b.dinerId, 'Refund', `Booking ${id} cancelled`, b.amount * b.qty, this.canteen(b.canteenId)!.name);
    if (status === 'Collected' && b.date === iso(0)) this.canteens.update((l) => l.map((c) => (c.id === b.canteenId ? { ...c, usage: c.usage + 1 } : c)));
  }
  charge(dinerId: string, kind: Txn['kind'], desc: string, amount: number, canteen = '—') {
    const now = new Date();
    this.txns.update((l) => [{ id: `TX-${Date.now()}-${Math.random()}`, dinerId, at: `${iso(0)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, kind, desc, amount, canteen }, ...l]);
    this.diners.update((l) =>
      l.map((p) => {
        if (p.id !== dinerId) return p;
        const cash = +(p.cash + amount).toFixed(2);
        return { ...p, cash, status: p.status === 'Blocked' ? 'Blocked' : cash < 20 ? 'Low Balance' : 'Active' };
      }),
    );
  }
  credit(ids: string[], meals: number) {
    this.diners.update((l) => l.map((p) => (ids.includes(p.id) ? { ...p, credits: p.credits + meals, allowance: p.allowance + meals } : p)));
    ids.forEach((id) => this.txns.update((l) => [{ id: `TX-${Date.now()}-${id}`, dinerId: id, at: `${iso(0)} 10:00`, kind: 'Credit', desc: `${meals} bonus meal credits`, amount: meals, canteen: '—' }, ...l]));
  }
  setDinerStatus(id: string, status: Diner['status']) {
    this.diners.update((l) => l.map((p) => (p.id === id ? { ...p, status } : p)));
  }
  respond(id: string, reply: string, status: Feedback['status'] = 'Responded') {
    this.feedback.update((l) => l.map((f) => (f.id === id ? { ...f, reply, status } : f)));
  }
  addFeedback(f: Omit<Feedback, 'id'>) {
    this.feedback.update((l) => [{ ...f, id: `FB-${3200 + l.length}` }, ...l]);
  }
}
