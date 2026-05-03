const PERSONA_DEFAULT_BASE_URL = "https://withpersona.com/api/v1";

export async function testPersona(credentials: Record<string, string>) {
  try {
    const apiKey = credentials.PERSONA_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "PERSONA_API_KEY is required",
      };
    }

    const baseUrl = credentials.PERSONA_BASE_URL || PERSONA_DEFAULT_BASE_URL;
    const response = await fetch(`${baseUrl}/inquiries?page[size]=1`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Persona validation failed: HTTP ${response.status}`,
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
