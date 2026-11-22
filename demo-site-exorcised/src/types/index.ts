export interface Bill {
  accountNumber: string;
  amountDue: number;
  currency: string;
}

export interface PaymentFormData {
  cardNumber: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
}

export interface PaymentFormValidation {
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
}

export interface PaymentResult {
  success: boolean;
  totalCharged: number;
  addOnIncluded: boolean;
}

export type SupportedLanguage = 'en' | 'pa' | 'hi';

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  direction: 'ltr' | 'rtl';
}

export interface CardValidationErrors {
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
}

export const SAMPLE_BILL: Bill = {
  accountNumber: 'ACC-2024-7891',
  amountDue: 2490.00,
  currency: '₹'
};
