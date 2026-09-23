// plugins/tg.js — Télécharge un pack de stickers Telegram

import axios from 'axios';

const TG_TOKEN = '8823306433:AAF8JlA3CAxsCxcnzvGPHhLpjQp1v7xMGVo';
const TG_API   = `https://api.telegram.org/bot${TG_TOKEN}`;
const TG_FILE  = `https://api.telegram.org/file/bot${TG_TOKEN}`;

const activeSessions = new Map();

async function getStickerPack(packName) {
    const res = await axios.get(`${TG_API}/getStickerSet`, { params: { name: packName }, timeout: 15000 });
    if (!res.data?.ok) throw new Error('Pack introuvable');
    return res.data.result;
}

async function downloadSticker(fileId) {
    const infoRes = await axios.get(`${TG_API}/getFile`, { params: { file_id: fileId }, timeout: 10000 });
    if (!infoRes.data?.ok) throw new Error('Récupération du fichier impossible');
    const fileRes = await axios.get(`${TG_FILE}/${infoRes.data.result.file_path}`, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(fileRes.data);
}

async function handler(client, message, args, ctx) {
    const jid    = message.key.remoteJid;
    const sender = message.key.participant || jid;
    const input  = args[0]?.trim();
    const image  = ctx.settings.images?.tg || ctx.settings.menuImage;

    // ── STOP ──
    if (input === 'stop') {
        if (activeSessions.has(sender)) {
            activeSessions.set(sender, { stopped: true });
            return client.sendMessage(jid, { text: ctx.box(ctx.t('tgStopped')) }, { quoted: message });
        }
        return client.sendMessage(jid, { text: ctx.box(ctx.t('tgNoneRunning')) }, { quoted: message });
    }

    // ── AIDE ──
    if (!input) {
        return client.sendMessage(jid, {
            image: { url: image },
            caption: ctx.box([ctx.t('tgTitle'), `${ctx.prefix}tg [${ctx.t('tgUsageEx')}]`], [ctx.t('tgExample'), `${ctx.prefix}tg https://t.me/addstickers/nom`], ['Stop', `${ctx.prefix}tg stop`]),
        }, { quoted: message });
    }

    if (activeSessions.has(sender)) {
        return client.sendMessage(jid, { text: ctx.box([ctx.t('tgAlreadyTitle'), `${ctx.prefix}tg stop ${ctx.t('tgAlreadyHint')}`]) }, { quoted: message });
    }

    const match    = input.match(/t\.me\/addstickers\/([^\s/]+)/);
    const packName = match ? match[1] : input;

    await client.sendMessage(jid, { text: ctx.box([ctx.t('tgFetching'), packName]) }, { quoted: message });

    try {
        const pack     = await getStickerPack(packName);
        const stickers = pack.stickers || [];

        const staticList   = stickers.filter(s => !s.is_animated && !s.is_video);
        const videoList    = stickers.filter(s => s.is_video);
        const animatedList = stickers.filter(s => s.is_animated);
        const sendList     = [...staticList, ...videoList]; // les .tgs (lottie) ne sont pas supportés par WhatsApp
        const total        = sendList.length;

        await client.sendMessage(jid, {
            text: ctx.box(
                [ctx.t('tgPackFound'), pack.title],
                [ctx.t('tgStatic'), staticList.length],
                [ctx.t('tgVideo'), videoList.length],
                [ctx.t('tgAnimatedIgnored'), animatedList.length],
                [ctx.t('tgTotal'), total]
            ),
        });

        if (total === 0) return client.sendMessage(jid, { text: ctx.box(ctx.t('tgNoCompatible')) });

        activeSessions.set(sender, { stopped: false });
        let success = 0, failed = 0;

        for (let i = 0; i < total; i++) {
            const session = activeSessions.get(sender);
            if (!session || session.stopped) {
                await client.sendMessage(jid, { text: ctx.box([ctx.t('tgStoppedResult'), `${success} ${ctx.t('tgSent')}, ${failed} ${ctx.t('tgFailed')}`]) });
                activeSessions.delete(sender);
                return;
            }

            try {
                const buffer  = await downloadSticker(sendList[i].file_id);
                if (sendList[i].is_video) {
                    await client.sendMessage(jid, { sticker: buffer, mimetype: 'video/mp4', isAnimated: true });
                } else {
                    await client.sendMessage(jid, { sticker: buffer, mimetype: 'image/webp' });
                }
                success++;
                await new Promise(r => setTimeout(r, 600));
            } catch (e) {
                console.error(`[TG] Sticker ${i + 1} échoué:`, e.message);
                failed++;
            }
        }

        activeSessions.delete(sender);
        return client.sendMessage(jid, { text: ctx.box([ctx.t('tgDone'), `${success} ${ctx.t('tgSent')}, ${failed} ${ctx.t('tgFailed')}`]) });

    } catch (e) {
        activeSessions.delete(sender);
        console.error('[TG] Erreur:', e.message);
        return client.sendMessage(jid, { text: ctx.box([ctx.t('tgPackNotFound'), packName], [ctx.t('tgCheckLink'), ctx.t('tgCheckLinkVal')]) }, { quoted: message });
    }
}

export default {
    name: 'tg',
    commands: ['tg'],
    category: 'outils',
    description: 'Télécharge un pack de stickers Telegram',
    // Traductions propres à ce plugin — lues automatiquement par index.js au
    // chargement (aucune modification de lang.js nécessaire).
    lang: {
        fr: {
            tgTitle:        '🎭 TG Sticker',
            tgUsageEx:      'lien du pack',
            tgExample:      'Exemple',
            tgStopped:      '⛔ Téléchargement arrêté',
            tgNoneRunning:  '❌ Aucun téléchargement en cours',
            tgAlreadyTitle: '⏳ Déjà en cours',
            tgAlreadyHint:  'pour arrêter',
            tgFetching:     '🔍 Récupération du pack',
            tgPackFound:    '🎭 Pack trouvé',
            tgStatic:       '🖼️ Statiques',
            tgVideo:        '🎬 Vidéo',
            tgAnimatedIgnored: '✨ Animés .tgs (ignorés)',
            tgTotal:        '📊 Total à envoyer',
            tgNoCompatible: '❌ Aucun sticker compatible',
            tgStoppedResult:'⛔ Arrêté',
            tgSent:         'envoyés',
            tgFailed:       'échoués',
            tgDone:         '✅ Pack terminé',
            tgPackNotFound: '❌ Pack introuvable',
            tgCheckLink:    'Vérifie',
            tgCheckLinkVal: 'que le lien est correct',
        },
        en: {
            tgTitle:        '🎭 TG Sticker',
            tgUsageEx:      'pack link',
            tgExample:      'Example',
            tgStopped:      '⛔ Download stopped',
            tgNoneRunning:  '❌ No download running',
            tgAlreadyTitle: '⏳ Already running',
            tgAlreadyHint:  'to stop',
            tgFetching:     '🔍 Fetching pack',
            tgPackFound:    '🎭 Pack found',
            tgStatic:       '🖼️ Static',
            tgVideo:        '🎬 Video',
            tgAnimatedIgnored: '✨ Animated .tgs (skipped)',
            tgTotal:        '📊 Total to send',
            tgNoCompatible: '❌ No compatible sticker',
            tgStoppedResult:'⛔ Stopped',
            tgSent:         'sent',
            tgFailed:       'failed',
            tgDone:         '✅ Pack complete',
            tgPackNotFound: '❌ Pack not found',
            tgCheckLink:    'Check',
            tgCheckLinkVal: 'that the link is correct',
        },
    },
    handler,
};
