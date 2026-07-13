// Shared date-range filter: two date inputs (start/end) plus an optional
// adjacent control (e.g. a "which date field" <select>). Emits ISO YYYY-MM-DD.
//
// Props:
//   start, end   current values (YYYY-MM-DD)
//   onChange     (key, value) => void  where key is 'start' | 'end'
//   label        optional group label (default "Date range")
//   extra        optional React node rendered before the date inputs
export default function DateRangeFilter({ start, end, onChange, label = 'Date range', extra = null }) {
  return (
    <>
      {extra}
      <div>
        <label>{label} — from</label>
        <input type="date" value={start || ''} max={end || undefined} onChange={(e) => onChange('start', e.target.value)} />
      </div>
      <div>
        <label>to</label>
        <input type="date" value={end || ''} min={start || undefined} onChange={(e) => onChange('end', e.target.value)} />
      </div>
    </>
  );
}
