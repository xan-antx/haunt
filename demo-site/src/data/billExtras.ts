/**
 * Fixed display details shown around the bill. SAMPLE_BILL (src/types) stays the single source of the
 * account number and amount due; nothing here changes between page loads.
 * Dates are ISO calendar dates (YYYY-MM-DD) and are formatted in UTC, so the time zone never shifts them.
 */

export interface MonthlyUsage {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  /** Units (kWh) used that month. */
  units: number;
}

export interface BillExtras {
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  /** Oldest first; the last entry is the month on this bill. */
  usage: readonly MonthlyUsage[];
}

export const BILL_EXTRAS: BillExtras = {
  billingPeriodStart: '2026-10-01',
  billingPeriodEnd: '2026-10-31',
  dueDate: '2026-11-15',
  usage: [
    { month: '2026-05-01', units: 402 },
    { month: '2026-06-01', units: 468 },
    { month: '2026-07-01', units: 451 },
    { month: '2026-08-01', units: 397 },
    { month: '2026-09-01', units: 372 },
    { month: '2026-10-01', units: 356 },
  ],
};

/** Contact addresses use the reserved .example domain, so they can never reach a real mailbox. */
export const CONTACT = {
  careEmail: 'care@lanternbills.example',
  outageEmail: 'outage@lanternbills.example',
} as const;
