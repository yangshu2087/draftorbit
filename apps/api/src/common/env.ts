const REQUIRED_API_ENVS = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const;
const REQUIRED_LIVE_STRIPE_ENVS = [
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_STARTER_MONTHLY_PRICE_ID',
  'STRIPE_STARTER_YEARLY_PRICE_ID',
  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_PRO_YEARLY_PRICE_ID',
  'STRIPE_PREMIUM_MONTHLY_PRICE_ID',
  'STRIPE_PREMIUM_YEARLY_PRICE_ID'
] as const;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function assertApiEnv(): void {
  for (const key of REQUIRED_API_ENVS) {
    requireEnv(key);
  }
}

export function getAuthMode(): 'required' | 'self_host_no_login' {
  const mode = (process.env.AUTH_MODE ?? 'required').trim();
  return mode === 'self_host_no_login' ? 'self_host_no_login' : 'required';
}

export function assertAuthModeSafety(): void {
  const mode = getAuthMode();
  const env = (process.env.NODE_ENV ?? 'development').trim();
  if (mode === 'self_host_no_login' && env === 'production') {
    throw new Error('AUTH_MODE=self_host_no_login is forbidden in production');
  }
}

export function assertBillingEnvSafety(): void {
  const env = (process.env.NODE_ENV ?? 'development').trim();
  const stripeSecret = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  const isLiveKey = stripeSecret.startsWith('sk_live_');
  const shouldStrictCheck = env === 'production' || isLiveKey;

  if (!shouldStrictCheck) return;

  if (!stripeSecret) {
    throw new Error('Missing required env: STRIPE_SECRET_KEY');
  }

  for (const key of REQUIRED_LIVE_STRIPE_ENVS) {
    requireEnv(key);
  }
}
