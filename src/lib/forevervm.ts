function base64UrlEncode(input: string): string {
  // Convert string to UTF-8 bytes and then to base64
  const base64 = btoa(
    new TextEncoder().encode(input).reduce((acc, byte) => acc + String.fromCharCode(byte), ""),
  );

  // Convert to base64url by replacing characters
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// Function to create HMAC signature
async function createSignature(input: string, secret: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);

  // Convert ArrayBuffer to base64url string
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// Main function to generate JWT
export async function generateJWT(payload: object, secret: string) {
  // Create JWT header
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature input
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Generate signature
  const signature = await createSignature(signatureInput, secret);

  // Return complete JWT
  return `${signatureInput}.${signature}`;
}

export async function generateReplToken() {
  const payload = {
    jti: crypto.randomUUID(),
    sub: "forevervm-com",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiration
  };

  // TODO: use config
  const secret = process.env.REACT_APP_FOREVERVM_JWT_SECRET || "";

  const token = await generateJWT(payload, secret);
  return token;
}
