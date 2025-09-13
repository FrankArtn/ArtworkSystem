'use client';
import { useMemo, useState } from 'react';

export default function MaterialSelect({
  items = [],
  value = '',
  onChange,
  label = 'Material',
  placeholder = 'Search name or SKU…',
  showStock = false,
  showCost = false,
  className = '',
}) {
  const [q, setQ] = useState('');

  const norm = (s) => String(s || '').toLowerCase();
  const filtered = useMemo(() => {
    const t = norm(q);
    let arr = Array.isArray(items) ? items : [];
    if (t) {
      arr = arr.filter(m =>
        norm(m.name).includes(t) ||
        norm(m.sku).includes(t)
      );
    }
    return arr.slice(0, 200);
  }, [items, q]);

  return (
    <div className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="border rounded px-2 py-1 w-64"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
        />
        {q && (
          <button
            type="button"
            className="px-2 py-1 border rounded text-xs"
            onClick={() => setQ('')}
            title="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      <select
        className="border rounded px-2 py-1 w-64"
        value={value}
        onChange={e => onChange?.(e.target.value)}
      >
        <option value="">{q ? 'Select a filtered result' : 'Select material'}</option>
        {filtered.map(m => (
          <option key={m.id} value={String(m.id)}>
            {m.name}
            {m.sku ? ` (${m.sku})` : ''}
            {showCost ? ` — $${Number(m.cost_price ?? 0).toFixed(2)}` : ''}
            {showStock ? ` — Unalloc ${m.unallocated_stock ?? 0}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
