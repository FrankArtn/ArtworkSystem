// app/products/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CURRENCY_SYMBOL, formatMoney } from '@/lib/currency';

export default function ProductsPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [deletingId, setDeletingId] = useState(null); // NEW

  const num   = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const money = (n) => num(n).toFixed(2);

  async function load() {
    setErr('');
    try {
      const r = await fetch('/api/products', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to load products');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load products');
    }
  }
  useEffect(() => { load(); }, []);

  // NEW: delete a product
  async function handleDelete(id) {
    if (!id) return;
    if (!confirm('Delete this product? This cannot be undone.')) return;

    setErr('');
    setDeletingId(id);
    try {
      const r = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to delete product');
      await load(); // refresh list
    } catch (e) {
      setErr(e.message || 'Failed to delete product');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Products</h2>
        <Link href="/products/new" className="rounded border px-3 py-1">
          New Product
        </Link>
      </div>

      {err && <p className="text-red-600 mb-2">{err}</p>}

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>ID</th>
            <th>Name</th>
            <th>SKU</th>
            <th>Unit</th>
            <th>Base setup</th>
            <th>Cost price</th>
            <th className="w-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-4 text-neutral-500">
                No products yet.
              </td>
            </tr>
          ) : rows.map(p => (
            <tr key={p.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>{p.id}</td>
              <td>{p.name || '—'}</td>
              <td>{p.sku || '—'}</td>
              <td>{p.unit || '—'}</td>
              <td>
                {p.base_setup_cost != null ? `${CURRENCY_SYMBOL}${money(p.base_setup_cost)}` : '—'} {/* Cost shown in products database */}
              </td>
              <td>
                {p.cost_price != null ? `${CURRENCY_SYMBOL}${money(p.cost_price)}` : '—'}
              </td>
              <td>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="rounded border px-2 py-1 disabled:opacity-60"
                >
                  {deletingId === p.id ? 'Deleting…' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
