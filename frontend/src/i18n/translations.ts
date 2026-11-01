import { Language } from '../types';
import { TranslationDictionary } from './types';
import { en } from './en';
import { fr } from './fr';
import { es } from './es';

export * from './types';
export { en, fr, es };

export const translations: Record<Language, TranslationDictionary> = {
  EN: en,
  FR: fr,
  ES: es,
};

export default translations;
