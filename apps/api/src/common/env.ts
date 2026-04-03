const REQUIRED_API_ENVS = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const;

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
