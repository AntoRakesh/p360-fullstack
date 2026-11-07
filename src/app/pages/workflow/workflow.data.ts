// Workflow & Automation: one hard-coded dataset + a root store shared by every workflow page.
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { avatarColor, initials, NAMES, rng } from '../dashboards/demo-data';

/* ======================= Designer graph ======================= */
export type NodeType = 'start' | 'end' | 'form' | 'approval' | 'condition' | 'parallel' | 'delay' | 'notification' | 'update' | 'task' | 'integration';
export type Side = 'l' | 'r' | 't' | 'b';

export interface StepCfg {
  description: string;
  assignee: string;
  approverType: string;
  allowDelegation: boolean;
  dueIn: number;
  dueUnit: 'Hours' | 'Days';
  escalation: boolean;
  escalateTo: string;
  conditions: string;
  channels: string[];
  reminders: boolean;
  connector: string;
  mode: 'Any one approver' | 'All approvers' | 'Majority';
  onTimeout: 'Escalate' | 'Auto-approve' | 'Auto-reject';
  retries: number;
}
export interface WfNode {
  id: string;
  type: NodeType;
  /** Label drawn on the canvas. */
  title: string;
  sub: string;
  /** Name used in the steps table / instance timeline. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  cfg: StepCfg;
}
export interface WfEdge {
  id: string;
  from: string;
  to: string;
  fp: Side;
  tp: Side;
  label?: string;
  red?: boolean;
  /** Offset of the start point along the source side. */
  fo?: number;
  lx?: number;
  ly?: number;
}

export interface NodeMeta {
  label: string;
  icon: string;
  color: string;
  typeLabel: string;
  group: 'Basic Elements' | 'Actions';
}
export const NODE_META: Record<NodeType, NodeMeta> = {
  start: { label: 'Start', icon: 'workflow-play', color: '#22c55e', typeLabel: 'Start', group: 'Basic Elements' },
  end: { label: 'End', icon: 'workflow-stop', color: '#ef4444', typeLabel: 'End', group: 'Basic Elements' },
  approval: { label: 'Task / Approval', icon: 'user', color: '#3b82f6', typeLabel: 'Approval', group: 'Basic Elements' },
  condition: { label: 'Condition', icon: 'workflow-diamond', color: '#f59e0b', typeLabel: 'Condition', group: 'Basic Elements' },
  parallel: { label: 'Parallel Branch', icon: 'workflow-fork', color: '#a855f7', typeLabel: 'Parallel', group: 'Basic Elements' },
  delay: { label: 'Delay / Wait', icon: 'clock', color: '#475569', typeLabel: 'Delay', group: 'Basic Elements' },
  notification: { label: 'Notification', icon: 'workflow-mail', color: '#ef4444', typeLabel: 'Action', group: 'Actions' },
  update: { label: 'Update Record', icon: 'workflow-db', color: '#7c3aed', typeLabel: 'Action', group: 'Actions' },
  task: { label: 'Create Task', icon: 'workflow-check-square', color: '#10b981', typeLabel: 'Task', group: 'Actions' },
  integration: { label: 'Integration', icon: 'workflow-link', color: '#7c3aed', typeLabel: 'Integration', group: 'Actions' },
  form: { label: 'Form', icon: 'workflow-form', color: '#8b5cf6', typeLabel: 'Form', group: 'Actions' },
};
export const PALETTE: NodeType[] = ['start', 'end', 'approval', 'condition', 'parallel', 'delay', 'notification', 'update', 'task', 'integration'];
export const STEP_KIND: Record<NodeType, string> = {
  start: 'Start Event', end: 'End Event', form: 'Form Task', approval: 'Approval Task', condition: 'Decision', parallel: 'Parallel Gateway',
  delay: 'Timer', notification: 'Notification', update: 'Record Update', task: 'Human Task', integration: 'Integration Call',
};
export const APPROVER_TYPES = ['Direct Manager', 'HR Department', 'Department Head', 'Specific User', 'Role', 'Requester', 'System'];
export const CONNECTOR_NAMES = ['SAP SuccessFactors', 'Microsoft 365 Calendar', 'Microsoft Teams', 'ServiceNow', 'ADP Payroll', 'Active Directory', 'Webhook'];

export function defaultCfg(type: NodeType, p: Partial<StepCfg> = {}): StepCfg {
  const human = type === 'approval' || type === 'task' || type === 'form';
  return {
    description: '',
    assignee: type === 'approval' ? 'Direct Manager' : type === 'form' ? 'Requester' : type === 'start' || type === 'end' || type === 'condition' ? '-' : 'System',
    approverType: type === 'approval' ? 'Direct Manager' : human ? 'Requester' : 'System',
    allowDelegation: type === 'approval',
    dueIn: type === 'approval' ? 2 : type === 'delay' ? 24 : 1,
    dueUnit: type === 'delay' ? 'Hours' : 'Days',
    escalation: type === 'approval',
    escalateTo: 'Department Head',
    conditions: '-',
    channels: type === 'notification' ? ['Email', 'Push'] : ['Email'],
    reminders: human,
    connector: type === 'integration' ? 'Microsoft 365 Calendar' : '',
    mode: 'Any one approver',
    onTimeout: 'Escalate',
    retries: type === 'integration' ? 3 : 0,
    ...p,
  };
}

const SIZE: Record<NodeType, [number, number]> = {
  start: [44, 44], end: [44, 44], condition: [64, 64], form: [158, 46], approval: [132, 46], parallel: [150, 46], delay: [140, 46],
  notification: [176, 46], update: [160, 46], task: [150, 46], integration: [160, 46],
};
export function makeNode(id: string, type: NodeType, title: string, sub: string, x: number, y: number, extra: Partial<WfNode> = {}, cfg: Partial<StepCfg> = {}): WfNode {
  const [w, h] = SIZE[type];
  return { id, type, title, sub, name: title, x, y, w, h, color: NODE_META[type].color, cfg: defaultCfg(type, cfg), ...extra };
}

/** The graph from the reference image (canvas units). */
function leaveGraph(): { nodes: WfNode[]; edges: WfEdge[] } {
  const nodes: WfNode[] = [
    makeNode('n1', 'start', 'Start', 'Leave Request Submitted', 41, 53, {}, { description: 'Triggered when an employee submits a leave request in ESS or mobile.' }),
    makeNode('n2', 'form', 'Employee Submission', 'Fill Leave Request Form', 138, 53, {}, { description: 'Employee fills leave type, dates, reason and optional attachment.' }),
    makeNode('n3', 'condition', 'Leave Type?', 'Annual / Sick / Other', 328, 46, { name: 'Leave Type Check' }, { conditions: 'Annual / Sick / Other', assignee: 'Leave Type', description: 'Route by leave type: Annual and Sick go to the manager, everything else to HR first.' }),
    makeNode('n4', 'approval', 'Manager Approval', 'Direct Manager', 474, 54, { w: 136 }, { description: 'Manager to review and approve the leave request.' }),
    makeNode('n6', 'approval', 'HR Approval', 'HR Department', 298, 169, { w: 125 }, { assignee: 'HR Department', approverType: 'HR Department', conditions: 'If Other / After Manager', description: 'HR validates special leave types (maternity, unpaid, study).' }),
    makeNode('n7', 'update', 'Update Records', 'Update Leave Balance', 800, 130, {}, { description: 'Deduct approved days from the leave balance and block the roster.' }),
    makeNode('n8', 'notification', 'Send Notification', 'Notify Employee & Manager', 800, 206, { w: 176, color: '#22c55e' }, { description: 'Email + push confirmation and calendar invite to employee and manager.' }),
    makeNode('n11', 'end', 'End', 'Request Completed', 853, 284),
    makeNode('n5', 'condition', 'Approved?', 'Yes / No', 641, 46, { name: 'Approval Decision' }, { conditions: 'Yes / No', assignee: '-', description: 'Branch on the manager decision.' }),
    makeNode('n9', 'approval', 'HR Approval', 'HR Department', 800, 55, { w: 145, name: 'HR Approval (Final)' }, { assignee: 'HR Department', approverType: 'HR Department', conditions: 'If Approved', description: 'Final HR check of balance and policy compliance.' }),
    makeNode('n10', 'notification', 'Send Rejection Notification', 'Notify Employee', 430, 259, { w: 198 }, { assignee: 'System', conditions: 'If Rejected', description: 'Inform the employee of rejection with the approver comment.' }),
  ];
  const edges: WfEdge[] = [
    { id: 'e1', from: 'n1', to: 'n2', fp: 'r', tp: 'l' },
    { id: 'e2', from: 'n2', to: 'n3', fp: 'r', tp: 'l' },
    { id: 'e3', from: 'n3', to: 'n4', fp: 'r', tp: 'l', label: 'Annual / Sick', lx: 434, ly: 62 },
    { id: 'e4', from: 'n3', to: 'n6', fp: 'b', tp: 't', label: 'Other', lx: 384, ly: 140 },
    { id: 'e5', from: 'n6', to: 'n4', fp: 'r', tp: 'b' },
    { id: 'e6', from: 'n4', to: 'n5', fp: 'r', tp: 'l' },
    { id: 'e7', from: 'n5', to: 'n9', fp: 'r', tp: 'l', label: 'Yes', lx: 752, ly: 66 },
    { id: 'e8', from: 'n5', to: 'n10', fp: 'b', tp: 'r', label: 'No', red: true, lx: 692, ly: 172 },
    { id: 'e13', from: 'n10', to: 'n11', fp: 'r', tp: 'l', fo: 20 },
    { id: 'e9', from: 'n10', to: 'n6', fp: 'l', tp: 'b' },
    { id: 'e10', from: 'n9', to: 'n7', fp: 'b', tp: 't' },
    { id: 'e11', from: 'n7', to: 'n8', fp: 'b', tp: 't' },
    { id: 'e12', from: 'n8', to: 'n11', fp: 'b', tp: 't' },
  ];
  return { nodes, edges };
}

/** Generates a tidy left-to-right / snake layout from a list of steps. */
export function linearGraph(steps: [NodeType, string, string][]): { nodes: WfNode[]; edges: WfEdge[] } {
  const all: [NodeType, string, string][] = [['start', 'Start', 'Request Submitted'], ...steps, ['end', 'End', 'Completed']];
  const perRow = 5;
  const nodes: WfNode[] = [];
  const edges: WfEdge[] = [];
  all.forEach(([t, title, sub], i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const c = row % 2 ? perRow - 1 - col : col;
    const [w, h] = SIZE[t];
    const cx = 60 + c * 195;
    const cy = 60 + row * 120;
    nodes.push(makeNode(`n${i + 1}`, t, title, sub, Math.round(cx - w / 2 + (t === 'start' || t === 'end' || t === 'condition' ? 0 : 50)), cy - h / 2));
  });
  for (let i = 0; i < nodes.length - 1; i++) {
    const r1 = Math.floor(i / perRow), r2 = Math.floor((i + 1) / perRow);
    const cond = nodes[i].type === 'condition';
    edges.push({ id: `e${i + 1}`, from: nodes[i].id, to: nodes[i + 1].id, fp: r1 !== r2 ? 'b' : r1 % 2 ? 'l' : 'r', tp: r1 !== r2 ? 't' : r1 % 2 ? 'r' : 'l', label: cond ? 'Yes' : undefined });
  }
  const conds = nodes.filter((n) => n.type === 'condition');
  if (conds.length) {
    const end = nodes[nodes.length - 1];
    const lastRow = Math.floor((nodes.length - 1) / perRow);
    const rej = makeNode('nr', 'notification', 'Send Rejection', 'Notify Requester', 300, 60 + (lastRow + 1) * 120 - 23, { name: 'Send Rejection Notification' }, { conditions: 'If Rejected' });
    nodes.push(rej);
    conds.forEach((c, k) => edges.push({ id: `er${k}`, from: c.id, to: 'nr', fp: 'b', tp: 't', label: 'No', red: true }));
    edges.push({ id: 'ere', from: 'nr', to: end.id, fp: 'r', tp: end.y > rej.y ? 't' : 'b' });
  }
  return { nodes, edges };
}

/* ======================= Workflow definitions ======================= */
export type WfStatus = 'Draft' | 'Active' | 'Inactive' | 'Archived';
export interface Workflow {
  id: string;
  name: string;
  description: string;
  module: string;
  category: string;
  status: WfStatus;
  version: string;
  validFrom: string;
  validTo: string;
  audit: boolean;
  manualTrigger: boolean;
  portal: boolean;
  owner: string;
  updated: string;
  trigger: string;
  slaHours: number;
  priority: 'High' | 'Medium' | 'Low';
  icon: string;
  color: string;
  nodes: WfNode[];
  edges: WfEdge[];
}

export const MODULES = ['Leave & Absence Management', 'Time & Attendance', 'People & Identity Management', 'Contractor & Vendor Workforce', 'Training, Skills & Compliance', 'Shift & Workforce Scheduling', 'Employee Self-Service (ESS)', 'Visitor Management', 'Physical Access Control', 'Workplace & Facility Services', 'Emergency & Mustering'];
export const CATEGORIES = ['Leave Request', 'Approval', 'Onboarding', 'Offboarding', 'Finance', 'Access', 'Scheduling', 'Compliance', 'Facility', 'Incident'];

type Seed = [string, string, string, string, WfStatus, string, string, string, string, [NodeType, string, string][]];
const DEF_SEEDS: Seed[] = [
  ['Contract Extension', 'Contractor & Vendor Workforce', 'Approval', 'Extend a contractor engagement with procurement, manager and HR approval.', 'Active', 'v2.1', 'Grace Park', 'briefcase', '#0d9488',
    [['form', 'Extension Request', 'Requester Form'], ['approval', 'Manager Approval', 'Direct Manager'], ['condition', 'Budget OK?', 'Cost Center'], ['approval', 'HR Approval', 'HR Department'], ['integration', 'Update SAP', 'SAP SuccessFactors'], ['notification', 'Notify Vendor', 'Email Vendor']]],
  ['Training Request', 'Training, Skills & Compliance', 'Approval', 'Request external training or certification with budget check.', 'Active', 'v1.4', 'Meera Iyer', 'graduation-cap', '#ca8a04',
    [['form', 'Training Request', 'Course & Cost'], ['approval', 'Manager Approval', 'Direct Manager'], ['condition', 'Cost > 2,000?', 'Budget Rule'], ['approval', 'L&D Approval', 'L&D Team'], ['task', 'Book Course', 'L&D Coordinator'], ['notification', 'Send Confirmation', 'Notify Employee']]],
  ['Employee Onboarding', 'People & Identity Management', 'Onboarding', 'Pre-boarding to day-one checklist across HR, IT, facilities and security.', 'Active', 'v3.0', 'Hannah Lee', 'user-plus', '#2563eb',
    [['form', 'New Hire Details', 'HR Form'], ['parallel', 'Parallel Setup', 'IT · Facilities · Security'], ['task', 'Create Accounts', 'IT Service Desk'], ['task', 'Issue Badge', 'Security'], ['task', 'Assign Desk', 'Facilities'], ['approval', 'HR Sign-off', 'HR Department'], ['notification', 'Welcome Email', 'Notify New Hire']]],
  ['Employee Offboarding', 'People & Identity Management', 'Offboarding', 'Exit clearance: asset return, access revocation and final settlement.', 'Active', 'v2.2', 'Hannah Lee', 'user', '#475569',
    [['form', 'Resignation', 'Employee Form'], ['approval', 'Manager Approval', 'Direct Manager'], ['task', 'Asset Return', 'IT & Facilities'], ['integration', 'Revoke Access', 'Active Directory'], ['update', 'Final Settlement', 'Payroll'], ['notification', 'Exit Confirmation', 'Notify Employee']]],
  ['Overtime Approval', 'Time & Attendance', 'Approval', 'Pre-approve or regularise overtime hours before payroll cut-off.', 'Active', 'v1.6', 'Vikram Rao', 'clock', '#ea580c',
    [['form', 'Overtime Claim', 'Hours & Reason'], ['condition', 'Hours > 4?', 'Policy Rule'], ['approval', 'Manager Approval', 'Direct Manager'], ['update', 'Update Timesheet', 'T&A Records'], ['integration', 'Push to Payroll', 'ADP Payroll']]],
  ['Shift Swap Request', 'Shift & Workforce Scheduling', 'Scheduling', 'Peer-to-peer shift swap with supervisor approval and rest-rule check.', 'Active', 'v1.2', 'Tom Baker', 'refresh', '#7c3aed',
    [['form', 'Swap Request', 'Requester'], ['approval', 'Peer Acceptance', 'Swap Partner'], ['condition', 'Rest Rule OK?', '11h Rest'], ['approval', 'Supervisor Approval', 'Shift Supervisor'], ['update', 'Update Roster', 'Scheduling'], ['notification', 'Notify Both', 'Push + Email']]],
  ['Expense Claim', 'Employee Self-Service (ESS)', 'Finance', 'Submit receipts, manager approval, finance audit and reimbursement.', 'Active', 'v2.0', 'Fatima Ali', 'file-text', '#16a34a',
    [['form', 'Expense Claim', 'Receipts'], ['approval', 'Manager Approval', 'Direct Manager'], ['condition', 'Amount > 5,000?', 'Finance Rule'], ['approval', 'Finance Audit', 'Finance Team'], ['integration', 'Reimburse', 'ADP Payroll'], ['notification', 'Notify Employee', 'Email']]],
  ['Visitor Pre-Approval', 'Visitor Management', 'Access', 'Host invites a visitor; security screens and issues a QR pass.', 'Active', 'v1.3', 'Omar Khalid', 'users', '#db2777',
    [['form', 'Visitor Invite', 'Host Form'], ['condition', 'Watchlist Clear?', 'Security Screening'], ['approval', 'Security Approval', 'Security Desk'], ['integration', 'Issue QR Pass', 'Access Control'], ['notification', 'Send Invite', 'Email + SMS']]],
  ['Access Request (Restricted Area)', 'Physical Access Control', 'Access', 'Time-bound access to server rooms, labs and restricted zones.', 'Active', 'v1.1', 'Ali Hassan', 'key-round', '#dc2626',
    [['form', 'Access Request', 'Zone & Period'], ['approval', 'Manager Approval', 'Direct Manager'], ['approval', 'Zone Owner Approval', 'Zone Owner'], ['integration', 'Grant Access', 'Access Control'], ['delay', 'Wait Until Expiry', 'Access Period'], ['integration', 'Revoke Access', 'Access Control']]],
  ['Attendance Regularization', 'Time & Attendance', 'Approval', 'Correct missed punches with manager approval.', 'Active', 'v1.0', 'Vikram Rao', 'calendar-days', '#0284c7',
    [['form', 'Regularization Form', 'Missed Punch'], ['approval', 'Manager Approval', 'Direct Manager'], ['update', 'Update Attendance', 'T&A Records'], ['notification', 'Notify Employee', 'Push']]],
  ['Asset Request', 'Workplace & Facility Services', 'Facility', 'Request laptops, monitors and furniture from facilities.', 'Inactive', 'v1.0', 'Kenji Sato', 'box', '#64748b',
    [['form', 'Asset Request', 'Catalog Item'], ['approval', 'Manager Approval', 'Direct Manager'], ['task', 'Fulfil Request', 'Facilities'], ['notification', 'Notify Employee', 'Email']]],
  ['Incident Escalation', 'Emergency & Mustering', 'Incident', 'Escalate safety incidents to HSE, management and authorities.', 'Active', 'v1.5', 'Aisha Bello', 'triangle-alert', '#ef4444',
    [['form', 'Incident Report', 'Reporter'], ['condition', 'Severity High?', 'Severity'], ['notification', 'Alert HSE', 'SMS + Push'], ['task', 'Investigate', 'HSE Officer'], ['approval', 'Close-out Approval', 'HSE Manager']]],
  ['Document Verification', 'People & Identity Management', 'Compliance', 'Verify identity and right-to-work documents.', 'Draft', 'v0.3', 'Hannah Lee', 'file-check', '#8b5cf6',
    [['form', 'Upload Documents', 'Employee'], ['integration', 'OCR & Validate', 'ID Verification API'], ['approval', 'HR Review', 'HR Department'], ['update', 'Update Profile', 'People Records']]],
  ['Remote Work Request', 'Employee Self-Service (ESS)', 'Approval', 'Ad-hoc and recurring work-from-home requests.', 'Archived', 'v1.0', 'Sara Khan', 'home', '#94a3b8',
    [['form', 'WFH Request', 'Dates'], ['approval', 'Manager Approval', 'Direct Manager'], ['notification', 'Notify Team', 'Teams']]],
];

const LEAVE_DEF = (): Workflow => ({
  id: 'WFD-001', name: 'Leave Request Approval Workflow', description: 'Employee leave request with manager and HR approval, notification and calendar update.',
  module: 'Leave & Absence Management', category: 'Leave Request', status: 'Draft', version: 'v1.0', validFrom: '2026-10-01', validTo: '2028-03-31',
  audit: true, manualTrigger: false, portal: true, owner: 'Rex Kumar', updated: '14 Oct 2026, 10:12 AM', trigger: 'Leave request submitted', slaHours: 72, priority: 'Medium',
  icon: 'workflow-form', color: '#22c55e', ...leaveGraph(),
});

export function seedWorkflows(): Workflow[] {
  return [
    LEAVE_DEF(),
    ...DEF_SEEDS.map(([name, module, category, description, status, version, owner, icon, color, steps], i): Workflow => ({
      id: `WFD-${String(i + 2).padStart(3, '0')}`, name, description, module, category, status, version, validFrom: '2026-01-01', validTo: '2027-12-31',
      audit: true, manualTrigger: i % 3 === 0, portal: status === 'Active', owner, updated: `${12 - (i % 9)} Oct 2026, 0${(i % 8) + 1}:${String((i * 17) % 60).padStart(2, '0')} PM`,
      trigger: `${name.replace(/ \(.*\)/, '')} submitted`, slaHours: [24, 48, 72][i % 3], priority: (['High', 'Medium', 'Low'] as const)[i % 3], icon, color, ...linearGraph(steps),
    })),
  ];
}

export const TEMPLATES = [
  { id: 'WFD-001', name: 'Leave Request Approval', desc: 'Manager + HR approval with branches' },
  { id: 'WFD-004', name: 'Employee Onboarding', desc: 'Parallel IT / Facilities / Security' },
  { id: 'WFD-008', name: 'Expense Claim', desc: 'Amount-based finance audit' },
  { id: 'WFD-007', name: 'Shift Swap Request', desc: 'Peer + supervisor with rest rule' },
  { id: 'WFD-009', name: 'Visitor Pre-Approval', desc: 'Watchlist screening + QR pass' },
  { id: 'WFD-006', name: 'Overtime Approval', desc: 'Policy rule + payroll push' },
];

/** Ordered list of steps (BFS from start, conditional side branches last). */
export function orderedSteps(nodes: WfNode[], edges: WfEdge[]): WfNode[] {
  const start = nodes.find((n) => n.type === 'start');
  const seen = new Set<string>();
  const out: WfNode[] = [];
  const q = start ? [start.id] : [];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = nodes.find((x) => x.id === id);
    if (n) out.push(n);
    edges.filter((e) => e.from === id && !e.red).forEach((e) => q.push(e.to));
  }
  const rest = nodes.filter((n) => !seen.has(n.id));
  const end = out.filter((n) => n.type === 'end');
  return [...out.filter((n) => n.type !== 'end'), ...end, ...rest];
}
/** Steps shown in an instance timeline (human / system steps only). */
export function timelineSteps(wf: Workflow): string[] {
  if (wf.id === 'WFD-001') return ['Employee Submission', 'Manager Approval', 'HR Approval', 'Update Records', 'Send Notification'];
  return orderedSteps(wf.nodes, wf.edges).filter((n) => !['start', 'end', 'condition', 'parallel'].includes(n.type) && !n.cfg.conditions.startsWith('If Rejected')).map((n) => n.name);
}

/* ======================= Instances ======================= */
export type InstStatus = 'In Progress' | 'Approved' | 'Rejected' | 'Cancelled';
export interface InstLog {
  at: number;
  text: string;
  by: string;
}
export interface Instance {
  id: string;
  wfId: string;
  workflow: string;
  requester: string;
  initials: string;
  avatar: string;
  dept: string;
  status: InstStatus;
  stepIdx: number;
  steps: string[];
  startedAt: number;
  dueAt: number;
  endedAt?: number;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
  summary: string;
  mine: boolean;
  delegated?: string;
  test?: boolean;
  log: InstLog[];
}
/** Demo "now": the reference image's clock. */
export const NOW = new Date(2026, 9, 14, 10, 24).getTime();
const LOADED = Date.now();
/** Demo clock that starts at the image's 10:24 AM and runs in real time. */
export const demoNow = () => NOW + (Date.now() - LOADED);
const H = 3600_000;
export const ME = 'Rex Kumar';
const DEPTS = ['Operations', 'Engineering', 'Sales', 'Finance', 'HR', 'IT', 'Logistics', 'Security'];
const APPROVERS: Record<string, string> = { 'Manager Approval': 'Rex Kumar', 'HR Approval': 'Hannah Lee', 'HR Approval (Final)': 'Hannah Lee', 'Finance Audit': 'Fatima Ali', 'L&D Approval': 'Meera Iyer', 'Security Approval': 'Omar Khalid', 'Supervisor Approval': 'Tom Baker' };
export const approverFor = (step: string, i = 0) => APPROVERS[step] ?? (step.includes('Approval') || step.includes('Review') || step.includes('Sign-off') ? (i % 2 ? 'Rex Kumar' : 'Grace Park') : step.includes('Form') || step.includes('Request') || step.includes('Submission') || step.includes('Claim') ? 'Requester' : 'System');

const SUMMARY: Record<string, (r: () => number) => string> = {
  'WFD-001': (r) => { const t = ['Annual', 'Sick', 'Casual', 'Annual', 'Study'][Math.floor(r() * 5)]; const n = 1 + Math.floor(r() * 5); return `${t} Leave · ${n} day${n > 1 ? 's' : ''}`; },
  'WFD-002': (r) => `Extend ${Math.floor(r() * 6) + 1} months · AED ${(40 + Math.floor(r() * 90)) * 1000}`,
  'WFD-003': (r) => `${['AWS Architect', 'PMP Prep', 'NEBOSH', 'Power BI', 'First Aid'][Math.floor(r() * 5)]} · AED ${(Math.floor(r() * 50) + 8) * 100}`,
  'WFD-006': (r) => `${1 + Math.floor(r() * 6)} h overtime · ${['Line 2', 'Warehouse', 'Night shift'][Math.floor(r() * 3)]}`,
  'WFD-008': (r) => `AED ${(Math.floor(r() * 80) + 3) * 50} · ${['Travel', 'Client meal', 'Software', 'Fuel'][Math.floor(r() * 4)]}`,
};
const fixed: [string, string, string, InstStatus, string, number][] = [
  ['WF-00123', 'WFD-001', 'Ahmed Hassan', 'In Progress', 'Manager Approval', NOW - 69 * 60_000],
  ['WF-00122', 'WFD-001', 'Priya Sharma', 'Approved', 'Completed', new Date(2026, 9, 13, 17, 42).getTime()],
  ['WF-00121', 'WFD-002', 'Ramesh Kumar', 'In Progress', 'HR Approval', new Date(2026, 9, 13, 11, 20).getTime()],
  ['WF-00120', 'WFD-003', 'Maria Santos', 'Rejected', 'Manager Approval', new Date(2026, 9, 12, 15, 10).getTime()],
];
/** Weighted pick so Leave dominates like a real tenant. */
const WF_WEIGHT = ['WFD-001', 'WFD-001', 'WFD-001', 'WFD-001', 'WFD-006', 'WFD-006', 'WFD-008', 'WFD-008', 'WFD-007', 'WFD-003', 'WFD-002', 'WFD-004', 'WFD-005', 'WFD-009', 'WFD-009', 'WFD-010', 'WFD-011', 'WFD-011', 'WFD-013'];

export function seedInstances(wfs: Workflow[]): Instance[] {
  const r = rng(77);
  const byId = (id: string) => wfs.find((w) => w.id === id)!;
  const list: Instance[] = [];
  const mk = (id: string, wfId: string, who: string, status: InstStatus, step: string | null, at: number, i: number): Instance => {
    const wf = byId(wfId);
    const steps = timelineSteps(wf);
    let stepIdx = step ? Math.max(0, steps.indexOf(step)) : status === 'In Progress' ? 1 + Math.floor(r() * (steps.length - 2)) : steps.length;
    if (status === 'Approved' || status === 'Cancelled') stepIdx = status === 'Approved' ? steps.length : stepIdx;
    if (status === 'Rejected' && !step) stepIdx = 1;
    const cur = steps[Math.min(stepIdx, steps.length - 1)];
    const assignee = status === 'In Progress' ? approverFor(cur, i) : '-';
    const sla = wf.slaHours * H;
    const log: InstLog[] = [{ at, text: `Submitted ${wf.name.replace(' Workflow', '')}`, by: who }];
    for (let k = 1; k < Math.min(stepIdx, steps.length); k++) log.push({ at: at + k * 5 * H, text: `${steps[k]} completed`, by: approverFor(steps[k], i) });
    if (status === 'Rejected') log.push({ at: at + 6 * H, text: `Rejected at ${cur}`, by: approverFor(cur, i) });
    if (status === 'Cancelled') log.push({ at: at + 3 * H, text: 'Cancelled by requester', by: who });
    const summ = SUMMARY[wfId]?.(r) ?? wf.description.split(' ').slice(0, 5).join(' ');
    return {
      id, wfId, workflow: wf.name.replace(' Workflow', ''), requester: who, initials: initials(who), avatar: avatarColor(who), dept: DEPTS[i % DEPTS.length], status, stepIdx, steps,
      startedAt: at, dueAt: at + sla, endedAt: status === 'In Progress' ? undefined : at + (6 + Math.floor(r() * 40)) * H, assignee, priority: (['High', 'Medium', 'Medium', 'Low'] as const)[i % 4],
      summary: summ, mine: status === 'In Progress' && assignee === ME, log,
    };
  };
  fixed.forEach(([id, wf, who, st, step, at], i) => list.push(mk(id, wf, who, st, step === 'Completed' ? null : step, at, i)));
  for (let n = 119; n >= 1; n--) {
    const i = 119 - n;
    const wfId = WF_WEIGHT[Math.floor(r() * WF_WEIGHT.length)];
    const ago = (i * 7.3 + r() * 6) * H;
    const roll = r();
    const status: InstStatus = ago < 170 * H ? (roll < 0.7 ? 'In Progress' : roll < 0.92 ? 'Approved' : 'Rejected') : ago < 140 * H ? (roll < 0.35 ? 'In Progress' : roll < 0.85 ? 'Approved' : roll < 0.95 ? 'Rejected' : 'Cancelled') : roll < 0.82 ? 'Approved' : roll < 0.94 ? 'Rejected' : 'Cancelled';
    const who = NAMES[Math.floor(r() * NAMES.length)];
    list.push(mk(`WF-${String(n).padStart(5, '0')}`, wfId, who, status, null, Math.round(NOW - ago - 2 * H), i + 4));
  }
  // Make sure the approver inbox has a healthy queue.
  list.filter((x) => x.status === 'In Progress').slice(0, 26).forEach((x, k) => {
    if (k % 2 === 0 && !x.mine) {
      const idx = x.steps.findIndex((s) => s.includes('Manager Approval'));
      if (idx > 0) Object.assign(x, { stepIdx: idx, assignee: ME, mine: true });
    }
  });
  list[0].mine = true;
  list[0].assignee = ME;
  return list;
}

/* ======================= Automation rules ======================= */
export interface RuleCond {
  field: string;
  op: string;
  value: string;
}
export interface RuleAction {
  type: string;
  target: string;
}
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  module: string;
  trigger: string;
  match: 'All' | 'Any';
  conds: RuleCond[];
  actions: RuleAction[];
  runs: number;
  success: number;
  lastRun: string;
  owner: string;
}
export const TRIGGERS = ['Leave request submitted', 'Attendance anomaly detected', 'Shift swap requested', 'Visitor pre-registered', 'Document expiring', 'Employee joined', 'Employee resigned', 'Approval pending > SLA', 'Overtime logged', 'Incident reported', 'Contract ending', 'Training overdue'];
export const FIELDS = ['Leave type', 'Days requested', 'Department', 'Employee grade', 'Site', 'Amount', 'Hours', 'Severity', 'Days to expiry', 'Pending hours', 'Employment type', 'Manager on leave'];
export const OPS = ['equals', 'not equals', 'greater than', 'less than', 'contains', 'is any of', 'is true'];
export const ACTIONS = ['Auto-approve', 'Auto-reject', 'Route to approver', 'Start workflow', 'Send notification', 'Send email', 'Create task', 'Update record', 'Escalate to', 'Call webhook', 'Post to Teams channel', 'Add to report'];

export const RULES_SEED: Rule[] = [
  { id: 'R-101', name: 'Auto-approve 1-day casual leave', enabled: true, module: 'Leave & Absence Management', trigger: 'Leave request submitted', match: 'All', conds: [{ field: 'Leave type', op: 'equals', value: 'Casual' }, { field: 'Days requested', op: 'less than', value: '2' }, { field: 'Department', op: 'not equals', value: 'Security' }], actions: [{ type: 'Auto-approve', target: 'Leave request' }, { type: 'Send notification', target: 'Employee & Manager' }, { type: 'Update record', target: 'Leave balance' }], runs: 1284, success: 99.2, lastRun: '10:21 AM', owner: 'Rex Kumar' },
  { id: 'R-102', name: 'Escalate approvals pending > 48h', enabled: true, module: 'Workflow & Automation', trigger: 'Approval pending > SLA', match: 'All', conds: [{ field: 'Pending hours', op: 'greater than', value: '48' }], actions: [{ type: 'Escalate to', target: 'Department Head' }, { type: 'Send email', target: 'Approver + Department Head' }], runs: 342, success: 100, lastRun: '10:00 AM', owner: 'Rex Kumar' },
  { id: 'R-103', name: 'Route to delegate when manager on leave', enabled: true, module: 'Workflow & Automation', trigger: 'Leave request submitted', match: 'All', conds: [{ field: 'Manager on leave', op: 'is true', value: 'Yes' }], actions: [{ type: 'Route to approver', target: 'Manager delegate' }, { type: 'Send notification', target: 'Delegate' }], runs: 186, success: 98.4, lastRun: '09:47 AM', owner: 'Hannah Lee' },
  { id: 'R-104', name: 'Missed punch → regularization', enabled: true, module: 'Time & Attendance', trigger: 'Attendance anomaly detected', match: 'Any', conds: [{ field: 'Hours', op: 'less than', value: '4' }, { field: 'Employment type', op: 'equals', value: 'Full-time' }], actions: [{ type: 'Start workflow', target: 'Attendance Regularization' }, { type: 'Send notification', target: 'Employee' }], runs: 2140, success: 97.8, lastRun: '10:18 AM', owner: 'Vikram Rao' },
  { id: 'R-105', name: 'Overtime above 4h needs Dept Head', enabled: true, module: 'Time & Attendance', trigger: 'Overtime logged', match: 'All', conds: [{ field: 'Hours', op: 'greater than', value: '4' }], actions: [{ type: 'Route to approver', target: 'Department Head' }], runs: 412, success: 99.5, lastRun: '08:55 AM', owner: 'Vikram Rao' },
  { id: 'R-106', name: 'Document expiry reminders (30 days)', enabled: true, module: 'People & Identity Management', trigger: 'Document expiring', match: 'All', conds: [{ field: 'Days to expiry', op: 'less than', value: '30' }], actions: [{ type: 'Send email', target: 'Employee' }, { type: 'Create task', target: 'HR Ops queue' }], runs: 96, success: 100, lastRun: '06:00 AM', owner: 'Hannah Lee' },
  { id: 'R-107', name: 'New joiner onboarding kickoff', enabled: true, module: 'People & Identity Management', trigger: 'Employee joined', match: 'All', conds: [{ field: 'Employment type', op: 'is any of', value: 'Full-time, Contract' }], actions: [{ type: 'Start workflow', target: 'Employee Onboarding' }, { type: 'Post to Teams channel', target: '#new-joiners' }], runs: 58, success: 100, lastRun: 'Yesterday', owner: 'Hannah Lee' },
  { id: 'R-108', name: 'High-severity incident broadcast', enabled: true, module: 'Emergency & Mustering', trigger: 'Incident reported', match: 'All', conds: [{ field: 'Severity', op: 'equals', value: 'High' }], actions: [{ type: 'Start workflow', target: 'Incident Escalation' }, { type: 'Send notification', target: 'HSE + Site Managers' }, { type: 'Call webhook', target: 'ServiceNow incident' }], runs: 12, success: 91.7, lastRun: '12 Oct', owner: 'Aisha Bello' },
  { id: 'R-109', name: 'Large expense needs Finance audit', enabled: false, module: 'Employee Self-Service (ESS)', trigger: 'Leave request submitted', match: 'All', conds: [{ field: 'Amount', op: 'greater than', value: '5000' }], actions: [{ type: 'Route to approver', target: 'Finance Team' }], runs: 0, success: 0, lastRun: 'Never', owner: 'Fatima Ali' },
  { id: 'R-110', name: 'Contract ending in 45 days', enabled: true, module: 'Contractor & Vendor Workforce', trigger: 'Contract ending', match: 'All', conds: [{ field: 'Days to expiry', op: 'less than', value: '45' }], actions: [{ type: 'Start workflow', target: 'Contract Extension' }, { type: 'Send email', target: 'Contract owner' }], runs: 34, success: 97.1, lastRun: '13 Oct', owner: 'Grace Park' },
];

/* ======================= Connectors ======================= */
export type ConnStatus = 'Connected' | 'Error' | 'Not Connected' | 'Paused';
export interface Connector {
  id: string;
  name: string;
  vendor: string;
  category: 'HRIS' | 'Collaboration' | 'Messaging' | 'ITSM' | 'Payroll' | 'Identity' | 'Calendar' | 'Custom';
  status: ConnStatus;
  logo: string;
  color: string;
  calls24h: number;
  errors24h: number;
  lastSync: string;
  auth: string;
  endpoint: string;
  usedBy: string[];
  trend: number[];
  /** Settings edited on Integrations & Connectors (optional, defaults derived on the page). */
  cfg?: ConnCfg;
}
export interface ConnCfg {
  clientId: string;
  scopes: string;
  timeoutS: number;
  retries: number;
  rateLimit: number;
  channel: string;
  syncEvery: string;
  signing: boolean;
}
const tr = (seed: number, base: number) => { const r = rng(seed); return Array.from({ length: 12 }, () => Math.round(base * (0.7 + r() * 0.6))); };
export const CONNECTORS_SEED: Connector[] = [
  { id: 'C1', name: 'SAP SuccessFactors', vendor: 'SAP', category: 'HRIS', status: 'Connected', logo: 'SF', color: '#0a6ed1', calls24h: 18420, errors24h: 12, lastSync: '2 min ago', auth: 'OAuth 2.0 (SAML bearer)', endpoint: 'https://api4.successfactors.com/odata/v2', usedBy: ['Contract Extension', 'Employee Onboarding'], trend: tr(1, 1500) },
  { id: 'C2', name: 'Microsoft 365 Calendar', vendor: 'Microsoft', category: 'Calendar', status: 'Connected', logo: 'O', color: '#0078d4', calls24h: 9240, errors24h: 3, lastSync: '1 min ago', auth: 'OAuth 2.0 (Entra ID)', endpoint: 'https://graph.microsoft.com/v1.0', usedBy: ['Leave Request Approval', 'Visitor Pre-Approval'], trend: tr(2, 770) },
  { id: 'C3', name: 'Microsoft Teams', vendor: 'Microsoft', category: 'Collaboration', status: 'Connected', logo: 'T', color: '#5b5fc7', calls24h: 6310, errors24h: 0, lastSync: 'Just now', auth: 'OAuth 2.0 (Bot)', endpoint: 'https://graph.microsoft.com/v1.0/teams', usedBy: ['Leave Request Approval', 'Remote Work Request'], trend: tr(3, 520) },
  { id: 'C4', name: 'ServiceNow', vendor: 'ServiceNow', category: 'ITSM', status: 'Error', logo: 'SN', color: '#293e40', calls24h: 1180, errors24h: 146, lastSync: '38 min ago', auth: 'Basic + mTLS', endpoint: 'https://people360.service-now.com/api/now', usedBy: ['Employee Onboarding', 'Incident Escalation'], trend: tr(4, 110) },
  { id: 'C5', name: 'ADP Payroll', vendor: 'ADP', category: 'Payroll', status: 'Connected', logo: 'ADP', color: '#d0271d', calls24h: 2460, errors24h: 4, lastSync: '15 min ago', auth: 'mTLS certificate', endpoint: 'https://api.adp.com/hr/v2', usedBy: ['Overtime Approval', 'Expense Claim', 'Employee Offboarding'], trend: tr(5, 210) },
  { id: 'C6', name: 'Active Directory', vendor: 'Microsoft', category: 'Identity', status: 'Connected', logo: 'AD', color: '#2563eb', calls24h: 4120, errors24h: 1, lastSync: '5 min ago', auth: 'LDAPS service account', endpoint: 'ldaps://dc01.people360.local:636', usedBy: ['Employee Offboarding', 'Employee Onboarding'], trend: tr(6, 340) },
  { id: 'C7', name: 'Slack', vendor: 'Salesforce', category: 'Messaging', status: 'Not Connected', logo: 'S', color: '#4a154b', calls24h: 0, errors24h: 0, lastSync: '—', auth: 'OAuth 2.0', endpoint: 'https://slack.com/api', usedBy: [], trend: Array(12).fill(0) },
  { id: 'C8', name: 'Twilio SMS', vendor: 'Twilio', category: 'Messaging', status: 'Connected', logo: 'Tw', color: '#f22f46', calls24h: 840, errors24h: 2, lastSync: '9 min ago', auth: 'API key', endpoint: 'https://api.twilio.com/2010-04-01', usedBy: ['Visitor Pre-Approval', 'Incident Escalation'], trend: tr(8, 70) },
  { id: 'C9', name: 'SMTP Email Relay', vendor: 'People360', category: 'Messaging', status: 'Connected', logo: '@', color: '#7c3aed', calls24h: 12880, errors24h: 9, lastSync: 'Just now', auth: 'SMTP AUTH (TLS)', endpoint: 'smtp.people360.io:587', usedBy: ['All workflows'], trend: tr(9, 1070) },
  { id: 'C10', name: 'Workday', vendor: 'Workday', category: 'HRIS', status: 'Paused', logo: 'W', color: '#f38b00', calls24h: 0, errors24h: 0, lastSync: '3 days ago', auth: 'OAuth 2.0', endpoint: 'https://wd5-services1.workday.com/ccx/service', usedBy: [], trend: tr(10, 60).map((v, i) => (i > 8 ? 0 : v)) },
  { id: 'C11', name: 'Google Calendar', vendor: 'Google', category: 'Calendar', status: 'Not Connected', logo: 'G', color: '#34a853', calls24h: 0, errors24h: 0, lastSync: '—', auth: 'OAuth 2.0', endpoint: 'https://www.googleapis.com/calendar/v3', usedBy: [], trend: Array(12).fill(0) },
  { id: 'C12', name: 'Jira Service Management', vendor: 'Atlassian', category: 'ITSM', status: 'Connected', logo: 'J', color: '#0052cc', calls24h: 620, errors24h: 0, lastSync: '22 min ago', auth: 'API token', endpoint: 'https://people360.atlassian.net/rest/api/3', usedBy: ['Asset Request'], trend: tr(12, 50) },
  { id: 'C13', name: 'Generic Webhook', vendor: 'Custom', category: 'Custom', status: 'Connected', logo: '{ }', color: '#0f766e', calls24h: 1530, errors24h: 21, lastSync: '4 min ago', auth: 'HMAC signature', endpoint: 'https://hooks.people360.io/wf/inbound', usedBy: ['Incident Escalation', 'Document Verification'], trend: tr(13, 130) },
  { id: 'C14', name: 'Access Control (Lenel)', vendor: 'LenelS2', category: 'Identity', status: 'Connected', logo: 'L', color: '#334155', calls24h: 2210, errors24h: 5, lastSync: '1 min ago', auth: 'REST API key', endpoint: 'https://onguard.people360.local/api', usedBy: ['Access Request (Restricted Area)', 'Visitor Pre-Approval'], trend: tr(14, 180) },
];
export interface SyncLog {
  at: string;
  connector: string;
  op: string;
  records: number;
  ms: number;
  status: 'Success' | 'Failed' | 'Retrying';
}
export const SYNC_LOGS: SyncLog[] = (() => {
  const r = rng(31);
  const ops = ['GET /employees (delta)', 'POST /events', 'POST /messages', 'PATCH /leaveBalance', 'POST /payslip-items', 'GET /users', 'POST /incident', 'POST /sms'];
  const conns = CONNECTORS_SEED.filter((c) => c.status === 'Connected' || c.status === 'Error');
  return Array.from({ length: 40 }, (_, i) => {
    const c = conns[Math.floor(r() * conns.length)];
    const fail = c.status === 'Error' ? r() < 0.6 : r() < 0.05;
    const m = 24 - Math.floor(i * 0.55);
    return { at: `10:${String(Math.max(0, m)).padStart(2, '0')} AM`, connector: c.name, op: ops[Math.floor(r() * ops.length)], records: Math.floor(r() * 240) + 1, ms: Math.floor(80 + r() * 900), status: fail ? (r() < 0.5 ? 'Retrying' : 'Failed') : 'Success' };
  });
})();

/* ======================= Rule executions ======================= */
export interface RuleExec {
  id: string;
  ruleId: string;
  rule: string;
  at: number;
  subject: string;
  result: 'Success' | 'Failed' | 'No match';
  ms: number;
  actions: number;
  test?: boolean;
  note?: string;
}
const SUBJECTS: Record<string, (r: () => number) => string> = {
  'Leave request submitted': (r) => `${NAMES[Math.floor(r() * NAMES.length)]} · ${['Casual', 'Annual', 'Sick'][Math.floor(r() * 3)]} ${1 + Math.floor(r() * 3)}d`,
  'Approval pending > SLA': (r) => `WF-${String(Math.floor(r() * 120) + 1).padStart(5, '0')} pending ${49 + Math.floor(r() * 30)}h`,
  'Attendance anomaly detected': (r) => `${NAMES[Math.floor(r() * NAMES.length)]} · missed punch`,
  'Overtime logged': (r) => `${NAMES[Math.floor(r() * NAMES.length)]} · ${3 + Math.floor(r() * 4)}h OT`,
  'Document expiring': (r) => `${NAMES[Math.floor(r() * NAMES.length)]} · ${['Passport', 'Visa', 'Emirates ID'][Math.floor(r() * 3)]}`,
  'Employee joined': (r) => `${NAMES[Math.floor(r() * NAMES.length)]} · new joiner`,
  'Incident reported': (r) => `INC-${400 + Math.floor(r() * 90)} · ${['Fire alarm', 'Chemical spill', 'Injury'][Math.floor(r() * 3)]}`,
  'Contract ending': (r) => `${NAMES[Math.floor(r() * NAMES.length)]} · contract ends in ${10 + Math.floor(r() * 30)}d`,
};
export const ruleSubject = (trigger: string, r: () => number) => SUBJECTS[trigger]?.(r) ?? `${NAMES[Math.floor(r() * NAMES.length)]} · ${trigger.toLowerCase()}`;
export function seedRuleExecs(rules: Rule[]): RuleExec[] {
  const r = rng(91);
  const out: RuleExec[] = [];
  const live = rules.filter((x) => x.enabled && x.runs > 0);
  for (let k = 0; k < 160; k++) {
    const rule = live[Math.floor(r() * r() * live.length * 1.4) % live.length];
    const fail = r() * 100 > rule.success;
    out.push({
      id: `EX-${String(9000 - k)}`, ruleId: rule.id, rule: rule.name, at: Math.round(NOW - k * 0.42 * H - r() * 0.3 * H), subject: ruleSubject(rule.trigger, r),
      result: fail ? 'Failed' : r() < 0.08 ? 'No match' : 'Success', ms: Math.round(60 + r() * 700), actions: rule.actions.length,
      note: fail ? ['Webhook timeout (30s)', 'Approver not found', 'ServiceNow 503'][Math.floor(r() * 3)] : undefined,
    });
  }
  return out;
}

/* ======================= Helpers ======================= */
export const fmtDT = (ms: number) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
};
export const fmtAgo = (ms: number) => {
  const m = Math.round((demoNow() - ms) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const statusTagCls = (s: string) =>
  s === 'Approved' || s === 'Active' || s === 'Connected' || s === 'Success' ? 'tag green' : s === 'Rejected' || s === 'Error' || s === 'Failed' || s === 'Overdue' ? 'tag red' : s === 'In Progress' ? 'tag blue' : s === 'Draft' || s === 'Paused' || s === 'Retrying' ? 'tag amber' : 'tag grey';
export const isOverdue = (i: Instance) => i.status === 'In Progress' && i.dueAt < demoNow();
export const instStatus = (i: Instance) => (isOverdue(i) ? 'Overdue' : i.status);
export const currentStep = (i: Instance) => (i.status === 'Approved' ? 'Completed' : i.steps[Math.min(i.stepIdx, i.steps.length - 1)]);

/* ======================= Store ======================= */
@Injectable({ providedIn: 'root' })
export class WorkflowStore {
  private readonly app = inject(AppState);
  readonly workflows = signal<Workflow[]>(seedWorkflows());
  readonly currentId = signal('WFD-001');
  readonly current = computed(() => this.workflows().find((w) => w.id === this.currentId()) ?? this.workflows()[0]);
  readonly instances = signal<Instance[]>(seedInstances(this.workflows()));
  readonly rules = signal<Rule[]>(RULES_SEED.map((r) => ({ ...r, conds: r.conds.map((c) => ({ ...c })), actions: r.actions.map((a) => ({ ...a })) })));
  readonly connectors = signal<Connector[]>(CONNECTORS_SEED.map((c) => ({ ...c })));
  readonly activity = signal<{ at: string; text: string; color: string }[]>([]);
  readonly ruleExecs = signal<RuleExec[]>(seedRuleExecs(this.rules()));
  readonly syncLogs = signal<(SyncLog & { id: number })[]>(SYNC_LOGS.map((l, id) => ({ ...l, id })));
  private execSeq = 9001;
  private syncSeq = 100;
  private seq = 124;
  private liveIdx = 0;

  readonly running = computed(() => this.instances().filter((i) => i.status === 'In Progress'));
  readonly myTasks = computed(() => this.instances().filter((i) => i.mine && i.status === 'In Progress'));

  constructor() {
    // Live: every few ticks an in-flight instance moves one step forward and new requests arrive.
    effect(() => {
      const t = this.app.tick();
      if (t === 0) return;
      untracked(() => {
        if (t % 3 === 0) this.advanceSomeone();
        if (t % 24 === 0) this.newArrival();
        if (t % 2 === 0) this.liveAutomation(t);
      });
    });
  }

  private advanceSomeone() {
    const cand = this.instances().filter((i) => i.status === 'In Progress' && !i.mine && !i.test);
    if (!cand.length) return;
    const inst = cand[this.liveIdx++ % cand.length];
    const next = inst.stepIdx + 1;
    const done = next >= inst.steps.length;
    const by = inst.assignee === '-' ? 'System' : inst.assignee;
    this.patchInst(inst.id, {
      stepIdx: next,
      status: done ? 'Approved' : 'In Progress',
      endedAt: done ? demoNow() : undefined,
      assignee: done ? '-' : approverFor(inst.steps[next], next),
      log: [...inst.log, { at: demoNow(), text: `${inst.steps[inst.stepIdx]} completed`, by }],
    });
    this.pushActivity(`${inst.id} · ${inst.steps[inst.stepIdx]} completed by ${by}`, done ? '#22c55e' : '#3b82f6');
  }
  private newArrival() {
    const wfs = ['WFD-001', 'WFD-006', 'WFD-008', 'WFD-011'];
    const wf = this.workflows().find((w) => w.id === wfs[this.seq % wfs.length])!;
    const who = NAMES[(this.seq * 7) % NAMES.length];
    this.addInstance(wf, who, { summary: SUMMARY[wf.id]?.(rng(this.seq)) ?? 'New request' });
  }
  addInstance(wf: Workflow, who: string, p: Partial<Instance> = {}) {
    const steps = timelineSteps(wf);
    const id = `WF-${String(this.seq++).padStart(5, '0')}`;
    const now = demoNow();
    const inst: Instance = {
      id, wfId: wf.id, workflow: wf.name.replace(' Workflow', ''), requester: who, initials: initials(who), avatar: avatarColor(who), dept: DEPTS[this.seq % DEPTS.length],
      status: 'In Progress', stepIdx: 1, steps, startedAt: now, dueAt: now + wf.slaHours * H, assignee: approverFor(steps[1], this.seq), priority: 'Medium',
      summary: '', mine: approverFor(steps[1], this.seq) === ME, log: [{ at: now, text: `Submitted ${wf.name.replace(' Workflow', '')}`, by: who }], ...p,
    };
    this.instances.update((l) => [inst, ...l]);
    this.pushActivity(`${id} · ${inst.workflow} started by ${who}`, '#7c3aed');
    return inst;
  }
  patchInst(id: string, p: Partial<Instance>) {
    this.instances.update((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }
  pushActivity(text: string, color: string) {
    const at = new Date(demoNow()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.activity.update((a) => [{ at, text, color }, ...a].slice(0, 30));
  }
  /** Approve / reject / delegate / cancel from any page. */
  decide(id: string, action: 'approve' | 'reject' | 'cancel' | 'escalate' | 'delegate' | 'retry', note = '', to = '') {
    const i = this.instances().find((x) => x.id === id);
    if (!i) return;
    const now = demoNow();
    if (action === 'approve') {
      const next = i.stepIdx + 1;
      const done = next >= i.steps.length;
      const nextAssignee = done ? '-' : approverFor(i.steps[next], next);
      this.patchInst(id, { stepIdx: next, status: done ? 'Approved' : 'In Progress', endedAt: done ? now : undefined, assignee: nextAssignee, mine: false, log: [...i.log, { at: now, text: `${i.steps[i.stepIdx]} approved${note ? ' · “' + note + '”' : ''}`, by: ME }] });
    } else if (action === 'reject') this.patchInst(id, { status: 'Rejected', endedAt: now, mine: false, assignee: '-', log: [...i.log, { at: now, text: `Rejected at ${i.steps[i.stepIdx]}${note ? ' · “' + note + '”' : ''}`, by: ME }] });
    else if (action === 'cancel') this.patchInst(id, { status: 'Cancelled', endedAt: now, mine: false, assignee: '-', log: [...i.log, { at: now, text: 'Cancelled by administrator', by: ME }] });
    else if (action === 'escalate') this.patchInst(id, { assignee: to || 'Department Head', mine: false, priority: 'High', dueAt: now + 24 * H, log: [...i.log, { at: now, text: `Escalated to ${to || 'Department Head'}`, by: ME }] });
    else if (action === 'delegate') this.patchInst(id, { assignee: to, delegated: to, mine: false, log: [...i.log, { at: now, text: `Delegated to ${to}${note ? ' · “' + note + '”' : ''}`, by: ME }] });
    else if (action === 'retry') this.patchInst(id, { status: 'In Progress', endedAt: undefined, assignee: approverFor(i.steps[i.stepIdx], 1), log: [...i.log, { at: now, text: `Restarted from ${i.steps[i.stepIdx]}`, by: ME }] });
    this.pushActivity(`${id} · ${action} by ${ME}`, action === 'approve' ? '#22c55e' : action === 'reject' || action === 'cancel' ? '#ef4444' : '#f59e0b');
  }

  /** Live: an enabled rule fires and a connected integration makes a call. */
  private liveAutomation(t: number) {
    const rules = this.rules().filter((r) => r.enabled);
    if (rules.length) {
      const rule = rules[(t / 2) % rules.length | 0];
      this.runRule(rule.id, false, ruleSubject(rule.trigger, rng(t)), Math.random() * 100 < rule.success);
    }
    const conns = this.connectors().filter((c) => c.status === 'Connected' || c.status === 'Error');
    if (conns.length) {
      const c = conns[t % conns.length];
      const fail = c.status === 'Error' ? Math.random() < 0.6 : Math.random() < 0.03;
      this.logSync(c.id, ['POST /events', 'GET /employees (delta)', 'POST /messages', 'PATCH /leaveBalance'][t % 4], fail);
    }
  }
  /** Record a rule execution (live, or a test run from the rule builder). */
  runRule(ruleId: string, test: boolean, subject: string, ok: boolean, matched = true, note?: string) {
    const rule = this.rules().find((r) => r.id === ruleId);
    if (!rule) return null;
    const at = demoNow();
    const ex: RuleExec = { id: `EX-${this.execSeq++}`, ruleId, rule: rule.name, at, subject, result: !matched ? 'No match' : ok ? 'Success' : 'Failed', ms: Math.round(60 + Math.random() * 600), actions: matched ? rule.actions.length : 0, test, note: note ?? (ok ? undefined : 'Action failed: webhook timeout (30s)') };
    this.ruleExecs.update((l) => [ex, ...l].slice(0, 400));
    if (!test) {
      const runs = rule.runs + 1;
      const success = Math.round(((rule.success * rule.runs + (ok ? 100 : 0)) / runs) * 10) / 10;
      this.patchRule(ruleId, { runs, success, lastRun: new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) });
    }
    return ex;
  }
  patchRule(id: string, p: Partial<Rule>) {
    this.rules.update((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  patchConn(id: string, p: Partial<Connector>) {
    this.connectors.update((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  logSync(connId: string, op: string, fail: boolean) {
    const c = this.connectors().find((x) => x.id === connId);
    if (!c) return;
    const at = new Date(demoNow()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.syncLogs.update((l) => [{ id: this.syncSeq++, at, connector: c.name, op, records: 1 + Math.floor(Math.random() * 120), ms: Math.round(80 + Math.random() * 700), status: fail ? 'Failed' as const : 'Success' as const }, ...l].slice(0, 200));
    const trend = [...c.trend];
    trend[trend.length - 1] += 1;
    this.patchConn(connId, { calls24h: c.calls24h + 1, errors24h: c.errors24h + (fail ? 1 : 0), lastSync: fail ? c.lastSync : 'Just now', trend });
  }

  patchWf(id: string, p: Partial<Workflow>) {
    this.workflows.update((l) => l.map((w) => (w.id === id ? { ...w, ...p } : w)));
  }
  addWorkflow(w: Workflow) {
    this.workflows.update((l) => [w, ...l]);
    this.currentId.set(w.id);
  }
  nextWfId() {
    return `WFD-${String(this.workflows().length + 1 + Math.floor(Math.random() * 900)).padStart(3, '0')}`;
  }
  blank(name: string, module: string, category: string): Workflow {
    const start = makeNode('n1', 'start', 'Start', 'Request Submitted', 60, 120);
    const end = makeNode('n2', 'end', 'End', 'Completed', 520, 120);
    return { ...LEAVE_DEF(), id: this.nextWfId(), name, module, category, description: '', status: 'Draft', version: 'v0.1', owner: ME, updated: 'Just now', trigger: 'Manual', icon: 'workflow', color: '#7c3aed', nodes: [start, end], edges: [{ id: 'e1', from: 'n1', to: 'n2', fp: 'r', tp: 'l' }] };
  }
  instancesOf(wfId: string) {
    return this.instances().filter((i) => i.wfId === wfId);
  }
  reset() {
    this.workflows.set(seedWorkflows());
    this.instances.set(seedInstances(this.workflows()));
    this.currentId.set('WFD-001');
  }
}
