// commands/one-shot.js
// .one-shot        → retire TOUS les membres en un seul appel (instantané)
// .one-shot2       → retire les membres par paquets (anti-ban)
// .set-one-shot N S → règle la taille des paquets (N) et le délai en secondes (S)
//                      entre deux paquets, utilisés par one-shot2
//                      (accepte aussi "set one shot N S" / "set one-shot N S")
//                      → tapé sans rien après "set" : ne fait rien.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = path.join(__dirname, '..', 'database', 'oneshot.json')

const DEFAULT_BATCH = 10
const DEFAULT_DELAY_MS = 1000
const MAX_BATCH = 50           // WhatsApp refuse souvent au-delà d'un certain volume par appel

const START_MSG = '*LA VRAIE PURGE EST LÀ 🧧*'
const END_MSG = '*BIG DEAL SOYONS STYLÉ 💸*'

// ───────── Réglage persistant (taille des paquets + délai) ─────────
function loadSettings() {
    const defaults = { batchSize: DEFAULT_BATCH, delayMs: DEFAULT_DELAY_MS }
    try {
        if (fs.existsSync(DB_FILE)) {
            const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
            return {
                batchSize: Number.isInteger(d.batchSize) && d.batchSize > 0 ? d.batchSize : defaults.batchSize,
                delayMs: Number.isInteger(d.delayMs) && d.delayMs > 0 ? d.delayMs : defaults.delayMs,
            }
        }
    } catch {}
    return defaults
}
function saveSettings(s) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(s, null, 2))
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const num = (p) => String(p).split('@')[0].split(':')[0]

async function getTargets(client, jid) {
    const meta = await client.groupMetadata(jid)
    const me = [client.user?.id, client.user?.lid].filter(Boolean).map(num)
    // on garde les admins (dont le propriétaire) et le bot lui-même
    return (meta.participants || [])
        .filter(p => !p.admin)
        .map(p => p.id)
        .filter(id => !me.includes(num(id)))
}

// Supprime le message de commande tapé par l'utilisateur (si le bot est admin)
async function deleteTriggerMessage(client, message) {
    try {
        await client.sendMessage(message.key.remoteJid, { delete: message.key }, { skipCanal: true })
    } catch (e) {
        console.error('❌ [ONE-SHOT] suppression de la commande :', e.message)
    }
}

// ───────── Lecture de la commande tapée (gère les variantes avec espaces) ─────────
function parseCommand(message) {
    const m = message.message || {}
    const body = (m.conversation || m.extendedTextMessage?.text
        || m.imageMessage?.caption || m.videoMessage?.caption || '').trim()
    const clean = body.replace(/^[^\w]+/, '') // enlève le préfixe (., !, / …)
    const norm = clean.toLowerCase().replace(/\s+/g, ' ')

    if (/^one-?shot2\b/.test(norm)) return { cmd: 'one-shot2' }
    if (/^one-?shot\b/.test(norm)) return { cmd: 'one-shot' }

    // set one-shot <taille> [secondes]   — "set" seul ne matche rien
    const setMatch = norm.match(/^set[\s-]?one[\s-]?shot\s+(\d+)(?:\s+(\d+))?/)
    if (setMatch) {
        return {
            cmd: 'set-one-shot',
            batchSize: parseInt(setMatch[1], 10),
            delaySeconds: setMatch[2] ? parseInt(setMatch[2], 10) : null,
        }
    }

    return { cmd: null }
}

export default {
    name: 'one-shot',
    commands: ['one-shot', 'oneshot', 'one-shot2', 'oneshot2', 'set-one-shot', 'setoneshot', 'set'],
    category: 'groupe',
    description: 'Supprime les membres du groupe (instantané ou par paquets) + réglage taille/délai des paquets',

    async handler(client, message /*, args, ctx */) {
        const jid = message.key.remoteJid
        const parsed = parseCommand(message)
        if (!parsed.cmd) return // pas notre commande (ex: "set" seul, ou un autre "set..." du bot)

        if (!jid.endsWith('@g.us')) {
            return client.sendMessage(jid, { text: '❌ Groupe uniquement' }, { quoted: message, skipCanal: true })
        }

        // ── réglage taille de paquet + délai (en secondes) pour one-shot2 ──
        if (parsed.cmd === 'set-one-shot') {
            if (!Number.isInteger(parsed.batchSize) || parsed.batchSize < 1) return
            const current = loadSettings()
            const batchSize = Math.min(parsed.batchSize, MAX_BATCH)
            const delayMs = parsed.delaySeconds && parsed.delaySeconds > 0
                ? parsed.delaySeconds * 1000
                : current.delayMs
            saveSettings({ batchSize, delayMs })
            // pas de message de confirmation — réglage silencieux
            return
        }

        // ── purge instantanée : un seul appel avec tous les membres ──
        if (parsed.cmd === 'one-shot') {
            await deleteTriggerMessage(client, message)

            let targets
            try { targets = await getTargets(client, jid) }
            catch { return }

            if (!targets.length) return

            await client.sendMessage(jid, { text: START_MSG }, { skipCanal: true })
            try {
                await client.groupParticipantsUpdate(jid, targets, 'remove')
            } catch (e) {
                console.error('❌ [ONE-SHOT]', e.message)
                return
            }
            await client.sendMessage(jid, { text: END_MSG }, { skipCanal: true })
            return
        }

        // ── purge par paquets : anti-ban, délai configurable entre paquets ──
        if (parsed.cmd === 'one-shot2') {
            await deleteTriggerMessage(client, message)

            let targets
            try { targets = await getTargets(client, jid) }
            catch { return }

            if (!targets.length) return

            const { batchSize, delayMs } = loadSettings()
            await client.sendMessage(jid, { text: START_MSG }, { skipCanal: true })

            for (let i = 0; i < targets.length; i += batchSize) {
                const chunk = targets.slice(i, i + batchSize)
                try {
                    await client.groupParticipantsUpdate(jid, chunk, 'remove')
                } catch (e) {
                    console.error('❌ [ONE-SHOT2]', e.message)
                    return
                }
                if (i + batchSize < targets.length) await sleep(delayMs)
            }

            await client.sendMessage(jid, { text: END_MSG }, { skipCanal: true })
        }
    }
}
