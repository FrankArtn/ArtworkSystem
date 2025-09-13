// app/components/MaterialSelect.js
'use client';
import { useMemo, useRef, useState } from 'react';

export default function MaterialSelect({
  items = [],
  value,                // selected material id (string or number)
  onChange,             // fn(nextId)
  label = 'Material',
  placeholder = 'Search name or SKU…',
  showStock = false,
  showUnit = false,
  className = ''
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Normalize to string for comparisons
  const valStr = value == null ? '' : String(value);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(m => {
      const name = String(m.name ?? '').toLowerCase();
      const sku  = String(m.sku ?? '').toLowerCase();
      const unit = String(m.unit ?? '').toLowerCase();
      return name.includes(t) || sku.includes(t) || unit.includes(t);
    });
  }, [items, q]);

  const selected = useMemo(
    () => items.find(m => String(m.id) === valStr),
    [items, valStr]
  );

  function formatRow(m) {
    const head = [m.name, m.sku ? `(${m.sku})` : null].filter(Boolean).join(' ');
    const tailBits = [];
    if (showUnit && m.unit) tailBits.push(m.unit);
    if (showStock) tailBits.push(`Unalloc ${m.unallocated_stock ?? 0}`);
    const tail = tailBits.length ? ` — ${tailBits.join(' · ')}` : '';
    return head + tail;
  }

  function pick(m) {
    onChange?.(String(m.id));
    setQ('');
    setOpen(false);
  }

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      {label && <div className="text-sm mb-1">{label}</div>}

      {/* Display selected label if any, otherwise the query */}
      <input
        type="text"
        className="border rounded px-2 py-1 w-full bg-black text-white border-neutral-700"
        placeholder={placeholder}
        value={q || (selected ? formatRow(selected) : '')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)} // allow click
      />

      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-neutral-700 bg-black text-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-neutral-400">No materials</div>
          ) : (
            filtered.map(m => {
              const isSel = String(m.id) === valStr;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`block w-full text-left px-3 py-2 hover:bg-white/10 ${isSel ? 'bg-white/5' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  title={formatRow(m)}
                >
                  <div className="font-medium">{m.name} {m.sku ? <span className="text-neutral-400">({m.sku})</span> : null}</div>
                  <div className="text-xs text-neutral-400">
                    {showUnit && m.unit ? <span>{m.unit}</span> : null}
                    {showUnit && showStock && m.unit ? <span> · </span> : null}
                    {showStock ? <span>Unalloc {m.unallocated_stock ?? 0}</span> : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
