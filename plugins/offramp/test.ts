const ONRAMPER_TEST_URL = "https://api-stg.onramper.com/supported?type=sell";
const TRANSAK_TEST_URL =
  "https://api-gateway-stg.transak.com/api/v2/lookup/currencies/fiat-currencies";

export async function testOfframp(credentials: Record<string, string>) {
  try {
    const onramperApiKey = credentials.ONRAMPER_API_KEY;
    const transakApiKey = credentials.TRANSAK_API_KEY;

    if (!onramperApiKey && !transakApiKey) {
      return {
        success: false,
        error: "Provide ONRAMPER_API_KEY or TRANSAK_API_KEY",
      };
    }

    if (onramperApiKey) {
      const response = await fetch(ONRAMPER_TEST_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: onramperApiKey,
        },
      });

      if (response.ok) {
        return { success: true };
      }
    }

    if (transakApiKey) {
      const qs = new URLSearchParams({ apiKey: transakApiKey });
      const response = await fetch(`${TRANSAK_TEST_URL}?${qs.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        return { success: true };
      }
      return {
        success: false,
        error: `Transak validation failed: HTTP ${response.status}`,
      };
    }

    return {
      success: false,
      error: "Onramper validation failed. Check API key and environment access.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
