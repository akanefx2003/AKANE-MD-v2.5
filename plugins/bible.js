// plugins/bible.js
import axios from 'axios';

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBzhyQ4NVisPH1NSe1R';

// ── Cadre v2.5 (identique à la carte de song.js) ────────────────────────────
const P = '┃· ͟͟͞͞➳❥';
const BRAND = '*┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5*';
const clean = (t) => String(t ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
// Abrège un texte de plus de 2 mots ("Mot1 Mot2...") pour garder la carte courte, comme song.js
const abbreviate = (text) => {
    const w = clean(text).split(' ').filter(Boolean);
    if (!w.length) return '—';
    return w.length <= 2 ? w.join(' ') : w.slice(0, 2).join(' ') + '...';
};
// mode : 'strong' = *_valeur_*, 'soft' = _valeur_, 'raw' = telle quelle (liens, @mentions)
const line = (label, value, mode = 'strong') =>
    `*${P} ${label} :* ` + (mode === 'raw' ? value : mode === 'soft' ? `_${value}_` : `*_${value}_*`);
const card = (top, bottom = []) =>
    ['╭⊷─────────◈', ...top, BRAND, ...bottom, '╰⊷─────────◈', '> *BY DEV AKANE 🌹*'].join('\n');

// Aide / erreurs : même boîte que song.js (ctx.titledBox), avec un repli si ctx est absent.
function titled(ctx, title, ...sections) {
    if (typeof ctx?.titledBox === 'function') return ctx.titledBox(title, ...sections);
    return card(sections.map((s) => line(clean(s[0]), clean(s.slice(1).join(' ')) || '—', 'soft')));
}
// Aide avec l'image gérée dans settings.js (settings.images.<cmd>, sinon menuImage), comme song.js
async function sendHelp(client, jid, message, ctx, key, caption) {
    const img = ctx?.settings?.images?.[key] || ctx?.settings?.menuImage;
    return client.sendMessage(jid, img ? { image: { url: img }, caption } : { text: caption }, { quoted: message });
}

const bibleBooks = {
    'genèse': 'Genesis', 'genese': 'Genesis',
    'exode': 'Exodus',
    'lévitique': 'Leviticus', 'levitique': 'Leviticus',
    'nombres': 'Numbers',
    'deutéronome': 'Deuteronomy', 'deuteronome': 'Deuteronomy',
    'josué': 'Joshua', 'josue': 'Joshua',
    'juges': 'Judges',
    'ruth': 'Ruth',
    '1 samuel': '1 Samuel', 'i samuel': '1 Samuel',
    '2 samuel': '2 Samuel', 'ii samuel': '2 Samuel',
    '1 rois': '1 Kings', 'i rois': '1 Kings',
    '2 rois': '2 Kings', 'ii rois': '2 Kings',
    '1 chroniques': '1 Chronicles', 'i chroniques': '1 Chronicles',
    '2 chroniques': '2 Chronicles', 'ii chroniques': '2 Chronicles',
    'esdras': 'Ezra',
    'néhémie': 'Nehemiah', 'nehemie': 'Nehemiah',
    'esther': 'Esther',
    'job': 'Job',
    'psaumes': 'Psalms', 'psaume': 'Psalms',
    'proverbes': 'Proverbs',
    'ecclésiaste': 'Ecclesiastes', 'ecclesiaste': 'Ecclesiastes',
    'cantique': 'Song of Solomon',
    'ésaïe': 'Isaiah', 'esaie': 'Isaiah',
    'jérémie': 'Jeremiah', 'jeremie': 'Jeremiah',
    'lamentations': 'Lamentations',
    'ézéchiel': 'Ezekiel', 'ezechiel': 'Ezekiel',
    'daniel': 'Daniel',
    'osée': 'Hosea', 'osee': 'Hosea',
    'joël': 'Joel', 'joel': 'Joel',
    'amos': 'Amos',
    'abdias': 'Obadiah',
    'jonas': 'Jonah',
    'michée': 'Micah', 'michee': 'Micah',
    'nahum': 'Nahum',
    'habacuc': 'Habakkuk',
    'sophonie': 'Zephaniah',
    'aggée': 'Haggai', 'aggee': 'Haggai',
    'zacharie': 'Zechariah',
    'malachie': 'Malachi',
    'matthieu': 'Matthew',
    'marc': 'Mark',
    'luc': 'Luke',
    'jean': 'John',
    'actes': 'Acts',
    'romains': 'Romans',
    '1 corinthiens': '1 Corinthians', 'i corinthiens': '1 Corinthians',
    '2 corinthiens': '2 Corinthians', 'ii corinthiens': '2 Corinthians',
    'galates': 'Galatians',
    'éphésiens': 'Ephesians', 'ephesiens': 'Ephesians',
    'philippiens': 'Philippians',
    'colossiens': 'Colossians',
    '1 thessaloniciens': '1 Thessalonians', 'i thessaloniciens': '1 Thessalonians',
    '2 thessaloniciens': '2 Thessalonians', 'ii thessaloniciens': '2 Thessalonians',
    '1 timothée': '1 Timothy', 'i timothée': '1 Timothy',
    '2 timothée': '2 Timothy', 'ii timothée': '2 Timothy',
    'tite': 'Titus',
    'philémon': 'Philemon', 'philemon': 'Philemon',
    'hébreux': 'Hebrews', 'hebreux': 'Hebrews',
    'jacques': 'James',
    '1 pierre': '1 Peter', 'i pierre': '1 Peter',
    '2 pierre': '2 Peter', 'ii pierre': '2 Peter',
    '1 jean': '1 John', 'i jean': '1 John',
    '2 jean': '2 John', 'ii jean': '2 John',
    '3 jean': '3 John', 'iii jean': '3 John',
    'jude': 'Jude',
    'apocalypse': 'Revelation'
};

// Du plus long au plus court : un nom n'en masque pas un autre qui commence pareil.
const bookEntries = Object.entries(bibleBooks).sort((x, y) => y[0].length - x[0].length);

function translateReference(ref) {
    ref = ref.toLowerCase().trim();
    for (const [fr, en] of bookEntries) {
        if (ref.startsWith(fr)) return en + ref.substring(fr.length);
    }
    return ref;
}

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;
    const query = (Array.isArray(args) ? args : []).join(' ').trim();
    const pfx = ctx?.prefix || '.';

    if (!query) {
        return sendHelp(client, jid, message, ctx, 'bible', titled(ctx, 'BIBLE',
            ['VERSET BIBLE', 'UTILISATION'],
            [pfx + 'bible', '[référence]'],
            ['EXEMPLE', `${pfx}bible Jean 3:16`]
        ));
    }

    try {
        // Le bot travaille en silence (comme song) et répond une fois le résultat prêt.
        const englishRef = translateReference(query);
        const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(englishRef)}&type=json`;
        const response = await axios.get(apiUrl, { timeout: 10000 });
        if (!response.data || response.data.length === 0) throw new Error('Verset non trouvé');

        const { bookname, chapter, verse, text } = response.data[0];
        const englishText = String(text).replace(/\(.*?\)/g, '').trim();

        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(englishText)}`;
        const translateResponse = await axios.get(translateUrl, { timeout: 10000 });

        let frenchText = '';
        if (translateResponse.data && translateResponse.data[0]) {
            frenchText = translateResponse.data[0].map((item) => item[0]).join(' ');
        }
        if (!frenchText) throw new Error('Traduction échouée');

        return client.sendMessage(jid, {
            text: card(
                [
                    line('VERSET', `${clean(bookname)} ${chapter}:${verse}`),
                    line('TEXTE', `"${clean(frenchText)}"`, 'soft'),
                ],
                [
                    line('TRADUCTION', 'AUTO', 'soft'),
                    line('CHAINE', CHANNEL_LINK, 'raw'),
                ]
            ),
        }, { quoted: message });

    } catch (err) {
        console.error('❌ Erreur bible:', err.message);
        return client.sendMessage(jid, {
            text: titled(ctx, 'BIBLE', ['ERREUR', 'Verset introuvable'], ['EXEMPLE', `${pfx}bible Jean 3:16`]),
        }, { quoted: message });
    }
}

export default {
    name: 'bible',
    commands: ['bible'],
    category: 'outils',
    description: 'Affiche un verset de la Bible en français',
    handler,
};
