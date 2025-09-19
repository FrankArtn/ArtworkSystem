'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { statusBadgeCls } from '@/app/components/statusBadgeCls';
import { CURRENCY_SYMBOL, formatMoney } from '@/lib/currency';

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get('quote'); // we pass ?quote=<id> from the redo redirect

  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]); // always an array
  const [prodSel, setProdSel] = useState('');
  const [qty, setQty] = useState(1);

  // NEW: extra inputs for “Add item” flow
  const [lenAdd, setLenAdd] = useState('');   // meters
  const [widAdd, setWidAdd] = useState('');   // meters (only for sqm)

  // local, temporary markup edits keyed by item id (string values for smooth typing)
  const [markupEdits, setMarkupEdits] = useState({}); // { [itemId]: "12.5" }

  const [markupPct, setMarkupPct] = useState('0');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [customerName, setCustomerName] = useState('');

  // NEW: transportation cost (quote-level, not part of the table)
  const [transportationCost, setTransportationCost] = useState('0');

  const toNumber = (v) => {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = (n) => Math.round(n * 100) / 100;

  function pctFromCostSale(cost, sale) {
    const c = toNumber(cost), s = toNumber(sale);
    return c > 0 ? ((s - c) / c) * 100 : 0;
  }
  function saleFromCostPct(cost, pct) {
    const c = toNumber(cost), p = Number.isFinite(Number(pct)) ? Number(pct) : 0;
    return round2(c * (1 + p / 100));
  }

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

  // NEW: fast map for lookups by id
  const prodById = useMemo(() => {
    const map = {};
    (products || []).forEach(p => { map[p.id] = p; });
    return map;
  }, [products]);

  // NEW: unit classifier
  const unitKind = (u) => {
    const s = (u || '').toLowerCase().trim();
    if (/(sqm|m2|m²|square)/.test(s)) return 'area';          // per square meter
    if (/(^|[^a-z])(m|meter|metre|linear)(s)?\b/.test(s) && !/(sqm|m2|m²|mm|cm)/.test(s)) return 'length'; // per meter
    return 'other';
  };

  const selectedUnitKind = useMemo(() => {
    const p = findSelectedProduct();
    return unitKind(p?.unit);
  }, [prodSel, products]);

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

  // ✅ preload existing quote & items when coming from "redo"
  useEffect(() => {
    (async () => {
      if (!editId || quote?.id) return;
      try {
        const qr = await fetch(`/api/quotes/${editId}`, { cache: 'no-store' });
        const qd = await qr.json().catch(() => null);
        if (qr.ok && qd?.id) {
          setQuote(qd);
          setCustomerName(qd?.customer || ''); // pre-fill customer name on redo preload
          // NEW: preload transportation cost from server
          setTransportationCost(String(toNumber(qd?.transportation_cost ?? 0)));
          const ir = await fetch(`/api/quotes/${qd.id}/items`, { cache: 'no-store' });
          const idata = await ir.json().catch(() => []);
          setItems(Array.isArray(idata) ? idata : []);
          setMarkupEdits({});
        }
      } catch {}
    })();
  }, [editId, quote?.id]);

  // Create the draft only when actually needed (first add)
  async function ensureQuote() {
    if (quote?.id) return quote;
    const r = await fetch('/api/quotes', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Failed to create quote');
    setQuote(data);
    setCustomerName(data?.customer || '');
    // preload transport cost on creation (if backend returns it)
    setTransportationCost(String(toNumber(data?.transportation_cost ?? 0)));
    return data;
  }

  async function saveCustomerName(name) {
    const next = (name ?? '').trim();
    const current = (quote?.customer ?? '').trim();
    if (!quote?.id && next === '') return;
    if (quote?.id && next === current) return;
    try {
      setErr('');
      if (!quote?.id) {
        const r = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ customer: next }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || 'Failed to create quote');
        setQuote(data);
        setCustomerName(data?.customer || next);
        // set transport if returned
        setTransportationCost(String(toNumber(data?.transportation_cost ?? transportationCost)));
        return;
      }
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
      setMarkupEdits({});
    } catch {
      setItems([]);
    }
  }

  // NEW: compute add-row “units” (area or length) for preview/validation
  const addLen = toNumber(lenAdd);
  const addWid = toNumber(widAdd);
  const addUnits = selectedUnitKind === 'area'
    ? round2(addLen * addWid || 0)
    : selectedUnitKind === 'length'
    ? round2(addLen || 0)
    : 1;

  async function addItem() {
    try {
      setErr('');
      if (!prodSel) { setErr('Select a product'); return; }
      if (!(Number(qty) > 0)) { setErr('Qty must be > 0'); return; }

      // guard for required dimensions depending on unit
      if (selectedUnitKind === 'area' && (!(addLen > 0) || !(addWid > 0))) {
        setErr('Please enter Length and Width (meters) for sqm products.');
        return;
      }
      if (selectedUnitKind === 'length' && !(addLen > 0)) {
        setErr('Please enter Length (meters) for meter products.');
        return;
      }

      setBusy(true);
      const q = await ensureQuote();

      // base payload
      const payload = {
        product_id: Number(prodSel),
        qty: Number(qty),
        sale_price: computedSale,
        cost_price: selectedCost,
      };

      // NEW: send dimensional fields so backend can compute totals
      if (selectedUnitKind === 'area') {
        payload.length_m = addLen;
        payload.width_m  = addWid;
        payload.area_sqm = round2(addLen * addWid);
      } else if (selectedUnitKind === 'length') {
        payload.length_m = addLen;
        payload.area_sqm = null;
      }

      const r = await fetch(`/api/quotes/${q.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to add item');

      setProdSel('');
      setQty(1);
      setLenAdd('');
      setWidAdd('');
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

  // NEW: billable units helper (1 for “each”, length for linear, area for sqm)
  function billableUnitsFor(item) {
    const p = prodById[item.product_id] || {};
       const kind = unitKind(p.unit || item.unit);
    const L = toNumber(item.length_m);
    const W = toNumber(item.width_m);
    if (kind === 'area') return round2((L > 0 && W > 0) ? L * W : toNumber(item.area_sqm));
    if (kind === 'length') return round2(L > 0 ? L : 0);
    return 1;
  }

  // Subtotal = items only (qty × billable units × sale_price)
  const subtotal = useMemo(
    () => items.reduce((s, it) => {
      const units = billableUnitsFor(it);
      return s + toNumber(it.sale_price) * Math.max(1, toNumber(it.qty || 1)) * (units || 1);
    }, 0),
    [items]
  );

  // NEW: grand total includes transportationCost
  const grandTotal = useMemo(
    () => round2(subtotal + toNumber(transportationCost)),
    [subtotal, transportationCost]
  );

  // Save transportation cost to the quote (don’t create a draft unless the user typed a non-zero)
  async function saveTransportationCost(v) {
    const amount = round2(toNumber(v));
    if (!quote?.id) {
      if (amount === 0) { // don’t create a draft just to store zero
        setTransportationCost(String(amount));
        return;
      }
      // need a draft to persist non-zero
      await ensureQuote();
    }
    try {
      const r = await fetch(`/api/quotes/${quote.id}`, {
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

  async function submitForApproval() {
    try {
      setErr('');
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
    try { await fetch(`/api/quotes/${id}?emptyOnly=1`, { method: "DELETE", keepalive: true }); } catch {}
  }

  useEffect(() => {
    const onBeforeUnload = () => {
      if (quote?.id && items.length === 0 && navigator.sendBeacon) {
        const url  = `/api/quotes/${quote.id}/cleanup`;
        const body = new Blob([JSON.stringify({ emptyOnly: true })], { type: "application/json" });
        navigator.sendBeacon(url, body);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (quote?.id && items.length === 0) {
        deleteDraftIfEmptyKeepalive(quote.id);
      }
    };
  }, [quote?.id, items.length]);

  const blackBare =
    "rounded px-2 py-1 bg-black text-white placeholder:text-neutral-300 focus:outline-none";

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-semibold mb-3">New Quote</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}
      <div className="mb-4 text-sm text-neutral-600">
        Quote #: {quote?.quote_number || (quote?.id ? `QUO-${String(quote.id).padStart(6,'0')}` : '— (not created yet)')}
        &nbsp;·&nbsp; Status:{' '}
        <span className={`inline-block px-2 py-0.5 rounded border ${statusBadgeCls(quote?.status)}`}>
          {quote?.status || 'draft (not saved yet)'}
        </span>
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
            onBlur={e => saveCustomerName(e.target.value)}
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
          Cost: <strong className="text-white">{CURRENCY_SYMBOL}{selectedCost.toFixed(2)}</strong>
          &nbsp;→&nbsp; Sale @ {Number(markupPct || 0).toFixed(1)}%:&nbsp;
          <strong className="text-white">{CURRENCY_SYMBOL}{computedSale.toFixed(2)}</strong>
        </div>
      </div>

      {/* Add item row */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="grid gap-1">
          <span className="text-sm">Product</span>
          <select
            className="border rounded px-2 py-1 w-64"
            value={prodSel}
            onChange={e => { setProdSel(e.target.value); setLenAdd(''); setWidAdd(''); }}
          >
            <option value="">Select product</option>
            {Array.isArray(products) && products.length > 0 ? (
              products.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} {p.sku ? `(${p.sku})` : ''} — {CURRENCY_SYMBOL}{Number(p.cost_hint ?? 0).toFixed(2)} cost{p.unit ? ` / ${p.unit}` : ''}
                </option>
              ))
            ) : (
              <option value="" disabled>No products found</option>
            )}
          </select>
        </label>

        {(selectedUnitKind === 'area' || selectedUnitKind === 'length') && (
          <label className="grid gap-1">
            <span className="text-sm">Length (m)</span>
            <input
              type="number" min="0" step="0.01"
              className="border rounded px-2 py-1 w-28"
              value={lenAdd}
              onChange={e => setLenAdd(e.target.value)}
            />
          </label>
        )}
        {selectedUnitKind === 'area' && (
          <label className="grid gap-1">
            <span className="text-sm">Width (m)</span>
            <input
              type="number" min="0" step="0.01"
              className="border rounded px-2 py-1 w-28"
              value={widAdd}
              onChange={e => setWidAdd(e.target.value)}
            />
          </label>
        )}

        <label className="grid gap-1">
          <span className="text-sm">Qty</span>
          <input
            type="number" min="1"
            className="border rounded px-2 py-1 w-24"
            value={qty}
            onChange={e => setQty(e.target.value)}
          />
        </label>

        {(selectedUnitKind === 'area' || selectedUnitKind === 'length') && (
          <div className="text-sm text-neutral-700 mb-2">
            {selectedUnitKind === 'area'
              ? <>Area: <strong>{addUnits || 0}</strong> sqm</>
              : <>Length: <strong>{addUnits || 0}</strong> m</>}
          </div>
        )}

        <div className="text-sm text-neutral-700 mb-2">
          Sale (per unit): <strong>{CURRENCY_SYMBOL}{computedSale.toFixed(2)}</strong>
        </div>

        <button
          onClick={addItem}
          disabled={busy || !prodSel}
          className="px-2 py-1 border rounded"
        >
          {busy ? 'Adding…' : 'Add item'}
        </button>
      </div>

      {/* Items table */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-4 [&>th]:border-b">
            <th>Product</th>
            {/* NEW columns next to Product */}
            <th>Length (m)</th>
            <th>Width (m)</th>
            <th>Total (sqm/m)</th>
            <th>SKU</th>
            <th>Cost/Unit</th>
            <th>Markup %</th>
            <th>Sale price/Unit</th>
            <th>Qty</th>
            <th>Line total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={11} className="py-4 text-neutral-500">No items yet.</td>
            </tr>
          ) : items.map(it => {
            const cost  = toNumber(it.cost_price);
            const sale  = toNumber(it.sale_price);
            const qtyN  = Math.max(1, toNumber(it.qty || 1));

            const p = prodById[it.product_id] || {};
            const kind = unitKind(p.unit || it.unit);

            const L = toNumber(it.length_m);
            const W = toNumber(it.width_m);
            const units = kind === 'area' ? round2((L > 0 && W > 0) ? L * W : toNumber(it.area_sqm))
                        : kind === 'length' ? round2(L > 0 ? L : 0)
                        : 1;

            const currentPct = pctFromCostSale(cost, sale);
            const editPctStr = markupEdits?.[it.id];
            const inputPct = editPctStr ?? currentPct.toFixed(1);

            const previewSale = Number.isFinite(Number(editPctStr))
              ? saleFromCostPct(cost, editPctStr)
              : sale;

            const line = round2(previewSale * qtyN * (units || 1));

            return (
              <tr key={it.id} className="[&>td]:py-2 [&>td]:px-4 [&>td]:border-b">
                <td>{it.product_name}</td>

                {/* NEW: Length (editable for area/length kinds) */}
                <td>
                  {kind === 'area' || kind === 'length' ? (
                    <input
                      type="number" step="0.01" min="0"
                      className="border rounded px-2 py-1 w-24 text-right"
                      value={Number.isFinite(L) && L > 0 ? L : ''}
                      onChange={e => {
                        const v = e.target.value;
                        setItems(prev => prev.map(r => r.id === it.id ? { ...r, length_m: v } : r));
                      }}
                      onBlur={async e => {
                        const v = toNumber(e.target.value);
                        const patch = { length_m: v };
                        if (kind === 'area') patch.area_sqm = round2(v * (W || 0));
                        await updateItem(it.id, patch);
                      }}
                    />
                  ) : <span className="text-neutral-400">—</span>}
                </td>

                {/* NEW: Width (only for area kinds) */}
                <td>
                  {kind === 'area' ? (
                    <input
                      type="number" step="0.01" min="0"
                      className="border rounded px-2 py-1 w-24 text-right"
                      value={Number.isFinite(W) && W > 0 ? W : ''}
                      onChange={e => {
                        const v = e.target.value;
                        setItems(prev => prev.map(r => r.id === it.id ? { ...r, width_m: v } : r));
                      }}
                      onBlur={async e => {
                        const v = toNumber(e.target.value);
                        const patch = { width_m: v, area_sqm: round2((L || 0) * v) };
                        await updateItem(it.id, patch);
                      }}
                    />
                  ) : <span className="text-neutral-400">—</span>}
                </td>

                {/* NEW: Total units display */}
                <td>
                  {kind === 'area'
                    ? <span>{units || 0} sqm</span>
                    : kind === 'length'
                    ? <span>{units || 0} m</span>
                    : <span className="text-neutral-400">—</span>}
                </td>

                <td>{it.sku || '—'}</td>
                <td>{CURRENCY_SYMBOL}{cost.toFixed(2)}</td>

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
                      const newSale = saleFromCostPct(cost, pct);
                      await updateItem(it.id, { sale_price: newSale });
                    }}
                  />
                </td>

                {/* Sale price (read-only, shows preview) */}
                <td>{CURRENCY_SYMBOL}{previewSale.toFixed(2)}</td>

                <td>
                  <input
                    type="number" min="1"
                    className="border rounded px-2 py-1 w-20"
                    value={it.qty}
                    onChange={e => updateItem(it.id, { qty: Number(e.target.value) })}
                  />
                </td>

                <td>{CURRENCY_SYMBOL}{line.toFixed(2)}</td>

                <td>
                  <button onClick={() => removeItem(it.id)} className="px-2 py-1 border rounded">
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* Table shows SUBTOTAL only (items) */}
        <tfoot>
          <tr>
            <td colSpan={9} className="text-right font-medium py-2 pr-2">Subtotal</td>
            <td className="font-semibold">{CURRENCY_SYMBOL}{subtotal.toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {/* NEW: Transportation cost + Grand total block (below table, above buttons) */}
      <div className="mt-3 max-w-md ml-auto space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm">Transportation cost</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="border rounded px-2 py-1 w-40 text-right"
            value={transportationCost}
            onChange={(e) => setTransportationCost(e.target.value)}
            onBlur={(e) => saveTransportationCost(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-2">
          <div className="text-right font-medium">Total</div>
          <div className="font-semibold">{CURRENCY_SYMBOL}{grandTotal.toFixed(2)}</div>
        </div>
      </div>

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
