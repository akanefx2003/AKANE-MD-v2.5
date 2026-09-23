// plugins/song.js

import yts from 'yt-search';
import axios from 'axios';
import fs from 'fs';
import { t, getLang } from '../lang.js';

const API_KEYS = [
    '25222978fdmshe6b4366767fb8e6p18086bjsnee54a88ff976',
    '5b1f7e8168msh62ce2d53951cc9ap1678a4jsn7af1076e73c6',
];

const API_HOST      = 'youtube-mp36.p.rapidapi.com';
const COUNTER_FILE  = './database/song_counter.json';

function getCounter() {
    try {
        if (fs.existsSync(COUNTER_FILE)) return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf-8')).index || 0;
    } catch {}
    return 0;
}
function saveCounter(index) {
    try { fs.writeFileSync(COUNTER_FILE, JSON.stringify({ index }, null, 2)); } catch {}
}
function getCurrentApiKey() {
    const counter = getCounter();
    return { apiKey: API_KEYS[counter % API_KEYS.length], counter };
}
function nextKey() {
    saveCounter(getCounter() + 1);
}

// ── Formatage des infos vidéo ───────────────────────────────────────────────

function formatViews(n) {
    const num = Number(n);
    if (!num && num !== 0) return 'N/A';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
}

async function getAudioBuffer(videoId) {
    const { apiKey } = getCurrentApiKey();

    const dlRes = await axios.get('https://youtube-mp36.p.rapidapi.com/dl', {
        params:  { id: videoId },
        headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': API_HOST },
        timeout: 30000,
    });

    const data = dlRes.data;

    if (data?.status === 'processing') {
        await new Promise(r => setTimeout(r, 3000));
        return getAudioBuffer(videoId);
    }
    if (data?.status !== 'ok' || !data?.link) throw new Error('Échec du téléchargement');

    const audioRes = await axios.get(data.link, {
        responseType: 'arraybuffer',
        timeout:      60000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer':    'https://youtube-mp36.p.rapidapi.com/',
        },
    });

    nextKey();
    return { buffer: Buffer.from(audioRes.data), title: data.title };
}

// ── Carte "SONG" — cadre fixe, ne pas modifier ──────────────────────────────
// Abrège un titre/artiste de plus de 2 mots ("Mot1 Mot2...") pour que la carte
// reste courte et lisible.
function abbreviate(text) {
    if (!text) return text || '—';
    const words = text.trim().split(/\s+/);
    if (words.length <= 2) return text.trim();
    return words.slice(0, 2).join(' ') + '...';
}

function buildSongCard({ title, artist, views, botLink }) {
    return `╭⊷─────────◈
*┃· ͟͟͞͞➳❥ TITRE :* *_${abbreviate(title)}_*
*┃· ͟͟͞͞➳❥ ARTISTE :*  *_${abbreviate(artist)}_*
*┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5*
*┃· ͟͟͞͞➳❥ VUES :* _${views}_
*┃· ͟͟͞͞➳❥ BOT LINK :* ${botLink}
╰⊷─────────◈
> *BY DEV AKANE 🌹*`;
}

async function handler(client, message, args, ctx) {
    const jid   = message.key.remoteJid;
    const query = args.join(' ').trim();
    // L'image d'aide (pas la miniature de la chanson) reste basée sur les images
    // génériques du bot : song, sinon menuImage.
    const helpImage = ctx.settings.images?.song || ctx.settings.menuImage;

    if (!query) {
        return client.sendMessage(jid, {
            image: { url: helpImage },
            caption: ctx.titledBox('SONG',
                [t(ctx.config, 'songTitle'), t(ctx.config, 'songUsage')],
                [ctx.prefix + 'song', t(ctx.config, 'songUsageValue')],
                [t(ctx.config, 'songExample'), `${ctx.prefix}song oshi no ko`]
            ),
        }, { quoted: message });
    }

    try {
        // Aucun message de statut ("recherche"/"téléchargement") : le bot
        // travaille en silence et ne réagit qu'une fois le résultat prêt.
        const resultat = await yts(query);
        if (!resultat?.videos?.length) {
            return client.sendMessage(jid, { text: ctx.titledBox('SONG', [t(ctx.config, 'songNotFound'), query]) }, { quoted: message });
        }

        const video = resultat.videos[0];
        const { buffer, title } = await getAudioBuffer(video.videoId);

        // Carte d'info avec la photo gérée depuis settings.js
        // (ctx.settings.images.song, repli sur menuImage si vide) — jamais la
        // miniature YouTube d'origine.
        const thumb = ctx.settings.images?.song || ctx.settings.menuImage;
        await client.sendMessage(jid, {
            image: { url: thumb },
            caption: buildSongCard({
                title:   title || video.title,
                views:   formatViews(video.views),
                artist:  video.author?.name || '—',
                botLink: ctx.settings.botLink,
            }),
        }, { quoted: message });

        await client.sendMessage(jid, {
            audio:    buffer,
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
        }, { quoted: message });

    } catch (err) {
        console.error('❌ Erreur song:', err.message);
        return client.sendMessage(jid, { text: ctx.titledBox('SONG', [t(ctx.config, 'songError'), err.message]) }, { quoted: message });
    }
}

export default {
    name: 'song',
    commands: ['song'],
    category: 'outils',
    description: 'Télécharge une musique depuis YouTube',
    handler,
};
