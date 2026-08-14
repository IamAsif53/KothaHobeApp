/**
 * Normalizes any phone number into E.164 format (+[country code][number]).
 * Example inputs:
 *  - "01700000000" (Default Bangladesh BD prefix -> "+8801700000000")
 *  - "8801700000000" -> "+8801700000000"
 *  - "+880 1700-000000" -> "+8801700000000"
 *  - "+14155552671" -> "+14155552671"
 */
export function normalizePhoneNumber(phone: string, defaultCountryPrefix = '+880'): string {
  if (!phone) return '';

  // Remove spaces, hyphens, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('+')) {
    // Already has leading plus
    return '+' + cleaned.replace(/[^\d]/g, '');
  }

  // Remove non-digit characters
  cleaned = cleaned.replace(/[^\d]/g, '');

  if (!cleaned) return '';

  // Bangladesh specific handling: starts with 01X -> add +88
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return '+88' + cleaned;
  }

  // Starts with 8801X -> add +
  if (cleaned.startsWith('880') && cleaned.length === 13) {
    return '+' + cleaned;
  }

  // Fallback if user passes digits without plus
  if (defaultCountryPrefix.startsWith('+')) {
    return defaultCountryPrefix + cleaned.replace(/^0+/, '');
  }

  return '+' + cleaned;
}

export function isValidE164Phone(phone: string): boolean {
  // E.164 standard: + followed by 7 to 15 digits
  return /^\+[1-9]\d{6,14}$/.test(phone);
}
