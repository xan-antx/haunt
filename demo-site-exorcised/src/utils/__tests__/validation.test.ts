import { describe, expect, it } from 'vitest';
import { validateCardNumber, validateCVV, validateExpiry } from '../validation';

function expiryIn(monthsFromNow: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + monthsFromNow);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${month}/${year}`;
}

describe('validateCardNumber', () => {
  it('accepts 13 to 19 digit numbers', () => {
    expect(validateCardNumber('4111111111111')).toEqual({ isValid: true });
    expect(validateCardNumber('4111111111111111')).toEqual({ isValid: true });
    expect(validateCardNumber('4111111111111111111')).toEqual({ isValid: true });
  });

  it('ignores spaces between digit groups', () => {
    expect(validateCardNumber('4111 1111 1111 1111').isValid).toBe(true);
  });

  it('rejects fewer than 13 digits', () => {
    expect(validateCardNumber('411111111111').isValid).toBe(false);
    expect(validateCardNumber('').isValid).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(validateCardNumber('41111111111a1111').isValid).toBe(false);
    expect(validateCardNumber('4111-1111-1111-1111').isValid).toBe(false);
  });

  it('returns the English error message', () => {
    expect(validateCardNumber('1').error).toBe('Please enter a valid card number');
  });
});

describe('validateExpiry', () => {
  it('accepts a future month', () => {
    expect(validateExpiry(expiryIn(6))).toEqual({ isValid: true });
  });

  it('accepts the current month', () => {
    expect(validateExpiry(expiryIn(0)).isValid).toBe(true);
  });

  it('rejects a past month', () => {
    expect(validateExpiry(expiryIn(-2)).isValid).toBe(false);
  });

  it('rejects invalid months', () => {
    expect(validateExpiry('00/99').isValid).toBe(false);
    expect(validateExpiry('13/99').isValid).toBe(false);
  });

  it('rejects the wrong format', () => {
    expect(validateExpiry('').isValid).toBe(false);
    expect(validateExpiry('1/30').isValid).toBe(false);
    expect(validateExpiry('12-30').isValid).toBe(false);
    expect(validateExpiry('12/2030').isValid).toBe(false);
  });

  it('returns the English error message', () => {
    expect(validateExpiry('nope').error).toBe('Please enter a valid expiry date');
  });
});

describe('validateCVV', () => {
  it('accepts exactly three digits', () => {
    expect(validateCVV('123')).toEqual({ isValid: true });
    expect(validateCVV('000')).toEqual({ isValid: true });
  });

  it('rejects the wrong length', () => {
    expect(validateCVV('12').isValid).toBe(false);
    expect(validateCVV('1234').isValid).toBe(false);
    expect(validateCVV('').isValid).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validateCVV('12a').isValid).toBe(false);
  });

  it('returns the English error message', () => {
    expect(validateCVV('x').error).toBe('Please enter a valid CVV');
  });
});
