// app/quotes/[id]/page.js
// app/quotes/[id]/page.js
'use client';
import { useEffect, useMemo, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';
import Link from 'next/link';

export default function QuoteDetailPage({ params }) {
  const router = useRouter();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { id: rawId } = usePromise(params);
  const id = useMemo(() => Number(rawId), [rawId]);
  const isWaitingForClient = String(quote?.status || '').toLowerCase() === 'waiting_for_client_approval';
  const isApproved = String(quote?.status || '').toLowerCase() === 'approved';
  const isComplete = useMemo(() => {
    const s = String(quote?.status || '').toLowerCase();
    return s === 'complete' || s === 'completed' || s === 'won' || s === 'closed';
  }, [quote?.status]);

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

  //Compute whether to show jobs column
  const showJobsCol = useMemo(() => {
    const st = String(quote?.status || '').toLowerCase();
    const finished = ['approved', 'accepted', 'won', 'complete', 'completed'].includes(st);
    return finished || items.some(it => it.job_number);
  }, [quote?.status, items]);

  // NEW: transportation cost (quote-level)
  const [transportationCost, setTransportationCost] = useState('0');

  const blackBare =
    "rounded px-2 py-1 bg-black text-white placeholder:text-neutral-300 focus:outline-none";

  const toNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const round2 = (n) => Math.round(n * 100) / 100;

  // local, temporary markup edits keyed by item id (string values for smooth typing)
  const [markupEdits, setMarkupEdits] = useState({}); // { [itemId]: "12.5" }

  const jobBadgeCls = (s) => {
    const t = String(s || '').toLowerCase();
    if (t === 'open') return 'bg-red-500/20 text-red-300 border-red-500/40';
    return statusBadgeCls(t);
  };

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
    if (!Number.isFinite(id) || deleted || approved) return;
    setErr('');
    try {
      const q = await fetch(`/api/quotes/${id}`, { cache: 'no-store' });
      const qd = await q.json();
      if (!q.ok) throw new Error(qd?.error || 'Failed to load quote');

      if (qd?.status === 'redo') {
        router.push(`/quotes/new?quote=${id}`);
        return;
      }

      setQuote(qd);
      // NEW: preload transportation cost
      setTransportationCost(String(toNumber(qd?.transportation_cost ?? 0)));

      const r = await fetch(`/api/quotes/${id}/items`, { cache: 'no-store' });
      const data = await r.json();
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      setMarkupEdits({});
    } catch (e) {
      setErr(e.message || 'Failed to load');
    }
  }
  useEffect(() => { load(); }, [id, deleted, approved]);

  async function updateItem(itemId, patch) {
    setErr('');
    await fetch(`/api/quotes/${id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
  }

  // NEW: persist transportation cost
  async function saveTransportationCost(v) {
    const amount = round2(toNumber(v));
    try {
      const r = await fetch(`/api/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transportation_cost: amount }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to save transportation cost');
      setQuote(prev => prev ? { ...prev, transportation_cost: amount } : prev);
      setTransportationCost(String(amount));
    } catch (e) {
      setErr(e.message || 'Failed to save transportation cost');
    }
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

    if (status === 'waiting_for_client_approval' || status === 'accepted' || status === 'won') {
      const msg =
        status === 'waiting_for_client_approval'
          ? 'Submitted for client approval'
          : 'Quote approved';
      setApproved(true);
      setApprovedMsg(msg);
      setShowPdfBtn(true);
      return;
    }

    if (status === 'redo') {
      setApproved(true);
      setApprovedMsg('Sent back to redo');
      setShowPdfBtn(false);
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

  // ✅ NEW: helper — billable units (area if L×W>0 or area_sqm>0; else length_m; else 1)
  const billableUnits = (it) => {
    const L = toNumber(it.length_m);
    const W = toNumber(it.width_m);
    const area = toNumber(it.area_sqm);
    const computedArea = L > 0 && W > 0 ? round2(L * W) : 0;
    if ((area || 0) > 0) return round2(area);
    if (computedArea > 0) return computedArea;
    if (toNumber(it.length_m) > 0) return round2(toNumber(it.length_m));
    return 1;
  };

  // Subtotal = items only (qty × billable units × sale_price)
  const subtotal = useMemo(
    () => items.reduce((s, it) => {
      const sale = toNumber(it.sale_price);
      const qty  = Math.max(1, toNumber(it.qty || 1));
      const units = billableUnits(it);
      return s + sale * qty * (units || 1);
    }, 0),
    [items]
  );

  // NEW: grand total includes transportation cost
  const grandTotal = useMemo(
    () => round2(subtotal + toNumber(transportationCost)),
    [subtotal, transportationCost]
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
            onClick={() => { setApproved(false); load(); }}
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

      {/* Customer */}
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
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Product</th>
            {/* ✅ NEW next to product */}
            <th>Length (m)</th>
            <th>Width (m)</th>
            <th>Total sqm</th>
            <th>SKU</th>
            <th>Job # / Status</th>
            <th>Cost/Unit</th>
            <th>Markup %</th>
            <th>Sale price/Unit</th>
            <th>QTY</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              {/* 11 columns when job col present; 10 when not — use showJobsCol */}
              <td colSpan={showJobsCol ? 11 : 10} className="py-4 text-neutral-500">No items.</td>
            </tr>
          ) : items.map(it => {
              const cost = toNumber(it.cost_price);
              const qty  = Math.max(1, toNumber(it.qty || 1));
              const L = toNumber(it.length_m);
              const W = toNumber(it.width_m);
              const explicitArea = toNumber(it.area_sqm);
              const area = explicitArea > 0 ? explicitArea : (L > 0 && W > 0 ? round2(L * W) : 0);

              // current/derived markup
              const currentPct = pctFromCostSale(cost, it.sale_price);
              const editPctStr = markupEdits[it.id];
              const effectivePct = Number.isFinite(Number(editPctStr))
                ? Number(editPctStr)
                : currentPct;

              const previewSale = Number.isFinite(Number(editPctStr))
                ? saleFromCostPct(cost, effectivePct)
                : round2(toNumber(it.sale_price));

              // ✅ CHANGED: line total multiplies by billable units (area or length or 1)
              const units = area > 0 ? area : (L > 0 ? L : 1);
              const line = round2(previewSale * qty * (units || 1));

              return (
                <tr key={it.id} className="[&>td]:py-2 [&>td]:border-b">
                  {/* Product */}
                  <td>
                    <div className={`${blackBare} border border-transparent min-w-40 inline-block`}>
                      {it.product_name}
                    </div>
                  </td>

                  {/* ✅ NEW: Length */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-24 text-right`}>
                      {L > 0 ? L : '—'}
                    </div>
                  </td>

                  {/* ✅ NEW: Width */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-24 text-right`}>
                      {W > 0 ? W : '—'}
                    </div>
                  </td>

                  {/* ✅ NEW: Total sqm (L×W) */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-right`}>
                      {area > 0 ? `${area} sqm` : '—'}
                    </div>
                  </td>

                  {/* SKU */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-center`}>
                      {it.sku || '—'}
                    </div>
                  </td>

                  {/* Job # / Status */}
                  {showJobsCol && (
                    <td>
                      {it.order_id ? (
                        <>
                          <Link className="text-blue-400 hover:underline" href={`/orders/${it.order_id}`}>
                            {it.job_number || `JOB-${String(it.order_id).padStart(6,'0')}`}
                          </Link>
                          {it.job_status && (
                            <span className={`ml-2 inline-block px-2 py-0.5 rounded border ${statusBadgeCls(it.job_status)}`}>
                              {it.job_status}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                  )}

                  {/* Cost (read-only) */}
                  <td>
                    <div className={`${blackBare} border border-transparent w-28 text-right`}>
                      ${cost.toFixed(2)}
                    </div>
                  </td>

                  {/* Markup % (editable unless waitingForClient/approved/complete) */}
                  <td>
                    {isApproved || isComplete || isWaitingForClient ? (
                      <div className={`${blackBare} border border-transparent w-24 text-right`}>
                        {Number.isFinite(currentPct) ? currentPct.toFixed(1) : '0.0'}%
                      </div>
                    ) : (
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
                    )}
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
            {/* +3 columns for Length/Width/Total sqm */}
            <td colSpan={showJobsCol ? 10 : 9} className="text-right font-medium py-2">Subtotal</td>
            <td className="font-semibold">${round2(subtotal).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* NEW: Transportation cost + Grand total block */}
      <div className="mt-3 max-w-md ml-auto space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm">Transportation cost</label>
          {isApproved || isComplete || isWaitingForClient ? (
            <div className="w-40 text-right">${round2(toNumber(transportationCost)).toFixed(2)}</div>
          ) : (
            <input
              type="number"
              step="0.01"
              min="0"
              className="border rounded px-2 py-1 w-40 text-right"
              value={transportationCost}
              onChange={(e) => setTransportationCost(e.target.value)}
              onBlur={(e) => saveTransportationCost(e.target.value)}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-2">
          <div className="text-right font-medium">Total</div>
          <div className="font-semibold">${grandTotal.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {isComplete ? (
          <>
            <a
              href={`/api/quotes/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border px-4 py-2"
            >
              Print PDF
            </a>
            <button className="rounded border px-4 py-2" onClick={() => router.push('/quotes')}>
              Back to list
            </button>
          </>
        ) : (
          <>
            {!isApproved && (
              <button
                className="rounded border px-4 py-2"
                onClick={() => setStatus('waiting_for_client_approval')}
              >
                Save & Approve (wait for client)
              </button>
            )}

            {!isApproved && (
              <button
                className="rounded border px-4 py-2"
                onClick={() => setStatus('redo')}
              >
                Send back to redo
              </button>
            )}

            <a
              href={`/api/quotes/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border px-4 py-2"
            >
              Print PDF
            </a>

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
          </>
        )}
      </div>

      {/* SHOW THESE ONLY WHEN WAITING FOR CLIENT */}
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
