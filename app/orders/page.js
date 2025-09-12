// app/orders/page.js
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';                // 👈 make sure this is imported
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function OrdersPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const r = await fetch('/api/orders/jobs?limit=200', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to load orders');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load orders');
    }
  }
  useEffect(() => { load(); }, []);

  // open status highlighted red; reuse your badge util for others
  const orderBadge = (s) => (String(s || '').toLowerCase() === 'open'
    ? 'bg-red-500/20 text-red-300 border-red-500/40'
    : statusBadgeCls(s));

  const qNum = (o) => o.quote_number || (o.quote_id ? `QUO-${String(o.quote_id).padStart(6,'0')}` : '—');
  const jNum = (o) => o.job_number || `JOB-${String(o.id).padStart(6,'0')}`;

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold mb-3">Orders</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <table className="w-full border-collapse">
  <thead>
    <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
      {[
        <th key="job">Job # (Customer · Product)</th>,
        <th key="status">Status</th>,
        <th key="quote">Quote #</th>,
        <th key="open" className="w-1">Open</th>,
      ]}
    </tr>
  </thead>

    <tbody>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={4} className="py-4 text-neutral-500">No orders yet.</td>
        </tr>
      ) : rows.map((o) => (
        <tr key={o.id} className="[&>td]:py-2 [&>td]:border-b">
          {[
            <td key="job">
              <Link className="text-blue-400 hover:underline" href={`/orders/${o.id}`}>
                {jNum(o)}
              </Link>
              {(o.customer || o.product_name) && (
                <span className="ml-2 text-neutral-400 text-sm">
                  {o.customer ? o.customer : '—'}
                  {o.product_name ? ` · ${o.product_name}${o.sku ? ` (${o.sku})` : ''}` : ''}
                </span>
              )}
            </td>,

            <td key="status">
              <span className={`inline-block px-2 py-0.5 rounded border ${orderBadge(o.status)}`}>
                {o.status || 'open'}
              </span>
            </td>,

            <td key="quote">
              {o.quote_id ? (
                <Link className="text-blue-400 hover:underline" href={`/quotes/${o.quote_id}`}>
                  {qNum(o)}
                </Link>
              ) : '—'}
            </td>,

            <td key="open">
              <Link className="px-2 py-1 border rounded" href={`/orders/${o.id}`}>
                View
              </Link>
            </td>,
          ]}
        </tr>
      ))}
    </tbody>
  </table>

    </div>
  );
}
