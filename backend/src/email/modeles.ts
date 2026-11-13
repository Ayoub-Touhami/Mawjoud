import type { MessageEmail } from './fournisseurs.js';

export type Langue = 'fr' | 'ar';
export type TypeEmail = 'verification_email' | 'reinitialisation_mot_de_passe' | 'compte_existant';

interface Contenu {
  sujet: string;
  corps: (lien: string, duree: string) => string;
}

/**
 * Textes des e-mails de compte, en français et en arabe (F13).
 * Les textes arabes sont à relire, comme ceux du front-end (TEXTES_ARABES_A_RELIRE.xlsx).
 */
const TEXTES: Record<TypeEmail, Record<Langue, Contenu>> = {
  verification_email: {
    fr: {
      sujet: 'Mawjoud : confirmez votre adresse e-mail',
      corps: (lien, duree) =>
        `Bonjour,\n\nPour activer votre compte Mawjoud, ouvrez ce lien (valable ${duree}) :\n${lien}\n\n` +
        `Si vous n'avez pas créé de compte, ignorez ce message.\n\nMawjoud — Moins de tours, plus de secours.`,
    },
    ar: {
      sujet: 'موجود: أكّد عنوان بريدك الإلكتروني',
      corps: (lien, duree) =>
        `مرحبًا،\n\nلتفعيل حسابك في موجود، افتح هذا الرابط (صالح لمدة ${duree}):\n${lien}\n\n` +
        `إذا لم تنشئ حسابًا، تجاهل هذه الرسالة.\n\nموجود`,
    },
  },
  reinitialisation_mot_de_passe: {
    fr: {
      sujet: 'Mawjoud : choisir un nouveau mot de passe',
      corps: (lien, duree) =>
        `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${duree}, une seule fois) :\n${lien}\n\n` +
        `Toutes vos connexions en cours seront fermées. Si vous n'avez rien demandé, ignorez ce message : ` +
        `votre mot de passe actuel reste valable.\n\nMawjoud`,
    },
    ar: {
      sujet: 'موجود: اختيار كلمة مرور جديدة',
      corps: (lien, duree) =>
        `مرحبًا،\n\nلاختيار كلمة مرور جديدة، افتح هذا الرابط (صالح لمدة ${duree}، مرة واحدة):\n${lien}\n\n` +
        `سيتم إغلاق جميع جلساتك المفتوحة. إذا لم تطلب ذلك، تجاهل هذه الرسالة: تبقى كلمة مرورك الحالية صالحة.\n\nموجود`,
    },
  },
  compte_existant: {
    fr: {
      sujet: 'Mawjoud : vous avez déjà un compte',
      corps: (lien) =>
        `Bonjour,\n\nQuelqu'un (sans doute vous) a voulu créer un compte Mawjoud avec cette adresse, ` +
        `qui en a déjà un. Connectez-vous, ou choisissez un nouveau mot de passe ici :\n${lien}\n\n` +
        `Si ce n'était pas vous, ignorez ce message : rien n'a changé.\n\nMawjoud`,
    },
    ar: {
      sujet: 'موجود: لديك حساب بالفعل',
      corps: (lien) =>
        `مرحبًا،\n\nحاول شخص ما (ربما أنت) إنشاء حساب في موجود بهذا العنوان، وهو مرتبط بحساب موجود. ` +
        `سجّل الدخول، أو اختر كلمة مرور جديدة من هنا:\n${lien}\n\n` +
        `إذا لم تكن أنت، تجاهل هذه الرسالة: لم يتغيّر شيء.\n\nموجود`,
    },
  },
};

const DUREES: Record<Langue, Record<'24h' | '1h', string>> = {
  fr: { '24h': '24 heures', '1h': '1 heure' },
  ar: { '24h': '24 ساعة', '1h': 'ساعة واحدة' },
};

export function composer(type: TypeEmail, langue: Langue, a: string, lien: string): MessageEmail {
  const t = TEXTES[type][langue];
  const duree = DUREES[langue][type === 'reinitialisation_mot_de_passe' ? '1h' : '24h'];
  return { a, sujet: t.sujet, texte: t.corps(lien, duree) };
}
