import crypto from "crypto"

// Telnyx signs webhooks with Ed25519, not HMAC (unlike Stripe). The account's
// public key is a raw 32-byte Ed25519 key, base64-encoded - Node's crypto
// needs it wrapped in a minimal SPKI DER envelope before it can verify
// against it. This prefix is the fixed, well-known ASN.1 header for an
// Ed25519 SubjectPublicKeyInfo structure; only the 32 key bytes actually vary.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

const MAX_TIMESTAMP_SKEW_SECONDS = 300 // reject signatures older than 5 min, blocks replay

function telnyxPublicKey(): crypto.KeyObject {
  const rawKey = Buffer.from(process.env.TELNYX_PUBLIC_KEY!, "base64")
  const der = Buffer.concat([ED25519_SPKI_PREFIX, rawKey])
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" })
}

/**
 * Verifies a Telnyx webhook's Ed25519 signature. Required before acting on
 * any inbound-SMS webhook - without this, anyone who finds the URL could
 * forge a fake "message.received" event and make Tee365's number auto-text
 * arbitrary third parties (the auto-reply logic sends to whatever "from"
 * number is in the payload).
 */
export function verifyTelnyxSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null
): boolean {
  if (!signatureHeader || !timestampHeader) return false

  const timestamp = parseInt(timestampHeader, 10)
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return false
  }

  try {
    const signedPayload = `${timestampHeader}|${rawBody}`
    const signature = Buffer.from(signatureHeader, "base64")
    return crypto.verify(null, Buffer.from(signedPayload), telnyxPublicKey(), signature)
  } catch {
    return false
  }
}
