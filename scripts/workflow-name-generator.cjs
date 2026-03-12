const BUSINESS_AREAS = [
  'Sales',
  'Support',
  'Finance',
  'Marketing',
  'Operations',
  'HR',
  'IT',
  'Product',
  'Procurement',
  'Logistics',
  'Customer Success',
  'Legal',
];

const WORKFLOW_TOPICS = [
  'Lead Routing',
  'Ticket Triage',
  'Invoice Review',
  'Campaign Approval',
  'Vendor Sync',
  'Renewal Reminder',
  'Onboarding Checklist',
  'SLA Monitor',
  'Forecast Update',
  'Contract Validation',
  'Escalation Queue',
  'KPI Digest',
];

const CHANNELS = [
  'Email',
  'Slack',
  'Webhook',
  'CRM',
  'ERP',
  'Dashboard',
  'Portal',
  'Data Warehouse',
  'Back Office',
  'API',
];

const CADENCES = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Real-Time',
  'Morning',
  'End-of-Day',
  'Priority',
];

const REGIONS = [
  'France',
  'Europe',
  'EMEA',
  'APAC',
  'North America',
  'Canada',
  'Benelux',
  'Iberia',
];

const QUALIFIERS = [
  'Internal',
  'External',
  'Priority',
  'Automated',
  'Shared',
  'Regional',
  'Global',
  'Partner',
];

const PRESET_DESCRIPTORS = [
  'Support Invoice Review Slack',
  'Priority IT Contract Validation',
  'Europe Legal Vendor Sync',
  'Internal KPI Digest Email',
];

const TEMPLATES = [
  ({ area, topic, channel, qualifier }) => `${qualifier} ${area} ${topic} ${channel}`,
  ({ region, area, topic, channel }) => `${region} ${area} ${topic} ${channel}`,
  ({ cadence, area, topic, channel }) => `${cadence} ${area} ${topic} ${channel}`,
  ({ qualifier, area, topic, cadence }) => `${qualifier} ${area} ${topic} ${cadence}`,
  ({ region, qualifier, area, topic }) => `${region} ${qualifier} ${area} ${topic}`,
  ({ area, topic, channel, cadence }) => `${area} ${topic} ${channel} ${cadence}`,
];

function normalizePrefix(prefix) {
  return (prefix || '').trimEnd();
}

function joinPrefix(prefix, value) {
  const safePrefix = normalizePrefix(prefix);
  if (!safePrefix) return value;

  const needsGlue = /[A-Za-z0-9]$/.test(safePrefix);
  return `${safePrefix}${needsGlue ? ' ' : ''}${value}`;
}

function takeByIndex(items, state) {
  const value = items[state.remaining % items.length];
  state.remaining = Math.floor(state.remaining / items.length);
  return value;
}

function buildDescriptor(index) {
  const zeroBasedIndex = Math.max(0, index - 1);

  if (zeroBasedIndex < PRESET_DESCRIPTORS.length) {
    return PRESET_DESCRIPTORS[zeroBasedIndex];
  }

  const state = { remaining: zeroBasedIndex - PRESET_DESCRIPTORS.length };
  const area = takeByIndex(BUSINESS_AREAS, state);
  const topic = takeByIndex(WORKFLOW_TOPICS, state);
  const channel = takeByIndex(CHANNELS, state);
  const cadence = takeByIndex(CADENCES, state);
  const region = takeByIndex(REGIONS, state);
  const qualifier = takeByIndex(QUALIFIERS, state);
  const template = TEMPLATES[state.remaining % TEMPLATES.length];

  return template({ area, topic, channel, cadence, region, qualifier });
}

function buildWorkflowName(options = {}) {
  const {
    prefix = '',
    index = 1,
    style = 'descriptive',
    padLength = 3,
    includeSerial = true,
  } = options;

  if (style === 'legacy') {
    return joinPrefix(prefix, String(index).padStart(padLength, '0'));
  }

  const descriptor = buildDescriptor(index);

  if (!includeSerial) {
    return joinPrefix(prefix, descriptor);
  }

  const serial = String(index).padStart(padLength, '0');
  return joinPrefix(prefix, `${serial} ${descriptor}`);
}

module.exports = {
  buildWorkflowName,
  buildDescriptor,
};