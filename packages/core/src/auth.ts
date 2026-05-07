export interface EnvAuthConfig {
  envVar: string;
  description: string;
}

export function requireEnv(envVar: string, description: string): string {
  const value = process.env[envVar];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable ${envVar}. ${description}`);
  }
  return value;
}

export function optionalEnv(envVar: string): string | undefined {
  const value = process.env[envVar];
  return value && value.length > 0 ? value : undefined;
}
