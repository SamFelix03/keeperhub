const REQUEST_FINANCE_DEFAULT_BASE_URL = "https://api.request.finance";

export async function testRequestFinance(credentials: Record<string, string>) {
  try {
    const apiKey = credentials.REQUEST_FINANCE_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "REQUEST_FINANCE_API_KEY is required",
      };
    }

    const baseUrl =
      credentials.REQUEST_FINANCE_BASE_URL || REQUEST_FINANCE_DEFAULT_BASE_URL;
    const url = `${baseUrl}/invoices?take=1&skip=0&format=paginated`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Request Finance validation failed: HTTP ${response.status}`,
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
