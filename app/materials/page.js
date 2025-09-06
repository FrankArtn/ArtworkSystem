'use client';
import { useEffect, useState } from "react";

export default function MaterialsPage() {
  const [mats, setMats] = useState([]);
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState(10);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // new material form
  const [form, setForm] = useState({
    name: "",
    sku: "",
    unit: "m2",
    costPerUnit: "",
    reorderLevel: "",
    onHand: "",
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  async function load() {
    setErr("");
    try {
      const r = await fetch("/api/materials", { cache: "no-store" });
      const data = await r.json();
      setMats(data);
      if (!sel && data.length) setSel(String(data[0].id));
    } catch {
      setErr("Failed to load materials");
    }
  }
  useEffect(() => { load(); }, []);

  async function addStock() {
    if (!sel) return;
    setLoading(true);
    setErr("");
    try {
      await fetch("/api/materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ materialId: Number(sel), qty: Number(qty) }),
      });
      await load();
    } catch {
      setErr("Failed to add stock");
    } finally {
      setLoading(false);
    }
  }

  async function createMaterial(e) {
    e.preventDefault();
    setCreateMsg("");
    setErr("");
    setCreating(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        unit: form.unit,
        costPerUnit: Number(form.costPerUnit),
        reorderLevel: form.reorderLevel === "" ? 0 : Number(form.reorderLevel),
        onHand: form.onHand === "" ? 0 : Number(form.onHand),
      };
      const r = await fetch("/api/materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data?.error || "Failed to create material");
      } else {
        setCreateMsg(`Created: ${data.material.name}`);
        setForm({ name: "", sku: "", unit: "m2", costPerUnit: "", reorderLevel: "", onHand: "" });
        await load();
      }
    } catch {
      setErr("Failed to create material");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold mb-3">Materials</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      {/* Table */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Name</th><th>SKU</th><th>Unit</th><th>Cost/Unit</th><th>On hand</th>
          </tr>
        </thead>
        <tbody>
          {mats.map(m => (
            <tr key={m.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>{m.name}</td>
              <td>{m.sku || <span className="text-neutral-400">—</span>}</td>
              <td>{m.unit}</td>
              <td>{m.cost_per_unit}</td>
              <td>{m.on_hand}</td>
            </tr>
          ))}
          {!mats.length && (
            <tr><td colSpan={5} className="py-4 text-neutral-500">No materials found.</td></tr>
          )}
        </tbody>
      </table>

      {/* Collapsible: Add stock (collapsed by default) */}
      <details className="group mt-6 border rounded-xl">
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
          <span className="font-medium">Add stock</span>
          <Chevron />
        </summary>
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={sel}
              onChange={e => setSel(e.target.value)}
            >
              <option value="" disabled>Select material</option>
              {mats.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input
              type="number"
              className="border rounded px-2 py-1 w-24"
              value={qty}
              onChange={e => setQty(e.target.value)}
              min="1"
            />
            <button
              onClick={addStock}
              disabled={loading || !sel}
              className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
            >
              {loading ? "Adding…" : "Add stock"}
            </button>
          </div>
        </div>
      </details>

      {/* Collapsible: Create new material (collapsed by default) */}
      <details className="group mt-4 border rounded-xl">
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
          <span className="font-medium">Create new material</span>
          <Chevron />
        </summary>
        <div className="px-4 pb-4">
          {createMsg && <p className="text-green-700 mb-2">{createMsg}</p>}
          <form onSubmit={createMaterial} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Name*</span>
              <input
                className="border rounded px-2 py-1"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">SKU</span>
              <input
                className="border rounded px-2 py-1"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="Optional, must be unique"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Unit*</span>
              <select
                className="border rounded px-2 py-1"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              >
                <option value="m2">m²</option>
                <option value="lm">lm</option>
                <option value="ea">each</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Cost per unit*</span>
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1"
                value={form.costPerUnit}
                onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Reorder level</span>
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1"
                value={form.reorderLevel}
                onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))}
                placeholder="0"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Initial on hand</span>
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1"
                value={form.onHand}
                onChange={e => setForm(f => ({ ...f, onHand: e.target.value }))}
                placeholder="0"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create material"}
              </button>
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}

/** Little chevron icon that rotates when <details> is open */
function Chevron() {
  return (
    <svg
      className="size-4 transition-transform group-open:rotate-180"
      viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.18l3.71-2.95a.75.75 0 11.94 1.16l-4.24 3.37a.75.75 0 01-.94 0L5.21 8.39a.75.75 0 01.02-1.18z" clipRule="evenodd" />
    </svg>
  );
}
