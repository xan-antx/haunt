export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateCardNumber(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d+$/.test(cleaned) || cleaned.length < 13) {
    return { isValid: false, error: 'Please enter a valid card number' };
  }
  return { isValid: true };
}

export function validateExpiry(value: string): ValidationResult {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return { isValid: false, error: 'Please enter a valid expiry date' };
  
  const month = parseInt(match[1] ?? '', 10);
  const year = parseInt(match[2] ?? '', 10) + 2000;
  
  if (month < 1 || month > 12) {
    return { isValid: false, error: 'Please enter a valid expiry date' };
  }
  
  const expiry = new Date(year, month - 1);
  const today = new Date();
  // Compare at month level: the first of the current month, at midnight
  const now = new Date(today.getFullYear(), today.getMonth(), 1);
  
  if (expiry < now) {
    return { isValid: false, error: 'Please enter a valid expiry date' };
  }
  
  return { isValid: true };
}

export function validateCVV(value: string): ValidationResult {
  if (!/^\d{3}$/.test(value)) {
    return { isValid: false, error: 'Please enter a valid CVV' };
  }
  return { isValid: true };
}
