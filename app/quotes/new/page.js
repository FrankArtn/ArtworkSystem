'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewQuotePage() {
  const router = useRouter();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]); // always an array
  const [prodSel, setProdSel] = useState('');
  const [qty, setQty] = useState(1);

  // local, temporary markup edits keyed by item id (string values for smooth typing)
    const [markupEdits, setMarkupEdits] = useState({}); // { [itemId]: "12.5" }

    function pctFromCostSale(cost, sale) {
    const c = toNumber(cost), s = toNumber(sale);
    return c > 0 ? ((s - c) / c) * 100 : 0;
    }
    function saleFromCostPct(cost, pct) {
    const c = toNumber(cost), p = Number.isFinite(Number(pct)) ? Number(pct) : 0;
    return round2(c * (1 + p / 100));
    }

  // Markup % (string so typing feels natural)
  const [markupPct, setMarkupPct] = useState('0');

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Customer Name useState
  const [customerName, setCustomerName] = useState('');

  const toNumber = (v) => {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = (n) => Math.round(n * 100) / 100;

  const findSelectedProduct = () =>
    Array.isArray(products) ? products.find(p => String(p.id) === String(prodSel)) : undefined;

  const selectedCost = useMemo(() => {
    const p = findSelectedProduct();
    return round2(toNumber(p?.cost_hint ?? 0));
  }, [products, prodSel]);

  const computedSale = useMemo(() => {
    const m = toNumber(markupPct);
    return round2(selectedCost * (1 + m / 100));
  }, [selectedCost, markupPct]);

  // Load products only — no draft creation here
  useEffect(() => {
    (async () => {
      try {
        const p = await fetch('/api/products', { cache: 'no-store' });
        const pdata = await p.json().catch(() => []);
        setProducts(Array.isArray(pdata) ? pdata : []);
      } catch {
        setProducts([]);
      }
    })();
  }, []);

  // Create the draft only when actually needed (first add)
  async function ensureQuote() {
    if (quote?.id) return quote;
    const r = await fetch('/api/quotes', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Failed to create quote');
    setQuote(data);
    setCustomerName(data?.customer || ''); // <- populate from server if present
    return data;
  }

  async function saveCustomerName(name) {
    const next = (name ?? '').trim();
    const current = (quote?.customer ?? '').trim();

    // 1) No draft yet + empty input -> do nothing (avoid creating a draft)
    if (!quote?.id && next === '') return;

    // 2) Existing draft + no actual change -> do nothing
    if (quote?.id && next === current) return;

    try {
      setErr('');

      if (!quote?.id) {
        // 3) Create the draft with initial customer (non-empty)
        const r = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ customer: next }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || 'Failed to create quote');
        setQuote(data);
        setCustomerName(data?.customer || next);
        return;
      }

      // 4) Update existing draft; allow clearing to NULL
      const r = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer: next === '' ? null : next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to save customer name');

      setQuote(prev => (prev ? { ...prev, customer: next } : data));
    } catch (e) {
      setErr(e.message || 'Failed to save customer name');
    }
  }

  async function reloadItems(qid) {
    const id = qid ?? quote?.id;
    if (!id) return;
    try {
      const r = await fetch(`/api/quotes/${id}/items`, { cache: 'no-store' });
      const data = await r.json().catch(() => []);
      setItems(Array.isArray(data) ? data : []);
      setMarkupEdits({}); // reset any in-progress edits after a reload
    } catch {
      setItems([]);
    }
  }

  async function addItem() {
    try {
      setErr('');
      if (!prodSel) { setErr('Select a product'); return; }
      if (!(Number(qty) > 0)) { setErr('Qty must be > 0'); return; }
      setBusy(true);

      const q = await ensureQuote(); // create draft on first add

      const payload = {
        product_id: Number(prodSel),
        qty: Number(qty),
        sale_price: computedSale,   // from markup
        cost_price: selectedCost,   // stored on the line
      };
      const r = await fetch(`/api/quotes/${q.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to add item');

      setProdSel('');
      setQty(1);
      await reloadItems(q.id);
    } catch (e) {
      setErr(e.message || 'Failed to add item');
    } finally {
      setBusy(false);
    }
  }

  async function updateItem(id, patch) {
    if (!quote?.id) return;
    await fetch(`/api/quotes/${quote.id}/items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await reloadItems();
  }

  async function removeItem(id) {
    if (!quote?.id) return;
    await fetch(`/api/quotes/${quote.id}/items/${id}`, { method: 'DELETE' });
    await reloadItems();
  }

  const total = useMemo(
    () => items.reduce((s, it) => s + toNumber(it.sale_price) * toNumber(it.qty || 1), 0),
    [items]
  );

  async function submitForApproval() {
    try {
      setErr('');
      // Don’t silently create an empty quote here
      if (!quote?.id || items.length === 0) {
        setErr('Add at least one item before submitting for approval.');
        return;
      }
      const r = await fetch(`/api/quotes/${quote.id}/submit`, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(data?.error || 'Failed to submit'); return; }
      router.push('/quotes');
    } catch (e) {
      setErr(e.message || 'Failed to submit');
    }
  }

  // helper: fire-and-forget delete with keepalive
    async function deleteDraftIfEmptyKeepalive(id) {
    try {
        await fetch(`/api/quotes/${id}?emptyOnly=1`, { method: "DELETE", keepalive: true });
    } catch {}
    }

    useEffect(() => {
    // Run on tab close/refresh as well
    const onBeforeUnload = () => {
        if (quote?.id && items.length === 0 && navigator.sendBeacon) {
        const url  = `/api/quotes/${quote.id}/cleanup`;
        const body = new Blob([JSON.stringify({ emptyOnly: true })], { type: "application/json" });
        navigator.sendBeacon(url, body);
        }
        // Note: some browsers ignore async work here; sendBeacon is best-effort.
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
        window.removeEventListener("beforeunload", onBeforeUnload);
        // Navigating away within the app: do a keepalive DELETE
        if (quote?.id && items.length === 0) {
        deleteDraftIfEmptyKeepalive(quote.id);
        }
    };
    }, [quote?.id, items.length]);

  // Style token
  const blackBare =
    "rounded px-2 py-1 bg-black text-white placeholder:text-neutral-300 focus:outline-none";

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-semibold mb-3">New Quote</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}
      <div className="mb-4 text-sm text-neutral-600">
        Quote #: {quote?.quote_number || (quote?.id ? `QUO-${String(quote.id).padStart(6,'0')}` : '— (not created yet)')}
        &nbsp;·&nbsp; Status: {quote?.status || 'draft (not saved yet)'}
      </div>

      {/* Customer name */}
      <div className="mb-3 flex items-end gap-3">
        <label className="grid gap-1">
          <span className="text-sm">Customer name</span>
          <input
            type="text"
            className="border rounded px-2 py-1 w-80"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            onBlur={e => saveCustomerName(e.target.value)}   // autosave on blur
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            placeholder="e.g., ACME Pty Ltd / John Smith"
          />
        </label>
        {quote?.customer && (
          <span className="text-xs text-neutral-600 mb-1">
            Saved to quote #{quote?.quote_number || (quote?.id ? `QUO-${String(quote.id).padStart(6,'0')}` : '—')}
          </span>
        )}
      </div>

      {/* Markup controls */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3 border rounded-lg bg-black text-white border-neutral-700">
        <label className="grid gap-1">
          <span className="text-sm">Markup %</span>
          <input
            type="number" step="0.1" min="-100"
            className={`${blackBare} w-28 border border-white/30`}
            value={markupPct}
            onChange={e => setMarkupPct(e.target.value)}
            placeholder="0"
          />
        </label>

        <div className="text-sm text-white/90">
          Cost: <strong className="text-white">${selectedCost.toFixed(2)}</strong>
          &nbsp;→&nbsp; Sale @ {Number(markupPct || 0).toFixed(1)}%:&nbsp;
          <strong className="text-white">${computedSale.toFixed(2)}</strong>
        </div>
      </div>

      {/* Add item row */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="grid gap-1">
          <span className="text-sm">Product</span>
          <select
            className="border rounded px-2 py-1 w-64"
            value={prodSel}
            onChange={e => setProdSel(e.target.value)}
          >
            <option value="">Select product</option>
            {Array.isArray(products) && products.length > 0 ? (
              products.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} {p.sku ? `(${p.sku})` : ''} — ${Number(p.cost_hint ?? 0).toFixed(2)} cost
                </option>
              ))
            ) : (
              <option value="" disabled>No products found</option>
            )}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm">Qty</span>
          <input
            type="number" min="1"
            className="border rounded px-2 py-1 w-24"
            value={qty}
            onChange={e => setQty(e.target.value)}
          />
        </label>

        <div className="text-sm text-neutral-700 mb-2">
          Sale for this line: <strong>${computedSale.toFixed(2)}</strong>
        </div>

        <button
          onClick={addItem}
          disabled={busy || !prodSel}
          className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
        >
          {busy ? 'Adding…' : 'Add item'}
        </button>
      </div>

      {/* Items table */}
        <table className="w-full border-collapse">
        <thead>
            <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-4 [&>th]:border-b">
            <th>Product</th>
            <th>SKU</th>
            <th>Cost</th>
            <th>Markup %</th>
            <th>Sale price</th>
            <th>Qty</th>
            <th>Line total</th>
            <th></th>
            </tr>
        </thead>
        <tbody>
            {items.length === 0 ? (
                <tr>
                <td colSpan={8} className="py-4 text-neutral-500">No items yet.</td>
                </tr>
            ) : items.map(it => {
                const cost  = toNumber(it.cost_price);
                const sale  = toNumber(it.sale_price);
                const qtyN  = toNumber(it.qty || 1);

                // current markup from stored sale/cost
                const currentPct = cost > 0 ? ((sale - cost) / cost) * 100 : 0;

                // local edit state (string) — make sure you added: const [markupEdits, setMarkupEdits] = useState({});
                const editPctStr = markupEdits?.[it.id];

                // value shown in the input
                const inputPct = editPctStr ?? currentPct.toFixed(1);

                // preview sale while typing; falls back to stored sale
                const previewSale = Number.isFinite(Number(editPctStr))
                    ? round2(cost * (1 + Number(editPctStr) / 100))
                    : sale;

                const line = round2(previewSale * qtyN);

                return (
                    <tr key={it.id} className="[&>td]:py-2 [&>td]:px-4 [&>td]:border-b">
                    <td>{it.product_name}</td>
                    <td>{it.sku || '—'}</td>
                    <td>${cost.toFixed(2)}</td>

                    {/* Markup % (editable) */}
                    <td>
                        <input
                        type="number"
                        step="0.1"
                        min="-100"
                        className="border rounded px-2 py-1 w-24 text-right"
                        value={inputPct}
                        onChange={e => setMarkupEdits(m => ({ ...m, [it.id]: e.target.value }))}
                        onBlur={async e => {
                            const v = Number(e.target.value);
                            const pct = Number.isFinite(v) ? v : currentPct;
                            const newSale = round2(cost * (1 + pct / 100));
                            await updateItem(it.id, { sale_price: newSale });
                        }}
                        />
                    </td>

                    {/* Sale price (read-only, shows preview) */}
                    <td>${previewSale.toFixed(2)}</td>

                    <td>
                        <input
                        type="number" min="1"
                        className="border rounded px-2 py-1 w-20"
                        value={it.qty}
                        onChange={e => updateItem(it.id, { qty: Number(e.target.value) })}
                        />
                    </td>

                    <td>${line.toFixed(2)}</td>

                    <td>
                        <button onClick={() => removeItem(it.id)} className="px-2 py-1 border rounded">
                        Remove
                        </button>
                    </td>
                    </tr>
                );
                })}
            </tbody>
        <tfoot>
            <tr>
            <td colSpan={6} className="text-right font-medium py-2">Total</td>
            <td className="font-semibold">${total.toFixed(2)}</td>
            <td />
            </tr>
        </tfoot>
        </table>


      <div className="mt-4 flex gap-2">
        <button onClick={submitForApproval} className="rounded border px-4 py-2">
          Submit for approval
        </button>
        <button onClick={() => router.push('/quotes')} className="rounded border px-4 py-2">
          Back to quotes
        </button>
      </div>
    </div>
  );
}