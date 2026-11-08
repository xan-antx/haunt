import { PaymentResult } from '../types';

export async function processPayment(
  cardNumber: string,
  addOnIncluded: boolean,
  billAmount: number
): Promise<PaymentResult> {
  // Simulate 800ms processing delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Magic failure card
  if (cardNumber.replace(/\s/g, '') === '4000000000000002') {
    return {
      success: false,
      totalCharged: 0,
      addOnIncluded: false
    };
  }
  
  // Calculate total with add-on if applicable
  const totalCharged = billAmount + (addOnIncluded ? 99 : 0);
  
  return {
    success: true,
    totalCharged,
    addOnIncluded
  };
}
