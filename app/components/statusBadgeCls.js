export function statusBadgeCls(s) {
  const t = String(s || '').toLowerCase();

  // Quotes
  if (t === 'pending_approval') {
    return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  }

    if (t === 'waiting_for_client_approval') {
        return 'bg-green-500/20 text-green-300 border-green-500/40';
    }

  if (t === 'redo' || t === 'draft') {
    return 'bg-red-500/20 text-red-300 border-red-500/40';
  }

  // Orders
  if (t === 'open') {
    return 'bg-red-500/20 text-red-300 border-red-500/40';
  }

  if (t === 'WIP') {
    return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  }

  if (t === 'complete') {
    return 'bg-green-500/20 text-green-300 border-green-500/40';
  }



  // Default
  return 'bg-white/10 text-white border-white/20';
}
