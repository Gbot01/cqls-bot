const { Client, GatewayIntentBits, Partials } = require("discord.js");
const axios = require("axios");

// =========================
// CONFIG DISCORD
// =========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers   // ← AJOUTÉ POUR LES PSEUDOS SERVEUR
    ],
    partials: [Partials.Message, Partials.Reaction]
});

// =========================
// BARÈMES ATTAQUE / DÉFENSE / TEMPO
// =========================
const attaque = {
    1: { 5: 1750, 4: 1000, 3: 400, 2: 150, 1: 115, 0: 50 },
    2: { 5: 1500, 4: 875, 3: 350, 2: 137, 1: 105, 0: 50 },
    3: { 5: 1250, 4: 750, 3: 300, 2: 125, 1: 95, 0: 50 },
    4: { 5: 1000, 4: 625, 3: 250, 2: 112, 1: 85, 0: 50 },
    5: { 5: 750, 4: 500, 3: 200, 2: 100, 1: 75, 0: 50 }
};

const defense = {
    1: { 5: 2200, 4: 750, 3: 400, 2: 150, 1: 65 },
    2: { 5: 1900, 4: 650, 3: 350, 2: 125, 1: 55 },
    3: { 5: 1600, 4: 550, 3: 300, 2: 100, 1: 45 },
    4: { 5: 1300, 4: 450, 3: 250, 2: 75, 1: 35 },
    5: { 5: 1000, 4: 350, 3: 200, 2: 50, 1: 25 }
};

const tempo = {
    "5-10": 50,
    "10-20": 100,
    "20-25": 150,
    "25-30": 200,
    "30+": 250
};

// =========================
// CONFIG GITHUB
// =========================
const owner = "Gbot01";
const repo = "cqls-bot";
const filePath = "saison.json";
const token = process.env.GITHUB_TOKEN;

// =========================
// LECTURE SAISON.JSON
// =========================
async function readSaison() {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    try {
        const res = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json"
            }
        });

        const content = Buffer.from(res.data.content, "base64").toString("utf8");
        return JSON.parse(content);

    } catch (err) {
        console.log("❌ Impossible de lire saison.json sur GitHub");
        console.log(err.response?.status, err.response?.statusText);
        return {};
    }
}

// =========================
// ÉCRITURE SAISON.JSON
// =========================
async function writeSaison(newData) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    let sha = null;

    try {
        const current = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json"
            }
        });

        sha = current.data.sha;
    } catch {
        console.log("⚠️ Création du fichier saison.json");
    }

    const updatedContent = Buffer.from(JSON.stringify(newData, null, 2)).toString("base64");

    await axios.put(url, {
        message: "Update saison.json",
        content: updatedContent,
        sha: sha
    }, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json"
        }
    });
}

// =========================
// VARIABLE SAISON
// =========================
let saison = {};

// =========================
// CHARGEMENT GITHUB AVANT READY
// =========================
(async () => {
    console.log("⏳ Chargement saison.json depuis GitHub…");
    saison = await readSaison();
    console.log("✅ Saison chargée :", saison);
})();

// =========================
// READY
// =========================
client.on("ready", () => {
    console.log(`🔥 Bot connecté : ${client.user.tag}`);
});

// =========================
// CALCUL POINTS VSX
// =========================
function calculPoints(salon, mentionsCount) {
    salon = salon.toLowerCase();

    // TEMPO
    if (salon.includes("tempo")) {
        if (salon.includes("5-10")) return tempo["5-10"] * mentionsCount;
        if (salon.includes("10-20")) return tempo["10-20"] * mentionsCount;
        if (salon.includes("20-25")) return tempo["20-25"] * mentionsCount;
        if (salon.includes("25-30")) return tempo["25-30"] * mentionsCount;
        return tempo["30+"] * mentionsCount;
    }

    // ATTAQUE NO-DEF
    if (salon.includes("attaques-no-def") || salon.includes("attaque-no-def")) {
        return 50 * mentionsCount;
    }

    // ATTAQUE / DÉFENSE CLASSIQUE
    const type = salon.includes("attaque") ? "attaque" : "defense";
    const match = salon.match(/vs(\d+)/);
    if (!match) return 0;

    const ennemis = parseInt(match[1]);
    const allies = mentionsCount;

    if (allies > 5) return 0;

    return type === "attaque"
        ? attaque[allies][ennemis]
        : defense[allies][ennemis];
}

// =========================
// MESSAGECREATE
// =========================
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.attachments.size > 0) {
        const salon = message.channel.name.toLowerCase();

        if (
            salon.includes("attaque") ||
            salon.includes("attaques") ||
            salon.includes("defense") ||
            salon.includes("défense") ||
            salon.includes("defenses") ||
            salon.includes("défenses") ||
            salon.includes("tempo")
        ) {
            await message.reply("📌 Screen détecté. Vote : 👍 = valider / 👎 = refuser (staff uniquement).");
        }
    }

    if (message.content === "!ladder") {
        if (Object.keys(saison).length === 0) {
            return message.reply("📉 Aucun point pour le moment.");
        }

        const classement = Object.entries(saison)
            .sort((a, b) => b[1] - a[1]);

        let ladder = "🏆 **Ladder de la saison**\n\n";

        for (const [id, points] of classement) {

            // 🔥 Récupération du pseudo serveur (nickname)
            const member = await message.guild.members.fetch(id).catch(() => null);

            const name = member
                ? (member.nickname || member.user.username)
                : `ID ${id}`;

            ladder += `**${name}** → ${points} points\n`;
        }

        return message.reply(ladder);
    }

    if (message.content.startsWith("!newsaison")) {
        saison = {};
        await writeSaison(saison);
        return message.reply("🌟 Nouvelle saison lancée !");
    }
});

// =========================
// ANTI DOUBLE VALIDATION
// =========================
const validatedMessages = new Set();

client.on("messageReactionAdd", async (reaction, user) => {
    if (reaction.emoji.name !== "👍") return;

    const originalMessage = reaction.message;
    const originalContent = originalMessage.content;

    if (!originalContent || originalContent.trim().length === 0) return;
    if (validatedMessages.has(originalMessage.id)) return;

    validatedMessages.add(originalMessage.id);

    const regex = /<@!?(\d+)>/g;
    const matches = [...originalContent.matchAll(regex)];
    if (matches.length === 0) return;

    const mentionsCount = matches.length;
    const salonName = originalMessage.channel.name;

    const points = calculPoints(salonName, mentionsCount);

    for (const match of matches) {
        const allyId = match[1];
        if (!saison[allyId]) saison[allyId] = 0;
        saison[allyId] += points;
    }

    await writeSaison(saison);
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
