const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Events 
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");

// =========================
// CONFIG DISCORD
// =========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message]
});

// =========================
// BARÈMES ATTAQUE / DÉFENSE / TEMPO (TES VALEURS EXACTES)
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
// SAISON.JSON LOCAL
// =========================
function readLocalSaison() {
    try {
        return JSON.parse(fs.readFileSync("./saison.json", "utf8"));
    } catch {
        return {};
    }
}

function writeLocalSaison(data) {
    fs.writeFileSync("./saison.json", JSON.stringify(data, null, 2));
}

let saison = readLocalSaison();

// =========================
// BACKUP GITHUB (MANUEL)
// =========================
const owner = "Gbot01";
const repo = "cqls-bot";
const filePath = "saison.json";
const token = process.env.GITHUB_TOKEN;

async function backupToGitHub() {
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
    } catch {}

    const updatedContent = Buffer.from(JSON.stringify(saison, null, 2)).toString("base64");

    await axios.put(url, {
        message: "Backup saison.json",
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
// READY
// =========================
client.on("ready", () => {
    console.log(`🔥 Bot connecté : ${client.user.tag}`);
});

// =========================
// CALCUL POINTS VSX
// =========================
function calculPoints(salon, alliesCount) {
    salon = salon.toLowerCase();

    if (salon.includes("tempo")) {
        if (salon.includes("5-10")) return tempo["5-10"];
        if (salon.includes("10-20")) return tempo["10-20"];
        if (salon.includes("20-25")) return tempo["20-25"];
        if (salon.includes("25-30")) return tempo["25-30"];
        return tempo["30+"];
    }

    if (salon.includes("attaques-no-def") || salon.includes("attaque-no-def")) {
        return 50;
    }

    const type = salon.includes("attaque") ? "attaque" : "defense";
    const match = salon.match(/vs(\d+)/);
    if (!match) return 0;

    const ennemis = parseInt(match[1]);
    const allies = alliesCount;

    if (allies > 5) return 0;

    return type === "attaque"
        ? attaque[allies][ennemis]
        : defense[allies][ennemis];
}

// =========================
// ANTI-SPAM SCREENS JOUEURS
// =========================
const lastScreenTime = new Map();
const SCREEN_COOLDOWN = 1000;

// =========================
// MESSAGE CREATE
// =========================
client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    // SCREEN
    if (message.attachments.size > 0) {

        const now = Date.now();
        const prev = lastScreenTime.get(message.author.id) || 0;

        if (now - prev < SCREEN_COOLDOWN) {
            return;
        }

        lastScreenTime.set(message.author.id, now);

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

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`valider_${message.id}`)
                    .setLabel("🟩 Valider")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`refuser_${message.id}`)
                    .setLabel("🟥 Refuser")
                    .setStyle(ButtonStyle.Danger)
            );

            await message.reply({
                content: "📌 Screen détecté — cliquez pour valider ou refuser.",
                components: [row]
            });
        }
    }

    // LADDER
    if (message.content === "!ladder") {
        if (Object.keys(saison).length === 0) {
            return message.reply("📉 Aucun point pour le moment.");
        }

        const classement = Object.entries(saison)
            .sort((a, b) => b[1] - a[1]);

        let ladder = "🏆 **Ladder de la saison**\n\n";

        const podium = ["🥇 1er", "🥈 2e", "🥉 3e"];
        let index = 0;

        for (const [id, points] of classement) {
            const member = await message.guild.members.fetch(id).catch(() => null);
            const name = member ? (member.nickname || member.user.username) : `ID ${id}`;

            if (index < 3) {
                ladder += `**${podium[index]} — ${name}** → ${points} points\n`;
            } else {
                ladder += `**${index + 1}e — ${name}** → ${points} points\n`;
            }

            index++;
        }

        return message.reply(ladder);
    }

    // NEWSAISON
    if (message.content.startsWith("!newsaison")) {
        saison = {};
        writeLocalSaison(saison);
        return message.reply("🌟 Nouvelle saison lancée !");
    }

    // BACKUP MANUEL
    if (message.content === "!backup") {
        await backupToGitHub();
        return message.reply("💾 Backup effectué sur GitHub !");
    }
});

// =========================
// BOUTONS : VALIDATION / REFUS
// =========================
const lastChefValidation = new Map();
const validationQueue = new Set();

client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isButton()) return;

    const chefId = interaction.user.id;
    const [action, messageId] = interaction.customId.split("_");

    const last = lastChefValidation.get(chefId);
    const now = Date.now();

    if (last && now - last < 1500) {
        return interaction.reply({
            content: "⚠️ Validation ignorée (trop rapide)",
            ephemeral: true
        });
    }

    lastChefValidation.set(chefId, now);

    const channel = interaction.channel;
    const screenMessage = await channel.messages.fetch(messageId).catch(() => null);

    if (!screenMessage) {
        return interaction.reply({
            content: "⚠️ Screen introuvable.",
            ephemeral: true
        });
    }

    // REFUSER
    if (action === "refuser") {

        await screenMessage.react("👎").catch(() => {});

        await interaction.message.edit({
            content: `🟥 Screen refusé par <@${interaction.user.id}>`,
            components: []
        });

        return interaction.reply({
            content: "✖ Screen refusé",
            ephemeral: true
        });
    }

    // VALIDER
    if (action === "valider") {

        if (validationQueue.has(messageId)) {
            return interaction.reply({
                content: "⚠️ Déjà en cours de validation",
                ephemeral: true
            });
        }

        validationQueue.add(messageId);

        try {
            const regex = /<@!?(\d+)>/g;
            const matches = [...screenMessage.content.matchAll(regex)];

            if (matches.length === 0) {
                validationQueue.delete(messageId);
                return interaction.reply({
                    content: "⚠️ Aucun ping détecté.",
                    ephemeral: true
                });
            }

            const mentionsCount = matches.length;
            const salonName = screenMessage.channel.name;

            const pointsParPing = calculPoints(salonName, mentionsCount);

            if (!pointsParPing || pointsParPing === 0) {
                validationQueue.delete(messageId);
                return interaction.reply({
                    content: "⚠️ Aucun point attribué.",
                    ephemeral: true
                });
            }

            for (const match of matches) {
                const allyId = match[1];
                if (!saison[allyId]) saison[allyId] = 0;
                saison[allyId] += pointsParPing;
            }

            writeLocalSaison(saison);

            const totalPoints = pointsParPing * mentionsCount;

            validationQueue.delete(messageId);

            await screenMessage.react("👍").catch(() => {});

            await interaction.message.edit({
                content: `🟩 Screen validé par <@${interaction.user.id}> — +${totalPoints} points`,
                components: []
            });

            return interaction.reply({
                content: "✔ Validation prise en compte",
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            validationQueue.delete(messageId);
            return interaction.reply({
                content: "❌ Erreur lors de la validation.",
                ephemeral: true
            });
        }
    }
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
