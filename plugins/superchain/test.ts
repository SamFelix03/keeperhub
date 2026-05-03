const ACROSS_TESTNET_BASE = "https://testnet.across.to/api";

export async function testSuperchain(credentials: Record<string, string>) {
  try {
    const apiKey = credentials.ACROSS_API_KEY;
    const baseUrl = credentials.ACROSS_API_BASE_URL || ACROSS_TESTNET_BASE;

    const headers: HeadersInit = { Accept: "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/available-routes`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Across validation failed: HTTP ${response.status}`,
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
