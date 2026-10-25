export type Role = 'admin' | 'analyst' | 'viewer';
export type Capability = 'overview.view' | 'geography.view' | 'records.view' | 'export.summary' | 'export.records' | 'metrics.refresh' | 'staff.manage' | 'audit.view';
export type Account = {
  id: number;
  username: string;
  role: Role | null;
  permissions: Capability[];
  must_change_password: boolean;
  is_superuser: boolean;
};
export type StaffRecord = Account & {
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
};
export type RoleDefinition = { name: Role; description: string; permissions: Capability[] };
export type RoleMatrix = { roles: RoleDefinition[]; capabilities: { key: Capability; label: string }[] };
export type StaffList = { results: StaffRecord[]; total: number; page: number; page_size: number };
export type AuditRecord = { id: number; action: string; actor: string; target: string; details: Record<string, unknown>; created_at: string };
export type Pair = { name: string; value: number };
export type FilterValues = {
  country: string[];
  state: string[];
  age_band: string[];
  language: string[];
  onboarding: string;
  recency: string;
  date_field: 'registered_at' | 'last_interaction' | 'first_chat' | 'last_chat';
  date_from: string;
  date_to: string;
};
export type FilterOptions = {
  country: string[]; state: string[]; age_band: string[]; language: string[];
  onboarding: string[]; recency: string[];
};
export const emptyFilters = (): FilterValues => ({
  country: [], state: [], age_band: [], language: [], onboarding: '', recency: '',
  date_field: 'registered_at', date_from: '', date_to: '',
});
export function hasFilters(filters: FilterValues): boolean {
  return Boolean(filters.country.length || filters.state.length || filters.age_band.length ||
    filters.language.length || filters.onboarding || filters.recency || filters.date_from || filters.date_to);
}
export function filterQuery(filters: FilterValues): string {
  const params = new URLSearchParams();
  for (const key of ['country', 'state', 'age_band', 'language'] as const) {
    filters[key].forEach((value) => params.append(key, value));
  }
  if (filters.onboarding) params.set('onboarding', filters.onboarding);
  if (filters.recency) params.set('recency', filters.recency);
  if (filters.date_from || filters.date_to) {
    params.set('date_field', filters.date_field);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
  }
  return params.toString();
}
export type Overview = {
  summary: { registered: number; onboarded: number; users_chatting: number; active_last_7d: number };
  derived: {
    total_messages: number;
    avg_response_ms: number | null;
    onboarding_rate: number | null;
    user_rows: number;
    messages_last_7d: number;
    messaging_users_last_7d: number;
    chatting_rate: number | null;
    active_rate: number | null;
    messages_per_chatting_user: number | null;
    mean_age: number | null;
    age_reported: number;
    response_time_reported: number;
    states_reported: number;
    missing_location: number;
    missing_language: number;
  };
  charts: { locations: Pair[]; states: Pair[]; countries: Pair[]; languages: Pair[]; onboarding: Pair[]; ages: Pair[]; registrations: { month: string; count: number }[]; last_chats: { month: string; count: number }[]; message_bands: Pair[]; response_bands: Pair[]; interaction_recency: Pair[] };
  updated_at: string;
  source: string;
  filters: {
    active: boolean;
    applied: FilterValues;
    options: FilterOptions;
    total_source_records: number;
    matched_records: number;
    basis: 'upstream_summary' | 'matching_user_records';
  };
};
export type UserRow = {
  name: string | null; phone_number: string | null; age: number | null; location: string | null;
  preferred_language: string | null; country: string; state: string; age_band: string;
  onboarding_state: string | null;
  onboarding_completed: boolean | null; registered_at: string | null;
  last_interaction: string | null; total_messages: number | null; messages_last_7d: number | null;
};

const SESSION_KEY = 'periodkit_session';
export function token() { return sessionStorage.getItem(SESSION_KEY); }
export function setToken(value: string) { sessionStorage.setItem(SESSION_KEY, value); }
export function clearToken() { sessionStorage.removeItem(SESSION_KEY); }
/** Never assume that an older server response includes permissions. Fail closed. */
export function hasPermission(account: Partial<Account> | null | undefined, permission: Capability): boolean {
  return Array.isArray(account?.permissions) && account.permissions.includes(permission);
}

export class AccountContractError extends Error {
  constructor() {
    super('The reporting server returned an outdated or incomplete account profile. Apply the roles and permissions backend update, run migrations, and restart Django.');
    this.name = 'AccountContractError';
  }
}

const allowedRoles: ReadonlySet<string> = new Set(['admin', 'analyst', 'viewer']);
const allowedCapabilities: ReadonlySet<string> = new Set([
  'overview.view', 'geography.view', 'records.view', 'export.summary', 'export.records',
  'metrics.refresh', 'staff.manage', 'audit.view',
]);

/** Validate RBAC responses rather than trusting an older cached /auth/me payload. */
export function readAccount(payload: unknown): Account {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AccountContractError();
  }
  const value = payload as Record<string, unknown>;
  if (
    typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id < 1 ||
    typeof value.username !== 'string' || value.username.trim().length === 0 ||
    typeof value.role !== 'string' || !allowedRoles.has(value.role) ||
    !Array.isArray(value.permissions) || !value.permissions.every((item) => typeof item === 'string') ||
    typeof value.must_change_password !== 'boolean' ||
    typeof value.is_superuser !== 'boolean'
  ) {
    throw new AccountContractError();
  }
  const permissions = value.permissions.filter(
    (item): item is Capability => typeof item === 'string' && allowedCapabilities.has(item)
  );
  return {
    id: value.id,
    username: value.username,
    role: value.role as Role,
    permissions,
    must_change_password: value.must_change_password,
    is_superuser: value.is_superuser,
  };
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const errors = body as Record<string, unknown>;
    if (typeof errors.detail === 'string') return errors.detail;
    for (const [name, value] of Object.entries(errors)) {
      if (typeof value === 'string') return `${name}: ${value}`;
      if (Array.isArray(value) && value.length) return `${name === 'non_field_errors' ? 'Validation' : name}: ${String(value[0])}`;
    }
  }
  return `Request failed (${status})`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token()) headers.set('Authorization', `Token ${token()}`);
  const response = await fetch(`/api/${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(errorMessage(body, response.status), response.status);
  return body as T;
}

async function downloadCsv(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (token()) headers.set('Authorization', `Token ${token()}`);
  const response = await fetch(`/api/${path}`, { headers, cache: 'no-store' });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new ApiError(errorMessage(body, response.status), response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  element.href = url;
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Aggregate report, available to administrators and analysts. */
export async function downloadSummary(filters = emptyFilters()): Promise<void> {
  const query = filterQuery(filters);
  return downloadCsv('metrics/export/' + (query ? `?${query}` : ''), 'periodkit-summary.csv');
}

/** Identifiable source data. The Django endpoint enforces administrator-only access. */
export async function downloadSourceCsv(): Promise<void> {
  return downloadCsv('metrics/export/records/', 'periodkit-source-users.csv');
}

/** Selected participant records only; administrator access enforced by Django. */
export async function downloadSelectedCsv(filters: FilterValues): Promise<void> {
  const query = filterQuery(filters);
  return downloadCsv('metrics/export/selected/' + (query ? `?${query}` : ''), 'periodkit-selected-users.csv');
}
