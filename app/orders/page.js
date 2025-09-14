// app/orders/page.js
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function OrdersPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('pending'); // 'pending' | 'completed'

  // Make "open" red; otherwise reuse your statusBadgeCls
  const orderBadgeCls = (s) => {
    const t = String(s || '').toLowerCase();
    if (t === 'open') return 'bg-red-500/20 text-red-300 border-red-500/40';
    return statusBadgeCls(t);
  };

  async function load() {
    setErr('');
    try {
      const r = await fetch('/api/orders/jobs?limit=500', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to load orders');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load orders');
    }
  }
  useEffect(() => { load(); }, []);

  // Completed = {complete, completed, closed}; everything else = Pending
  const isCompleted = (s) => {
    const t = String(s || '').toLowerCase();
    return t === 'complete' || t === 'completed' || t === 'closed';
  };

  const completedCount = useMemo(
    () => rows.filter(o => isCompleted(o.status)).length,
    [rows]
  );
  const pendingCount = useMemo(
    () => rows.length - completedCount,
    [rows, completedCount]
  );

  const filtered = useMemo(
    () => rows.filter(o => (tab === 'completed' ? isCompleted(o.status) : !isCompleted(o.status))),
    [rows, tab]
  );

  const humanQuoteNum = (o) =>
    o?.quote_number || (o?.quote_id ? `QUO-${String(o.quote_id).padStart(6, '0')}` : '—');

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold mb-3">Orders</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`rounded px-3 py-1 border ${tab === 'pending' ? 'bg-white/10 border-white/30' : 'border-white/20'}`}
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('completed')}
          className={`rounded px-3 py-1 border ${tab === 'completed' ? 'bg-white/10 border-white/30' : 'border-white/20'}`}
        >
          Completed ({completedCount})
        </button>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Job # (Customer · Product)</th>
            <th>Status</th>
            <th>Quote #</th>
            <th className="w-1">Open</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-neutral-500">
                {tab === 'completed' ? 'No completed jobs.' : 'No pending jobs.'}
              </td>
            </tr>
          ) : filtered.map(o => (
            <tr key={o.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>
                <Link href={`/orders/${o.id}`} className="text-blue-400 hover:underline">
                  {o.job_number}
                </Link>
                {(o.customer || o.product_name) && (
                  <div className="text-xs text-neutral-400">
                    {o.customer ? o.customer : '—'}
                    {o.product_name ? ` · ${o.product_name}${Number.isFinite(Number(o.qty)) ? ` × ${o.qty}` : ''}` : ''}
                  </div>
                )}
              </td>

              <td>
                <span className={`inline-block px-2 py-0.5 rounded border ${orderBadgeCls(o.status)}`}>
                  {o.status || 'open'}
                </span>
              </td>
              <td>{humanQuoteNum(o)}</td>
              <td>
                <Link className="px-2 py-1 border rounded" href={`/orders/${o.id}`}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
