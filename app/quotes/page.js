// app/quotes/page.js
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function QuotesPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('pending'); // 'approved' | 'pending'

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

  const approvedCount = useMemo(
    () => rows.filter(q => String(q.status || '').toLowerCase() === 'approved').length,
    [rows]
  );
  const pendingCount = useMemo(
    () => rows.length - approvedCount,
    [rows, approvedCount]
  );

  const filtered = useMemo(() => {
    const isApproved = (s) => String(s || '').toLowerCase() === 'approved';
    return rows.filter(q => tab === 'approved' ? isApproved(q.status) : !isApproved(q.status));
  }, [rows, tab]);

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-semibold mb-3">Quotes</h2>
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
          onClick={() => setTab('approved')}
          className={`rounded px-3 py-1 border ${tab === 'approved' ? 'bg-white/10 border-white/30' : 'border-white/20'}`}
        >
          Approved ({approvedCount})
        </button>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Quote # (Customer)</th>
            <th>Status</th>
            <th className="w-1">Open</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-4 text-neutral-500">
                {tab === 'approved' ? 'No approved quotes yet.' : 'No pending quotes.'}
              </td>
            </tr>
          ) : filtered.map(q => (
            <tr key={q.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>
                <Link className="text-blue-600 hover:underline" href={`/quotes/${q.id}`}>
                  {q.quote_number || `QUO-${String(q.id).padStart(6,'0')}`}
                </Link>
                <span className="ml-2 text-neutral-400">
                  {q.customer?.trim() ? `— ${q.customer}` : '—'}
                </span>
              </td>
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
