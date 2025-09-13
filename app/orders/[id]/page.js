// app/orders/[id]/page.js
'use client';

import { useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';
import MaterialSelect from '@/app/components/MaterialSelect';


export default function OrderDetailPage({ params }) {
  const router = useRouter();
  const { id: rawId } = usePromise(params);
  const id = useMemo(() => Number(rawId), [rawId]);

  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');

  // Materials UI state
  const [mats, setMats] = useState([]);         // for the <select> (from /api/materials)
  const [allocs, setAllocs] = useState([]);     // this job's allocations (from /api/orders/[id]/materials)
  const [selMat, setSelMat] = useState('');
  const [matQty, setMatQty] = useState(1);
  const [matBusy, setMatBusy] = useState(false);

  // helpers for numbers / money
  const num   = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const money = (n) => num(n).toFixed(2);

  // Make "open" red for orders; otherwise reuse statusBadgeCls
  const orderBadgeCls = (s) => {
    const t = String(s || '').toLowerCase();
    if (t === 'open') return 'bg-red-500/20 text-red-300 border-red-500/40';
    return statusBadgeCls(t);
  };

  const prettyStatus = (s) => {
    const t = String(s || '').toLowerCase();
    if (t === 'in_progress') return 'WIP';
    if (t === 'complete') return 'Completed';
    return t || 'open';
  };

  async function loadOrder() {
    if (!Number.isFinite(id)) return;
    setErr('');
    try {
      const r = await fetch(`/api/orders/${id}`, { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to load order');
      setOrder(data || null);
    } catch (e) {
      setErr(e.message || 'Failed to load order');
    }
  }

  async function loadMaterialsList() {
    try {
      const r = await fetch('/api/materials', { cache: 'no-store' });
      const data = await r.json().catch(() => []);
      if (r.ok && Array.isArray(data)) setMats(data);
    } catch {}
  }

  async function loadAllocations() {
    if (!Number.isFinite(id)) return;
    try {
      const r = await fetch(`/api/orders/${id}/materials`, { cache: 'no-store' });
      const data = await r.json().catch(() => []);
      if (r.ok && Array.isArray(data)) setAllocs(data);
      else setAllocs([]);
    } catch {
      setAllocs([]);
    }
  }

  useEffect(() => { loadOrder(); }, [id]);
  useEffect(() => { loadMaterialsList(); }, []);         // for the selector
  useEffect(() => { loadAllocations(); }, [id, order?.job_number]); // refresh when job changes

  // total cost of materials for this job
  const totalAllocCost = useMemo(
    () => (Array.isArray(allocs) ? allocs.reduce((s, a) => s + num(a.unit_cost) * num(a.qty), 0) : 0),
    [allocs]
  );

  // Reusable status patcher
  const [updating, setUpdating] = useState(false);
  async function patchOrderStatus(nextStatus) {
    if (!Number.isFinite(id)) return;
    setErr('');
    setUpdating(true);
    try {
      const r = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to update status');
      setOrder(data || null);
    } catch (e) {
      setErr(e.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  // Add material to THIS job → calls your /api/materials/transfer
  async function addMaterialToJob() {
    if (!order?.job_number) { setErr('Missing job number'); return; }
    if (!selMat) { setErr('Select a material'); return; }
    const n = Number(matQty);
    if (!Number.isFinite(n) || n <= 0) { setErr('Quantity must be > 0'); return; }

    setErr('');
    setMatBusy(true);
    try {
      const r = await fetch('/api/materials/transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: selMat,
          qty: n,
          job_number: order.job_number, // tie allocation to this job
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to allocate material');

      await Promise.all([loadAllocations(), loadMaterialsList()]);
      setSelMat('');
      setMatQty(1);
    } catch (e) {
      setErr(e.message || 'Failed to allocate material');
    } finally {
      setMatBusy(false);
    }
  }

  const humanQuoteNum = (o) =>
    o?.quote_number || (o?.quote_id ? `QUO-${String(o.quote_id).padStart(6, '0')}` : '—');

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-semibold mb-3">Job Order</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      {!order ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Top summary */}
          <div className="mb-4 text-sm text-neutral-300 space-y-1">
            <div>
              <span className="font-medium">Job #:</span>{' '}
              <span>{order.job_number || `JOB-${String(order.id).padStart(6, '0')}`}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <span className={`inline-block px-2 py-0.5 rounded border ${orderBadgeCls(order.status)}`}>
                {prettyStatus(order.status)}
              </span>
            </div>

            <div>
              <span className="font-medium">Customer:</span>{' '}
              <span>{order.customer?.trim() ? order.customer : '—'}</span>
            </div>

            <div>
              <span className="font-medium">Quote:</span>{' '}
              {order.quote_id ? (
                <Link className="text-blue-400 hover:underline" href={`/quotes/${order.quote_id}`}>
                  {humanQuoteNum(order)}
                </Link>
              ) : (
                <span>—</span>
              )}
            </div>

            {/* If this order is tied to a specific quote item, show its product + qty */}
            {order.product_name ? (
              <div>
                <span className="font-medium">Product:</span>{' '}
                <span>
                  {order.product_name}
                  {order.sku ? ` (${order.sku})` : ''}
                  {Number.isFinite(Number(order.qty)) ? ` × ${order.qty}` : ''}
                </span>
              </div>
            ) : null}

            <div className="text-xs text-neutral-500 mt-2">
              {order.created_at && <>Created: {order.created_at} · </>}
              {order.updated_at && <>Updated: {order.updated_at}</>}
              {order.completed_at && <> · Completed: {order.completed_at}</>}
            </div>
          </div>

          {/* If no single product was returned but items[] exists (legacy orders), list them */}
          {!order.product_name && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="mb-5">
              <h3 className="text-lg font-semibold mb-2">Items</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="[&>td]:py-2 [&>td]:border-b">
                      <td>{it.product_name || '—'}</td>
                      <td>{it.sku || '—'}</td>
                      <td>{Number.isFinite(Number(it.qty)) ? it.qty : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== Materials used for this job ===== */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-2">Materials used for this job</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Unit cost</th>
                  <th>Line total</th>
                  <th className="w-1">When</th>
                </tr>
              </thead>
              <tbody>
                {allocs.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-neutral-500">No materials allocated yet.</td></tr>
                ) : (
                  allocs.map((a) => {
                    const unit = num(a.unit_cost);
                    const qty  = num(a.qty);
                    const line = unit * qty;
                    return (
                      <tr key={`${a.id ?? `${a.material_id}-${a.created_at ?? ''}`}`} className="[&>td]:py-2 [&>td]:border-b">
                        <td>{a.material_name || '—'}</td>
                        <td>{a.sku || '—'}</td>
                        <td>{a.unit || '—'}</td>
                        <td>{Number.isFinite(qty) ? qty : '—'}</td>
                        <td>${money(unit)}</td>
                        <td>${money(line)}</td>
                        <td className="text-xs text-neutral-500">{a.created_at || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="text-right font-medium py-2">Total cost</td>
                  <td className="font-semibold">${money(totalAllocCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>

            {/* Add material to this job */}
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="grid gap-1">
                <span className="text-sm">Material</span>
                <MaterialSelect
                items={mats}
                value={selMat}
                onChange={setSelMat}
                label="Material"
                placeholder="Search name or SKU…"
                showStock
                showUnit
                className="w-95"
                />

              </label>
              <label className="grid gap-1">
                <span className="text-sm">Qty</span>
                <input
                  type="number" min="1"
                  className="border rounded px-2 py-1 w-24"
                  value={matQty}
                  onChange={e => setMatQty(e.target.value)}
                />
              </label>
              <button
                onClick={addMaterialToJob}
                disabled={matBusy || !selMat || !order?.job_number}
                className="rounded border px-4 py-2 disabled:opacity-60"
              >
                {matBusy ? 'Adding…' : 'Add material to job'}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-wrap gap-2">
            <button
              className="rounded border px-4 py-2 disabled:opacity-60"
              disabled={updating || order?.status === 'in_progress'}
              onClick={() => patchOrderStatus('in_progress')}
            >
              {order?.status === 'in_progress' ? 'WIP' : 'Mark WIP'}
            </button>
            <button
              className="rounded border px-4 py-2 disabled:opacity-60"
              disabled={updating || order?.status === 'complete'}
              onClick={() => patchOrderStatus('complete')}
            >
              {order?.status === 'complete' ? 'Completed' : 'Mark Complete'}
            </button>

            {order.quote_id && (
              <Link className="rounded border px-4 py-2" href={`/quotes/${order.quote_id}`}>
                Open related quote
              </Link>
            )}
            <button className="rounded border px-4 py-2" onClick={() => router.push('/orders')}>
              Back to orders
            </button>
          </div>
        </>
      )}
    </div>
  );
}
