// app/orders/[id]/page.js
'use client';

import { useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function OrderDetailPage({ params }) {
  const router = useRouter();
  const { id: rawId } = usePromise(params);
  const id = useMemo(() => Number(rawId), [rawId]);

  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');

  // Make "open" red for orders; otherwise reuse statusBadgeCls
  const orderBadgeCls = (s) => {
    const t = String(s || '').toLowerCase();
    if (t === 'open') return 'bg-red-500/20 text-red-300 border-red-500/40';
    return statusBadgeCls(t);
  };

  async function load() {
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

  useEffect(() => { load(); }, [id]);

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
                {order.status || 'open'}
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

          {/* Actions */}
          <div className="mt-5 flex flex-wrap gap-2">
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
