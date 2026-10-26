import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Database,
  Heart,
  LayoutDashboard,
  KeyRound,
  UserCog,
  LoaderCircle,
  LogOut,
  MapPinned,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Brand from '../components/Brand';
import LocationMap from '../components/LocationMap';
import ReportFilters from '../components/ReportFilters';
import StaffManagement from './StaffManagement';
import SyncSettings from './SyncSettings';
import {
  api, clearToken, downloadSummary, downloadSourceCsv, downloadSelectedCsv,
  emptyFilters, filterQuery, hasFilters, hasPermission,
  type Account, type Overview, type Pair, type UserRow, type FilterValues, type SyncStatus,
} from '../lib/api';

const colors = ['#c53779', '#ea85ac', '#f3afc8', '#f9d5e3', '#8c5b75', '#d56897'];
const formatNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-NG').format(value)
    : '—';
const formatMonth = (month: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

type Page = 'overview' | 'reach' | 'users' | 'access' | 'sync';

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ text = 'No records available for this view.' }: { text?: string }) {
  return (
    <div className="chart-empty">
      <span className="chart-empty-icon"><BarChart3 size={22} /></span>
      <span>{text}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number | string | null | undefined;
  description: string;
  icon: typeof Users;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-name">{label}</span>
        <span className="stat-icon"><Icon size={20} aria-hidden="true" /></span>
      </div>
      <strong>{typeof value === 'number' ? formatNumber(value) : value || '—'}</strong>
      <small>{description}</small>
    </div>
  );
}

function RegistrationChart({ data }: { data: Overview['charts']['registrations'] }) {
  if (!data.length) return <EmptyChart text="Registration dates are not available." />;
  return (
    <div className="chart" role="img" aria-label="Registration counts by month">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 12, bottom: 6, left: -19 }}>
          <defs>
            <linearGradient id="periodkit-registration-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c53779" stopOpacity={0.19} />
              <stop offset="100%" stopColor="#c53779" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f1e8ee" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#897b85' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#897b85' }} />
          <Tooltip labelFormatter={(label) => formatMonth(String(label))} />
          <Area
            type="monotone"
            dataKey="count"
            name="Registrations"
            stroke="#c53779"
            strokeWidth={2.5}
            fill="url(#periodkit-registration-fill)"
            dot={{ r: 3, fill: '#c53779', stroke: '#fff', strokeWidth: 1.5 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function OnboardingChart({ data }: { data: Pair[] }) {
  if (!data.length || data.every((item) => item.value === 0)) {
    return <EmptyChart text="Onboarding status is not available." />;
  }
  return (
    <div className="pie-layout">
      <div className="pie" role="img" aria-label="Onboarding completion breakdown">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="60%"
              outerRadius="82%"
              paddingAngle={3}
              stroke="none"
            >
              {data.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        {data.map((item, index) => (
          <div key={item.name}>
            <span className="legend-dot" style={{ backgroundColor: colors[index % colors.length] }} />
            <span className="legend-name">{item.name}</span>
            <strong>{formatNumber(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBars({ data }: { data: Pair[] }) {
  const visible = data.slice(0, 6);
  if (!visible.length) return <EmptyChart />;
  return (
    <div
      className="chart chart-horizontal"
      role="img"
      aria-label="Category counts"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visible} layout="vertical" margin={{ top: 8, right: 15, left: 0, bottom: 3 }} barCategoryGap="32%">
          <CartesianGrid stroke="#f1e8ee" strokeDasharray="3 5" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#897b85' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#71616c' }}
            tickFormatter={(value: string) => value.length > 18 ? value.slice(0, 17) + '...' : value}
          />
          <Tooltip />
          <Bar dataKey="value" name="Users" radius={[0, 5, 5, 0]} maxBarSize={18}>
            {visible.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SourceNotice({ error, hasExistingData, onRetry, loading }: {
  error: string;
  hasExistingData: boolean;
  onRetry: () => void;
  loading: boolean;
}) {
  return (
    <section className="source-notice" role="status" aria-live="polite">
      <div className="notice-icon"><WifiOff size={20} aria-hidden="true" /></div>
      <div className="notice-body">
        <h2>{hasExistingData ? 'Unable to refresh source data' : 'Metrics source currently unavailable'}</h2>
        <p>
          {hasExistingData
            ? 'Previously retrieved data is still shown below. New information could not be loaded.'
            : 'The reporting portal is available, but the external metrics service cannot be reached. Your charts and figures will populate once the connection is restored.'}
        </p>
        <details className="notice-technical"><summary>Connection details</summary><small>{error}</small></details>
      </div>
      <button className="btn btn-outline notice-retry" onClick={onRetry} disabled={loading}>
        <RefreshCw size={15} className={loading ? 'spin' : ''} /> Retry
      </button>
    </section>
  );
}

function OverviewContent({ data }: { data: Overview | null }) {
  const [chartGroup, setChartGroup] = useState<'activity' | 'audience'>('activity');
  const summary = data?.summary;
  const derived = data?.derived;
  const charts = data?.charts;

  return (
    <div className="overview-layout">
      <div className="stats" aria-label="Programme summary metrics">
        <MetricCard label="Registered users" value={summary?.registered} description="Total registrations" icon={Users} />
        <MetricCard
          label="Onboarded"
          value={summary?.onboarded}
          description={data && derived?.onboarding_rate != null ? `${formatNumber(derived.onboarding_rate)}% of registrations` : 'Awaiting source data'}
          icon={UserRoundCheck}
        />
        <MetricCard label="Active in last 7 days" value={summary?.active_last_7d} description={data?.filters?.active ? 'From selected records with recent interaction' : 'Source-reported recent activity'} icon={Activity} />
        <MetricCard label="Messages (last 7 days)" value={derived?.messages_last_7d} description="Rolling 7-day messages for selected users" icon={BarChart3} />
      </div>

      <div className="section-title overview-section-heading">
        <h2>Participation &amp; engagement</h2>
        <div className="chart-tabs" role="group" aria-label="Chart categories">
          <button type="button" aria-pressed={chartGroup === 'activity'} className={chartGroup === 'activity' ? 'active' : ''} onClick={() => setChartGroup('activity')}>Activity</button>
          <button type="button" aria-pressed={chartGroup === 'audience'} className={chartGroup === 'audience' ? 'active' : ''} onClick={() => setChartGroup('audience')}>Audience</button>
        </div>
      </div>
      <div className="two-col overview-panels">
        {chartGroup === 'activity' ? (
          <>
            <ChartCard title="Registrations over time" subtitle="Monthly registration trends">
              <RegistrationChart data={charts?.registrations ?? []} />
            </ChartCard>
            <ChartCard title="Onboarding progress" subtitle="Onboarding status">
              <OnboardingChart data={charts?.onboarding ?? []} />
            </ChartCard>
          </>
        ) : (
          <>
            <ChartCard title="Users by location" subtitle="Top reported locations">
              <CategoryBars data={charts?.locations ?? []} />
            </ChartCard>
            <ChartCard title="Preferred languages" subtitle="Language distribution">
              <CategoryBars data={charts?.languages ?? []} />
            </ChartCard>
          </>
        )}
      </div>

      <div className="mini-stats" aria-label="Additional engagement statistics">
        <div><BarChart3 size={20} /><span>Total reported messages<strong>{formatNumber(derived?.total_messages)}</strong></span></div>
        <div>
          <ClipboardList size={20} />
          <span>Mean reported response time<strong>{derived?.avg_response_ms == null ? '—' : `${formatNumber(derived.avg_response_ms)} ms`}</strong></span>
        </div>
        <div><Users size={20} /><span>User records returned<strong>{formatNumber(derived?.user_rows)}</strong></span></div>
      </div>
    </div>
  );
}


function EngagementReachContent({ data }: { data: Overview | null }) {
  const [view, setView] = useState<'map' | 'activity' | 'audience'>('map');
  const [geoList, setGeoList] = useState<'states' | 'locations'>('states');
  const derived = data?.derived;
  const charts = data?.charts;
  const locations = charts?.locations ?? [];
  const states = charts?.states ?? [];
  const selected = data?.filters?.active;
  const percent = (value: number | null | undefined) => value == null ? '—' : `${value}%`;
  return (
    <div className="overview-layout engagement-layout reach-workspace">
      <div className="stats" aria-label="Engagement and reach indicators">
        <MetricCard label="Users in report" value={data?.filters?.matched_records} description="Matching participant records" icon={Users} />
        <MetricCard label="Messages in last 7 days" value={derived?.messages_last_7d} description="Rolling total for selected records" icon={BarChart3} />
        <MetricCard label="Active user rate" value={percent(derived?.active_rate)} description={selected ? 'From selected interaction timestamps' : 'Source active / registered'} icon={Activity} />
        <MetricCard label="Known state locations" value={derived?.states_reported} description="Records mapped to a Nigerian state or FCT" icon={MapPinned} />
      </div>
      <div className="section-title overview-section-heading reach-section-heading">
        <h2>Engagement and geographic distribution</h2>
        <div className="chart-tabs" role="group" aria-label="Engagement and geography views">
          <button type="button" aria-pressed={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>Map &amp; locations</button>
          <button type="button" aria-pressed={view === 'activity'} className={view === 'activity' ? 'active' : ''} onClick={() => setView('activity')}>Engagement</button>
          <button type="button" aria-pressed={view === 'audience'} className={view === 'audience' ? 'active' : ''} onClick={() => setView('audience')}>Audience</button>
        </div>
      </div>
      {view === 'map' ? <div className="map-grid reach-panels">
        <ChartCard title="Reported location map" subtitle="Approximate city centres and recognised state locations in Nigeria">
          {locations.length ? <LocationMap items={locations} /> : <EmptyChart text="Location data is not available for this selection." />}
        </ChartCard>
        <ChartCard title="Geographic distribution" subtitle="Compare recognised states or source-reported location values">
          <div className="chart-tabs distribution-tabs" role="group" aria-label="Location breakdown">
            <button type="button" className={geoList === 'states' ? 'active' : ''} aria-pressed={geoList === 'states'} onClick={() => setGeoList('states')}>States</button>
            <button type="button" className={geoList === 'locations' ? 'active' : ''} aria-pressed={geoList === 'locations'} onClick={() => setGeoList('locations')}>Locations</button>
          </div>
          {(geoList === 'states' ? states : locations).length ? <div className="location-list">
            {(geoList === 'states' ? states : locations).map((item) => <div key={item.name}><span>{item.name}</span><strong>{formatNumber(item.value)}</strong></div>)}
          </div> : <EmptyChart text="No geographic values are available." />}
        </ChartCard>
      </div> : <div className="two-col overview-panels reach-panels">
        {view === 'activity' ? <>
          <ChartCard title="Lifetime messages per user" subtitle="Participant counts within each message-volume band">
            <CategoryBars data={charts?.message_bands ?? []} />
          </ChartCard>
          <ChartCard title="Last reported interaction" subtitle="Recency calculated from available timestamps">
            <CategoryBars data={charts?.interaction_recency ?? []} />
          </ChartCard>
        </> : <>
          <ChartCard title="Age groups" subtitle={derived?.mean_age != null ? `Mean reported age: ${derived.mean_age} years` : 'Available participant age bands'}>
            <CategoryBars data={charts?.ages ?? []} />
          </ChartCard>
          <ChartCard title="Reported response times" subtitle="Breakdown of available per-user mean response times">
            <CategoryBars data={charts?.response_bands ?? []} />
          </ChartCard>
        </>}
      </div>}
      <div className="mini-stats reach-mini" aria-label="Additional reporting indicators">
        <div><BarChart3 size={20} /><span>Lifetime messages<strong>{formatNumber(derived?.total_messages)}</strong></span></div>
        <div><Activity size={20} /><span>Mean reported response time<strong>{derived?.avg_response_ms == null ? '—' : `${formatNumber(derived.avg_response_ms)} ms`}</strong></span></div>
        <div><Users size={20} /><span>Ages reported<strong>{formatNumber(derived?.age_reported)} / {formatNumber(derived?.user_rows)}</strong></span></div>
      </div>
      <p className="fine-print reach-note">Map markers represent approximate place centres, not precise user locations. Country and state are inferred only where recognisable. The seven-day message indicator is based on the source's current rolling period and is not a historical daily series.</p>
    </div>
  );
}

function UserRecords({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: UserRow[] | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('messages');
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const result = (rows ?? []).filter((user) => {
      const matchTerm = !term || [user.name, user.location, user.phone_number, user.preferred_language]
        .some((value) => (value ?? '').toLocaleLowerCase().includes(term));
      const matchStatus = status === 'all' || (status === 'completed' ? user.onboarding_completed : !user.onboarding_completed);
      return matchTerm && matchStatus;
    });
    return result.sort((a, b) => {
      if (sort === 'name') return (a.name ?? '').localeCompare(b.name ?? '');
      if (sort === 'recent') return (b.last_interaction ?? '').localeCompare(a.last_interaction ?? '');
      return (b.total_messages ?? 0) - (a.total_messages ?? 0);
    });
  }, [rows, search, status, sort]);
  useEffect(() => { setPage(1); }, [rows, search, status, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const shown = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="panel records-panel">
      <div className="panel-heading records-heading">
        <div>
          <h3>Individual user metrics</h3>
          <p>Administrator-only records matching the shared filters. Downloads may include personal information.</p>
        </div>
        <div className="search-box">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search records by name, location, phone or language"
            className="search" placeholder="Search records" value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="records-filters" aria-label="User record filters">
        <label>Onboarding
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Not completed</option>
          </select>
        </label>
        <label>Sort
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="messages">Most messages</option>
            <option value="recent">Latest interaction</option>
            <option value="name">Name A-Z</option>
          </select>
        </label>
      </div>
      {error && <div className="inline-error" role="alert"><AlertCircle size={17} /> {error}<button type="button" onClick={onRetry}>Retry</button></div>}
      {loading && !rows ? (
        <div className="records-empty"><LoaderCircle className="spin" size={22} /> Loading user records...</div>
      ) : !rows ? (
        <div className="records-empty"><Database size={24} /> User records are not available.</div>
      ) : (
        <>
          <div className="table-scroll" role="region" aria-label="User records table" tabIndex={0}>
            <table>
              <thead><tr>
                <th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Location</th><th scope="col">Country</th><th scope="col">State</th>
                <th scope="col">Age</th><th scope="col">Age band</th><th scope="col">Onboarded</th><th scope="col">Messages</th>
                <th scope="col">Messages (7d)</th><th scope="col">Registered</th><th scope="col">Last interaction</th>
              </tr></thead>
              <tbody>{shown.map((user, index) => (
                <tr key={`${user.phone_number ?? user.name ?? 'user'}-${index}`}>
                  <td>{user.name || 'Not provided'}</td>
                  <td>{user.phone_number || '—'}</td>
                  <td>{user.location || '—'}</td>
                  <td>{user.country}</td><td>{user.state}</td>
                  <td>{user.age ?? '—'}</td><td>{user.age_band}</td>
                  <td><span className={user.onboarding_completed === true ? 'status-pill success' : 'status-pill muted'}>{user.onboarding_completed === true ? 'Completed' : user.onboarding_completed === false ? 'Pending' : 'Not reported'}</span></td>
                  <td>{formatNumber(user.total_messages)}</td>
                  <td>{formatNumber(user.messages_last_7d)}</td>
                  <td>{user.registered_at ? new Date(user.registered_at).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '—'}</td>
                  <td>{user.last_interaction ? new Date(user.last_interaction).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="empty-search">No records match your filters.</p>}
          <div className="records-pagination">
            <span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filtered.length)}` : '0'} of {filtered.length} matching records</span>
            <div>
              <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <span>Page {currentPage} of {totalPages}</span>
              <button type="button" aria-label="Next page" disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function Dashboard({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState('');
  const [rowsError, setRowsError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [page, setPage] = useState<Page>('overview');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [filters, setFilters] = useState<FilterValues>(emptyFilters);
  const query = useMemo(() => filterQuery(filters), [filters]);
  const loadRequest = useRef(0);
  const rowsRequest = useRef(0);
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (force = false, quiet = false) => {
    const id = ++loadRequest.current;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const path = 'metrics/overview/' + (query || force ? `?${query}${query && force ? '&' : ''}${force ? 'refresh=1' : ''}` : '');
      const response = await api<Overview>(path);
      if (!response?.filters?.options || !Array.isArray(response.filters.options.country)) {
        throw new Error('The reporting backend has not been updated to v0.3.4. Apply the ZIP patch and restart Django before using filters.');
      }
      if (id === loadRequest.current) setData(response);
    } catch (reason) {
      if (id === loadRequest.current) setError((reason as Error).message || 'Unable to connect to the metrics service.');
    } finally {
      if (id === loadRequest.current && !quiet) setLoading(false);
    }
  }, [query]);

  const loadUsers = useCallback(async () => {
    const id = ++rowsRequest.current;
    setLoadingRows(true);
    setRowsError('');
    try {
      const response = await api<{ users: UserRow[]; filters?: { applied: FilterValues } }>('metrics/users/' + (query ? `?${query}` : ''));
      if (!Array.isArray(response.users) || !response.filters?.applied) {
        throw new Error('The reporting backend must be updated to v0.3.4 to support record filters.');
      }
      if (id === rowsRequest.current) setRows(response.users);
    } catch (reason) {
      if (id === rowsRequest.current) setRowsError((reason as Error).message || 'Unable to retrieve user records.');
    } finally {
      if (id === rowsRequest.current) setLoadingRows(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    async function checkStatus() {
      try {
        const result = await api<SyncStatus>('metrics/sync/status/');
        if (active) setSyncStatus(result);
      } catch { /* Keep reporting usable if scheduler status is briefly unavailable. */ }
    }
    void checkStatus();
    const timer = window.setInterval(() => { if (!document.hidden) void checkStatus(); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  // The cron job writes to the database, not this browser. Poll saved reports
  // periodically so the screen reflects completed background syncs.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && (page === 'overview' || page === 'reach' || page === 'users')) {
        void load(false, true);
        if (page === 'users' && hasPermission(account, 'records.view')) void loadUsers();
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [account, load, loadUsers, page]);
  useEffect(() => {
    if (page === 'users' && hasPermission(account, 'records.view')) void loadUsers();
  }, [page, account, loadUsers]);

  const applyFilters = (next: FilterValues) => {
    if (filterQuery(next) === query) return;
    // Invalidate old in-flight calls to avoid stale cohort data on screen.
    loadRequest.current += 1;
    rowsRequest.current += 1;
    setData(null);
    setRows(null);
    setFilters(next);
    setExportError('');
  };

  useEffect(() => {
    if (!menu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menu]);

  const pageLabel = page === 'overview' ? 'Overview' : page === 'reach' ? 'Engagement & reach' : page === 'users' ? 'User records' : page === 'sync' ? 'Data collection' : 'Staff & permissions';

  function goToPage(next: Page) {
    setPage(next);
    setExportError('');
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function signOut() {
    try { await api('auth/logout/', { method: 'POST' }); } catch { /* Revoke local access even when offline. */ }
    clearToken();
    onLogout();
    navigate('/login', { replace: true });
  }

  async function exportReport(kind: 'summary' | 'source' | 'selected') {
    setExportError('');
    setExportBusy(true);
    try {
      if (kind === 'source') {
        if (hasFilters(filters) && !window.confirm('The full source CSV ignores your current filters and includes all source records. Continue?')) return;
        await downloadSourceCsv();
      } else if (kind === 'selected') await downloadSelectedCsv(filters);
      else await downloadSummary(filters);
    } catch (reason) {
      setExportError((reason as Error).message || 'Unable to export report.');
    } finally {
      setExportBusy(false);
    }
  }

  function refresh() {
    void load(hasPermission(account, 'metrics.refresh'));
    if (page === 'users' && hasPermission(account, 'records.view')) void loadUsers();
  }

  return (
    <div className="app-layout">
      <aside id="workspace-nav" className={`sidebar ${menu ? 'show' : ''}`} aria-label="Workspace navigation">
        <div className="sidebar-brand"><Brand /></div>
        <div className="sidebar-main">
          <span className="sidebar-label">WORKSPACE</span>
          <nav aria-label="Reports">
            <button className={`nav-item ${page === 'overview' ? 'selected' : ''}`} aria-current={page === 'overview' ? 'page' : undefined} onClick={() => goToPage('overview')}>
              <LayoutDashboard size={18} /> Overview
            </button>
            <button className={`nav-item ${page === 'reach' ? 'selected' : ''}`} aria-current={page === 'reach' ? 'page' : undefined} onClick={() => goToPage('reach')}>
              <MapPinned size={18} /> Engagement &amp; reach
            </button>
            {hasPermission(account, 'records.view') && (
              <button className={`nav-item ${page === 'users' ? 'selected' : ''}`} aria-current={page === 'users' ? 'page' : undefined} onClick={() => goToPage('users')}>
                <Users size={18} /> User records
              </button>
            )}
            {hasPermission(account, 'sync.manage') && (
              <button className={`nav-item ${page === 'sync' ? 'selected' : ''}`} aria-current={page === 'sync' ? 'page' : undefined} onClick={() => goToPage('sync')}>
                <Clock3 size={18} /> Data collection
              </button>
            )}
            {hasPermission(account, 'staff.manage') && (
              <button className={`nav-item ${page === 'access' ? 'selected' : ''}`} aria-current={page === 'access' ? 'page' : undefined} onClick={() => goToPage('access')}>
                <UserCog size={18} /> Staff &amp; permissions
              </button>
            )}
          </nav>
        </div>
        <div className="sidebar-end">
          <a href="https://myperiodkit.org/" target="_blank" rel="noopener noreferrer" className="nav-item">
            <Heart size={18} /> Project website <ArrowUpRight size={15} />
          </a>
          <div className="profile">
            <span className="avatar"><CircleUserRound size={22} /></span>
            <span className="profile-text"><strong>{account.username}</strong><small>{account.role}</small></span>
          </div>
          <button className="nav-item" onClick={() => navigate('/change-password')}><KeyRound size={18} /> Change password</button>
          <button className="nav-item signout" onClick={() => void signOut()}><LogOut size={18} /> Sign out</button>
        </div>
      </aside>
      {menu && <button className="backdrop" aria-label="Close navigation menu" onClick={() => setMenu(false)} />}

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="mobile-menu"
              type="button"
              onClick={() => setMenu((current) => !current)}
              aria-label={menu ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menu}
              aria-controls="workspace-nav"
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
            <div className="breadcrumb"><span>My Period Kit</span><ChevronRight size={14} /><strong>{pageLabel}</strong></div>
          </div>
          <div className="topbar-end">
            {page !== 'access' && page !== 'sync' && <span className={`connection-pill ${error ? 'is-offline' : data ? 'is-online' : ''}`}>
              {error ? <AlertCircle size={14} /> : data ? <CheckCircle2 size={14} /> : <LoaderCircle size={14} className="spin" />}
              <span>{error ? 'Source unavailable' : data ? (syncStatus?.last_error ? 'Saved data' : 'Data loaded') : 'Connecting'}</span>
            </span>}
            <span className="top-user"><ShieldCheck size={16} /> {account.role} access</span>
          </div>
        </header>

        <main className={`dashboard-content ${page === 'access' ? 'access-page-shell' : ''}`} id="main-content">
          <div className="dash-head">
            <div className="dash-title">
              <h1>{page === 'overview' ? 'Insights overview' : pageLabel}</h1>
            </div>
            <div className="head-actions">
              {(page === 'overview' || page === 'reach') && hasPermission(account, 'export.summary') && (
                <button className="btn btn-outline" onClick={() => void exportReport('summary')} disabled={!data || exportBusy}>
                  <ArrowDownToLine size={16} /> <span>{hasFilters(filters) ? 'Export filtered summary' : 'Export summary'}</span>
                </button>
              )}
              {page === 'users' && hasPermission(account, 'export.records') && <>
                <button className="btn btn-outline" title="Download only records matching your applied filters" onClick={() => void exportReport('selected')} disabled={exportBusy || loadingRows}>
                  <ArrowDownToLine size={16} /> <span>{exportBusy ? 'Downloading...' : 'Export selected CSV'}</span>
                </button>
                <button className="btn btn-outline" title="The complete source CSV is unfiltered and may contain additional personal information" onClick={() => void exportReport('source')} disabled={exportBusy}>
                  <ArrowDownToLine size={16} /> <span>Full source CSV</span>
                </button>
              </>}
              {page !== 'access' && page !== 'sync' && <button className="btn btn-primary" onClick={refresh} disabled={loading || loadingRows}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} /> <span>Refresh</span>
              </button>}
            </div>
          </div>

          {page !== 'access' && page !== 'sync' && <ReportFilters applied={filters} options={data?.filters?.options}
            onApply={applyFilters} loading={loading || loadingRows} />}
          {page !== 'access' && page !== 'sync' && <div className="data-meta" aria-live="polite">
            <CalendarDays size={15} />
            {data
              ? <span>Last loaded {new Date(data.updated_at).toLocaleString('en-GB')}
                  <span className="data-meta-detail"> · {data.filters?.active
                    ? `${formatNumber(data.filters?.matched_records)} of ${formatNumber(data.filters?.total_source_records)} supplied records. Filtered counts are record-based.`
                    : 'Full source summary'} · Saved on server</span>
                </span>
              : <span>{loading ? 'Connecting to programme metrics...' : 'Awaiting live programme data'}</span>}
          </div>}

          {exportError && <div className="inline-error" role="alert"><AlertCircle size={17} /> {exportError}</div>}
          {page !== 'access' && page !== 'sync' && error && <SourceNotice error={error} hasExistingData={!!data} onRetry={() => void load()} loading={loading} />}
          {page === 'overview' && <OverviewContent data={data} />}
          {page === 'reach' && <EngagementReachContent data={data} />}
          {page === 'users' && hasPermission(account, 'records.view') && (
            <UserRecords rows={rows} loading={loadingRows} error={rowsError} onRetry={() => void loadUsers()} />
          )}

          {page === 'access' && hasPermission(account, 'staff.manage') && <StaffManagement account={account} />}
          {page === 'sync' && hasPermission(account, 'sync.manage') && <SyncSettings onSynced={() => { void load(); }} />}

          <footer className="dash-footer">
            <span>My Period Kit Insights / Internal reporting portal</span>
            <span>Responsible programme monitoring</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
