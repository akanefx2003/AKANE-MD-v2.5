// lang.js — Textes traduits du bot (fr / en)
//
// Un seul endroit pour toutes les chaînes traduites. index.js s'en sert pour
// le menu BOT-INFOS et pour .setlangue/.setlanguage ; les plugins (song.js,
// mail.js...) s'en servent pour traduire leurs propres messages.
//
// Pour ajouter une langue à un plugin : ajoute ses clés ici, dans fr ET en,
// puis appelle t(ctx.config, 'ma_cle') depuis le plugin.

export const LANGS = ['fr', 'en'];

// Langue courante à utiliser, avec repli sur 'fr' si la valeur en config
// est absente ou invalide.
export function getLang(config) {
    return LANGS.includes(config?.language) ? config.language : 'fr';
}

const dict = {
    fr: {
        // ── Commande setlangue ──
        langUsage:   'Usage',
        langUsageEx: 'setlangue fr|en',
        langChanged: '✅ Langue changée',

        // ── Sous-menus (tools-menu / gc-menu / fun-menu / dev-menu) ──
        toolsMenuTitle: 'TOOLS-MENU',
        gcMenuTitle:    'GC-MENU',
        funMenuTitle:   'FUN-MENU',
        devMenuTitle:   'DEV-MENU',
        menuEmpty:      'Aucune commande pour le moment.',

        // ── Plugin song ──
        songTitle:      '🎵 Téléchargeur audio',
        songUsage:      'Usage',
        songUsageValue: 'titre de la musique',
        songExample:    'Exemple',
        songSearching:  '🔍 Recherche en cours...',
        songNotFound:   '❌ Introuvable',
        songDownloading:'⏳ Téléchargement...',
        songViews:      '👁️ Vues',
        songDuration:   '⏱️ Durée',
        songLink:       '🔗 Lien',
        songError:      '❌ Erreur',

        // ── Plugin mail ──
        mailHelpTitle:  '📧 Email temporaire',
        mailHelpGen:    'créer une adresse',
        mailHelpInbox:  'voir les messages reçus',
        mailHelpRead:   'lire un message',
        mailHelpDelete: 'supprimer l\'adresse',
        mailCreating:   '🔄 Création en cours...',
        mailCreateErr:  '❌ Erreur lors de la création',
        mailAlready:    '⚠️ Email déjà actif',
        mailExpiresIn:  'Expire dans',
        mailCreated:    '✅ Email créé',
        mailPassword:   'Mot de passe',
        mailDuration:   'Durée',
        mailOneHour:    '1 heure',
        mailNext:       'Suite',
        mailNoActive:   '❌ Aucun email actif',
        mailGenFirst:   'd\'abord',
        mailExpired:    '❌ Email expiré',
        mailFetching:   '📥 Récupération...',
        mailEmpty:      '📭 Boîte vide',
        mailInbox:      '📥 Inbox',
        mailMessages:   'message(s)',
        mailNoSubject:  'Sans objet',
        mailFrom:       'de',
        mailNotFound:   '❌ Message introuvable',
        mailReadErr:    '❌ Impossible de lire ce message',
        mailUnknown:    'Inconnu',
        mailContent:    'Contenu',
        mailDeleted:    '✅ Email supprimé',
        mailNewOne:     'pour en créer un nouveau',
        mailInvalid:    '❌ Commande invalide',

        // ── Plugin welcome-goodbye : messages envoyés dans le groupe ──
        wgWelcomeTitle: 'BIENVENUE',
        wgGoodbyeTitle: 'À DIEU',
        wgMembers:      'MEMBRES',
        wgRank:         'RANG',
        wgWelcomeLine1: 'Le monarque des ombres te souhaite la bienvenue dans le donjon',
        wgGoodbyeLine1: 'A quitté le donjon',
        wgGoodbyeLine2: 'A dieu loser.',
        wgCustomBot:    'SI TU VEUX UN BOT PERSONNALISÉ ENVOIES MOI UN MESSAGE',
        wgBotLink:      'BOT LINK',
        wgTelegram:     'TELEGRAM',
        wgMail:         'MAIL',

        // ── Plugin welcome-goodbye : réponses aux commandes ──
        wgGroupOnly:    '❌ Groupe uniquement',
        wgWelcomeOn:    '✅ Welcome activé',
        wgWelcomeOff:   '❌ Welcome désactivé',
        wgGoodbyeOn:    '✅ Goodbye activé',
        wgGoodbyeOff:   '❌ Goodbye désactivé',
        wgLimitOn:      '✅ Limite activée (max 3 au revoir / 5 s)',
        wgLimitOff:     '❌ Limite désactivée',
        wgAntiFlood:    '🛡️ Limite anti-flood',

        // ── Plugin rank-system : cartes de graduation / rétrogradation ──
        rkGraduationTitle: 'Viens de passer :',
        rkDemotionTitle:   'Viens d\'être │rétrogradé au :',
        rkRank:            'RANG',
        rkInDungeon:       'Dans le donjon',
        rkCongrats:        'Félicitations',
        rkStayActive:      'Soit plus │actif ┃faiblard.',
        rkSentMessages:    'Message envoyé',
        rkNextGraduation:  'Prochaine graduation',
        rkMaxRank:         'Rang maximum atteint',
        rkMessagesUnit:    'message',
        rkLeaderboard:     'Classement',
        rkNoData:          'Aucune donnée',
    },
    en: {
        // ── setlanguage command ──
        langUsage:   'Usage',
        langUsageEx: 'setlanguage fr|en',
        langChanged: '✅ Language changed',

        // ── Submenus (tools-menu / gc-menu / fun-menu / dev-menu) ──
        toolsMenuTitle: 'TOOLS-MENU',
        gcMenuTitle:    'GC-MENU',
        funMenuTitle:   'FUN-MENU',
        devMenuTitle:   'DEV-MENU',
        menuEmpty:      'No command yet.',

        // ── song plugin ──
        songTitle:      '🎵 Audio downloader',
        songUsage:      'Usage',
        songUsageValue: 'song title',
        songExample:    'Example',
        songSearching:  '🔍 Searching...',
        songNotFound:   '❌ Not found',
        songDownloading:'⏳ Downloading...',
        songViews:      '👁️ Views',
        songDuration:   '⏱️ Duration',
        songLink:       '🔗 Link',
        songError:      '❌ Error',

        // ── mail plugin ──
        mailHelpTitle:  '📧 Temporary email',
        mailHelpGen:    'create an address',
        mailHelpInbox:  'view received messages',
        mailHelpRead:   'read a message',
        mailHelpDelete: 'delete the address',
        mailCreating:   '🔄 Creating...',
        mailCreateErr:  '❌ Error while creating',
        mailAlready:    '⚠️ Email already active',
        mailExpiresIn:  'Expires in',
        mailCreated:    '✅ Email created',
        mailPassword:   'Password',
        mailDuration:   'Duration',
        mailOneHour:    '1 hour',
        mailNext:       'Next',
        mailNoActive:   '❌ No active email',
        mailGenFirst:   'first',
        mailExpired:    '❌ Email expired',
        mailFetching:   '📥 Fetching...',
        mailEmpty:      '📭 Empty inbox',
        mailInbox:      '📥 Inbox',
        mailMessages:   'message(s)',
        mailNoSubject:  'No subject',
        mailFrom:       'from',
        mailNotFound:   '❌ Message not found',
        mailReadErr:    '❌ Unable to read this message',
        mailUnknown:    'Unknown',
        mailContent:    'Content',
        mailDeleted:    '✅ Email deleted',
        mailNewOne:     'to create a new one',
        mailInvalid:    '❌ Invalid command',

        // ── welcome-goodbye plugin: messages sent in the group ──
        wgWelcomeTitle: 'WELCOME',
        wgGoodbyeTitle: 'FAREWELL',
        wgMembers:      'MEMBERS',
        wgRank:         'RANK',
        wgWelcomeLine1: 'The monarch of shadows welcomes you to the dungeon',
        wgGoodbyeLine1: 'Has left the dungeon',
        wgGoodbyeLine2: 'Farewell, loser.',
        wgCustomBot:    'IF YOU WANT A CUSTOM BOT, SEND ME A MESSAGE',
        wgBotLink:      'BOT LINK',
        wgTelegram:     'TELEGRAM',
        wgMail:         'MAIL',

        // ── welcome-goodbye plugin: command replies ──
        wgGroupOnly:    '❌ Groups only',
        wgWelcomeOn:    '✅ Welcome enabled',
        wgWelcomeOff:   '❌ Welcome disabled',
        wgGoodbyeOn:    '✅ Goodbye enabled',
        wgGoodbyeOff:   '❌ Goodbye disabled',
        wgLimitOn:      '✅ Limit enabled (max 3 goodbyes / 5 s)',
        wgLimitOff:     '❌ Limit disabled',
        wgAntiFlood:    '🛡️ Anti-flood limit',

        // ── rank-system plugin: graduation / demotion cards ──
        rkGraduationTitle: 'Just reached :',
        rkDemotionTitle:   'Has just been │demoted to :',
        rkRank:            'RANK',
        rkInDungeon:       'In the dungeon',
        rkCongrats:        'Congratulations',
        rkStayActive:      'Be more │active ┃weakling.',
        rkSentMessages:    'Messages sent',
        rkNextGraduation:  'Next graduation',
        rkMaxRank:         'Maximum rank reached',
        rkMessagesUnit:    'messages',
        rkLeaderboard:     'Leaderboard',
        rkNoData:          'No data',
    },
};

// t(config, 'cle') → la chaîne traduite dans la langue courante (config.language),
// repli sur le français puis sur la clé elle-même si rien n'est trouvé.
export function t(config, key) {
    const lang = getLang(config);
    return dict[lang]?.[key] ?? dict.fr[key] ?? key;
}

export default { LANGS, getLang, t };
