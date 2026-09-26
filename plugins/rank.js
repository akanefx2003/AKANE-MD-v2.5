import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { t } from '../lang.js' // ← adapte le chemin si lang.js n'est pas à la racine du projet

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = path.join(__dirname, '..', 'database', 'ranks.json')

// ───────── Réglages ─────────
// Images de graduation / rétrogradation : remplace ces deux liens par les tiens
// (mêmes contraintes que WELCOME_IMG/GOODBYE_IMG dans welcome-goodbye-v2.js).
const GRADUATION_IMG = 'https://tinyurl.com/REMPLACE_MOI_GRADUATION'
const DEMOTION_IMG = 'https://tinyurl.com/REMPLACE_MOI_RETROGRADATION'

const BOT_LINK = 'https://urls.fr/MjktBF'

// Rangs façon Solo Leveling, du plus faible au plus fort
const RANKS = ['E', 'D', 'C', 'B', 'A', 'S']

// Messages requis pour passer AU rang suivant, indexé par le rang de départ :
// E→D : 10, D→C : 15, C→B : 20, B→A : 25, A→S : 30 (+5 à chaque palier)
const BASE_THRESHOLD = 10
const THRESHOLD_STEP = 5
function thresholdFor(rankIndex) {
    // rankIndex = index du rang ACTUEL (avant graduation)
    return BASE_THRESHOLD + rankIndex * THRESHOLD_STEP
}

const INACTIVITY_MS = 24 * 60 * 60 * 1000 // 1 jour sans message → rétrogradation
const CHECK_INTERVAL_MS = 30 * 60 * 1000  // vérifie les inactifs toutes les 30 min

// ───────── Mise en forme (même style que welcome-goodbye-v2.js) ─────────
const TOP = '╭⊷─────────◈'
const END = '╰⊷─────────◈'
const B = '┃ · ͟͟͞͞➳❥'
const BRAND = '┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5'
const SIGN = '> *BY DEV AKANE 🌹*'

const line = (txt) => `*${B} ${txt}*`
const field = (label, value) => `*${B}* *${label} :* ${value}`
const bTag = (value) => `*${B}* ${value}`

function botLinkBlock() {
    return [
        `*┠─ 🄱🄾🅃 🄻🄸🄽🄺*`,
        `🔗 ${BOT_LINK}`,
        END,
        SIGN
    ].join('\n')
}

function graduationText(config, tag, newRank, groupName, sentCount, nextThresholdLabel) {
    return [
        TOP,
        bTag(tag),
        line(t(config, 'rkGraduationTitle')),
        field(t(config, 'rkRank'), `*_${newRank}_*`),
        line(`${t(config, 'rkInDungeon')} :`),
        bTag(groupName),
        `*${BRAND}*`,
        line(t(config, 'rkCongrats')),
        field(t(config, 'rkSentMessages'), `*_${sentCount}_*`),
        field(t(config, 'rkNextGraduation'), `*_${nextThresholdLabel}_*`),
        botLinkBlock()
    ].join('\n')
}

function demotionText(config, tag, newRank, groupName, sentCount, nextThresholdLabel) {
    return [
        TOP,
        bTag(tag),
        line(t(config, 'rkDemotionTitle')),
        field(t(config, 'rkRank'), `*_${newRank}_*`),
        line(`${t(config, 'rkInDungeon')} :`),
        bTag(groupName),
        `*${BRAND}*`,
        line(t(config, 'rkStayActive')),
        field(t(config, 'rkSentMessages'), `*_${sentCount}_*`),
        field(t(config, 'rkNextGraduation'), `*_${nextThresholdLabel}_*`),
        botLinkBlock()
    ].join('\n')
}

// ───────── Base de données ─────────
// { "<group>": { "<number>": { rank: 0..5, count: 0, lastActive: ms } } }
function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) || {}
    } catch {}
    return {}
}

function saveDB(db) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

function getEntry(db, group, number) {
    db[group] ||= {}
    db[group][number] ||= { rank: 0, count: 0, lastActive: Date.now() }
    return db[group][number]
}

// ───────── API utilisée par welcome-goodbye-v2.js ─────────
export function getRankLabel(group, number) {
    const db = loadDB()
    const entry = db[group]?.[number]
    return RANKS[entry?.rank ?? 0]
}

// ───────── Utilitaires JID ─────────
const _num = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

async function getGroupInfo(client, group) {
    try {
        const meta = await client.groupMetadata(group)
        return { name: meta?.subject || 'Groupe' }
    } catch {
        return { name: 'Groupe' }
    }
}

async function sendWithImage(client, group, text, mentions, imgUrl) {
    try {
        const res = await fetch(imgUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
        if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.length) {
                await client.sendMessage(group, { image: buf, caption: text, mentions })
                return
            }
        }
    } catch (e) {
        console.error('❌ [RANK-SYSTEM] envoi image:', e.message)
    }
    await client.sendMessage(group, { text, mentions })
}

function nextGraduationLabel(config, rankIndex) {
    if (rankIndex >= RANKS.length - 1) return t(config, 'rkMaxRank') // déjà rang S, pas de palier suivant
    return `${thresholdFor(rankIndex)} ${t(config, 'rkMessagesUnit')}`
}

// ───────── Promotion / rétrogradation ─────────
async function promote(client, group, number, config) {
    const db = loadDB()
    const entry = getEntry(db, group, number)
    if (entry.rank >= RANKS.length - 1) return // déjà rang max

    entry.rank += 1
    entry.count = 0
    saveDB(db)

    const { name: groupName } = await getGroupInfo(client, group)
    const jid = `${number}@s.whatsapp.net`
    const text = graduationText(
        config,
        `@${number}`,
        RANKS[entry.rank],
        groupName,
        entry.count,
        nextGraduationLabel(config, entry.rank)
    )
    await sendWithImage(client, group, text, [jid], GRADUATION_IMG)
}

async function demote(client, group, number, config) {
    const db = loadDB()
    const entry = getEntry(db, group, number)
    if (entry.rank <= 0) return // rang E : pas de rétrogradation possible

    entry.rank -= 1
    entry.count = 0
    entry.lastActive = Date.now() // évite de re-rétrograder en boucle tant qu'il reste inactif
    saveDB(db)

    const { name: groupName } = await getGroupInfo(client, group)
    const jid = `${number}@s.whatsapp.net`
    const text = demotionText(
        config,
        `@${number}`,
        RANKS[entry.rank],
        groupName,
        entry.count,
        nextGraduationLabel(config, entry.rank)
    )
    await sendWithImage(client, group, text, [jid], DEMOTION_IMG)
}

// ───────── Vérification périodique de l'inactivité ─────────
let _intervalStarted = false
function startInactivityWatcher(client, config) {
    if (_intervalStarted) return
    _intervalStarted = true
    setInterval(async () => {
        const db = loadDB()
        const now = Date.now()
        for (const group of Object.keys(db)) {
            for (const number of Object.keys(db[group])) {
                const entry = db[group][number]
                // seuls les membres déjà gradués (rang > E) peuvent être rétrogradés
                if (entry.rank > 0 && now - entry.lastActive >= INACTIVITY_MS) {
                    await demote(client, group, number, config)
                }
            }
        }
    }, CHECK_INTERVAL_MS)
}

export default {
    name: 'rank-system',
    commands: ['rank'],
    category: 'groupe',
    description: 'Système de rang (E à S) basé sur l\'activité des membres, façon Solo Leveling',

    // index.js appelle déjà onMessage(client, message, ctx) pour CHAQUE message —
    // aucune modification de index.js n'est nécessaire, ce plugin fonctionne
    // simplement déposé dans ./plugins. Le watcher d'inactivité démarre tout
    // seul (une fois) dès le premier message reçu.
    async onMessage(client, message, ctx = {}) {
        try {
            const config = ctx.config
            startInactivityWatcher(client, config)

            const group = message.key?.remoteJid
            if (!group?.endsWith('@g.us')) return
            if (message.key?.fromMe) return

            const number = _num(message.key?.participant || message.key?.remoteJid)
            if (!number) return

            const db = loadDB()
            const entry = getEntry(db, group, number)
            entry.count += 1
            entry.lastActive = Date.now()

            const needed = thresholdFor(entry.rank)
            const reachedThreshold = entry.rank < RANKS.length - 1 && entry.count >= needed
            saveDB(db)

            if (reachedThreshold) {
                await promote(client, group, number, config)
            }
        } catch (e) {
            console.error('❌ [RANK-SYSTEM]:', e.message)
        }
    },

    async handler(client, message, args = [], ctx = {}) {
        const jid = message.key.remoteJid
        const cfg = ctx.config
        const frame = (...lines) =>
            ['╭─────────◈', ...lines.filter(Boolean).map(l => `*┆㊧  ${l}*`), '╰─────────◈', SIGN].join('\n')
        const say = (...lines) => client.sendMessage(jid, { text: frame(...lines) }, { quoted: message })

        if (!jid.endsWith('@g.us')) return say(t(cfg, 'wgGroupOnly'))

        const sub = String(args[0] || '').toLowerCase()

        // .rank classement → top membres du groupe par rang puis par messages
        if (['classement', 'top', 'leaderboard'].includes(sub)) {
            const db = loadDB()
            const group = db[jid] || {}
            const list = Object.entries(group)
                .sort((a, b) => b[1].rank - a[1].rank || b[1].count - a[1].count)
                .slice(0, 10)

            if (!list.length) return say(t(cfg, 'rkNoData'))

            return say(
                `🏆 *${t(cfg, 'rkLeaderboard')}*`,
                ...list.map(([num, e], i) => `${i + 1}. @${num} — ${RANKS[e.rank]} (${e.count}/${thresholdFor(e.rank)})`)
            )
        }

        // .rank (seul) → rang de l'auteur du message
        const number = _num(message.key?.participant || message.key?.remoteJid)
        const db = loadDB()
        const entry = getEntry(db, jid, number)
        saveDB(db)

        return say(
            `🎖️ ${t(cfg, 'rkRank')} : *${RANKS[entry.rank]}*`,
            `${t(cfg, 'rkSentMessages')} : *${entry.count}*`,
            entry.rank < RANKS.length - 1
                ? `${t(cfg, 'rkNextGraduation')} : *${nextGraduationLabel(cfg, entry.rank)}*`
                : t(cfg, 'rkMaxRank')
        )
    }
}
