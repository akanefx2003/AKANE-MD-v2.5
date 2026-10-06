// plugins/groupcreate.js
// .gcreate <nom> [@mentions] — crée un nouveau groupe WhatsApp
// Alias abrégé : .gc (ne s'affiche pas dans le menu — voir note en bas de fichier)

import axios from 'axios';

const GROUP_IMAGE = 'https://tinyurl.com/2ytggf5p';
const FOOTER = '> *BY DEV AKANE 🌹*';

function box(lines) {
    const body = lines.map(([label, value]) => `*┃· ͟͟͞͞➳❥* *${label} :* ${value}`).join('\n');
    return `╭⊷─────────◈\n${body}\n╰⊷─────────◈\n${FOOTER}`;
}

async function fetchGroupImage() {
    const res = await axios.get(GROUP_IMAGE, { responseType: 'arraybuffer', timeout: 20000 });
    return Buffer.from(res.data);
}

// JID de la personne qui a tapé la commande (fonctionne que ce soit
// depuis le propre numéro du bot ou depuis un autre numéro autorisé).
function getSenderJid(client, message) {
    return message.key.fromMe
        ? `${client.user?.id?.split(':')[0]}@s.whatsapp.net`
        : (message.key.participant || message.key.remoteJid);
}

export default {
    name: 'groupcreate',
    // "gcreate" en premier = c'est le nom affiché dans le menu.
    // "gc" est un deuxième déclencheur qui fonctionne pareil mais reste masqué.
    commands: ['gcreate', 'gc'],
    category: 'groupe',
    description: 'Crée un nouveau groupe WhatsApp',

    async handler(client, message, args, ctx) {
        const remoteJid = message.key.remoteJid;
        const prefix = ctx?.prefix || '.';
        const query = args.join(' ').trim();

        if (!query) {
            return client.sendMessage(remoteJid, {
                text: box([
                    ['UTILISATION', `${prefix}gcreate [NOM]`],
                    ['EXEMPLE', `${prefix}gcreate Mon Groupe`],
                ]),
            }, { quoted: message });
        }

        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        try {
            await client.sendMessage(remoteJid, { text: '⏳ *Création du groupe...*' }, { quoted: message });

            const group = await client.groupCreate(query, mentioned);
            const gid = group.gid || group.id;
            const inviteCode = await client.groupInviteCode(gid);
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            const senderJid = getSenderJid(client, message);

            // Une seule fois téléchargée, réutilisée pour la photo de profil
            // du groupe ET pour le message de confirmation ci-dessous.
            let imageBuffer = null;
            try {
                imageBuffer = await fetchGroupImage();
            } catch (e) {
                console.error('❌ gcreate (téléchargement image) :', e.message);
            }

            if (imageBuffer) {
                try {
                    await client.updateProfilePicture(gid, imageBuffer);
                } catch (e) {
                    console.error('❌ gcreate (photo de profil du groupe) :', e.message);
                }
            }

            await client.sendMessage(remoteJid, {
                image: imageBuffer ? imageBuffer : { url: GROUP_IMAGE },
                caption: box([
                    ['GROUPE NAME', query],
                    ['GC-LINK', inviteLink],
                    ['OWENER', `@${senderJid.split('@')[0]}`],
                ]),
                mentions: [...mentioned, senderJid],
            }, { quoted: message });
        } catch (err) {
            console.error('❌ gcreate:', err.message);
            let raison = err.message;
            if (err.message.includes('not-authorized')) raison = 'Non autorisé';
            if (err.message.includes('rate-overlimit')) raison = 'Trop de groupes créés récemment';
            await client.sendMessage(remoteJid, { text: box([['ERREUR', raison]]) }, { quoted: message }).catch(() => {});
        }
    },
};
