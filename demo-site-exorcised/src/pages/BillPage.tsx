import { memo, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/common/Button';
import { FormField } from '../components/common/FormField';
import { PageLayout } from '../components/common/PageLayout';
import { LateBanner } from '../components/LateBanner';
import { OverflowingSummary } from '../components/OverflowingSummary';
import { SilentCardErrors } from '../components/SilentCardErrors';
import { TrappingProtectionModal } from '../components/TrappingProtectionModal';
import { UnlabeledPayButton } from '../components/UnlabeledPayButton';
import { UsageChart } from '../components/UsageChart';
import { BILL_EXTRAS, CONTACT } from '../data/billExtras';
import { useLanguage, useLanguageSearch } from '../hooks/useLanguage';
import { usePaymentForm } from '../hooks/usePaymentForm';
import { SAMPLE_BILL } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatDateRange, formatLongDate, formatMonthYear, formatNumber } from '../utils/format';
import { processPayment } from '../utils/payment';
import common from './Pages.module.css';
import styles from './BillPage.module.css';

/** Small decorative icons. Each sits next to text that says the same thing. */
function LockIcon() {
  return (
    <svg className={styles.inlineIcon} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className={styles.inlineIcon} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className={styles.inlineIcon} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M10 9v6M14 9v6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className={styles.inlineIcon} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface BillCardProps {
  /** Formatted amount due, e.g. "₹2,490.00". */
  amountText: string;
}

/**
 * The bill itself: amount, due date, account, period, units and the six-month chart.
 * Memoised so typing in the payment form does not re-render it; it still follows language changes.
 */
const BillCard = memo(function BillCard({ amountText }: BillCardProps) {
  const { t } = useTranslation();
  const unitsThisBill = BILL_EXTRAS.usage[BILL_EXTRAS.usage.length - 1]?.units ?? 0;

  return (
    <section className={`${common.section} ${styles.billCard}`} aria-labelledby="bill-card-heading">
      <div className={styles.billCardTop}>
        <h2 id="bill-card-heading" className={styles.billCardHeading}>
          {t('billDetails.cardHeading', {
            period: formatMonthYear(t, BILL_EXTRAS.billingPeriodStart),
          })}
        </h2>
        <span className={styles.status}>
          <ClockIcon />
          {t('billDetails.status')}
        </span>
      </div>

      <dl className={styles.facts}>
        <div className={`${styles.fact} ${styles.factWide}`}>
          <dt>{t('billDetails.amountDue')}</dt>
          <dd data-testid="amount-due" className={styles.amountDue}>
            {amountText}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('billDetails.dueDate')}</dt>
          <dd>{formatLongDate(t, BILL_EXTRAS.dueDate)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('billDetails.accountNumber')}</dt>
          <dd data-testid="account-number" className={styles.accountNumber}>
            {SAMPLE_BILL.accountNumber}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('billDetails.billingPeriod')}</dt>
          <dd>{formatDateRange(t, BILL_EXTRAS.billingPeriodStart, BILL_EXTRAS.billingPeriodEnd)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('billDetails.unitsUsed')}</dt>
          <dd>{t('usage.units', { value: formatNumber(unitsThisBill) })}</dd>
        </div>
      </dl>

      <UsageChart usage={BILL_EXTRAS.usage} />
    </section>
  );
});

/**
 * Autopay status and help, under the Payment Summary. It has no link to the Autopay page: that link
 * arrives only with the late banner (Problem 4). It also has no image, so the banner stays the page's
 * first <img>.
 */
const HelpCard = memo(function HelpCard() {
  const { t } = useTranslation();

  return (
    <section className={`${common.section} ${styles.helpCard}`} aria-labelledby="help-card-heading">
      <div className={styles.billCardTop}>
        <h2 id="help-card-heading" className={styles.billCardHeading}>
          {t('help.heading')}
        </h2>
        <span className={`${styles.status} ${styles.statusOff}`}>
          <PauseIcon />
          {t('help.autopayOff')}
        </span>
      </div>

      <p className={styles.helpLead}>
        {t('help.payYourself', { date: formatLongDate(t, BILL_EXTRAS.dueDate) })}
      </p>

      <dl className={styles.helpFacts}>
        <div className={styles.fact}>
          <dt>{t('help.questionsHeading')}</dt>
          <dd>
            <a href={`mailto:${CONTACT.careEmail}`} className={styles.helpLink}>
              {CONTACT.careEmail}
            </a>
            <span className={styles.helpNote}>{t('help.replyTime')}</span>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('help.hoursHeading')}</dt>
          <dd>{t('help.hoursText')}</dd>
        </div>
      </dl>
    </section>
  );
});

type PaymentForm = ReturnType<typeof usePaymentForm>;

interface PaymentFormSectionProps {
  form: PaymentForm;
  paymentFailed: boolean;
  onSubmit: () => void;
}

/** The payment form: four inputs, card errors, and the icon-only submit button. */
function PaymentFormSection({ form, paymentFailed, onSubmit }: PaymentFormSectionProps) {
  const { t } = useTranslation();
  const { formData, errors, touched, updateField, validateField } = form;

  // Card validation messages are translated here. In pa/hi the validation.* card keys
  // are missing, so i18next falls back to English (Problem 6).
  const cardNumberError = errors.cardNumber ? t('validation.cardNumber') : undefined;
  const expiryError = errors.expiry ? t('validation.expiry') : undefined;
  const cvvError = errors.cvv ? t('validation.cvv') : undefined;

  const nameError =
    touched.has('cardholderName') && formData.cardholderName.trim().length === 0
      ? t('validation.cardholderName')
      : undefined;

  useEffect(() => {
    document.getElementById('card-number')?.focus();
  }, []);

  return (
    <section id="payment-section" className={common.section} aria-labelledby="payment-form-heading">
      <h2 id="payment-form-heading" className={common.sectionHeading}>
        {t('paymentForm.heading')}
      </h2>
      <p className={styles.secureNote}>
        <LockIcon />
        <span>{t('paymentForm.secureNote')}</span>
      </p>

      {paymentFailed ? (
        <div role="alert" className={common.paymentError}>
          {t('payment.failed')}
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={event => {
          event.preventDefault();
        }}
      >
        <div className={common.formGrid}>
          <div className={common.formWide}>
            <FormField
              id="card-number"
              label={t('paymentForm.cardNumber')}
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder={t('paymentForm.cardNumberPlaceholder')}
              value={formData.cardNumber}
              onChange={value => updateField('cardNumber', value)}
              onBlur={() => validateField('cardNumber')}
              required
            />
            <SilentCardErrors errors={{ cardNumber: cardNumberError }} />
          </div>

          <div>
            <FormField
              id="card-expiry"
              label={t('paymentForm.expiry')}
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder={t('paymentForm.expiryPlaceholder')}
              value={formData.expiry}
              onChange={value => updateField('expiry', value)}
              onBlur={() => validateField('expiry')}
              required
            />
            <SilentCardErrors errors={{ expiry: expiryError }} />
          </div>

          <div>
            <FormField
              id="card-cvv"
              label={t('paymentForm.cvv')}
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder={t('paymentForm.cvvPlaceholder')}
              value={formData.cvv}
              onChange={value => updateField('cvv', value)}
              onBlur={() => validateField('cvv')}
              required
            />
            <SilentCardErrors errors={{ cvv: cvvError }} />
          </div>

          <div className={common.formWide}>
            <FormField
              id="cardholder-name"
              label={t('paymentForm.cardholderName')}
              type="text"
              autoComplete="cc-name"
              placeholder={t('paymentForm.cardholderNamePlaceholder')}
              value={formData.cardholderName}
              onChange={value => updateField('cardholderName', value)}
              onBlur={() => validateField('cardholderName')}
              error={nameError}
              required
            />
          </div>
        </div>

        <div className={common.actions}>
          <UnlabeledPayButton onClick={onSubmit} />
        </div>
      </form>
    </section>
  );
}

export function BillPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useLanguage();
  const languageSearch = useLanguageSearch();

  const form = usePaymentForm();
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);

  const amountText = formatCurrency(SAMPLE_BILL.amountDue);

  function handleSubmit() {
    setPaymentFailed(false);
    if (form.validateAll()) {
      setModalOpen(true);
    }
  }

  async function handleContinue(addOnSelected: boolean) {
    const result = await processPayment(
      form.formData.cardNumber,
      addOnSelected,
      SAMPLE_BILL.amountDue
    );
    if (result.success) {
      navigate(
        { pathname: '/confirmation', search: languageSearch },
        { state: { totalCharged: result.totalCharged, addOnIncluded: result.addOnIncluded } }
      );
    } else {
      setModalOpen(false);
      setPaymentFailed(true);
    }
  }

  return (
    <PageLayout title={t('pageTitle')}>
      <div className={styles.intro}>
        <h1 className={styles.heading}>{t('billDetails.heading')}</h1>
        <p className={styles.subtitle}>{t('billDetails.subtitle')}</p>
      </div>

      {/*
        Problem 4 (deliberate): nothing in this wrapper takes space until the banner arrives after
        1500 ms. Then the image, the Autopay link (placed where Pay this bill was) and the offer
        text all appear at once and push everything below down.
      */}
      <div className={styles.bannerWrap}>
        <LateBanner onLoaded={() => setBannerLoaded(true)} />
        {bannerLoaded ? (
          <Link to={{ pathname: '/autopay', search: languageSearch }} className={styles.autopayLink}>
            {t('autopayLink')}
            <ArrowIcon />
          </Link>
        ) : null}
        {bannerLoaded ? (
          <p className={styles.offer}>
            <span className={styles.offerTag}>{t('banner.offerTag')}</span>
            <span className={styles.offerText}>{t('banner.offerText')}</span>
            <span className={styles.offerTerms}>{t('banner.offerTerms')}</span>
          </p>
        ) : null}
      </div>

      <div className={styles.payRow}>
        <Button onClick={() => setShowForm(true)}>{t('payBillButton')}</Button>
        <p className={styles.payHint}>
          <LockIcon />
          <span>{t('payPanel.hint')}</span>
        </p>
      </div>

      <div className={styles.billRow}>
        <BillCard amountText={amountText} />
        <div className={styles.side}>
          <OverflowingSummary amount={amountText} />
          <HelpCard />
        </div>
      </div>

      {showForm ? (
        <PaymentFormSection form={form} paymentFailed={paymentFailed} onSubmit={handleSubmit} />
      ) : null}

      <TrappingProtectionModal
        isOpen={modalOpen}
        onContinue={handleContinue}
        onClose={() => setModalOpen(false)}
        amount={SAMPLE_BILL.amountDue}
      />
    </PageLayout>
  );
}

export default BillPage;
