// plugins/dev-info.js
// Commandes du DEV-MENU : dev-channel, owner, group-support, report
// (la commande "repo" reste dans index.js, elle est juste déplacée dans la catégorie dev)

// ⚠️ À REMPLIR : liens de la chaîne dev et du groupe de support
const DEV_CHANNEL   = 'https://whatsapp.com/channel/0029Vb865EJ0QeapgV7MkP2D';
const GROUP_SUPPORT = 'https://chat.whatsapp.com/H3NFTeYMW9E1sMsr21zehB'; // ← colle ici le lien d'invitation du groupe (https://chat.whatsapp.com/...)

const OWNER_NAME    = 'DEV AKANE';
const OWNER_NUMBER  = '221762413172';
const OWNER_JID     = `${OWNER_NUMBER}@s.whatsapp.net`;

const REPORT_COOLDOWN_MS = 60 * 1000;
const REPORT_MAX_CHARS   = 800;
const lastReport = new Map(); // expéditeur -> timestamp

const FOOTER = '> *BY DEV AKANE 🌹*';

export default {
    name: 'dev-info',
    commands: ['dev-channel', 'owner', 'group-support', 'report'],
    category: 'dev',
    description: 'Infos développeur : chaîne, contact, groupe de support, signalement',

    async handler(client, message, args, ctx) {
        const sender  = message.key.remoteJid;
        const prefix  = ctx?.prefix || '.';
        const box     = ctx.titledBox;
        const reply   = (content) => client.sendMessage(sender, content, { quoted: message });

        // Le PluginManager ne transmet pas le nom de la commande : on le relit dans le message
        const m    = message.message || {};
        const body = (m.extendedTextMessage?.text || m.conversation || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
        const command = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();

        switch (command) {
            case 'dev-channel':
                return reply({
                    text: box('DEV-CHANNEL', ['CHAÎNE', DEV_CHANNEL], FOOTER),
                    nativeFlow: [{ text: 'REJOINDRE LA CHAÎNE 📢', url: DEV_CHANNEL }],
                });

            case 'group-support': {
                if (!GROUP_SUPPORT) return reply({ text: box('GROUP-SUPPORT', "❌ Lien du groupe pas encore configuré", FOOTER) });
                return reply({
                    text: box('GROUP-SUPPORT', ['GROUPE', GROUP_SUPPORT], FOOTER),
                    nativeFlow: [{ text: 'REJOINDRE LE GROUPE 💬', url: GROUP_SUPPORT }],
                });
            }

            case 'owner': {
                const vcard = [
                    'BEGIN:VCARD',
                    'VERSION:3.0',
                    `FN:${OWNER_NAME}`,
                    `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}`,
                    'END:VCARD',
                ].join('\n');
                await reply({ contacts: { displayName: OWNER_NAME, contacts: [{ vcard }] } });
                return reply({ text: box('OWNER', ['NOM', OWNER_NAME], ['NUMÉRO', `+${OWNER_NUMBER}`], FOOTER) });
            }

            case 'report': {
                const text = args.join(' ').trim();
                if (!text) {
                    return reply({ text: box('REPORT', ['USAGE', `${prefix}report [décris le problème]`], ['EXEMPLE', `${prefix}report le menu ne s'affiche pas`], FOOTER) });
                }

                const who  = message.key.participant || sender;
                const wait = (lastReport.get(who) || 0) + REPORT_COOLDOWN_MS - Date.now();
                if (wait > 0) return reply({ text: `⏳ Attends encore ${Math.ceil(wait / 1000)}s avant d'envoyer un autre signalement.` });
                lastReport.set(who, Date.now());

                const clean   = text.slice(0, REPORT_MAX_CHARS);
                const number  = who.split('@')[0].split(':')[0];
                const isGroup = sender.endsWith('@g.us');
                const report  = box('NOUVEAU REPORT',
                    ['DE', `${message.pushName || 'inconnu'} (+${number})`],
                    ['LIEU', isGroup ? `groupe ${sender}` : 'message privé'],
                    ['MESSAGE', clean],
                    FOOTER,
                );

                try {
                    await client.sendMessage(OWNER_JID, { text: report });
                } catch (err) {
                    console.error('❌ report :', err.message);
                    lastReport.delete(who);
                    return reply({ text: box('REPORT', "❌ Impossible d'envoyer le signalement, réessaie plus tard", FOOTER) });
                }
                return reply({ text: box('REPORT', ['STATUT', 'signalement envoyé ✅'], FOOTER) });
            }
        }
    },
};
