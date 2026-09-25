// plugins/checkban.js — Vérifie si un ou plusieurs numéros WhatsApp sont bannis (API baron0)

const API_BASE         = 'https://baron0.com';
const BANCHECK_API_KEY = process.env.BANCHECK_API_KEY || 'bk_v1_UQ9DzG2ThP3OCdLl7V-6JTGFgtU5TqBL2cFhT-aZb2w-PeD8buAQNyWLjLic-6U9E-09hfaBSssYQa52436B__EUsloXo7Z6y2wjIa4G4Xdkg1_8YJ4i14_fPbT_uNgLdJtxVX_kpns6YoXzaw3SDQ3ViIJB05BMq2cs2edudAV_r9IDj6HVCzYvtsxngykST5AU-pHD3MuOP_h8wRVeekLZlha-Ccs2fBcOj2eIad2scl7XmiofPlwb-B6nFx0K9g4yFVp48mORM7aWyYmmsHyJTS5HBAMsT1yc7M4vf7YPt6l9EtXUFpgN1Tyvc-vIO0ViLg04IFexVnQntgPe1OUG9VuvAxQKc-8Av6RxcRjBrRNk5aYKgf9nEoP88WopiCXb5XtcW5qXY7pz7e7_ihuQxcjBVYRT2vBiMcb8iQu5Tu34gbqp9r3oJInql7H3wicWIxVkzGEidb5u8iFsBFKesu4W7CoyPEBcf-knlkfGMC6VMLnZztwlfwxrZY-EWc3C6K0NK6HZKAVTwIogxkSK9co_mM23Ba8-UT78jEEI';

const MAX_BULK    = 20;
const COOLDOWN_MS = 5000;
const lastUse     = new Map();

function normalize(raw) {
    const digits = String(raw).replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return '+' + digits;
}

async function callApi(pathname, payload) {
    const res = await fetch(`${API_BASE}${pathname}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${BANCHECK_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
    });

    const body = await res.json().catch(() => ({}));

    // Erreurs au format problem+json : { status, title, detail, requestId }
    if (!res.ok) throw new Error(body.detail || body.title || `HTTP ${res.status}`);

    return body;
}

async function handler(client, message, args, ctx) {
    const jid    = message.key.remoteJid;
    const sender = message.key.participant || jid;
    const { box, prefix } = ctx;
    const send = (text) => client.sendMessage(jid, { text }, { quoted: message });

    // ── CLÉ API ──
    if (!BANCHECK_API_KEY) {
        return send(box(['⚠️ Clé API manquante', 'définis BANCHECK_API_KEY']));
    }

    // ── HELP ──
    if (!args.length) {
        return send(box(
            ['🔎 Ban check', `${prefix}checkban +491701234567`],
            [`${prefix}checkban +49... +33...`, `jusqu'à ${MAX_BULK} numéros`]
        ));
    }

    // ── ANTI-SPAM ──
    const now = Date.now();
    if (now - (lastUse.get(sender) || 0) < COOLDOWN_MS) {
        return send(box('⏳ Patiente quelques secondes'));
    }
    lastUse.set(sender, now);

    // ── VALIDATION ──
    const numbers = [...new Set(args.map(normalize).filter(Boolean))];

    if (!numbers.length) return send(box(['❌ Numéro invalide', 'format : +codepays numéro']));
    if (numbers.length > MAX_BULK) return send(box(['❌ Trop de numéros', `maximum : ${MAX_BULK}`]));

    try {
        await client.sendMessage(jid, { text: box('🔎 Vérification en cours...') });

        // ── UN SEUL NUMÉRO ──
        if (numbers.length === 1) {
            const result = await callApi('/api/v2/check', { number: numbers[0] });

            const pairs = [
                ['🔎 Ban check', numbers[0]],
                ['Statut', result.banned ? '🚫 Banni' : '✅ Non banni'],
            ];
            if (result.banned && result.reason) pairs.push(['Raison', result.reason]);

            return send(box(...pairs));
        }

        // ── PLUSIEURS NUMÉROS ──
        const body    = await callApi('/api/v2/bulk-check', { numbers });
        const results = body.results || [];

        const pairs = [['🔎 Ban check', `${results.length} numéro(s)`]];

        results.forEach(r => {
            if (r.status && r.status !== 'ok') return pairs.push([r.number, '⚠️ erreur']);
            pairs.push([r.number, r.banned ? `🚫 banni${r.reason ? ` (${r.reason})` : ''}` : '✅ non banni']);
        });

        const banned = results.filter(r => r.banned).length;
        pairs.push(['Bannis', `${banned} / ${results.length}`]);

        return send(box(...pairs));

    } catch (err) {
        return send(box(['⚠️ Erreur', String(err.message).slice(0, 200)]));
    }
}

export default {
    name: 'checkban',
    commands: ['checkban'],
    category: 'outils',
    description: 'Vérifie si un ou plusieurs numéros WhatsApp sont bannis',
    handler,
};
