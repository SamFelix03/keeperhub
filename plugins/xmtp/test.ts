const ALLOWED_ENVS = new Set([
  "testnet",
  "dev",
  "production",
  "mainnet",
  "local",
  "testnet-dev",
  "testnet-staging",
]);

export async function testXmtp(credentials: Record<string, string>) {
  try {
    const env = credentials.XMTP_ENV || "testnet";
    if (!ALLOWED_ENVS.has(env)) {
      return {
        success: false,
        error: `Invalid XMTP environment: ${env}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
