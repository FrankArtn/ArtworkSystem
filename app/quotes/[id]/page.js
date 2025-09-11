// app/quotes/[id]/page.js
'use client';
import { useEffect, useMemo, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';

export default function QuoteDetailPage({ params }) {
  const router = useRouter();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { id: rawId } = usePromise(params);
  const id = useMemo(() => Number(rawId), [rawId]);

  // ✅ NEW: local state to show success panel after deletion
  const [deleted, setDeleted] = useState(false);
  const [delMsg, setDelMsg] = useState('');

    // ✅ NEW: approval success state
  const [approved, setApproved] = useState(false);
  const [approvedMsg, setApprovedMsg] = useState('');

  // ✅ NEW: control whether PDF button shows in the success panel
  const [showPdfBtn, setShowPdfBtn] = useState(false);

  // to show job_numbers after approve
  const [createdJobs, setCreatedJobs] = useState([]); 


  // black style that blends into background (no white borders)
  const blackBare =
    "rounded px-2 py-1 bg-black text-white placeholder:text-neutral-300 focus:outline-none";

  const toNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const round2 = (n) => Math.round(n * 100) / 100;

  // local, temporary markup edits keyed by item id (string values for smooth typing)
  const [markupEdits, setMarkupEdits] = useState({}); // { [itemId]: "12.5" }

  function pctFromCostSale(cost, sale) {
    const c = toNumber(cost), s = toNumber(sale);
    if (c <= 0) return 0;
    return ((s - c) / c) * 100;
  }
  function saleFromCostPct(cost, pct) {
    const c = toNumber(cost), p = Number.isFinite(Number(pct)) ? Number(pct) : 0;
    return round2(c * (1 + p / 100));
  }

  async function load() {
    if (!Number.isFinite(id) || deleted || approved) return; // ✅ stop fetching after delete
    setErr('');
    try {
      const q = await fetch(`/api/quotes/${id}`, { cache: 'no-store' });
      const qd = await q.json();
      if (!q.ok) throw new Error(qd?.error || 'Failed to load quote');

      // ✅ If this quote is in "redo", jump straight to the editor
      if (qd?.status === 'redo') {
        router.push(`/quotes/new?quote=${id}`);
        return; // stop: don't render the review view
      }

      setQuote(qd);

      const r = await fetch(`/api/quotes/${id}/items`, { cache: 'no-store' });
      const data = await r.json();
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);

      // reset any local edits on reload
      setMarkupEdits({});
    } catch (e) {
      setErr(e.message || 'Failed to load');
    }
  }
  useEffect(() => { load(); }, [id, deleted, approved]); // ✅ watch `deleted`

  async function updateItem(itemId, patch) {
    setErr('');
    await fetch(`/api/quotes/${id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function setStatus(status) {
    setErr('');
    const r = await fetch(`/api/quotes/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(data?.error || 'Failed to update status'); return; }

    // ✅ show approval success panel for your approve action
    if (status === 'waiting_for_client_approval' || status === 'accepted' || status === 'won') {
      const msg =
        status === 'waiting_for_client_approval'
          ? 'Submitted for client approval'
          : 'Quote approved';
      setApproved(true);
      setApprovedMsg(msg);
      setShowPdfBtn(true); 
      return; // load() is skipped due to approved flag; keeps UX consistent with delete
    }

    // ✅ NEW: Redo → show the same panel but hide PDF button
    if (status === 'redo') {
      setApproved(true);
      setApprovedMsg('Sent back to redo');  // message for redo
      setShowPdfBtn(false);                 // 👈 hide PDF button on redo
      // router.push(`/quotes/new?quote=${id}`); //Push quote to new quotes page
      return;
    }

    await load();
  }

  async function deleteQuote() {
    if (!confirm('Delete this quote permanently? This cannot be undone.')) return;
    setErr(''); setDeleting(true);
    try {
      const r = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to delete quote');
      // ✅ show success panel instead of navigating away
      setDeleted(true);
      setDelMsg('Successfully deleted');
      setQuote(null);
      setItems([]);
    } catch (e) {
      setErr(e.message || 'Failed to delete quote');
    } finally {
      setDeleting(false);
    }
  }

    async function handleAccepted() {
    setErr('');
    const r = await fetch(`/api/quotes/${id}/approve`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(data?.error || 'Failed to approve'); return; }

    setApproved(true);
    setApprovedMsg('Quote accepted; jobs created');
    setShowPdfBtn(true);
    setCreatedJobs(Array.isArray(data.jobs) ? data.jobs : []);
  }

  async function handleDenied() {
    setErr('');
    const r = await fetch(`/api/quotes/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'denied' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(data?.error || 'Failed to deny'); return; }

    setApproved(true);
    setApprovedMsg('Quote denied');
    setShowPdfBtn(false);
    setCreatedJobs([]);
  }

  const total = useMemo(
    () => items.reduce((s, it) => s + toNumber(it.sale_price) * toNumber(it.qty || 1), 0),
    [items]
  );

  // ✅ Minimal success panel; keeps your formatting conventions
  if (deleted) {
    return (
      <div className="max-w-6xl">
        <h2 className="text-2xl font-semibold mb-3">Quote Review</h2>
        <p className="text-green-700 mb-4">{delMsg}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded border px-4 py-2"
            onClick={() => router.push('/quotes')}
          >
            Return to quotes list
          </button>
        </div>
      </div>
    );
  }

  // ✅ NEW: Minimal approval success panel
  if (approved) {
    return (
      <div className="max-w-6xl">
        <h2 className="text-2xl font-semibold mb-3">Quote Review</h2>
        <p className="text-green-700 mb-4">{approvedMsg || 'Successfully approved'}</p>

        {/* ✅ Show created job numbers (from /approve response) */}
        {createdJobs.length > 0 && (
          <ul className="list-disc ml-5 text-sm">
            {createdJobs.map(j => (
              <li key={j.id}>Job #{j.job_number}{j.quote_item_id ? ` (item ${j.quote_item_id})` : ''}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {showPdfBtn && (
          <a
            href={`/api/quotes/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border px-4 py-2"
          >
            Print PDF
          </a>
          )}
          <button className="rounded border px-4 py-2" onClick={() => router.push('/quotes')}>
            Back to list
          </button>
          <button
            className="rounded border px-4 py-2"
            onClick={() => { setApproved(false); load(); }} // continue editing
          >
            Continue editing
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="max-w-6xl">
      <h2 className="text-2xl font-semibold mb-3">Quote Review</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      {/* ✅ NEW: Customer at the top */}
      {quote && (
        <div className="mb-1 text-base">
          <span className="font-medium">Customer:</span>{' '}
          {quote.customer?.trim() ? quote.customer : <span className="text-neutral-500">—</span>}
        </div>
      )}

      {quote && (
        <div className="mb-4 text-sm text-neutral-600">
          Quote #: {quote.quote_number || `QUO-${String(quote.id).padStart(6,'0')}`}
          &nbsp;·&nbsp; Status:{' '}
          <span className={`inline-block px-2 py-0.5 rounded border ${statusBadgeCls(quote.status)}`}>
            {quote.status || 'draft'}
          </span>
          {/* (Optional) inline customer display instead of the separate line above:
              &nbsp;·&nbsp; Customer: <span className="font-medium">{quote.customer || '—'}</span>
          */}
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Product</th>
            <th>SKU</th>
            <th>Cost</th>
            <th>Markup %</th>
            <th>Sale price</th>
            <th>QTY</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={7} className="py-4 text-neutral-500">No items.</td></tr>
          ) : items.map(it => {
              const cost = toNumber(it.cost_price);
              const qty  = toNumber(it.qty || 1);

              // current/derived markup
              const currentPct = pctFromCostSale(cost, it.sale_price);
              const editPctStr = markupEdits[it.id];
              const effectivePct = Number.isFinite(Number(editPctStr))
                ? Number(editPctStr)
                : currentPct;

              // show “preview” sale if user has typed a new pct; otherwise, stored sale_price
              const previewSale = Number.isFinite(Number(editPctStr))
                ? saleFromCostPct(cost, editPctStr)
                : round2(toNumber(it.sale_price));

              const line = round2(previewSale * qty);

              return (
                <tr key={it.id} className="[&>td]:py-2 [&>td]:border-b">
                  {/* Product */}
                  <td>
                    <div className={`${blackBare} border border-transparent min-w-40 inline-block`}>
                      {it.product_name}
                    </div>
                  </td>

                  {/* SKU */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-center`}>
                      {it.sku || '—'}
                    </div>
                  </td>

                  {/* Cost (read-only) */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-right`}>
                      ${cost.toFixed(2)}
                    </div>
                  </td>

                  {/* Markup % (editable) */}
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="-100"
                      className={`${blackBare} w-24 text-right border border-white`}
                      value={
                        editPctStr ?? (Number.isFinite(currentPct) ? currentPct.toFixed(1) : '0.0')
                      }
                      onChange={e => setMarkupEdits(m => ({ ...m, [it.id]: e.target.value }))}
                      onBlur={async e => {
                        const v = Number(e.target.value);
                        const newSale = saleFromCostPct(cost, Number.isFinite(v) ? v : 0);
                        await updateItem(it.id, { sale_price: newSale });
                      }}
                    />
                  </td>

                  {/* Sale price (read-only, shows computed/preview) */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-right`}>
                      ${previewSale.toFixed(2)}
                    </div>
                  </td>

                  {/* QTY (read-only) */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-20 text-center`}>
                      {qty}
                    </div>
                  </td>

                  {/* Line total (read-only) */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-right`}>
                      ${line.toFixed(2)}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="text-right font-medium py-2">Total</td>
            <td className="font-semibold">${round2(total).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-5 flex flex-wrap gap-2">
        {/* a) Edit, save then approve → waiting_for_client_approval */}
        <button
          className="rounded border px-4 py-2"
          onClick={() => setStatus('waiting_for_client_approval')}
        >
          Save & Approve (wait for client)
        </button>

        {/* b) Send back to redo */}
        <button
          className="rounded border px-4 py-2"
          onClick={() => setStatus('redo')}
        >
          Send back to redo
        </button>

        {/* c) Approve & PDF (opens in new tab) */}
        <a
          href={`/api/quotes/${id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border px-4 py-2"
        >
          Print PDF
        </a>

        {/* Delete quote */}
        <button
          onClick={deleteQuote}
          disabled={deleting}
          className="rounded border px-4 py-2 disabled:opacity-60"
        >
          {deleting ? 'Deleting…' : 'Delete quote'}
        </button>

        <button className="rounded border px-4 py-2" onClick={() => router.push('/quotes')}>
          Back to list
        </button>
      </div>
        {/* ✅ SHOW THESE ONLY WHEN WAITING FOR CLIENT */}
        {quote?.status === 'waiting_for_client_approval' && (
          <div className="mt-3 flex gap-2">
            <button className="rounded border px-4 py-2" onClick={handleAccepted}>
              Accepted
            </button>
            <button className="rounded border px-4 py-2" onClick={handleDenied}>
              Denied
            </button>
          </div>
        )}
    </div>
  );
}
