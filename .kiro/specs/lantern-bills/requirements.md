# Requirements Document

## Introduction

Lantern Bills is a demonstration electricity bill-payment website designed to test accessibility testing tools ("ghosts"). The application provides a realistic bill payment flow with multilingual support, but contains exactly six deliberate accessibility and usability problems for testing purposes. The application must be built using React, Vite, and TypeScript, and run on port 3000 with a single command.

## Glossary

- **Application**: The Lantern Bills web application
- **User**: A person interacting with the website
- **Bill**: An electricity bill displayed to the user
- **Bill_Page**: The initial page displaying the bill and "Pay this bill" button
- **Pay_Bill_Button**: The "Pay this bill" button on the Bill_Page that opens the Payment_Form
- **Payment_Form**: The form where users enter credit card details
- **Submit_Button**: The icon-only button that submits the payment form to trigger the Protection_Modal
- **Protection_Modal**: A modal dialog offering a paid protection add-on
- **Add_On_Checkbox**: A checkbox within the Protection_Modal for the ₹99 payment protection add-on
- **Continue_Control**: A control in the Protection_Modal that processes the payment
- **Close_Control**: A control in the Protection_Modal that dismisses the modal without processing payment
- **Learn_More_Link**: A link in the Protection_Modal that expands a short explanation inside the modal without navigating away
- **Confirmation_Element**: An element displaying payment success that carries data-haunt="payment-success"
- **Screen_Reader**: Assistive technology that reads web content aloud
- **Browser_Language**: The preferred language setting configured in the user's web browser
- **Banner_Image**: A large decorative image displayed at the top of the page
- **Payment_Summary**: A box displaying the total amount to be paid
- **Translation_File**: A file containing text strings in a specific language
- **Autopay_Link**: A "Set up autopay" link displayed after the Banner_Image loads
- **Autopay_Page**: A simple page displaying "Autopay coming soon" with a back navigation link

## Requirements

### Requirement 1: Application Setup and Development Environment

**User Story:** As a developer, I want to start the application with a single command, so that I can quickly run and test the demo site.

#### Acceptance Criteria

1. THE Application SHALL be built using React, Vite, and TypeScript
2. WHEN a developer runs \"npm run dev\", THE Application SHALL start and serve on port 3000 within 30 seconds
3. WHEN the Application starts on port 3000, THE Application SHALL respond with HTTP status 200 to requests at http://localhost:3000
4. THE Application SHALL be located in the demo-site/ directory
5. IF port 3000 is already in use, THEN \"npm run dev\" SHALL display an error message indicating the port conflict
6. WHEN a developer runs \"npm run build\", THE Application SHALL produce a static site that can be hosted without a development server

### Requirement 2: Bill Payment User Flow

**User Story:** As a user, I want to complete a bill payment flow, so that I can pay my electricity bill.

#### Acceptance Criteria

1. WHEN the Application loads, THE Application SHALL display the Bill_Page containing an account number of ACC-2024-7891, an amount due of ₹2,490.00, and the Pay_Bill_Button
2. WHEN the User clicks the Pay_Bill_Button, THE Application SHALL display the Payment_Form
3. THE Payment_Form SHALL contain input fields for card number, expiry date, CVV, and cardholder name, and the Submit_Button
4. WHEN the User clicks the Submit_Button with all required fields populated and valid, THE Application SHALL display the Protection_Modal
5. WHEN the User clicks the Submit_Button with any field invalid, THE Application SHALL display error messages for the invalid fields and SHALL NOT display the Protection_Modal
6. WHEN the Protection_Modal opens, THE Application SHALL move keyboard focus to the Add_On_Checkbox
7. WHEN the User activates the Continue_Control in the Protection_Modal, THE Application SHALL display a processing indicator for exactly 800 milliseconds
8. WHEN the card number is 4000000000000002, THE Application SHALL fail payment processing after 800 milliseconds and display an error indication with role="alert" for Screen_Reader announcement
9. WHEN the card number is any valid card number other than 4000000000000002, THE Application SHALL succeed payment processing after 800 milliseconds and display the Confirmation_Element
10. WHEN the Add_On_Checkbox is checked at the time the Continue_Control is activated, THE Confirmation_Element SHALL display a total charged amount of ₹2,589.00 (₹2,490.00 + ₹99.00)
11. WHEN the Add_On_Checkbox is not checked at the time the Continue_Control is activated, THE Confirmation_Element SHALL display a total charged amount of ₹2,490.00
11. THE Confirmation_Element SHALL carry the attribute data-haunt="payment-success" in all supported languages
12. THE Application SHALL use fixed sample bill data with no variation between page loads
13. THE Application SHALL NOT persist any state between page loads
14. THE Application SHALL NOT make network calls to any external service, including fonts and analytics

### Requirement 3: Multilingual Support

**User Story:** As a user, I want to see the application in my preferred language, so that I can understand the content.

#### Acceptance Criteria

1. THE Application SHALL support English (language code: en), Punjabi (language code: pa), and Hindi (language code: hi) languages
2. WHEN the Application loads, THE Application SHALL detect the Browser_Language from the navigator.languages array
3. WHEN the Browser_Language contains en, pa, or hi (ignoring region codes such as en-US or pa-IN), THE Application SHALL display all user interface text in that language
4. WHEN the Browser_Language contains none of en, pa, or hi, THE Application SHALL display all user interface text in English
5. WHERE a specific translation string is missing from the Translation_File, THE Application SHALL display that string in English as fallback
6. WHEN the URL contains a query parameter ?lang=en, ?lang=pa, or ?lang=hi, THE Application SHALL display all user interface text in that language, overriding the Browser_Language detection
7. WHEN the URL contains a query parameter ?lang= with a value that is not en, pa, or hi, THE Application SHALL ignore the parameter and display the user interface text based on Browser_Language detection

### Requirement 4: Inaccessible Submit Button (Deliberate Problem 1)

**User Story:** As a test system, I want to detect buttons without accessible names, so that I can identify accessibility violations.

#### Acceptance Criteria

1. THE Submit_Button SHALL be rendered as a button element containing only an icon or graphical symbol without visible text
2. THE Submit_Button SHALL NOT have any of the following: aria-label attribute, aria-labelledby attribute, title attribute, tooltip, or text content
3. WHEN queried by a Screen_Reader's accessibility API, THE Submit_Button accessible name property SHALL be empty or null
4. THE Submit_Button SHALL be visually distinguishable from other page elements through color, shape, or positioning

### Requirement 5: Keyboard-Inaccessible Modal with Pre-Selected Option (Deliberate Problem 2)

**User Story:** As a test system, I want to detect keyboard traps and inaccessible controls, so that I can identify accessibility violations.

#### Acceptance Criteria

1. WHEN the User clicks the Submit_Button with valid form data, THE Application SHALL display the Protection_Modal
2. THE Protection_Modal SHALL have role=\"dialog\" and a proper accessible label
3. THE Protection_Modal SHALL contain a \"Protect your payment\" heading, the Add_On_Checkbox, the Learn_More_Link, the Continue_Control, and the Close_Control
4. THE Add_On_Checkbox SHALL be checked by default when the Protection_Modal first displays
5. WHEN the User dismisses and reopens the Protection_Modal, THE Add_On_Checkbox SHALL be checked by default regardless of previous User interaction
6. WHILE the Protection_Modal is displayed, Tab and Shift+Tab keyboard navigation SHALL cycle only between the Add_On_Checkbox and the Learn_More_Link
7. THE Learn_More_Link SHALL expand a short explanation inside the Protection_Modal without navigating to another page or moving focus outside the modal
8. THE Continue_Control SHALL NOT be keyboard focusable
8. THE Close_Control SHALL NOT be keyboard focusable
9. WHEN the User presses Escape while the Protection_Modal is displayed, THE Application SHALL NOT close the Protection_Modal
10. WHEN the User activates the Continue_Control with a mouse click, THE Application SHALL process the payment with the total amount calculated according to Requirement 2 acceptance criteria 10 and 11
11. WHEN the User activates the Close_Control with a mouse click, THE Application SHALL close the Protection_Modal without processing payment

### Requirement 6: Visual-Only Error Messages (Deliberate Problem 3)

**User Story:** As a test system, I want to detect error messages that are not announced to screen readers, so that I can identify accessibility violations.

#### Acceptance Criteria

1. WHEN the User enters a card number containing fewer than 13 digits or non-numeric characters and moves focus away from the card number field, THE Application SHALL display an error message adjacent to or below the card number field within 100 milliseconds
2. WHEN the User enters an expiry date in the past or with an invalid month (not 01-12) and moves focus away from the expiry date field, THE Application SHALL display an error message adjacent to or below the expiry date field within 100 milliseconds
3. WHEN the User enters a CVV containing fewer than 3 digits or non-numeric characters and moves focus away from the CVV field, THE Application SHALL display an error message adjacent to or below the CVV field within 100 milliseconds
4. THE card validation error messages SHALL be visible to sighted users through standard CSS rendering
5. THE card validation error messages SHALL NOT be announced to Screen_Reader users through any of the following: aria-live regions, role=\"alert\" attribute, or programmatic focus management
6. THE card validation error messages SHALL NOT be linked to their input fields via aria-describedby attribute
7. THE invalid input fields SHALL NOT have aria-invalid attribute set
8. WHEN multiple Payment_Form fields contain invalid data, THE Application SHALL display a separate error message for each invalid field

### Requirement 7: Layout Shift from Late-Loading Banner (Deliberate Problem 4)

**User Story:** As a test system, I want to detect cumulative layout shift issues, so that I can identify usability violations.

#### Acceptance Criteria

1. THE Application SHALL include a Banner_Image at the top of the Bill_Page with an artificial loading delay of exactly 1500 milliseconds
2. THE Application SHALL NOT reserve vertical space for the Banner_Image before it loads
3. WHEN the page loads, THE Banner_Image SHALL complete loading after the Pay_Bill_Button and other page content is visible to the User
4. WHEN the Banner_Image completes loading, THE Pay_Bill_Button SHALL shift downward by at least 100 pixels from its initial position
5. AFTER the Banner_Image loads and causes the layout shift, THE Autopay_Link SHALL be positioned where the Pay_Bill_Button was initially positioned before the shift
6. WHEN the User clicks the Autopay_Link, THE Application SHALL navigate to the Autopay_Page
7. THE Autopay_Page SHALL display "Autopay coming soon" text and a "Back to bill" link
8. WHEN the User clicks the "Back to bill" link, THE Application SHALL navigate back to the Bill_Page

### Requirement 8: Content Overflow at 200% Zoom (Deliberate Problem 5)

**User Story:** As a test system, I want to detect content that becomes unusable at high zoom levels, so that I can identify accessibility violations.

#### Acceptance Criteria

1. THE Application SHALL display a Payment_Summary box on the Bill_Page containing the bill total of ₹2,490.00
2. WHERE the viewport is 640 CSS pixels wide or narrower (simulating 200% zoom on a 1280-pixel display), THE Payment_Summary box SHALL cut off the bill total such that at least the last character is not visible within the box's boundaries
3. WHERE the viewport is 640 CSS pixels wide or narrower, THE cut-off content in the Payment_Summary box SHALL not be accessible through horizontal scrolling, vertical scrolling, or text reflow

### Requirement 9: Incomplete Translations (Deliberate Problem 6)

**User Story:** As a test system, I want to detect missing translations, so that I can identify localization issues.

#### Acceptance Criteria

1. THE Translation_File for English (en) SHALL include translation keys for all user interface text strings in the Application
2. THE Translation_File for Punjabi (pa) SHALL include translation keys for all user interface text strings EXCEPT the Pay_Bill_Button text and card validation error messages
3. THE Translation_File for Hindi (hi) SHALL include translation keys for all user interface text strings EXCEPT the Pay_Bill_Button text and card validation error messages
4. WHEN the Browser_Language is Punjabi (pa) or when the URL contains ?lang=pa, THE Application SHALL display the Pay_Bill_Button text in English
5. WHEN the Browser_Language is Hindi (hi) or when the URL contains ?lang=hi, THE Application SHALL display the Pay_Bill_Button text in English
6. WHEN the displayed language is Punjabi (pa) and a card validation error occurs, THE Application SHALL display the error message in English
7. WHEN the displayed language is Hindi (hi) and a card validation error occurs, THE Application SHALL display the error message in English
8. WHEN the displayed language is Punjabi (pa) or Hindi (hi), THE Application SHALL display all other user interface text (including Protection_Modal content, confirmation messages, and all other strings) in the selected language

### Requirement 10: Clean Accessible Implementation for Non-Problem Features

**User Story:** As a test system, I want all other features to be accessible, so that the six deliberate problems are the only issues found.

#### Acceptance Criteria

1. THE Application SHALL implement semantic HTML5 elements (header, main, footer, button, form, label, input) for all page structure and interactive elements except the Submit_Button icon
2. THE Application SHALL provide ARIA labels or visible text labels for all interactive elements except the Submit_Button
3. THE Application SHALL maintain a color contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text (18pt or 14pt bold), measured according to WCAG 2.1 Level AA
4. THE Application SHALL support full keyboard navigation using Tab key for all interactive elements, with Tab order following visual reading order, except for the Continue_Control and Close_Control in the Protection_Modal
5. WHEN the User activates an interactive element using the keyboard Enter or Space key, THE Application SHALL perform the same action as a mouse click, except for the Continue_Control and Close_Control in the Protection_Modal
6. THE Application SHALL remain fully functional at 100% and 150% browser zoom levels
7. THE Application SHALL include exactly one h1 heading element on each page
8. THE Application SHALL use logical heading hierarchy with h2 elements for major sections
9. THE Application SHALL include header, main, and footer landmark elements
10. THE Application SHALL include a descriptive page title element
11. THE Application SHALL set the html lang attribute to the currently displayed language (en, pa, or hi)
12. WHERE the viewport is 640 CSS pixels wide or narrower, THE Application SHALL keep all content except the Payment_Summary total readable and usable
