// settings.js — Personnalisation du bot
// Modifie juste les valeurs ci-dessous : le nom, le dev, la langue, le thème,
// les images (photos de menu) et les liens changent partout dans le bot (menu,
// ping, footer des commandes, plugins...) sans toucher au reste du code.
// Redémarre le bot après une modification.
//
// ⚠️ C'est le SEUL fichier de config lu par index.js (import settings from
// './settings.js'). Si tu as encore un fichier "setting.js" (sans "s") à côté,
// supprime-le : il n'est plus utilisé et ses valeurs seraient ignorées.

export default {
    // Nom du bot, affiché dans le menu et au bas de chaque message
    botName: 'AKANE MD v2.5',

    // Nom du développeur, affiché à côté du nom du bot
    devName: 'DEV AKANE',

    // Version courte du nom du dev, utilisée dans le menu BOT-INFOS (ex: "akane")
    devShortName: 'akane',

    // Langue actuelle du bot : 'fr' ou 'en'.
    // Change avec .setlangue / .setlanguage (ou modifie directement ici).
    // S'applique au menu BOT-INFOS, aux sous-menus (tools/gc/fun/dev) et aux
    // plugins traduits (song, mail...).
    language: 'fr',

    // Thème affiché dans le menu BOT-INFOS
    theme: 'jin woo',

    // Nom affiché comme "USER" dans le menu BOT-INFOS, selon la langue
    userLabel: {
        fr: 'monarque',
        en: 'monarch',
    },

    // Lien affiché comme "LIEN DU BOT" (fr) / "BOT-LINK" (en) dans le menu
    // et dans les cartes de commandes (song, etc.)
    botLink: 'https://urls.fr/MjktBF',

    // Lien direct (URL) vers l'image utilisée comme photo du menu (.menu)
    // par défaut / secours, si aucune image spécifique n'est définie ci-dessous.
    // Doit être un lien direct vers une image (se terminant par .jpg/.png ...)
    menuImage: 'https://tinyurl.com/22h73wdy',

    // ── Liens affichés dans le message de connexion (welcome) ───────────────
    groupLink:   'https://chat.whatsapp.com/F9yJB6Xnbks55gS6URvdX2',
    youtubeLink: 'https://youtube.com/@akanefx-j3k9o?si=cPol4CQyEg0Ei2rJ',

    // ── Chaîne WhatsApp officielle ──────────────────────────────────────────
    // Lien d'invitation : affiché dans le welcome ET utilisé par boutons.js
    // (tag « Voir la chaîne » + abonnement automatique).
    channelLink: 'https://whatsapp.com/channel/0029VbE3PI53WHTgnzuQ4Z2l',

    // Nom affiché sur le tag "chaîne officielle" ajouté à chaque message du
    // bot (boutons.js) et dans le message d'abonnement automatique.
    channelName: 'Suivre la chaîne ᥲkᥲᥒᥱ mძ ᥎2 sur WhatsApp',

    // JID technique de la chaîne (xxxx@newsletter). Laisse '' : boutons.js le
    // retrouve tout seul à partir de channelLink au démarrage. Tu peux aussi le
    // forcer ici (obtenu avec la commande .getjid).
    channelJid: '',

    // Code de connexion personnalisé (pairing code), ex: 'AKANEMD9'
    // Doit faire EXACTEMENT 8 caractères, lettres et/ou chiffres (A-Z, 0-9).
    // Laisse vide ('') pour que WhatsApp génère un code aléatoire à chaque fois.
    pairingCode: 'JPXFRD99',

    // ── Images centralisées ─────────────────────────────────────────────────
    // Toutes les images utilisées par le bot (menu, sous-menus, commandes,
    // plugins) vivent ICI. Un plugin ne doit jamais coder une image en dur :
    // il doit lire ctx.settings.images.<clé>, avec repli sur menuImage si la
    // clé est vide.
    images: {
        // Image du menu BOT-INFOS quand la langue est 'fr'
        menuFr: 'https://tinyurl.com/22h73wdy',

        // Image du menu BOT-INFOS quand la langue est 'en' (différente de la fr)
        menuEn: 'https://tinyurl.com/27lelake',

        // Photo du sous-menu tools-menu (song, mail, url...)
        tools: 'https://tinyurl.com/2bqjbqdy',

        // Photo du sous-menu gc-menu (commandes de groupe)
        gc: 'https://raw.githubusercontent.com/toge021/Media/main/f216.jpg',

        // Photo du sous-menu fun-menu (jeux, commandes fun)
        fun: 'https://raw.githubusercontent.com/toge021/Media/main/377a.jpg',

        // Photo du sous-menu dev-menu (commandes développeur)
        dev: 'https://raw.githubusercontent.com/toge021/Media/main/f216.jpg',

        // Miniature envoyée par .song (remplace la miniature YouTube d'origine)
        song: 'https://tinyurl.com/27n423qa',

        // Image utilisée par le plugin mail (aide, création d'adresse...)
        mail: 'https://raw.githubusercontent.com/toge021/Media/main/377a.jpg',

        tg: 'https://raw.githubusercontent.com/toge021/Media/main/f216.jpg',

        // Image envoyée avec le texte de la commande .help (liste des commandes)
        help: 'https://tinyurl.com/22h73wdy',

        // Image par défaut du message de bienvenue (welcome). Chaque groupe
        // peut la remplacer avec {prefix}welcome image <url> ; tant qu'il ne
        // l'a pas fait, c'est celle-ci qui est utilisée.
        welcome: 'https://tinyurl.com/24vhgx6y',

        // Image par défaut du message d'au revoir (goodbye). Même logique :
        // {prefix}goodbye image <url> pour la remplacer par groupe.
        goodbye: 'https://tinyurl.com/27uupg8n',
    },
};
