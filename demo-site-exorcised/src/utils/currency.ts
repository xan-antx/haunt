export function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function calculateTotal(billAmount: number, addOnIncluded: boolean): number {
  return billAmount + (addOnIncluded ? 99 : 0);
}
