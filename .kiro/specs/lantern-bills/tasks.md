# Implementation Plan: Lantern Bills

## Overview

This implementation plan breaks down the Lantern Bills feature into discrete coding tasks. The feature is a React + TypeScript + Vite demonstration application that simulates a bill payment flow with six deliberate accessibility problems for testing purposes. Each problem component is isolated to allow independent bugfixes in the future.

## Tasks

- [ ] 1. Initialize project structure and dependencies
  - Create demo-site/ directory in workspace
  - Initialize npm project with package.json
  - Install React 18, React DOM, TypeScript, Vite as dependencies
  - Install react-router-dom, react-i18next, i18next, i18next-http-backend, i18next-browser-languagedetector
  - Install dev dependencies: @vitejs/plugin-react, typescript, vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, fast-check
  - Create directory structure: src/, public/, src/components/, src/pages/, src/hooks/, src/utils/, src/i18n/, src/types/, public/locales/
  - _Requirements: 1.1, 1.2, 1.4_

- [ ] 2. Configure build tooling and TypeScript
  - [ ] 2.1 Create Vite configuration
    - Write vite.config.ts with React plugin, dev server on port 3000 (strictPort: true), build output to dist/
    - Configure preview server to use port 3000
    - _Requirements: 1.2, 1.3_
  
  - [ ] 2.2 Create TypeScript configuration
    - Write tsconfig.json with strict mode, ES2020 target, React JSX support
    - Configure module resolution for bundler
    - _Requirements: 1.1_
  
  - [ ] 2.3 Add package.json scripts
    - Add scripts: "dev", "build", "preview", "test", "test:watch", "test:properties"
    - Configure "dev" script to run vite
    - Configure "build" script to run tsc && vite build
    - _Requirements: 1.2, 1.6_

- [ ] 3. Create translation files
  - [ ] 3.1 Create complete English translation file
    - Create public/locales/en/translation.json with all required keys
    - Include keys: pageTitle, payBillButton, billDetails.*, paymentForm.*, validation.*, modal.*, payment.*, confirmation.*, autopay.*, banner.alt, summary.total, autopayLink
    - _Requirements: 9.1_
  
  - [ ] 3.2 Create incomplete Punjabi translation file
    - Create public/locales/pa/translation.json
    - Deliberately omit: payBillButton, validation.cardNumber, validation.expiry, validation.cvv
    - Include all other keys with Punjabi translations
    - _Requirements: 9.2, 9.4, 9.6_
  
  - [ ] 3.3 Create incomplete Hindi translation file
    - Create public/locales/hi/translation.json
    - Deliberately omit: payBillButton, validation.cardNumber, validation.expiry, validation.cvv
    - Include all other keys with Hindi translations
    - _Requirements: 9.3, 9.5, 9.7_

- [ ] 4. Set up i18n configuration
  - Create src/i18n/config.ts with i18next initialization
  - Configure HttpBackend to load from /locales/{{lng}}/translation.json
  - Configure LanguageDetector with order: ['querystring', 'navigator']
  - Set fallbackLng to 'en', supportedLngs to ['en', 'pa', 'hi']
  - Set querystring lookup to 'lang'
  - Disable React suspense for simpler error handling
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

- [ ] 5. Create TypeScript type definitions
  - Create src/types/index.ts
  - Define interfaces: Bill, PaymentFormData, PaymentFormValidation, PaymentResult, SupportedLanguage, LanguageConfig, CardValidationErrors
  - Export SAMPLE_BILL constant with account ACC-2024-7891, amount 2490.00
  - _Requirements: 2.1, 2.13_

- [ ] 6. Implement utility functions
  - [ ] 6.1 Create validation utilities
    - Create src/utils/validation.ts
    - Implement validateCardNumber: check ≥13 digits, numeric only, return ValidationResult
    - Implement validateExpiry: check MM/YY format, month 01-12, not in past, return ValidationResult
    - Implement validateCVV: check exactly 3 digits, numeric only, return ValidationResult
    - Export ValidationResult interface with isValid and optional error message
    - _Requirements: 2.5, 6.1, 6.2, 6.3_
  
  - [ ] 6.2 Create currency and payment utilities
    - Create src/utils/currency.ts with formatCurrency and calculateTotal functions
    - Create src/utils/payment.ts with processPayment async function
    - Implement 800ms delay in processPayment
    - Implement magic failure card check for 4000000000000002
    - Calculate total based on addOnIncluded flag (₹99 add-on)
    - _Requirements: 2.7, 2.8, 2.9, 2.10, 2.11_

- [ ] 7. Create custom React hooks
  - [ ] 7.1 Create useLanguage hook
    - Create src/hooks/useLanguage.tsx
    - Implement URL query parameter detection (?lang=)
    - Synchronize document.documentElement.lang with i18n.language
    - Return currentLanguage and changeLanguage
    - _Requirements: 3.6, 3.7, 10.11_
  
  - [ ] 7.2 Create usePaymentForm hook
    - Create src/hooks/usePaymentForm.tsx
    - Manage formData state (cardNumber, expiry, cvv, cardholderName)
    - Manage errors state and touched fields tracking
    - Implement updateField, validateField, isValid, and reset functions
    - Call validation utilities on field blur
    - _Requirements: 2.3, 2.4, 2.5_

- [ ] 8. Checkpoint - Verify foundation setup
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Create standard accessible components
  - [ ] 9.1 Create Button component
    - Create src/components/common/Button.tsx
    - Implement semantic button with proper focus indicators
    - Support variants: primary, secondary
    - Accept optional ariaLabel prop
    - _Requirements: 10.1, 10.2, 10.4_
  
  - [ ] 9.2 Create FormField component
    - Create src/components/common/FormField.tsx
    - Implement label associated with input via htmlFor/id
    - Support aria-invalid when error present
    - Link error message via aria-describedby
    - Render error in role="alert" region for screen reader announcement
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [ ] 9.3 Create global styles
    - Create src/index.css with CSS reset, color contrast variables, focus indicators
    - Define CSS custom properties: --color-primary, --color-error, --color-success, --color-text, --color-border
    - Ensure all colors meet WCAG 2.1 Level AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
    - Style focus-visible with 3px outline
    - _Requirements: 10.3, 10.4_

- [ ] 10. Implement Problem Component 1: UnlabeledPayButton
  - Create src/components/UnlabeledPayButton.tsx
  - Render button element with only SVG icon (arrow or chevron), no text content
  - Deliberately omit: aria-label, aria-labelledby, title attributes
  - Apply visual styling (circular blue button with white arrow)
  - Accept onClick and disabled props
  - Create src/components/UnlabeledPayButton.module.css for styling
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 11. Implement Problem Component 2: TrappingProtectionModal
  - Create src/components/TrappingProtectionModal.tsx with TypeScript interface TrappingProtectionModalProps
  - Render dialog with role="dialog" and aria-label
  - Implement focus management: move focus to checkbox on open
  - Implement keyboard trap: capture Tab/Shift+Tab to cycle only between checkbox and Learn_More_Link
  - Set Continue_Control and Close_Control with tabindex="-1" (not keyboard-focusable)
  - Checkbox checked by default on every open
  - Learn_More_Link expands explanation text within modal (local state)
  - Continue_Control: mouse-only, 800ms loading indicator, calls onContinue
  - Close_Control: mouse-only X icon, calls onClose
  - Disable Escape key closing
  - Disable backdrop click-to-close
  - Create src/components/TrappingProtectionModal.module.css
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

- [ ] 12. Implement Problem Component 3: SilentCardErrors
  - Create src/components/SilentCardErrors.tsx with CardValidationErrors interface
  - Render error messages as plain div/span elements with red text
  - Deliberately omit: role="alert", aria-live, aria-describedby, aria-invalid
  - Display errors within 100ms of receiving props
  - Support multiple simultaneous errors
  - Create src/components/SilentCardErrors.module.css with .error-text style
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 13. Implement Problem Component 4: LateBanner
  - Create src/components/LateBanner.tsx
  - Render img element with no explicit height/width attributes
  - Use setTimeout to delay src setting by exactly 1500ms
  - Deliberately omit: min-height, aspect-ratio, placeholder
  - Use placeholder image asset (1200x300px banner) or create simple colored rectangle
  - Create src/components/LateBanner.module.css with no space reservation
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 14. Implement Problem Component 5: OverflowingSummary
  - Create src/components/OverflowingSummary.tsx accepting amount prop
  - Render bordered box with padding
  - Create src/components/OverflowingSummary.module.css
  - At viewport ≤640px: set fixed width (180px), overflow:hidden, white-space:nowrap, large font
  - At viewport >640px: allow normal responsive behavior
  - Ensure last 1-2 characters clip at narrow viewport
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 15. Checkpoint - Verify all problem components isolated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Create page components
  - [ ] 16.1 Create AutopayPage
    - Create src/pages/AutopayPage.tsx
    - Display h1 heading "Set Up Autopay"
    - Display "Autopay coming soon" message
    - Add "Back to bill" link using React Router Link
    - Use useLanguage hook and useTranslation for multilingual support
    - _Requirements: 7.6, 7.7, 7.8, 10.7_
  
  - [ ] 16.2 Create ConfirmationPage
    - Create src/pages/ConfirmationPage.tsx
    - Display h1 heading "Payment Successful"
    - Render element with data-haunt="payment-success" attribute
    - Read totalCharged and addOnIncluded from useLocation state
    - Display total charged amount using formatCurrency
    - Use useLanguage hook and useTranslation
    - _Requirements: 2.9, 2.10, 2.11, 2.12, 10.7_
  
  - [ ] 16.3 Create BillPage
    - Create src/pages/BillPage.tsx
    - Render LateBanner component at top
    - Render Autopay_Link (appears after banner loads, positioned where button was)
    - Render OverflowingSummary with bill amount
    - Render BillDetails section with account number and amount due
    - Render PaymentForm section
    - Manage modal open/close state
    - Use useLanguage hook and useTranslation
    - Use usePaymentForm hook
    - _Requirements: 2.1, 2.2, 7.4, 7.5, 10.7, 10.8, 10.9_
  
  - [ ] 16.4 Implement PaymentForm within BillPage
    - Within BillPage, create PaymentForm component/section
    - Render four FormField components for card inputs
    - Render SilentCardErrors component with validation errors
    - Render UnlabeledPayButton as submit button
    - Handle form submission: validate all fields, open modal if valid
    - Render TrappingProtectionModal with isOpen, onContinue, onClose props
    - Wire onContinue to call processPayment and navigate to confirmation
    - Handle magic failure card with role="alert" error message
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [ ] 17. Set up routing and App component
  - Create src/App.tsx with BrowserRouter and Routes
  - Define three routes: "/" → BillPage, "/autopay" → AutopayPage, "/confirmation" → ConfirmationPage
  - Import and call useLanguage hook at App level
  - _Requirements: 2.1, 7.6, 10.9_

- [ ] 18. Create application entry point
  - Create src/main.tsx
  - Import i18n config (to initialize i18next)
  - Import index.css
  - Render App component to root element
  - _Requirements: 1.1, 1.2_

- [ ] 19. Create sample data file
  - Create src/data/sampleBill.ts (optional helper file)
  - Export SAMPLE_BILL constant if not already in types/index.ts
  - _Requirements: 2.1, 2.13_

- [ ] 20. Checkpoint - Verify application runs
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Set up testing infrastructure
  - [ ] 21.1 Configure Vitest
    - Create vitest.config.ts or add test config to vite.config.ts
    - Configure jsdom environment
    - Set up @testing-library/jest-dom matchers
    - _Requirements: 1.6_
  
  - [ ] 21.2 Create test setup file
    - Create src/setupTests.ts
    - Import @testing-library/jest-dom
    - Configure i18next for tests (fixed language, synchronous loading)
    - _Requirements: 1.6_
  
  - [ ] 21.3 Create fast-check generators
    - Create src/__tests__/generators.ts
    - Implement validPaymentDataArbitrary for valid form data
    - Implement invalidPaymentDataArbitrary with at least one invalid field
    - Implement futureExpiryArbitrary for future dates
    - Implement narrowViewportArbitrary (320-640px)
    - Implement browserLanguageArbitrary (en/pa/hi variants + unsupported)
    - _Requirements: Testing Strategy from Design_

- [ ]* 22. Write unit tests for utilities
  - [ ]* 22.1 Write validation utility unit tests
    - Create src/utils/__tests__/validation.test.ts
    - Test validateCardNumber with valid/invalid inputs
    - Test validateExpiry with past/future dates, invalid months
    - Test validateCVV with valid/invalid lengths
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 22.2 Write currency and payment utility unit tests
    - Create src/utils/__tests__/currency.test.ts and payment.test.ts
    - Test formatCurrency output format
    - Test calculateTotal with/without add-on
    - Test processPayment with magic failure card
    - Test 800ms delay behavior
    - _Requirements: 2.7, 2.8, 2.9_

- [ ]* 23. Write property-based tests for payment flow
  - [ ]* 23.1 Write property test for valid form submission
    - Create src/__tests__/properties/payment-flow.properties.test.tsx
    - **Property 1: Valid Form Submission Triggers Modal**
    - **Validates: Requirements 2.4**
    - Use validPaymentDataArbitrary, submit form, verify modal displays
    - Run with numRuns: 100
    - _Requirements: 2.4_
  
  - [ ]* 23.2 Write property test for invalid form submission
    - **Property 2: Invalid Form Submission Shows Errors**
    - **Validates: Requirements 2.5**
    - Use invalidPaymentDataArbitrary, submit form, verify errors shown, no modal
    - _Requirements: 2.5_
  
  - [ ]* 23.3 Write property test for modal focus management
    - **Property 3: Modal Focus Management**
    - **Validates: Requirements 2.6**
    - Open modal, verify focus moves to checkbox
    - _Requirements: 2.6_
  
  - [ ]* 23.4 Write property test for non-failure cards
    - **Property 4: Non-Failure Cards Succeed**
    - **Validates: Requirements 2.9, 2.12**
    - Generate valid cards excluding 4000000000000002, verify success and data-haunt attribute
    - _Requirements: 2.9, 2.12_
  
  - [ ]* 23.5 Write property test for total calculation
    - **Property 5: Total Calculation Correctness**
    - **Validates: Requirements 2.10, 2.11**
    - Test with checkbox checked → ₹2,589.00, unchecked → ₹2,490.00
    - _Requirements: 2.10, 2.11_
  
  - [ ]* 23.6 Write property test for bill data invariance
    - **Property 6: Bill Data Invariance**
    - **Validates: Requirements 2.13**
    - Multiple loads, verify account and amount unchanged
    - _Requirements: 2.13_

- [ ]* 24. Write property-based tests for language support
  - [ ]* 24.1 Write property test for language detection
    - Create src/__tests__/properties/language.properties.test.tsx
    - **Property 7: Language Detection and Fallback**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - Use browserLanguageArbitrary, verify correct language or fallback to English
    - _Requirements: 3.2, 3.3, 3.4_
  
  - [ ]* 24.2 Write property test for URL language override
    - **Property 8: URL Language Override**
    - **Validates: Requirements 3.6, 3.7**
    - Test ?lang= parameter with valid/invalid values
    - _Requirements: 3.6, 3.7_
  
  - [ ]* 24.3 Write property test for missing translation fallback
    - **Property 15: Missing Translation Fallback**
    - **Validates: Requirements 9.4, 9.5, 9.6, 9.7, 9.8**
    - Switch to pa/hi, verify Pay_Bill_Button and validation errors in English
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ]* 25. Write property-based tests for modal behavior
  - [ ]* 25.1 Write property test for checkbox default state
    - Create src/__tests__/properties/modal.properties.test.tsx
    - **Property 9: Checkbox Default State**
    - **Validates: Requirements 5.4, 5.5**
    - Open modal multiple times, verify checkbox always checked by default
    - _Requirements: 5.4, 5.5_
  
  - [ ]* 25.2 Write property test for keyboard trap
    - **Property 10: Keyboard Trap Cycling**
    - **Validates: Requirements 5.6**
    - Simulate Tab/Shift+Tab, verify focus cycles only between checkbox and Learn_More_Link
    - _Requirements: 5.6_

- [ ]* 26. Write property-based tests for validation errors
  - [ ]* 26.1 Write property test for field validation display
    - Create src/__tests__/properties/validation.properties.test.tsx
    - **Property 11: Field Validation Error Display**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Blur invalid fields, verify errors appear within 100ms
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 26.2 Write property test for multiple simultaneous errors
    - **Property 12: Multiple Simultaneous Errors**
    - **Validates: Requirements 6.8**
    - Multiple invalid fields, verify all errors display simultaneously
    - _Requirements: 6.8_

- [ ]* 27. Write property-based tests for layout and responsive behavior
  - [ ]* 27.1 Write property test for layout shift magnitude
    - Create src/__tests__/properties/layout.properties.test.tsx
    - **Property 13: Layout Shift Magnitude**
    - **Validates: Requirements 7.4**
    - Measure button position before/after banner load, verify ≥100px shift
    - _Requirements: 7.4_
  
  - [ ]* 27.2 Write property test for content clipping
    - **Property 14: Content Clipping at Narrow Viewport**
    - **Validates: Requirements 8.2, 8.3**
    - Use narrowViewportArbitrary, verify content clips and no scroll
    - _Requirements: 8.2, 8.3_

- [ ]* 28. Write property-based tests for accessibility
  - [ ]* 28.1 Write property test for keyboard interaction equivalence
    - Create src/__tests__/properties/accessibility.properties.test.tsx
    - **Property 16: Keyboard Interaction Equivalence**
    - **Validates: Requirements 10.5**
    - Test keyboard activation (Enter/Space) equals mouse click for accessible elements
    - _Requirements: 10.5_
  
  - [ ]* 28.2 Write property test for single h1 per page
    - **Property 17: Single H1 Per Page**
    - **Validates: Requirements 10.7**
    - Render each page, verify exactly one h1
    - _Requirements: 10.7_
  
  - [ ]* 28.3 Write property test for descriptive page titles
    - **Property 18: Descriptive Page Titles**
    - **Validates: Requirements 10.10**
    - Verify document.title contains descriptive text for each page
    - _Requirements: 10.10_
  
  - [ ]* 28.4 Write property test for HTML lang synchronization
    - **Property 19: HTML Lang Attribute Synchronization**
    - **Validates: Requirements 10.11**
    - Change language, verify html lang attribute updates
    - _Requirements: 10.11_

- [ ]* 29. Write unit tests for problem components
  - [ ]* 29.1 Write UnlabeledPayButton verification tests
    - Create src/components/__tests__/UnlabeledPayButton.test.tsx
    - Verify button has no accessible name (empty string)
    - Verify button is keyboard focusable and clickable
    - _Requirements: 4.2, 4.3_
  
  - [ ]* 29.2 Write TrappingProtectionModal verification tests
    - Create src/components/__tests__/TrappingProtectionModal.test.tsx
    - Verify Tab never reaches Continue/Close controls
    - Verify Escape doesn't close modal
    - Verify checkbox checked by default on open
    - _Requirements: 5.6, 5.8, 5.9_
  
  - [ ]* 29.3 Write SilentCardErrors verification tests
    - Create src/components/__tests__/SilentCardErrors.test.tsx
    - Verify errors lack aria-live, role="alert", aria-describedby
    - Verify errors are visible in DOM
    - _Requirements: 6.5, 6.6, 6.7_
  
  - [ ]* 29.4 Write LateBanner verification tests
    - Create src/components/__tests__/LateBanner.test.tsx
    - Verify image loads after delay
    - Verify no min-height or aspect-ratio set
    - _Requirements: 7.1, 7.2_
  
  - [ ]* 29.5 Write OverflowingSummary verification tests
    - Create src/components/__tests__/OverflowingSummary.test.tsx
    - Verify content clips at ≤640px viewport
    - Verify no horizontal scroll available
    - _Requirements: 8.2, 8.3_
  
  - [ ]* 29.6 Write translation file verification tests
    - Create src/__tests__/translations.test.ts
    - Verify en translation file has all keys
    - Verify pa/hi files lack specific keys (payBillButton, validation.*)
    - _Requirements: 9.1, 9.2, 9.3_

- [ ]* 30. Write integration tests for complete flows
  - [ ]* 30.1 Write smoke test for app rendering
    - Create src/__tests__/App.test.tsx
    - Render app, verify Bill_Page displays with account number and amount
    - _Requirements: 1.3, 2.1_
  
  - [ ]* 30.2 Write end-to-end payment flow test
    - Fill form with valid data, submit, confirm in modal, verify confirmation page
    - Test with add-on checked and unchecked
    - _Requirements: 2.1 through 2.12_
  
  - [ ]* 30.3 Write autopay navigation test
    - Click Autopay_Link, verify AutopayPage displays, click back link
    - _Requirements: 7.6, 7.7, 7.8_

- [ ] 31. Final checkpoint - Verify all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 32. Create HTML entry point
  - Create index.html in project root with div#root
  - Link to src/main.tsx
  - Set appropriate meta tags (charset, viewport)
  - _Requirements: 1.1, 1.2_

- [ ] 33. Verify dev server starts on port 3000
  - Test npm run dev command
  - Verify application responds at http://localhost:3000
  - Verify port conflict error if 3000 is occupied
  - _Requirements: 1.2, 1.3, 1.5_

- [ ] 34. Verify production build works
  - Run npm run build
  - Verify dist/ directory created with static assets
  - Test preview server
  - _Requirements: 1.6_

- [ ] 35. Final integration verification
  - Manually test all six problem components are present and broken as specified
  - Verify all non-problem features are accessible
  - Test in multiple languages (en, pa, hi)
  - Test responsive behavior at different zoom levels
  - _Requirements: All requirements_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Problem components (tasks 10-14) are isolated and can be implemented independently
- Property-based tests (tasks 23-28) use fast-check with minimum 100 iterations each
- Unit tests (tasks 22, 29, 30) verify specific examples and problem component structure
- Checkpoints (tasks 8, 15, 20, 31) ensure incremental validation throughout implementation
- All test tasks are marked optional to allow rapid prototyping, but are recommended for production quality

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "5"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "4", "6.1", "6.2"] },
    { "id": 3, "tasks": ["7.1", "7.2", "9.1", "9.2", "9.3", "10", "11", "12", "13", "14"] },
    { "id": 4, "tasks": ["16.1", "16.2", "16.3"] },
    { "id": 5, "tasks": ["16.4", "17", "19"] },
    { "id": 6, "tasks": ["18", "32"] },
    { "id": 7, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 8, "tasks": ["22.1", "22.2", "23.1", "23.2", "23.3", "23.4", "23.5", "23.6", "24.1", "24.2", "24.3", "25.1", "25.2", "26.1", "26.2", "27.1", "27.2", "28.1", "28.2", "28.3", "28.4", "29.1", "29.2", "29.3", "29.4", "29.5", "29.6", "30.1", "30.2", "30.3"] },
    { "id": 9, "tasks": ["33", "34", "35"] }
  ]
}
```
