import { useEffect, useState } from 'react';
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
import { useLanguage } from '../hooks/useLanguage';
import { usePaymentForm } from '../hooks/usePaymentForm';
import { SAMPLE_BILL } from '../types';
import { formatCurrency } from '../utils/currency';
import { processPayment } from '../utils/payment';
import common from './Pages.module.css';
import styles from './BillPage.module.css';

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
      navigate('/confirmation', {
        state: { totalCharged: result.totalCharged, addOnIncluded: result.addOnIncluded },
      });
    } else {
      setModalOpen(false);
      setPaymentFailed(true);
    }
  }

  return (
    <PageLayout title={t('pageTitle')}>
      <h1 className={styles.heading}>{t('billDetails.heading')}</h1>

      <div className={styles.bannerWrap}>
        <LateBanner onLoaded={() => setBannerLoaded(true)} />
        {bannerLoaded ? (
          <Link to="/autopay" className={styles.autopayLink}>
            {t('autopayLink')}
          </Link>
        ) : null}
      </div>

      <div className={styles.payRow}>
        <Button onClick={() => setShowForm(true)}>{t('payBillButton')}</Button>
      </div>

      <div className={common.row}>
        <div className={common.section}>
          <dl className={common.detailsList}>
            <dt>{t('billDetails.accountNumber')}</dt>
            <dd data-testid="account-number">{SAMPLE_BILL.accountNumber}</dd>
            <dt>{t('billDetails.amountDue')}</dt>
            <dd data-testid="amount-due">{amountText}</dd>
          </dl>
        </div>
        <OverflowingSummary amount={amountText} />
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
