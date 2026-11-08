import { useCallback, useState } from 'react';
import type { PaymentFormData, PaymentFormValidation } from '../types';
import {
  validateCardNumber,
  validateExpiry,
  validateCVV,
  type ValidationResult,
} from '../utils/validation';

export type PaymentFormField = keyof PaymentFormData;

const EMPTY_FORM: PaymentFormData = {
  cardNumber: '',
  expiry: '',
  cvv: '',
  cardholderName: '',
};

function validateValue(field: PaymentFormField, data: PaymentFormData): ValidationResult {
  switch (field) {
    case 'cardNumber':
      return validateCardNumber(data.cardNumber);
    case 'expiry':
      return validateExpiry(data.expiry);
    case 'cvv':
      return validateCVV(data.cvv);
    case 'cardholderName':
      return { isValid: data.cardholderName.trim().length > 0 };
  }
}

export function usePaymentForm() {
  const [formData, setFormData] = useState<PaymentFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<PaymentFormValidation>({});
  const [touched, setTouched] = useState<ReadonlySet<PaymentFormField>>(new Set());

  const updateField = useCallback((field: PaymentFormField, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const applyResult = useCallback(
    (field: PaymentFormField, result: ValidationResult) => {
      // Only the three card fields have displayable errors.
      if (field === 'cardholderName') return;
      setErrors(prev => {
        const next = { ...prev };
        if (result.isValid) {
          delete next[field];
        } else {
          next[field] = result.error;
        }
        return next;
      });
    },
    []
  );

  /** Validate one field (called on blur) and mark it touched. */
  const validateField = useCallback(
    (field: PaymentFormField) => {
      setTouched(prev => new Set(prev).add(field));
      applyResult(field, validateValue(field, formData));
    },
    [formData, applyResult]
  );

  /** True when every field currently holds valid data. */
  const isValid = useCallback(
    () =>
      (['cardNumber', 'expiry', 'cvv', 'cardholderName'] as const).every(
        field => validateValue(field, formData).isValid
      ),
    [formData]
  );

  /** Validate every field at once (called on submit). Returns overall validity. */
  const validateAll = useCallback(() => {
    const fields = ['cardNumber', 'expiry', 'cvv', 'cardholderName'] as const;
    setTouched(new Set(fields));
    const next: PaymentFormValidation = {};
    for (const field of ['cardNumber', 'expiry', 'cvv'] as const) {
      const result = validateValue(field, formData);
      if (!result.isValid) next[field] = result.error;
    }
    setErrors(next);
    return fields.every(field => validateValue(field, formData).isValid);
  }, [formData]);

  const reset = useCallback(() => {
    setFormData(EMPTY_FORM);
    setErrors({});
    setTouched(new Set());
  }, []);

  return {
    formData,
    errors,
    touched,
    updateField,
    validateField,
    validateAll,
    isValid,
    reset,
  };
}
