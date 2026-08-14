export function formatE164(phone: string, prefix = '+880'): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) return cleaned;

  cleaned = cleaned.replace(/[^\d]/g, '');
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return '+88' + cleaned;
  }
  if (cleaned.startsWith('8801') && cleaned.length === 13) {
    return '+' + cleaned;
  }
  return prefix + cleaned.replace(/^0+/, '');
}

export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  if (phone.startsWith('+880')) {
    // Format Bangladesh number: +880 1700-000000
    const local = phone.replace('+880', '');
    if (local.length === 10) {
      return `+880 ${local.slice(0, 4)}-${local.slice(4)}`;
    }
  }
  return phone;
}
