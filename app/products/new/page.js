// app/products/new/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProductPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [baseCost, setBaseCost] = useState('0');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null); // {id, name, base_setup_cost}

  const moneyStrToNum = (s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required'); return; }

    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          base_setup_cost: moneyStrToNum(baseCost),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to create product');

      setCreated(data || null);
      // reset inputs for quick entry
      setName('');
      setBaseCost('0');
    } catch (e) {
      setErr(e.message || 'Failed to create product');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-3">Create Product</h2>
      {err && <p className="text-red-600 mb-3">{err}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm mb-1">Name<span className="text-red-500">*</span></span>
          <input
            className="w-full rounded border px-3 py-2 bg-black text-white placeholder:text-neutral-400"
            placeholder="e.g. Custom Sign"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className="block text-sm mb-1">Base setup cost</span>
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-48 rounded border px-3 py-2 bg-black text-white text-right"
            value={baseCost}
            onChange={e => setBaseCost(e.target.value)}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded border px-4 py-2 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save product'}
          </button>
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => router.push('/products')}
          >
            Back to products
          </button>
        </div>
      </form>

      {created && (
        <div className="mt-6 rounded border p-3 text-sm">
          <div className="mb-2 text-green-500">Product created.</div>
          <div>ID: {created.id}</div>
          <div>Name: {created.name}</div>
          <div>Base setup cost: {Number(created.base_setup_cost ?? 0).toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
