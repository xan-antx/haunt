import i18n from 'i18next';
import { initI18n } from './initI18n';

/** Resolves once the detected language's translation file has loaded. */
export const i18nReady = initI18n(i18n);

export default i18n;
