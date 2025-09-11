// app/orders/page.js
'use client';
import { useEffect, useState } from 'react';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function OrdersPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const r = await fetch('/api/orders/jobs?open=1', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to load orders');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load orders');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold mb-3">Orders</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Job #</th>
            <th>Status</th>
            <th>Quote #</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} className="py-4 text-neutral-500">No orders yet.</td></tr>
          ) : rows.map(o => (
            <tr key={o.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>
                {o.job_number}
                <span className="ml-2 text-neutral-400">
                  {o.customer?.trim() ? `· ${o.customer}` : '· —'}
                </span>
              </td>
              <td>
                <span className={`inline-block px-2 py-0.5 rounded border ${statusBadgeCls(o.status)}`}>
                  {o.status || 'open'}
                </span>
              </td>
              <td>{o.quote_number || (o.quote_id ? `QUO-${String(o.quote_id).padStart(6, '0')}` : '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
