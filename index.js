const { Client, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Reaction]
});

// ----------------------
// BARÈMES ATTAQUES
// ----------------------
const attaque = {
    1: { 5: 1750, 4: 1000, 3: 400, 2: 150, 1: 115, 0: 50 },
    2: { 5: 1500, 4: 875, 3: 350, 2: 137, 1: 105, 0: 50 },
    3: { 5: 1250, 4: 750, 3: 300, 2: 125, 1: 95, 0: 50 },
    4: { 5: 1000, 4: 625, 3: 250, 2: 112, 1: 85, 0: 50 },
    5: { 5: 750, 4: 500, 3: 200, 2: 100, 1: 75, 0: 50 }
};

// ----------------------
// BARÈMES DÉFENSES
// ----------------------
const defense = {
    1: { 5: 2200, 4: 750, 3: 400, 2: 150, 1: 65, 0: 0 },
    2: { 5: 1900, 4: 650, 3: 350, 2: 125, 1: 55, 0: 0 },
    3: { 5: 1600, 4: 550, 3: 300, 2: 100, 1: 45, 0: 0 },
    4: { 5: 1300, 4: 450, 3: 250, 2: 75, 1: 35, 0: 0 },
    5: { 5: 1000, 4: 350, 3: 200, 2: 50, 1: 25, 0: 0 }
};

// ----------------------
// BARÈMES TEMPO
// ----------------------
const tempo = {
    "5-10": 50,
    "10-20": 100,
    "20-25": 150,
    "25-30": 200,
    "30+": 250
};

// ----------------------
// SAISON
// ----------------------
function loadSaison() {
    try {
        return JSON.parse(fs.readFileSync("saison.json", "utf8"));
    } catch {
        return {};
    }
}

function saveSaison(data) {
    fs.writeFileSync("saison.json", JSON.stringify(data, null, 2));
}

// ----------------------
// CALCUL POINTS (VERSION VSX)
// ----------------------
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

    const type = salon.includes("attaques") ? "attaque" : "defense";

    const match = salon.match(/vs(\d+)/);
    if (!match) return 0;

    const ennemis = parseInt(match[1]);
    const allies = mentionsCount;

    if (allies > 5) return 0;

    if (type === "attaque") {
        return attaque[allies][ennemis];
    } else {
        return defense[allies][ennemis];
    }
}

// ----------------------
// MESSAGECREATE
// ----------------------
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Détection automatique de screen uniquement dans les salons VSX
    if (message.attachments.size > 0) {
        const salon = message.channel.name.toLowerCase();

        if (
            salon.startsWith("attaques") ||
            salon.startsWith("defenses") ||
            salon.startsWith("tempo")
        ) {
            await message.reply("📌 Screen détecté. Vote : 👍 = valider / 👎 = refuser (staff uniquement).");
        }
    }

    // Commande ladder
    if (message.content === "!ladder") {
        const saison = loadSaison();
        if (Object.keys(saison).length === 0) {
            return message.reply("📉 Aucun point pour le moment.");
        }

        let ladder = "🏆 **Ladder de la saison**\n\n";
        for (const id in saison) {
            const user = await client.users.fetch(id).catch(() => null);
            const name = user ? user.username : `ID ${id}`;
            ladder += `**${name}** → ${saison[id]} points\n`;
        }

        return message.reply(ladder);
    }

    // Commande newsaison x (reset)
    if (message.content.startsWith("!newsaison")) {
        const saison = {};
        saveSaison(saison);
        return message.reply("🌟 Nouvelle saison lancée ! Le ladder a été remis à zéro.");
    }
});

// ----------------------
// VALIDATION 👍
// ----------------------
client.on("messageReactionAdd", async (reaction, user) => {
    if (reaction.emoji.name !== "👍") return;

    const originalMessage = reaction.message;
    const originalContent = originalMessage.content;

    if (!originalContent || originalContent.trim().length === 0) return;

    const regex = /<@!?(\d+)>/g;
    const matches = [...originalContent.matchAll(regex)];

    if (matches.length === 0) return;

    const mentionsCount = matches.length;
    const salonName = originalMessage.channel.name;

    const points = calculPoints(salonName, mentionsCount);

    const saison = loadSaison();

    for (const match of matches) {
        const allyId = match[1];
        if (!saison[allyId]) saison[allyId] = 0;
        saison[allyId] += points;
    }

    saveSaison(saison);
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);
