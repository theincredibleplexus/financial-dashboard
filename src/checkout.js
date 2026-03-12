// ─── LEMON SQUEEZY CHECKOUT ──────────────────────────────────────────────────
// Variant IDs are set in .env — fall back to 'PLACEHOLDER' so the build
// doesn't break while IDs aren't configured yet.

const LEMON_PRO_VARIANT_ID      = import.meta.env.VITE_LEMON_PRO_VARIANT      || 'PLACEHOLDER'
const LEMON_LIFETIME_VARIANT_ID = import.meta.env.VITE_LEMON_LIFETIME_VARIANT || 'PLACEHOLDER'

export function getProCheckoutUrl(userId, userEmail) {
  const params = new URLSearchParams({
    'checkout[custom][user_id]': userId,
    'checkout[custom][tier]':    'pro',
    'checkout[email]':           userEmail,
  })
  return `https://commaapp.lemonsqueezy.com/checkout/buy/${LEMON_PRO_VARIANT_ID}?${params.toString()}`
}

export function getLifetimeCheckoutUrl(userId, userEmail) {
  const params = new URLSearchParams({
    'checkout[custom][user_id]': userId,
    'checkout[custom][tier]':    'lifetime',
    'checkout[email]':           userEmail,
  })
  return `https://commaapp.lemonsqueezy.com/checkout/buy/${LEMON_LIFETIME_VARIANT_ID}?${params.toString()}`
}
