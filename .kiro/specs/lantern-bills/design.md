# Design Document

## Overview

Lantern Bills is a demonstration React application built with Vite and TypeScript that simulates an electricity bill payment flow. The application intentionally contains six isolated accessibility and usability problems for testing purposes, while maintaining accessible implementation for all other features.

The architecture emphasizes component isolation—each of the six deliberate problems exists in its own clearly-named component. **These components will remain broken in this implementation.** Future bugfix specs will create separate fixed versions that can be swapped in independently without affecting other parts of the application.

**Key Technologies:**
- React 18 with TypeScript
- Vite for development server and build tooling
- react-i18next for internationalization
- React Router for client-side routing
- CSS Modules for component-scoped styling

**Design Principles:**
1. **Problem Isolation**: Each deliberate issue lives in a dedicated, clearly-named component
2. **Accessibility by Default**: All non-problem features follow WCAG 2.1 Level AA guidelines
3. **Zero External Dependencies**: No network calls, no external fonts, no analytics
4. **Deterministic Behavior**: Fixed sample data with no variation between loads
5. **Development Simplicity**: Single command startup (`npm run dev`) on port 3000

## Architecture

### High-Level Structure

The application follows a standard Vite + React + TypeScript project structure with deliberate problem components isolated in a dedicated directory:

```
demo-site/
├── public/                      # Static assets
│   └── locales/                 # Translation files (JSON)
│       ├── en/
│       │   └── translation.json
│       ├── pa/
│       │   └── translation.json # Deliberately incomplete
│       └── hi/
│           └── translation.json # Deliberately incomplete
├── src/
│   ├── components/              # UI components
│   │   ├── common/              # Standard accessible components (NOT problem components)
│   │   │   ├── Button.tsx       # Generic accessible button
│   │   │   ├── Input.tsx        # Generic accessible input
│   │   │   ├── Label.tsx        # Generic accessible label
│   │   │   └── FormField.tsx    # Generic accessible form field
│   │   ├── UnlabeledPayButton.tsx      # Problem 1 (intentionally broken)
│   │   ├── TrappingProtectionModal.tsx # Problem 2 (intentionally broken)
│   │   ├── SilentCardErrors.tsx        # Problem 3 (intentionally broken)
│   │   ├── LateBanner.tsx              # Problem 4 (intentionally broken)
│   │   └── OverflowingSummary.tsx      # Problem 5 (intentionally broken)
│   ├── pages/                   # Route-level components
│   │   ├── BillPage.tsx
│   │   ├── AutopayPage.tsx
│   │   └── ConfirmationPage.tsx
│   ├── hooks/                   # Custom React hooks
│   │   ├── useLanguage.tsx
│   │   └── usePaymentForm.tsx
│   ├── utils/                   # Utility functions
│   │   ├── validation.ts
│   │   └── currency.ts
│   ├── i18n/                    # i18n configuration
│   │   └── config.ts
│   ├── types/                   # TypeScript type definitions
│   │   └── index.ts
│   ├── App.tsx                  # Root component with routing
│   ├── main.tsx                 # Application entry point
│   └── index.css                # Global styles
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configuration
└── package.json
```

### Component Hierarchy

```
App (Router)
├── BillPage
│   ├── LateBanner (Problem 4)
│   ├── AutopayLink (positioned where button was before shift)
│   ├── OverflowingSummary (Problem 5)
│   ├── BillDetails
│   └── PaymentSection
│       ├── PaymentForm
│       │   ├── FormField (card number)
│       │   ├── FormField (expiry)
│       │   ├── FormField (CVV)
│       │   ├── FormField (cardholder name)
│       │   ├── SilentCardErrors (Problem 3)
│       │   └── UnlabeledPayButton (Problem 1)
│       └── TrappingProtectionModal (Problem 2)
├── AutopayPage
└── ConfirmationPage
```

### State Management Approach

The application uses **React's built-in state management** (useState, useContext) rather than external libraries like Redux or Zustand. This aligns with the zero-dependency philosophy and keeps the implementation simple.

**State Organization:**
- **Form state**: Local to PaymentForm component using usePaymentForm custom hook
- **Modal state**: Local to BillPage, lifted to parent to coordinate form submission
- **Language state**: Managed by react-i18next, accessed via useTranslation hook
- **Payment flow state**: URL-based routing (BillPage → ConfirmationPage)

**No state persistence**: Application resets completely on page refresh as required.

## Components and Interfaces

### Problem Components - Intentionally Broken

**CRITICAL**: The six problem components listed below exist ONLY in their broken form. This design does NOT include accessible or fixed versions of these components. They will remain broken in this implementation. Fixes will come later through separate bugfix specifications.

The six problem components are:
1. **UnlabeledPayButton** - Submit button with no accessible name
2. **TrappingProtectionModal** - Modal with keyboard trap and mouse-only controls
3. **SilentCardErrors** - Error messages not announced to screen readers
4. **LateBanner** - Image that loads late causing layout shift
5. **OverflowingSummary** - Content that clips at narrow viewport
6. **Missing Translation Keys** - Incomplete pa/hi translation files

Each component specification below describes ONLY the broken implementation.

---

#### 1. UnlabeledPayButton (Problem 1)

**Purpose**: Icon-only submit button with no accessible name

**Interface**:
```typescript
interface UnlabeledPayButtonProps {
  onClick: () => void;
  disabled?: boolean;
}
```

**Implementation Strategy**:
- Render a `<button>` element with only an SVG icon (arrow or chevron)
- **Deliberately omit**: aria-label, aria-labelledby, title, text content
- Use visual styling to make it recognizable as a button (color, shape, hover state)
- Remains keyboard-focusable and clickable
- Accessible name query returns empty/null

**Styling**: Distinct visual appearance (e.g., circular blue button with white arrow icon)

---

#### 2. TrappingProtectionModal (Problem 2)

**Purpose**: Modal with keyboard trap and mouse-only Continue/Close controls

**Interface**:
```typescript
interface TrappingProtectionModalProps {
  isOpen: boolean;
  onContinue: (addOnSelected: boolean) => void;
  onClose: () => void;
  amount: number;
}
```

**Implementation Strategy**:
- Use `role="dialog"` with proper aria-label
- **Focus management on open**:
  - Move focus to the Add_On_Checkbox when modal opens
  - Only checkbox and Learn_More_Link are in tab order (tabindex="0")
  - Continue_Control and Close_Control use **tabindex="-1"** (not keyboard-focusable)
- **Keyboard trap**:
  - Capture Tab and Shift+Tab events
  - Cycle focus between only checkbox and Learn_More_Link
  - Do NOT allow focus to leave modal
  - Do NOT respond to Escape key
- **Checkbox behavior**:
  - Checked by default on every open
  - Shows "₹99 payment protection" text
- **Learn_More_Link**:
  - Expands explanation text within modal (controlled by local state)
  - Does not navigate, does not move focus
- **Continue_Control**:
  - Only responds to mouse click
  - Shows 800ms loading indicator
  - Calls onContinue with checkbox state
- **Close_Control**:
  - Only responds to mouse click (X icon in corner)
  - Calls onClose without processing payment

**Modal Backdrop**: Semi-transparent overlay with onClick **disabled** (no click-outside-to-close)

---

#### 3. SilentCardErrors (Problem 3)

**Purpose**: Validation error messages visible to sighted users but not announced to screen readers

**Interface**:
```typescript
interface CardValidationErrors {
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
}

interface SilentCardErrorsProps {
  errors: CardValidationErrors;
}
```

**Implementation Strategy**:
- Render error messages as plain `<div>` or `<span>` elements below each field
- Apply CSS class for red text (e.g., `.error-text { color: #d32f2f; }`)
- **Deliberately omit**:
  - `role="alert"` or `aria-live` regions
  - `aria-describedby` linking errors to inputs
  - `aria-invalid` on input fields
  - Any mechanism that announces to screen readers
- Errors appear within 100ms of onBlur event
- Multiple errors can display simultaneously

**Validation Rules** (implemented in `src/utils/validation.ts`):
- Card number: minimum 13 digits, numeric only
- Expiry: MM/YY format, month 01-12, date not in past
- CVV: exactly 3 digits, numeric only

---

#### 4. LateBanner (Problem 4)

**Purpose**: Banner image that loads late and causes layout shift

**Interface**:
```typescript
interface LateBannerProps {
  // No props needed - behavior is self-contained
}
```

**Implementation Strategy**:
- Render an `<img>` element with no explicit height/width
- **Artificial delay**: Use setTimeout to set image src after exactly 1500ms
- **No space reservation**: Do not set min-height, aspect-ratio, or placeholder
- Use actual image asset (e.g., 1200x300px banner)
- Image loads while Pay_Bill_Button is already visible
- Button shifts downward by 100+ pixels when image loads
- After shift, Autopay_Link appears in the original button position

**Content**: Generic electricity company branding or landscape image

---

#### 5. OverflowingSummary (Problem 5)

**Purpose**: Payment summary box that clips content at 200% zoom (≤640px viewport)

**Interface**:
```typescript
interface OverflowingSummaryProps {
  amount: string; // e.g., "₹2,490.00"
}
```

**Implementation Strategy**:
- Render a fixed-width box with `overflow: hidden` in CSS
- At viewport width ≤640px:
  - Set explicit width in pixels (e.g., 180px)
  - Set `white-space: nowrap`
  - Apply `overflow: hidden` (no scroll)
  - Use large font size that causes text to exceed container
- Result: Last 1-2 characters of amount are clipped and inaccessible
- At viewport width >640px: Box behaves normally, content fits

**Styling**: Bordered box with padding, aligned to right side of page

---

#### 6. Missing Translation Keys (Problem 6)

**Location**: `public/locales/[lang]/translation.json` files

**Implementation Strategy**:
- **English (`en/translation.json`)**: Complete with all keys
- **Punjabi (`pa/translation.json`)**: 
  - **Omit**: `payBillButton`, `validation.cardNumber`, `validation.expiry`, `validation.cvv`
  - Include all other keys
- **Hindi (`hi/translation.json`)**: 
  - **Omit**: `payBillButton`, `validation.cardNumber`, `validation.expiry`, `validation.cvv`
  - Include all other keys
- react-i18next fallback behavior: When key is missing, display English text
- Affected components will show mixed languages (e.g., Punjabi page with English button text)

**Translation File Structure**:
```json
{
  "payBillButton": "Pay this bill",
  "billDetails": {
    "accountNumber": "Account Number",
    "amountDue": "Amount Due"
  },
  "paymentForm": {
    "cardNumber": "Card Number",
    "expiry": "Expiry Date",
    "cvv": "CVV",
    "cardholderName": "Cardholder Name"
  },
  "validation": {
    "cardNumber": "Please enter a valid card number",
    "expiry": "Please enter a valid expiry date",
    "cvv": "Please enter a valid CVV"
  },
  "modal": {
    "protectHeading": "Protect your payment",
    "addOnText": "Payment protection for ₹99",
    "learnMore": "Learn more",
    "continue": "Continue",
    "close": "Close"
  },
  "confirmation": {
    "success": "Payment received",
    "charged": "Total charged"
  },
  "autopay": {
    "comingSoon": "Autopay coming soon",
    "backToBill": "Back to bill"
  }
}
```

### Standard Accessible Components

**IMPORTANT**: These are standard UI building blocks, NOT reference implementations or fixed versions of the six problem components. The problem components (UnlabeledPayButton, TrappingProtectionModal, SilentCardErrors, LateBanner, OverflowingSummary, and missing translation keys) exist ONLY in their broken form and will remain broken in this implementation. Fixes will come later through separate bugfix specs.

#### Button Component (Generic, NOT a fix for UnlabeledPayButton)
```typescript
interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  ariaLabel?: string; // Used when children is not text
}
```
- Semantic `<button>` element
- Proper focus indicators
- Keyboard support (Enter/Space)
- Sufficient color contrast
- **Usage**: General navigation buttons, form controls (NOT the pay button, which uses UnlabeledPayButton)

#### FormField Component (Generic, NOT related to SilentCardErrors)
```typescript
interface FormFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string; // Properly announced error
  required?: boolean;
}
```
- Semantic `<label>` associated with `<input>` via htmlFor/id
- aria-invalid when error present
- aria-describedby linking to error message
- Error message in aria-live region (role="alert")
- **Usage**: Standard form inputs that are NOT part of the payment card validation (which uses SilentCardErrors for error display)

## Data Models

### Bill Data
```typescript
interface Bill {
  accountNumber: string;  // "ACC-2024-7891"
  amountDue: number;       // 2490.00 (in rupees)
  currency: string;        // "₹"
}

const SAMPLE_BILL: Bill = {
  accountNumber: "ACC-2024-7891",
  amountDue: 2490.00,
  currency: "₹"
};
```

### Payment Form Data
```typescript
interface PaymentFormData {
  cardNumber: string;
  expiry: string;        // MM/YY format
  cvv: string;
  cardholderName: string;
}

interface PaymentFormValidation {
  cardNumber?: string;   // Error message or undefined
  expiry?: string;
  cvv?: string;
}
```

### Payment Result
```typescript
interface PaymentResult {
  success: boolean;
  totalCharged: number;  // 2490.00 or 2589.00
  addOnIncluded: boolean;
}
```

### Language Configuration
```typescript
type SupportedLanguage = 'en' | 'pa' | 'hi';

interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  direction: 'ltr' | 'rtl'; // All three are LTR
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before writing correctness properties, I need to perform prework analysis to determine which acceptance criteria are testable as properties.


### Reflection and Redundancy Elimination

After analyzing all acceptance criteria, I identified the following properties suitable for property-based testing. Here's the reflection to eliminate redundancy:

**Redundant Properties Identified:**
- Properties 2.4 and 5.1 are identical (valid form submission triggers modal) - keep only 2.4
- Properties 6.1, 6.2, 6.3 test the same validation pattern for different fields - combine into one property about field validation
- Properties 6.5, 6.6, 6.7 all verify missing accessibility attributes - combine into one property
- Properties 9.4, 9.5, 9.6, 9.7 all test fallback behavior for missing keys - combine into one property

**Properties After Consolidation:**

From Requirement 2 (Bill Payment Flow):
- Property 2.4: Valid form submission triggers modal
- Property 2.5: Invalid form submission shows errors, no modal
- Property 2.6: Modal opening moves focus to checkbox
- Property 2.9: Non-failure card numbers succeed
- Property 2.10 & 2.11: Total calculation with/without add-on (combine into one property)
- Property 2.12: Confirmation element has data-haunt attribute in all languages
- Property 2.13: Bill data is invariant across loads

From Requirement 3 (Multilingual Support):
- Property 3.2, 3.3, 3.4: Browser language detection and fallback (combine)
- Property 3.6, 3.7: URL parameter override behavior (combine)

From Requirement 5 (Keyboard-Inaccessible Modal):
- Property 5.4 & 5.5: Checkbox always starts checked (combine)
- Property 5.6: Tab cycling stays within two elements

From Requirement 6 (Visual-Only Error Messages):
- Property 6.1-6.3: Field validation displays errors (combine)
- Property 6.8: Multiple errors coexist

From Requirement 7 (Layout Shift):
- Property 7.4: Button shifts by ≥100px

From Requirement 8 (Content Overflow):
- Property 8.2 & 8.3: Content clipping at narrow viewport (combine)

From Requirement 10 (Accessibility):
- Property 10.5: Keyboard activation equivalence
- Property 10.7: One h1 per page
- Property 10.10: Descriptive page titles
- Property 10.11: HTML lang attribute matches language

### Property 1: Valid Form Submission Triggers Modal

*For any* valid payment form data (card number with ≥13 digits, valid future expiry date, 3-digit CVV, non-empty cardholder name), submitting the form SHALL display the Protection Modal.

**Validates: Requirements 2.4**

### Property 2: Invalid Form Submission Shows Errors

*For any* payment form data containing at least one invalid field, submitting the form SHALL display error messages for all invalid fields and SHALL NOT display the Protection Modal.

**Validates: Requirements 2.5**

### Property 3: Modal Focus Management

*For any* valid payment submission that opens the Protection Modal, keyboard focus SHALL move to the Add_On_Checkbox when the modal opens.

**Validates: Requirements 2.6**

### Property 4: Non-Failure Cards Succeed

*For any* valid card number other than 4000000000000002, payment processing SHALL succeed and display the Confirmation Element with data-haunt="payment-success".

**Validates: Requirements 2.9, 2.12**

### Property 5: Total Calculation Correctness

*For any* successful payment flow, if the Add_On_Checkbox is checked when Continue is activated, the total charged SHALL be ₹2,589.00; if unchecked, the total SHALL be ₹2,490.00.

**Validates: Requirements 2.10, 2.11**

### Property 6: Bill Data Invariance

*For any* sequence of page loads, the displayed bill data (account number ACC-2024-7891, amount due ₹2,490.00) SHALL remain identical.

**Validates: Requirements 2.13**

### Property 7: Language Detection and Fallback

*For any* browser language setting, the application SHALL display UI text in that language if it matches en, pa, or hi (ignoring region codes), otherwise SHALL fall back to English.

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 8: URL Language Override

*For any* URL query parameter ?lang=en, ?lang=pa, or ?lang=hi, the application SHALL display UI text in that language, overriding browser language detection; for any invalid lang parameter value, the application SHALL ignore it and use browser language detection.

**Validates: Requirements 3.6, 3.7**

### Property 9: Checkbox Default State

*For any* opening of the Protection Modal (first open or after dismissing and reopening), the Add_On_Checkbox SHALL be checked by default, regardless of previous user interaction.

**Validates: Requirements 5.4, 5.5**

### Property 10: Keyboard Trap Cycling

*For any* sequence of Tab and Shift+Tab key presses while the Protection Modal is displayed, keyboard focus SHALL cycle only between the Add_On_Checkbox and the Learn_More_Link, never reaching Continue_Control or Close_Control.

**Validates: Requirements 5.6**

### Property 11: Field Validation Error Display

*For any* form field that contains invalid data (card number <13 digits or non-numeric, expiry date in past or invalid month, CVV <3 digits or non-numeric), when focus moves away from that field, an error message SHALL appear within 100 milliseconds.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 12: Multiple Simultaneous Errors

*For any* combination of invalid fields in the payment form, each invalid field SHALL display its own distinct error message simultaneously.

**Validates: Requirements 6.8**

### Property 13: Layout Shift Magnitude

*For any* page load where the late-loading banner appears, the Pay_Bill_Button SHALL shift downward by at least 100 pixels from its initial position when the banner completes loading.

**Validates: Requirements 7.4**

### Property 14: Content Clipping at Narrow Viewport

*For any* viewport width ≤640 CSS pixels, the Payment_Summary box SHALL clip the bill total such that at least the last character is not visible and the clipped content SHALL NOT be accessible through scrolling or text reflow.

**Validates: Requirements 8.2, 8.3**

### Property 15: Missing Translation Fallback

*For any* language setting of pa or hi, UI elements using missing translation keys (payBillButton, validation error messages) SHALL display in English while all other UI text displays in the selected language.

**Validates: Requirements 9.4, 9.5, 9.6, 9.7, 9.8**

### Property 16: Keyboard Interaction Equivalence

*For any* keyboard-accessible interactive element (excluding Continue_Control and Close_Control in the modal), activating it with Enter or Space key SHALL perform the same action as a mouse click.

**Validates: Requirements 10.5**

### Property 17: Single H1 Per Page

*For any* page in the application (Bill_Page, Autopay_Page, Confirmation_Page), exactly one h1 heading element SHALL exist.

**Validates: Requirements 10.7**

### Property 18: Descriptive Page Titles

*For any* page in the application, the document title element SHALL contain descriptive text identifying the current page.

**Validates: Requirements 10.10**

### Property 19: HTML Lang Attribute Synchronization

*For any* selected language (en, pa, hi), the html element's lang attribute SHALL be set to match the currently displayed language.

**Validates: Requirements 10.11**

## Error Handling

### Validation Errors

**Card Number Validation**:
- Pattern: Must be numeric only, minimum 13 digits
- Error message: "Please enter a valid card number" (key: `validation.cardNumber`)
- Timing: Display within 100ms of onBlur event
- Visual-only (Problem 3): No aria-live, role="alert", aria-describedby, or aria-invalid

**Expiry Date Validation**:
- Pattern: MM/YY format, month 01-12, date must not be in past
- Error message: "Please enter a valid expiry date" (key: `validation.expiry`)
- Timing: Display within 100ms of onBlur event
- Visual-only (Problem 3): No screen reader announcement

**CVV Validation**:
- Pattern: Exactly 3 numeric digits
- Error message: "Please enter a valid CVV" (key: `validation.cvv`)
- Timing: Display within 100ms of onBlur event
- Visual-only (Problem 3): No screen reader announcement

**Implementation Location**: `src/utils/validation.ts`

```typescript
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
  
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10) + 2000;
  
  if (month < 1 || month > 12) {
    return { isValid: false, error: 'Please enter a valid expiry date' };
  }
  
  const expiry = new Date(year, month - 1);
  const now = new Date();
  now.setDate(1); // Compare at month level
  
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
```

### Payment Processing Errors

**Magic Failure Card**: `4000000000000002`
- Behavior: After 800ms processing delay, display payment failure
- Error indication: Element with `role="alert"` containing failure message
- Error message: "Payment failed. Please try a different card." (key: `payment.failed`)
- This is the ONLY card that triggers screen reader announcement (to demonstrate proper error handling vs. Problem 3)

**All Other Valid Cards**: Payment succeeds after 800ms

### Network Errors

The application makes **no network calls** and therefore has no network error handling. All data is static and embedded in the application.

### Translation Fallback

When a translation key is missing:
- react-i18next automatically falls back to English (en) translation
- No error thrown or logged
- Silent fallback enables Problem 6 (incomplete translations)

## Testing Strategy

### Dual Testing Approach

The Lantern Bills application requires both **unit tests** and **property-based tests** for comprehensive coverage.

#### Unit Tests (Example-Based)

**Purpose**: Verify specific examples, integration points, and edge cases

**Framework**: Vitest + React Testing Library

**Coverage Areas**:
- Application setup and infrastructure (Requirement 1): Smoke tests for build config, port binding
- Specific UI interactions (Requirement 2): Click handlers, form submission, modal opening
- Problem component structure (Requirements 4-9): Verify deliberate issues exist as specified
- Accessibility landmarks and structure (Requirement 10): Verify semantic HTML, heading hierarchy
- Translation file structure (Requirement 9): Verify expected keys present/absent

**Example Unit Tests**:
```typescript
// Smoke test: App renders bill page on load
test('displays bill page with account number and amount', () => {
  render(<App />);
  expect(screen.getByText('ACC-2024-7891')).toBeInTheDocument();
  expect(screen.getByText('₹2,490.00')).toBeInTheDocument();
});

// Problem verification: UnlabeledPayButton has no accessible name
test('submit button has no accessible name', () => {
  render(<PaymentForm />);
  const button = screen.getByRole('button', { name: /submit|pay/i });
  expect(button).toHaveAccessibleName(''); // Empty accessible name
});

// Edge case: Magic failure card
test('card 4000000000000002 fails payment with alert', async () => {
  render(<App />);
  // Fill form with failure card...
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Payment failed');
  }, { timeout: 1000 });
});
```

#### Property-Based Tests

**Purpose**: Verify universal properties hold across many generated inputs

**Framework**: fast-check (TypeScript property-based testing library)

**Configuration**: 
- Minimum 100 iterations per property test
- Each test tagged with comment referencing design property

**Test Tag Format**:
```typescript
/**
 * Feature: lantern-bills, Property 1: Valid Form Submission Triggers Modal
 * 
 * For any valid payment form data, submitting the form SHALL display the Protection Modal.
 */
test('property: valid form submission triggers modal', () => {
  fc.assert(
    fc.property(validPaymentDataArbitrary(), (formData) => {
      // Test implementation
    }),
    { numRuns: 100 }
  );
});
```

**Generators (Arbitraries)**:

```typescript
// Valid payment form data generator
function validPaymentDataArbitrary(): fc.Arbitrary<PaymentFormData> {
  return fc.record({
    cardNumber: fc.stringOf(fc.integer(0, 9).map(String), { minLength: 13, maxLength: 19 }),
    expiry: futureExpiryArbitrary(),
    cvv: fc.stringOf(fc.integer(0, 9).map(String), { minLength: 3, maxLength: 3 }),
    cardholderName: fc.string({ minLength: 1 }),
  });
}

// Future expiry date generator
function futureExpiryArbitrary(): fc.Arbitrary<string> {
  return fc.integer(0, 60).map(monthsAhead => {
    const date = new Date();
    date.setMonth(date.getMonth() + monthsAhead + 1);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${year}`;
  });
}

// Invalid form data generator (at least one invalid field)
function invalidPaymentDataArbitrary(): fc.Arbitrary<PaymentFormData> {
  return fc.oneof(
    fc.record({ // Invalid card
      cardNumber: fc.oneof(
        fc.string({ maxLength: 12 }), // Too short
        fc.string().filter(s => !/^\d+$/.test(s)) // Non-numeric
      ),
      expiry: futureExpiryArbitrary(),
      cvv: fc.stringOf(fc.integer(0, 9).map(String), { minLength: 3, maxLength: 3 }),
      cardholderName: fc.string({ minLength: 1 }),
    }),
    // ... similar records for invalid expiry, invalid CVV
  );
}

// Viewport width generator for responsive testing
function narrowViewportArbitrary(): fc.Arbitrary<number> {
  return fc.integer(320, 640); // Mobile to narrow tablet
}

// Browser language code generator
function browserLanguageArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom('en', 'en-US', 'en-GB'), // English variants
    fc.constantFrom('pa', 'pa-IN'), // Punjabi variants
    fc.constantFrom('hi', 'hi-IN'), // Hindi variants
    fc.string().filter(s => !['en', 'pa', 'hi'].some(lang => s.startsWith(lang))) // Unsupported
  );
}
```

**Property Test Coverage**:
- Properties 1-19 from the Correctness Properties section
- Each property maps to one or more property-based tests
- Total minimum: 19 property tests × 100 iterations = 1,900 test executions

**Integration with CI**:
- Run on every commit
- Property tests may uncover edge cases not visible in unit tests
- Failures include shrunk counterexample for debugging

### Test Organization

```
demo-site/
└── src/
    ├── components/
    │   ├── accessible/
    │   │   └── __tests__/
    │   │       ├── Button.test.tsx
    │   │       └── FormField.test.tsx
    │   └── problems/
    │       └── __tests__/
    │           ├── UnlabeledPayButton.test.tsx
    │           ├── TrappingProtectionModal.test.tsx
    │           ├── SilentCardErrors.test.tsx
    │           ├── LateBanner.test.tsx
    │           └── OverflowingSummary.test.tsx
    ├── pages/
    │   └── __tests__/
    │       ├── BillPage.test.tsx
    │       └── BillPage.properties.test.tsx # Property-based tests
    ├── utils/
    │   └── __tests__/
    │       ├── validation.test.tsx # Unit tests
    │       └── validation.properties.test.tsx # Property-based tests
    └── __tests__/
        ├── App.test.tsx # Integration tests
        └── properties/ # Property-based test suite
            ├── payment-flow.properties.test.tsx
            ├── language.properties.test.tsx
            ├── modal.properties.test.tsx
            └── accessibility.properties.test.tsx
```

### Testing the Deliberate Problems

Each problem component must have tests that **verify the problem exists as specified**. These tests confirm the broken behavior is present and detectable by ghost testing tools. 

**IMPORTANT**: These are NOT tests of fixed versions. There are no fixed versions in this implementation.

1. **UnlabeledPayButton**: Test that accessible name is empty
2. **TrappingProtectionModal**: Test that Tab never reaches Continue/Close, Escape doesn't close
3. **SilentCardErrors**: Test that errors lack aria-live, role="alert", aria-describedby, aria-invalid
4. **LateBanner**: Test that button position shifts by ≥100px after banner loads
5. **OverflowingSummary**: Test that content clips at ≤640px viewport
6. **Missing translations**: Test that pa/hi files lack specific keys

These tests ensure the problems remain present and detectable by ghost testing tools. Future bugfix specs will create separate fixed implementations.

## Internationalization (i18n) Implementation

### Library and Configuration

**Library**: react-i18next + i18next + i18next-http-backend + i18next-browser-languagedetector

**Configuration File**: `src/i18n/config.ts`

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpBackend) // Load translations from /public/locales
  .use(LanguageDetector) // Detect browser language
  .use(initReactI18next) // Pass i18n to react-i18next
  .init({
    fallbackLng: 'en', // Default to English
    supportedLngs: ['en', 'pa', 'hi'], // Supported languages
    detection: {
      order: ['querystring', 'navigator'], // Check ?lang= first, then browser
      lookupQuerystring: 'lang',
    },
    backend: {
      loadPath: '/locales/{{lng}}/translation.json', // Translation file path
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false, // Disable suspense for simpler error handling
    },
  });

export default i18n;
```

### Translation File Structure

**Directory**: `public/locales/`

**English (`public/locales/en/translation.json`)** - Complete:
```json
{
  "pageTitle": "Lantern Bills - Pay Your Bill",
  "payBillButton": "Pay this bill",
  "billDetails": {
    "heading": "Your Electricity Bill",
    "accountNumber": "Account Number",
    "amountDue": "Amount Due"
  },
  "paymentForm": {
    "heading": "Payment Details",
    "cardNumber": "Card Number",
    "cardNumberPlaceholder": "1234 5678 9012 3456",
    "expiry": "Expiry Date",
    "expiryPlaceholder": "MM/YY",
    "cvv": "CVV",
    "cvvPlaceholder": "123",
    "cardholderName": "Cardholder Name",
    "cardholderNamePlaceholder": "Full name on card"
  },
  "validation": {
    "cardNumber": "Please enter a valid card number",
    "expiry": "Please enter a valid expiry date",
    "cvv": "Please enter a valid CVV"
  },
  "modal": {
    "protectHeading": "Protect your payment",
    "addOnText": "Payment protection for ₹99",
    "addOnDescription": "Get instant refund if payment fails due to technical issues",
    "learnMore": "Learn more",
    "continue": "Continue",
    "close": "Close"
  },
  "payment": {
    "processing": "Processing payment...",
    "failed": "Payment failed. Please try a different card."
  },
  "confirmation": {
    "heading": "Payment received",
    "message": "Your payment has been processed successfully.",
    "charged": "Total charged",
    "accountNumber": "Account Number",
    "backToBill": "Make another payment"
  },
  "autopay": {
    "heading": "Set Up Autopay",
    "comingSoon": "Autopay coming soon",
    "description": "This feature will be available soon.",
    "backToBill": "Back to bill"
  },
  "banner": {
    "alt": "Lantern Bills - Powering Your Home"
  },
  "summary": {
    "total": "Total Amount"
  },
  "autopayLink": "Set up autopay"
}
```

**Punjabi (`public/locales/pa/translation.json`)** - Deliberately Incomplete:
```json
{
  "pageTitle": "ਲੈਂਟਰਨ ਬਿਲ - ਆਪਣਾ ਬਿੱਲ ਭੁਗਤਾਨ ਕਰੋ",
  "_MISSING_payBillButton": "Deliberately omitted - will fallback to English",
  "billDetails": {
    "heading": "ਤੁਹਾਡਾ ਬਿਜਲੀ ਦਾ ਬਿੱਲ",
    "accountNumber": "ਖਾਤਾ ਨੰਬਰ",
    "amountDue": "ਬਕਾਇਆ ਰਕਮ"
  },
  "paymentForm": {
    "heading": "ਭੁਗਤਾਨ ਵੇਰਵੇ",
    "cardNumber": "ਕਾਰਡ ਨੰਬਰ",
    "cardNumberPlaceholder": "1234 5678 9012 3456",
    "expiry": "ਮਿਆਦ ਪੁੱਗਣ ਦੀ ਮਿਤੀ",
    "expiryPlaceholder": "MM/YY",
    "cvv": "CVV",
    "cvvPlaceholder": "123",
    "cardholderName": "ਕਾਰਡਧਾਰਕ ਦਾ ਨਾਮ",
    "cardholderNamePlaceholder": "ਕਾਰਡ ਤੇ ਪੂਰਾ ਨਾਮ"
  },
  "_MISSING_validation": "Deliberately omitted - will fallback to English",
  "modal": {
    "protectHeading": "ਆਪਣੇ ਭੁਗਤਾਨ ਦੀ ਰੱਖਿਆ ਕਰੋ",
    "addOnText": "₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ",
    "addOnDescription": "ਜੇਕਰ ਤਕਨੀਕੀ ਸਮੱਸਿਆਵਾਂ ਕਾਰਨ ਭੁਗਤਾਨ ਅਸਫਲ ਹੁੰਦਾ ਹੈ ਤਾਂ ਤੁਰੰਤ ਰਿਫੰਡ ਪ੍ਰਾਪਤ ਕਰੋ",
    "learnMore": "ਹੋਰ ਜਾਣੋ",
    "continue": "ਜਾਰੀ ਰੱਖੋ",
    "close": "ਬੰਦ ਕਰੋ"
  },
  "payment": {
    "processing": "ਭੁਗਤਾਨ ਪ੍ਰੋਸੈਸ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ...",
    "failed": "ਭੁਗਤਾਨ ਅਸਫਲ ਰਿਹਾ। ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਵੱਖਰਾ ਕਾਰਡ ਅਜ਼ਮਾਓ।"
  },
  "confirmation": {
    "heading": "ਭੁਗਤਾਨ ਪ੍ਰਾਪਤ ਹੋਇਆ",
    "message": "ਤੁਹਾਡਾ ਭੁਗਤਾਨ ਸਫਲਤਾਪੂਰਵਕ ਪ੍ਰੋਸੈਸ ਕੀਤਾ ਗਿਆ ਹੈ।",
    "charged": "ਕੁੱਲ ਚਾਰਜ ਕੀਤਾ ਗਿਆ",
    "accountNumber": "ਖਾਤਾ ਨੰਬਰ",
    "backToBill": "ਇੱਕ ਹੋਰ ਭੁਗਤਾਨ ਕਰੋ"
  },
  "autopay": {
    "heading": "ਆਟੋਪੇ ਸੈੱਟਅੱਪ ਕਰੋ",
    "comingSoon": "ਆਟੋਪੇ ਜਲਦੀ ਆ ਰਿਹਾ ਹੈ",
    "description": "ਇਹ ਵਿਸ਼ੇਸ਼ਤਾ ਜਲਦੀ ਉਪਲਬਧ ਹੋਵੇਗੀ।",
    "backToBill": "ਬਿੱਲ 'ਤੇ ਵਾਪਸ ਜਾਓ"
  },
  "banner": {
    "alt": "ਲੈਂਟਰਨ ਬਿਲ - ਤੁਹਾਡੇ ਘਰ ਨੂੰ ਸ਼ਕਤੀ ਦੇਣਾ"
  },
  "summary": {
    "total": "ਕੁੱਲ ਰਕਮ"
  },
  "autopayLink": "ਆਟੋਪੇ ਸੈੱਟਅੱਪ ਕਰੋ"
}
```

**Hindi (`public/locales/hi/translation.json`)** - Deliberately Incomplete:
```json
{
  "pageTitle": "लैंटर्न बिल - अपना बिल भुगतान करें",
  "_MISSING_payBillButton": "Deliberately omitted - will fallback to English",
  "billDetails": {
    "heading": "आपका बिजली बिल",
    "accountNumber": "खाता संख्या",
    "amountDue": "देय राशि"
  },
  "paymentForm": {
    "heading": "भुगतान विवरण",
    "cardNumber": "कार्ड नंबर",
    "cardNumberPlaceholder": "1234 5678 9012 3456",
    "expiry": "समाप्ति तिथि",
    "expiryPlaceholder": "MM/YY",
    "cvv": "CVV",
    "cvvPlaceholder": "123",
    "cardholderName": "कार्डधारक का नाम",
    "cardholderNamePlaceholder": "कार्ड पर पूरा नाम"
  },
  "_MISSING_validation": "Deliberately omitted - will fallback to English",
  "modal": {
    "protectHeading": "अपने भुगतान की रक्षा करें",
    "addOnText": "₹99 के लिए भुगतान सुरक्षा",
    "addOnDescription": "यदि तकनीकी समस्याओं के कारण भुगतान विफल होता है तो तुरंत रिफंड प्राप्त करें",
    "learnMore": "और जानें",
    "continue": "जारी रखें",
    "close": "बंद करें"
  },
  "payment": {
    "processing": "भुगतान प्रोसेस हो रहा है...",
    "failed": "भुगतान विफल रहा। कृपया एक अलग कार्ड आज़माएं।"
  },
  "confirmation": {
    "heading": "भुगतान प्राप्त हुआ",
    "message": "आपका भुगतान सफलतापूर्वक प्रोसेस किया गया है।",
    "charged": "कुल चार्ज किया गया",
    "accountNumber": "खाता संख्या",
    "backToBill": "एक और भुगतान करें"
  },
  "autopay": {
    "heading": "ऑटोपे सेटअप करें",
    "comingSoon": "ऑटोपे जल्द आ रहा है",
    "description": "यह सुविधा जल्द ही उपलब्ध होगी।",
    "backToBill": "बिल पर वापस जाएं"
  },
  "banner": {
    "alt": "लैंटर्न बिल - आपके घर को शक्ति प्रदान करना"
  },
  "summary": {
    "total": "कुल राशि"
  },
  "autopayLink": "ऑटोपे सेटअप करें"
}
```

### Usage in Components

```typescript
import { useTranslation } from 'react-i18next';

function BillPage() {
  const { t, i18n } = useTranslation();
  
  // Simple translation
  const accountLabel = t('billDetails.accountNumber'); // "Account Number"
  
  // With interpolation
  const amount = t('billDetails.amountDue'); // "Amount Due"
  
  // Change language programmatically
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };
  
  // Current language
  const currentLang = i18n.language; // 'en', 'pa', or 'hi'
  
  return (
    <div lang={currentLang}>
      <h1>{t('billDetails.heading')}</h1>
      {/* ... */}
    </div>
  );
}
```

### Language Detection Flow

1. **Check URL Query Parameter**: `?lang=en|pa|hi` (highest priority)
2. **Check Browser Language**: `navigator.languages` array
3. **Match with region codes ignored**: `en-US` → `en`, `pa-IN` → `pa`
4. **Fallback to English**: If no match found

### HTML Lang Attribute

The html element's lang attribute must be synchronized with the current language:

```typescript
// In App.tsx or language change handler
useEffect(() => {
  document.documentElement.lang = i18n.language;
}, [i18n.language]);
```

## Routing and Page Flow

### Routing Library

**Library**: React Router v6

**Configuration**: `src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BillPage from './pages/BillPage';
import AutopayPage from './pages/AutopayPage';
import ConfirmationPage from './pages/ConfirmationPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BillPage />} />
        <Route path="/autopay" element={<AutopayPage />} />
        <Route path="/confirmation" element={<ConfirmationPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Page Flow

```
┌─────────────┐
│  BillPage   │ (/)
│   - Banner  │
│   - Summary │
│   - Form    │
└──────┬──────┘
       │
       ├─ Click "Set up autopay" link
       │  (appears after banner loads, in original button position)
       │  
       v
┌─────────────┐
│ AutopayPage │ (/autopay)
│  "Coming    │
│   soon"     │
│   [Back]    │
└──────┬──────┘
       │
       └─ Click "Back to bill" → return to BillPage
       
       
┌─────────────┐
│  BillPage   │
│ with Form   │
└──────┬──────┘
       │
       └─ Fill form, submit, confirm in modal
          
          v
┌─────────────┐
│Confirmation │ (/confirmation)
│   Page      │
│ ✓ Success   │
└─────────────┘
```

### Navigation Implementation

**Autopay Link** (in BillPage):
```typescript
import { Link } from 'react-router-dom';

<Link to="/autopay" className="autopay-link">
  {t('autopayLink')}
</Link>
```

**Programmatic Navigation** (after payment success):
```typescript
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

const handlePaymentSuccess = (result: PaymentResult) => {
  // Navigate to confirmation with state
  navigate('/confirmation', { 
    state: { 
      totalCharged: result.totalCharged,
      addOnIncluded: result.addOnIncluded 
    } 
  });
};
```

**Reading Navigation State** (in ConfirmationPage):
```typescript
import { useLocation } from 'react-router-dom';

const location = useLocation();
const { totalCharged, addOnIncluded } = location.state || {};
```

## CSS and Styling Strategy

### Styling Approach

**CSS Modules** for component-scoped styles, ensuring problem components can be styled independently without affecting others.

### Global Styles

**File**: `src/index.css`

```css
/* CSS Reset and base styles */
*, *::before, *::after {
  box-sizing: border-box;
}

* {
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.5;
  color: #1a1a1a;
  background-color: #f5f5f5;
}

/* Ensure sufficient color contrast (WCAG AA) */
:root {
  --color-primary: #0066cc; /* 4.5:1 contrast on white */
  --color-error: #d32f2f; /* 5.5:1 contrast on white */
  --color-success: #2e7d32; /* 4.6:1 contrast on white */
  --color-text: #1a1a1a; /* 15:1 contrast on white */
  --color-text-light: #666666; /* 4.6:1 contrast on white */
  --color-border: #cccccc;
  --color-background: #ffffff;
}

/* Focus indicators for keyboard navigation */
*:focus-visible {
  outline: 3px solid #0066cc;
  outline-offset: 2px;
}

/* Landmark elements */
header, main, footer {
  display: block;
}
```

### Component-Specific Styles (CSS Modules)

**Example**: `src/components/problems/LateBanner.module.css`

```css
.banner {
  /* No min-height or aspect-ratio - allows layout shift */
  width: 100%;
  display: block;
}

.banner img {
  width: 100%;
  height: auto;
  display: block;
}
```

**Example**: `src/components/problems/OverflowingSummary.module.css`

```css
.summary {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  padding: 1rem;
  border-radius: 4px;
}

/* Problem 5: Content overflow at narrow viewport */
@media (max-width: 640px) {
  .summary {
    width: 180px; /* Fixed width */
    overflow: hidden; /* No scroll */
    white-space: nowrap; /* Prevent wrapping */
  }
  
  .amount {
    font-size: 1.5rem; /* Large enough to overflow */
  }
}

@media (min-width: 641px) {
  .summary {
    width: auto;
  }
}
```

**Example**: `src/components/problems/TrappingProtectionModal.module.css`

```css
.backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background-color: var(--color-background);
  border-radius: 8px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.checkbox, .learnMore {
  /* These are keyboard-focusable (tabindex="0") */
}

.continueButton, .closeButton {
  /* Problem 2: These are mouse-only */
  /* tabindex="-1" applied in component code */
  cursor: pointer;
  background-color: var(--color-primary);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
}

.closeButton {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background-color: transparent;
  color: var(--color-text);
  padding: 0.5rem;
}
```

### Accessibility-Compliant Styles

All non-problem components follow these rules:
- **Color contrast**: Minimum 4.5:1 for normal text, 3:1 for large text (18pt or 14pt bold)
- **Focus indicators**: Visible 3px outline for all interactive elements
- **Responsive design**: Functional at 100%, 150%, and 200% zoom (except Problem 5 at 200%)
- **Semantic HTML**: Styles enhance semantic structure, don't replace it

## Build Configuration

### Vite Configuration

**File**: `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Required: Run on port 3000
    strictPort: true, // Fail if port is already in use
    open: false, // Don't auto-open browser
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // No source maps for demo
    rollupOptions: {
      output: {
        manualChunks: undefined, // Single bundle for simplicity
      },
    },
  },
  preview: {
    port: 3000, // Preview build on same port
  },
});
```

### TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Package Scripts

**File**: `package.json`

```json
{
  "name": "lantern-bills",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest --run",
    "test:watch": "vitest",
    "test:properties": "vitest --run --grep 'Feature: lantern-bills, Property'",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.22.0",
    "react-i18next": "^14.0.0",
    "i18next": "^23.8.0",
    "i18next-http-backend": "^2.4.0",
    "i18next-browser-languagedetector": "^7.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "@vitejs/plugin-react": "^4.2.1",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "typescript": "^5.3.3",
    "vite": "^5.1.0",
    "@testing-library/react": "^14.2.0",
    "@testing-library/jest-dom": "^6.3.0",
    "@testing-library/user-event": "^14.5.2",
    "vitest": "^1.2.0",
    "jsdom": "^24.0.0",
    "fast-check": "^3.15.0"
  }
}
```

## Utility Functions and Hooks

### Custom Hooks

#### useLanguage Hook

**File**: `src/hooks/useLanguage.tsx`

```typescript
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

/**
 * Custom hook to manage language detection and HTML lang attribute synchronization
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    // Check for ?lang= query parameter
    const langParam = searchParams.get('lang');
    if (langParam && ['en', 'pa', 'hi'].includes(langParam)) {
      i18n.changeLanguage(langParam);
    }
  }, [searchParams, i18n]);
  
  useEffect(() => {
    // Synchronize HTML lang attribute with current language
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  
  return {
    currentLanguage: i18n.language,
    changeLanguage: i18n.changeLanguage,
  };
}
```

#### usePaymentForm Hook

**File**: `src/hooks/usePaymentForm.tsx`

```typescript
import { useState } from 'react';
import { validateCardNumber, validateExpiry, validateCVV, ValidationResult } from '../utils/validation';

export interface PaymentFormData {
  cardNumber: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
}

export interface PaymentFormErrors {
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
}

export function usePaymentForm() {
  const [formData, setFormData] = useState<PaymentFormData>({
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardholderName: '',
  });
  
  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const [touched, setTouched] = useState<Set<keyof PaymentFormData>>(new Set());
  
  const updateField = (field: keyof PaymentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const validateField = (field: keyof PaymentFormData) => {
    setTouched(prev => new Set(prev).add(field));
    
    let result: ValidationResult = { isValid: true };
    
    switch (field) {
      case 'cardNumber':
        result = validateCardNumber(formData.cardNumber);
        break;
      case 'expiry':
        result = validateExpiry(formData.expiry);
        break;
      case 'cvv':
        result = validateCVV(formData.cvv);
        break;
    }
    
    if (result.isValid) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    } else {
      setErrors(prev => ({ ...prev, [field]: result.error }));
    }
  };
  
  const isValid = () => {
    const cardValid = validateCardNumber(formData.cardNumber).isValid;
    const expiryValid = validateExpiry(formData.expiry).isValid;
    const cvvValid = validateCVV(formData.cvv).isValid;
    const nameValid = formData.cardholderName.trim().length > 0;
    
    return cardValid && expiryValid && cvvValid && nameValid;
  };
  
  const reset = () => {
    setFormData({
      cardNumber: '',
      expiry: '',
      cvv: '',
      cardholderName: '',
    });
    setErrors({});
    setTouched(new Set());
  };
  
  return {
    formData,
    errors,
    touched,
    updateField,
    validateField,
    isValid,
    reset,
  };
}
```

### Utility Functions

#### Currency Formatting

**File**: `src/utils/currency.ts`

```typescript
/**
 * Format amount in rupees with currency symbol
 */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

/**
 * Calculate total with optional add-on
 */
export function calculateTotal(baseAmount: number, includeAddOn: boolean): number {
  const ADD_ON_PRICE = 99.00;
  return includeAddOn ? baseAmount + ADD_ON_PRICE : baseAmount;
}
```

#### Payment Processing

**File**: `src/utils/payment.ts`

```typescript
const MAGIC_FAILURE_CARD = '4000000000000002';
const PROCESSING_DELAY_MS = 800;

export interface PaymentResult {
  success: boolean;
  totalCharged: number;
  addOnIncluded: boolean;
}

/**
 * Simulate payment processing with deterministic behavior
 * - Card 4000000000000002 always fails
 * - All other valid cards succeed
 * - Processing takes exactly 800ms
 */
export async function processPayment(
  cardNumber: string,
  addOnIncluded: boolean,
  baseAmount: number
): Promise<PaymentResult> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY_MS));
  
  const cleanedCard = cardNumber.replace(/\s/g, '');
  const success = cleanedCard !== MAGIC_FAILURE_CARD;
  const totalCharged = success ? calculateTotal(baseAmount, addOnIncluded) : 0;
  
  return {
    success,
    totalCharged,
    addOnIncluded,
  };
}
```

## Implementation Notes

### Zero External Dependencies

The application must function completely offline with no external network calls:

**Forbidden**:
- External font CDNs (Google Fonts, Font Awesome)
- Analytics scripts (Google Analytics, Mixpanel)
- Error tracking (Sentry, Rollbar)
- External APIs

**Allowed**:
- Local assets bundled with the application
- System fonts via font-family fallback stack
- Inline SVG icons

### Fixed Sample Data

All data is hardcoded with no variation:

```typescript
// src/data/sampleBill.ts
export const SAMPLE_BILL = {
  accountNumber: 'ACC-2024-7891',
  amountDue: 2490.00,
  currency: '₹',
} as const;

// No API calls, no data fetching, no variation
```

### State Management Philosophy

**No global state libraries** (Redux, Zustand, Jotai) because:
- Simple application with limited shared state
- URL handles navigation state
- i18next handles language state
- Local component state handles form data and UI state

**State organization**:
- Form state: `usePaymentForm` hook
- Modal state: Lifted to BillPage parent
- Language state: react-i18next (via useLanguage hook)
- No persistence between page refreshes

### Development Workflow

**Starting the dev server**:
```bash
cd demo-site
npm install
npm run dev
```
Expected output:
```
VITE v5.1.0  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

**Building for production**:
```bash
npm run build
```
Produces static site in `demo-site/dist/` that can be hosted without Node.js.

**Running tests**:
```bash
npm test                    # All tests once
npm run test:watch          # Watch mode
npm run test:properties     # Property-based tests only
```

### Browser Compatibility

Target modern browsers with native ES2020 support:
- Chrome/Edge 80+
- Firefox 75+
- Safari 14+

No polyfills, no IE11 support, no legacy browser support.
