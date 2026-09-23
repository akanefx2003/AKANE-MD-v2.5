// plugins/url.js

import { downloadMediaMessage } from 'baileys';
import { fileTypeFromBuffer } from 'file-type';
import axios from 'axios';
import FormData from 'form-data';

// ─── Upload vers CDN Crysnovax (avec bonne extension) ──────────────────────

async function uploadToCrysnovax(buffer, fileName) {
    const form = new FormData();
    form.append('file', buffer, { filename: fileName });

    try {
        const res = await axios.post(
            'https://cdn.crysnovax.link/upload',
            form,
            {
                headers: { ...form.getHeaders() },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 15000,
            }
        );

        let url = res.data?.url || res.data?.link || res.data;
        if (typeof url === 'object') url = url.url || url.link || JSON.stringify(url);
        return url ? url.trim() : null;
    } catch (error) {
        throw new Error(`Upload failed: ${error.message}`);
    }
}

// ─── Raccourcisseur (TinyURL, pas de clé requise) ─────────────────────────────

async function shortenUrl(longUrl) {
    try {
        const res   = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
        const short = (await res.text()).trim();
        return short.startsWith('http') ? short : longUrl;
    } catch {
        return longUrl; // si le raccourcisseur échoue, on garde le lien complet
    }
}

// ─── Verrou par sender ─────────────────────────────────────────────────────

const processing = new Map();

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(client, message, args, ctx) {
    const jid    = message.key.remoteJid;
    const sender = message.key.participant || message.key.remoteJid;

    if (processing.get(sender)) {
        return client.sendMessage(jid, { text: ctx.box(ctx.t('urlAlreadyBusy')) }, { quoted: message });
    }

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
        return client.sendMessage(jid, {
            text: ctx.box(
                [ctx.t('urlTitle'), ctx.t('urlUsage')],
                [ctx.t('urlSupport'), ctx.t('urlSupportVal')],
                [ctx.t('urlExample'), `${ctx.t('urlExampleVal')} ${ctx.prefix}url`]
            ),
        }, { quoted: message });
    }

    const mediaData = quoted.imageMessage || quoted.videoMessage || quoted.audioMessage || quoted.documentMessage;

    if (!mediaData) {
        return client.sendMessage(jid, { text: ctx.box(ctx.t('urlUnsupported'), ctx.t('urlUnsupportedDesc')) }, { quoted: message });
    }

    processing.set(sender, true);
    await client.sendMessage(jid, { react: { text: '⏳', key: message.key } });

    try {
        const fakeMsg = { key: { ...message.key }, message: quoted };
        const buffer  = await downloadMediaMessage(fakeMsg, 'buffer', {});

        if (!buffer || buffer.length === 0) throw new Error('Impossible de télécharger le média');

        let extension = 'bin';
        try {
            const type = await fileTypeFromBuffer(buffer);
            extension = type?.ext || quoted.documentMessage?.fileName?.split('.').pop() || 'bin';
        } catch {
            extension = quoted.documentMessage?.fileName?.split('.').pop() || 'bin';
        }

        const longLink = await uploadToCrysnovax(buffer, `akane_${Date.now()}.${extension}`);
        const link     = await shortenUrl(longLink);
        const sizeMB   = (buffer.length / 1024 / 1024).toFixed(2);

        await client.sendMessage(jid, { react: { text: '✅', key: message.key } });

        // Toujours en texte seul, sans afficher la photo/le média généré
        const typeLabel = quoted.imageMessage ? ctx.t('urlTypeImage')
            : quoted.videoMessage ? ctx.t('urlTypeVideo')
            : quoted.audioMessage ? ctx.t('urlTypeAudio')
            : (quoted.documentMessage?.fileName || `Document.${extension}`);

        return client.sendMessage(jid, {
            text: ctx.box([ctx.t('urlGenerated'), typeLabel], [ctx.t('urlSize'), `${sizeMB} MB`], [ctx.t('urlLink'), link]),
            nativeFlow: [{ text: ctx.t('urlCopyLink'), copy: link }],
        }, { quoted: message });

    } catch (error) {
        console.error('❌ Erreur URL:', error.message);
        await client.sendMessage(jid, { react: { text: '❌', key: message.key } });
        return client.sendMessage(jid, { text: ctx.box([ctx.t('urlFailed'), error.message]) }, { quoted: message });

    } finally {
        processing.delete(sender);
    }
}

export default {
    name: 'url',
    commands: ['url'],
    category: 'outils',
    description: 'Génère un lien court pour une image, vidéo, audio ou document cité',
    // Traductions propres à ce plugin — lues automatiquement par index.js au
    // chargement (aucune modification de lang.js nécessaire).
    lang: {
        fr: {
            urlTitle:       '🔗 URL Uploader',
            urlUsage:       'Réponds à un média pour générer son lien',
            urlSupport:     'Supporte',
            urlSupportVal:  'image, vidéo, audio, document',
            urlExample:     'Exemple',
            urlExampleVal:  'réponds à un média puis tape',
            urlAlreadyBusy: '⏳ Ton upload est déjà en cours, patiente...',
            urlUnsupported: '❌ Média non supporté',
            urlUnsupportedDesc: 'Réponds à une image, vidéo, audio ou document',
            urlGenerated:   '✅ Lien généré',
            urlSize:        'Taille',
            urlLink:        'Lien',
            urlCopyLink:    '📋 Copier le lien',
            urlFailed:      '❌ Échec de l\'upload',
            urlTypeImage:   'Image',
            urlTypeVideo:   'Vidéo',
            urlTypeAudio:   'Audio',
        },
        en: {
            urlTitle:       '🔗 URL Uploader',
            urlUsage:       'Reply to a media to generate its link',
            urlSupport:     'Supports',
            urlSupportVal:  'image, video, audio, document',
            urlExample:     'Example',
            urlExampleVal:  'reply to a media then type',
            urlAlreadyBusy: '⏳ Your upload is already running, please wait...',
            urlUnsupported: '❌ Unsupported media',
            urlUnsupportedDesc: 'Reply to an image, video, audio or document',
            urlGenerated:   '✅ Link generated',
            urlSize:        'Size',
            urlLink:        'Link',
            urlCopyLink:    '📋 Copy link',
            urlFailed:      '❌ Upload failed',
            urlTypeImage:   'Image',
            urlTypeVideo:   'Video',
            urlTypeAudio:   'Audio',
        },
    },
    handler,
};
