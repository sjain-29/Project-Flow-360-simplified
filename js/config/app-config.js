/** Application constants: roles, stage statuses and the default stage list. */
export const APP = { name: 'ProjectFlow 360', tagline: 'Stage tracker', version: '2.0.0', firebaseSdkVersion: '13.3.0' };

/** Three roles. Only the administrator changes anything; commenters can add comments. */
export const ROLES = {
  admin: { name: 'Administrator', description: 'Full control: projects, items, stages, dates, users and settings.' },
  commenter: { name: 'Commenter', description: 'Can view everything and add comments.' },
  viewer: { name: 'Viewer', description: 'Can view everything. Cannot change anything or comment.' },
};

export const STAGE_STATUSES = ['Not Started', 'In Progress', 'Waiting', 'On Hold', 'Completed', 'Not Applicable'];
export const OPEN_STATUSES = ['Not Started', 'In Progress', 'Waiting', 'On Hold'];
export const PROJECT_STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

/** The stages every new item starts with. Editable in Administration → Stage list. */
export const DEFAULT_STAGES = [
  ['avail', 'In-house availability check', 'Planning'],
  ['pr', 'Purchase request (PR)', 'Planning'],
  ['prApproval', 'PR approval', 'Planning'],
  ['quotations', 'Vendor quotations', 'Sourcing'],
  ['po', 'Purchase order (PO)', 'Sourcing'],
  ['pi', 'Proforma invoice (PI)', 'Accounts'],
  ['payment', 'Payment', 'Accounts'],
  ['dispatch', 'Vendor dispatch', 'Sourcing'],
  ['spifReceipt', 'SPIF receipt (GRN)', 'Stores – SPIF'],
  ['mr', 'Material request SPIF → GVT', 'Planning'],
  ['logistics', 'Logistics', 'Logistics'],
  ['gvtReceipt', 'GVT receipt', 'Stores – GVT'],
  ['development', 'Development', 'Development'],
  ['testing', 'Testing', 'Testing'],
  ['closure', 'Closure', 'Project Management'],
];
export const defaultStageTemplate = () => Object.fromEntries(DEFAULT_STAGES.map(([key, name, owner], i) => [key, { name, owner, order: (i + 1) * 10 }]));
export const defaultSettings = (orgName = 'My Organisation') => ({ orgName, dueSoonDays: 7, stageTemplate: defaultStageTemplate() });

export const USERNAME_RE = /^[a-z][a-z0-9_-]{1,31}$/;
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;
export const PASSWORD_MIN = 8;
