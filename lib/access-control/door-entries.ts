// UniFi's authentication_type on a door unlock, in plain words for the door
// texts and /admin/door. Unknown types fall through lowercased rather than
// hidden, so a new method still shows up as something.
export function describeUnlockMethod(authType: string | null | undefined): string {
  switch (authType) {
    case "PIN_CODE": return "code"
    case "REMOTE_THROUGH_UAH":
    case "REMOTE_UNLOCK": return "app"
    case "NFC": return "card"
    case "MOBILE_TAP":
    case "MOBILE_BUTTON": return "phone"
    case null:
    case undefined:
    case "": return "unknown"
    default: return authType.toLowerCase().replace(/_/g, " ")
  }
}
