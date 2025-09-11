// app/quotes/page.js
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function QuotesPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const r = await fetch('/api/quotes', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to load quotes');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load quotes');
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-semibold mb-3">Quotes</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Quote #</th>
            <th>Status</th>
            <th className="w-1">Open</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} className="py-4 text-neutral-500">No quotes yet.</td></tr>
          ) : rows.map(q => (
            <tr key={q.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>
                <Link className="text-blue-600 hover:underline" href={`/quotes/${q.id}`}>
                  {q.quote_number || `QUO-${String(q.id).padStart(6,'0')}`}
                </Link>
                {/* 👇 customer next to the number */}
                <span className="ml-2 text-neutral-400">
                  {q.customer?.trim() ? `· ${q.customer}` : '· —'}
                </span>
              </td>
              {/* ✅ badge */}
              <td>
                <span className={`inline-block px-2 py-0.5 rounded border ${statusBadgeCls(q.status)}`}>
                  {q.status || 'draft'}
                </span>
              </td>
              <td>
                <Link className="px-2 py-1 border rounded" href={`/quotes/${q.id}`}>
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
