// /lib/currency.js
export const CURRENCY_SYMBOL =
  process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? '฿';

export const formatMoney = (n) =>
  `${CURRENCY_SYMBOL}${(Number(n) || 0).toFixed(2)}`;
