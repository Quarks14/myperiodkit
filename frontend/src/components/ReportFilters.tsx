import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, Check, Filter, RotateCcw, X } from 'lucide-react';
import { emptyFilters, hasFilters, type FilterOptions, type FilterValues } from '../lib/api';

type MultiKey = 'country' | 'state' | 'age_band' | 'language';
const groups: { key: MultiKey; label: string }[] = [
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'age_band', label: 'Age band' },
  { key: 'language', label: 'Language' },
];
const defaultOptions: FilterOptions = {
  country: [], state: [], age_band: ['Under 18', '18-24', '25-34', '35+', 'Not provided'],
  language: [], onboarding: ['Completed', 'Not completed', 'Not reported'],
  recency: ['Last 7 days', '8-30 days', 'Over 30 days', 'Never'],
};

function MultiCheckbox({ label, values, options, onChange }: {
  label: string; values: string[]; options: string[]; onChange: (values: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const visible = options.filter((item) => item.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <fieldset className="report-multi">
    <legend>{label} <span>{values.length ? `(${values.length} selected)` : ''}</span></legend>
    <input aria-label={`Find ${label.toLowerCase()}`} placeholder={`Find ${label.toLowerCase()}`} value={search}
      onChange={(event) => setSearch(event.target.value)} />
    <div className="report-checklist">
      {visible.map((value) => <label key={value} className="report-check-option">
        <input type="checkbox" checked={values.includes(value)} onChange={(event) => onChange(
          event.target.checked ? [...values, value] : values.filter((item) => item !== value)
        )} />
        <span>{value}</span>
      </label>)}
      {!visible.length && <p className="report-none">No matching values in the current source.</p>}
    </div>
  </fieldset>;
}

function activeLabels(filters: FilterValues): string[] {
  const parts = groups.filter(({ key }) => filters[key].length).map(({ key, label }) =>
    `${label}: ${filters[key].length === 1 ? filters[key][0] : `${filters[key].length} selected`}`);
  if (filters.onboarding) parts.push(`Onboarding: ${filters.onboarding}`);
  if (filters.recency) parts.push(`Activity: ${filters.recency}`);
  if (filters.date_from || filters.date_to) parts.push(`${filters.date_from || 'Any date'} to ${filters.date_to || 'Today'}`);
  return parts;
}

export default function ReportFilters({ applied, options, onApply, loading }: {
  applied: FilterValues;
  options?: FilterOptions;
  onApply: (filters: FilterValues) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(applied);
  const [validation, setValidation] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const choices = options ?? defaultOptions;
  const labels = activeLabels(applied);
  useEffect(() => { if (open) setDraft(applied); }, [open, applied]);
  useEffect(() => {
    if (!open) return;
    // The dialog is portalled to <body> so Leaflet panes cannot render over it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstInput = dialogRef.current?.querySelector<HTMLInputElement>('input');
    firstInput?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setValidation('End date must be on or after start date.'); return;
    }
    setValidation('');
    onApply({ ...draft });
    setOpen(false);
  }
  const change = (key: MultiKey, values: string[]) => setDraft((prev) => ({ ...prev, [key]: values }));
  return <>
    <div className="report-filter-bar" aria-label="Report filters">
      <div className="report-filter-heading"><Filter size={17} /><strong>Filters</strong></div>
      <div className="report-active-filters" aria-live="polite">
        {labels.length ? labels.map((label) => <span className="report-filter-chip" key={label}>{label}</span>)
          : <span className="report-all-data">All available records</span>}
      </div>
      {hasFilters(applied) && <button className="report-clear-btn" type="button" disabled={loading} onClick={() => onApply(emptyFilters())}><RotateCcw size={14} /> Clear</button>}
      <button ref={triggerRef} className="btn btn-outline report-open-btn" type="button" onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open}><Filter size={16} /> Edit filters {hasFilters(applied) ? <Check size={14} /> : null}</button>
    </div>
    {open && createPortal(<div className="report-filter-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <form ref={dialogRef} className="report-filter-dialog" role="dialog" aria-modal="true" aria-label="Filter reporting records" onSubmit={apply}>
        <div className="report-dialog-head"><div><h2>Filter reporting records</h2><p>Select one or more values. All reporting pages use the same filters.</p></div>
          <button type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="report-dialog-close"><X size={20} /></button></div>
        <div className="report-dialog-scroll">
          <div className="report-filter-grid">
            {groups.map(({ key, label }) => <MultiCheckbox key={key} label={label}
              values={draft[key]} options={choices[key]} onChange={(values) => change(key, values)} />)}
          </div>
          <div className="report-filter-secondary">
            <label>Onboarding<select value={draft.onboarding} onChange={(event) => setDraft({ ...draft, onboarding: event.target.value })}>
              <option value="">All statuses</option>{choices.onboarding.map((item) => <option key={item}>{item}</option>)}
            </select></label>
            <label>Last interaction<select value={draft.recency} onChange={(event) => setDraft({ ...draft, recency: event.target.value })}>
              <option value="">Any activity</option>{choices.recency.map((item) => <option key={item}>{item}</option>)}
            </select></label>
          </div>
          <fieldset className="report-date-fieldset">
            <legend><CalendarRange size={17} /> Date range (UTC)</legend>
            <div className="report-dates">
              <label>Date type<select value={draft.date_field} onChange={(event) => setDraft({ ...draft, date_field: event.target.value as FilterValues['date_field'] })}>
                <option value="registered_at">Registration date</option>
                <option value="last_interaction">Last interaction</option>
                <option value="first_chat">First message date</option>
                <option value="last_chat">Last message date</option>
              </select></label>
              <label>From<input type="date" value={draft.date_from} onChange={(event) => setDraft({ ...draft, date_from: event.target.value })} /></label>
              <label>To<input type="date" value={draft.date_to} onChange={(event) => setDraft({ ...draft, date_to: event.target.value })} /></label>
            </div>
          </fieldset>
          <p className="report-filter-help">Country and state are derived only where the source location is recognisable. Date ranges use inclusive UTC dates. Seven-day message totals still refer to the source’s current rolling seven days for the selected users.</p>
          {validation && <p className="report-filter-error" role="alert">{validation}</p>}
        </div>
        <div className="report-filter-actions"><button type="button" className="btn btn-outline" onClick={() => { setDraft(emptyFilters()); setValidation(''); }}>Reset selections</button>
          <button className="btn btn-primary" type="submit"><Check size={16} /> Apply filters</button></div>
      </form>
    </div>, document.body)}
  </>;
}
