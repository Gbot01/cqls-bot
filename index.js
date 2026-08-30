<<<<<<< HEAD
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// ------------------------------
// CLIENT DISCORD
// ------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION"]
});

// ------------------------------
// CONFIG
// ------------------------------

const salonClassement = "classement-saison";
const nomRoleStaff = "Chef";

// ------------------------------
// BARÈMES ATTAQUE / DÉFENSE / TEMPO
// ------------------------------

const baremesTempo = {
    "Tempo-5-10Min": 50,
    "Tempo-10-20Min": 100,
    "Tempo-20-25Min": 150,
    "Tempo-25-30Min": 200,
    "Tempo-plus-de-30min": 250
};

const attaque = {
    1: [50, 115, 150, 400, 1000, 1750],
    2: [50, 105, 137, 380, 875, 1500],
    3: [50, 95, 125, 350, 800, 1250],
    4: [50, 85, 112, 250, 625, 1000],
    5: [50, 75, 100, 200, 500, 750]
};

const defense = {
    1: [0, 65, 150, 400, 750, 2200],
    2: [0, 55, 137, 380, 700, 2000],
    3: [0, 45, 125, 350, 650, 1600],
    4: [0, 35, 112, 250, 500, 1250],
    5: [0, 25, 100, 200, 350, 1000]
};

// ------------------------------
// FICHIER SAISON
// ------------------------------

const saisonFile = "./saison.json";
if (!fs.existsSync(saisonFile)) fs.writeFileSync(saisonFile, JSON.stringify({}));

function loadSaison() {
    return JSON.parse(fs.readFileSync(saisonFile));
}
function saveSaison(data) {
    fs.writeFileSync(saisonFile, JSON.stringify(data, null, 2));
}

// ------------------------------
// ANTI DOUBLE SCREEN (URL)
// ------------------------------

const screensFile = "./screens.json";
if (!fs.existsSync(screensFile)) fs.writeFileSync(screensFile, JSON.stringify([]));

function loadScreens() {
    return JSON.parse(fs.readFileSync(screensFile));
}
function saveScreens(data) {
    fs.writeFileSync(screensFile, JSON.stringify(data, null, 2));
}

// ------------------------------
// ANTI DOUBLE VALIDATION (message.id)
// ------------------------------

const validatedFile = "./validated.json";
if (!fs.existsSync(validatedFile)) fs.writeFileSync(validatedFile, JSON.stringify([]));

function loadValidated() {
    return JSON.parse(fs.readFileSync(validatedFile));
}
function saveValidated(data) {
    fs.writeFileSync(validatedFile, JSON.stringify(data, null, 2));
}

// ------------------------------
// CALCUL DES POINTS
// ------------------------------

function calculPoints(salon, nbAllies) {
    if (baremesTempo[salon]) return baremesTempo[salon];

    const match = salon.match(/vs(\d+)/);
    if (!match) return 0;

    const enemies = parseInt(match[1]);

    if (salon.includes("attaques")) return attaque[nbAllies][enemies];
    if (salon.includes("défenses")) return defense[nbAllies][enemies];

    return 0;
}

// ------------------------------
// DÉTECTION DES SCREENS
// ------------------------------

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.attachments.size > 0) {
        await message.react("👍");
        await message.react("👎");

        message.reply("💫 Screen détecté. Vote : 👍=valider / 👎=refuser (staff uniquement).");
    }
});

// ------------------------------
// GESTION DES VOTES (STAFF ONLY)
// ------------------------------

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    const message = reaction.message;
    const salon = message.channel.name;

    if (message.attachments.size === 0) return;

    const member = message.guild.members.cache.get(user.id);
    if (!member.roles.cache.some(r => r.name === nomRoleStaff)) return;

    if (reaction.emoji.name !== "👍") return;

    // ------------------------------
    // ANTI DOUBLE VALIDATION FIABLE
    // ------------------------------

    const validated = loadValidated();
    if (validated.includes(message.id)) {
        return; // déjà validé → on ignore
    }

    // ------------------------------
    // ANTI DOUBLE SCREEN
    // ------------------------------

    const screenURL = message.attachments.first().url;
    const screens = loadScreens();

    if (screens.includes(screenURL)) {
        return; // déjà validé → silencieux
    }

    // ------------------------------
    // COMPTER LES ALLIÉS
    // ------------------------------

    const regex = /<@!?(\d+)>/g;
    const nbAllies = [...message.content.matchAll(regex)].length;

    // ------------------------------
    // CALCUL DES POINTS
    // ------------------------------

    const pointsParPing = calculPoints(salon, nbAllies);
    const total = pointsParPing * nbAllies;

    // ------------------------------
    // AJOUT DANS SAISON.JSON
    // ------------------------------

    const saison = loadSaison();
    const auteur = message.author.id;

    if (!saison[auteur]) saison[auteur] = 0;
    saison[auteur] += total;

    saveSaison(saison);

    // ------------------------------
    // ENREGISTRER SCREEN + VALIDATION
    // ------------------------------

    screens.push(screenURL);
    saveScreens(screens);

    validated.push(message.id);
    saveValidated(validated);
});

// ------------------------------
// COMMANDE !ladder
// ------------------------------

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!ladder")) return;

    const saison = loadSaison();
    const entries = Object.entries(saison).sort((a, b) => b[1] - a[1]);

    const embed = new EmbedBuilder()
        .setTitle("🏆 Classement Saison")
        .setColor("Gold");

    let desc = "";

    for (let i = 0; i < entries.length; i++) {
        const [id, points] = entries[i];
        const user = await message.guild.members.fetch(id).catch(() => null);
        desc += `**${i + 1}.** ${user ? user.displayName : "Inconnu"} — **${points} pts**\n`;
    }

    embed.setDescription(desc || "Aucun point pour le moment.");

    message.channel.send({ embeds: [embed] });
});

// ------------------------------
// COMMANDE !newsaison
// ------------------------------

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!newsaison")) return;

    const member = message.guild.members.cache.get(message.author.id);
    if (!member.roles.cache.some(r => r.name === nomRoleStaff)) {
        return message.reply("❌ Commande réservée au staff.");
    }

    saveSaison({});
    saveScreens([]);
    saveValidated([]);

    message.reply("🔄 Nouvelle saison lancée !");
});

// ------------------------------
// LADDER AUTO 24H
// ------------------------------

setInterval(async () => {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const salon = guild.channels.cache.find(c => c.name === salonClassement);
    if (!salon) return;

    const saison = loadSaison();
    const entries = Object.entries(saison).sort((a, b) => b[1] - a[1]);

    const embed = new EmbedBuilder()
        .setTitle("🏆 Classement Saison (Auto 24h)")
        .setColor("Gold");

    let desc = "";

    for (let i = 0; i < entries.length; i++) {
        const [id, points] = entries[i];
        const user = await guild.members.fetch(id).catch(() => null);
        desc += `**${i + 1}.** ${user ? user.displayName : "Inconnu"} — **${points} pts**\n`;
    }

    embed.setDescription(desc || "Aucun point pour le moment.");

    salon.send({ embeds: [embed] });

}, 24 * 60 * 60 * 1000);

// ------------------------------
// LOGIN
// ------------------------------

client.login("process.env.TOKEN");
=======
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// ------------------------------
// CLIENT DISCORD
// ------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION"]
});

// ------------------------------
// CONFIG
// ------------------------------

const salonClassement = "classement-saison";
const nomRoleStaff = "Chef";

// ------------------------------
// BARÈMES ATTAQUE / DÉFENSE / TEMPO
// ------------------------------

const baremesTempo = {
    "Tempo-5-10Min": 50,
    "Tempo-10-20Min": 100,
    "Tempo-20-25Min": 150,
    "Tempo-25-30Min": 200,
    "Tempo-plus-de-30min": 250
};

const attaque = {
    1: [50, 115, 150, 400, 1000, 1750],
    2: [50, 105, 137, 380, 875, 1500],
    3: [50, 95, 125, 350, 800, 1250],
    4: [50, 85, 112, 250, 625, 1000],
    5: [50, 75, 100, 200, 500, 750]
};

const defense = {
    1: [0, 65, 150, 400, 750, 2200],
    2: [0, 55, 137, 380, 700, 2000],
    3: [0, 45, 125, 350, 650, 1600],
    4: [0, 35, 112, 250, 500, 1250],
    5: [0, 25, 100, 200, 350, 1000]
};

// ------------------------------
// FICHIER SAISON
// ------------------------------

const saisonFile = "./saison.json";
if (!fs.existsSync(saisonFile)) fs.writeFileSync(saisonFile, JSON.stringify({}));

function loadSaison() {
    return JSON.parse(fs.readFileSync(saisonFile));
}
function saveSaison(data) {
    fs.writeFileSync(saisonFile, JSON.stringify(data, null, 2));
}

// ------------------------------
// ANTI DOUBLE SCREEN (URL)
// ------------------------------

const screensFile = "./screens.json";
if (!fs.existsSync(screensFile)) fs.writeFileSync(screensFile, JSON.stringify([]));

function loadScreens() {
    return JSON.parse(fs.readFileSync(screensFile));
}
function saveScreens(data) {
    fs.writeFileSync(screensFile, JSON.stringify(data, null, 2));
}

// ------------------------------
// ANTI DOUBLE VALIDATION (message.id)
// ------------------------------

const validatedFile = "./validated.json";
if (!fs.existsSync(validatedFile)) fs.writeFileSync(validatedFile, JSON.stringify([]));

function loadValidated() {
    return JSON.parse(fs.readFileSync(validatedFile));
}
function saveValidated(data) {
    fs.writeFileSync(validatedFile, JSON.stringify(data, null, 2));
}

// ------------------------------
// CALCUL DES POINTS
// ------------------------------

function calculPoints(salon, nbAllies) {
    if (baremesTempo[salon]) return baremesTempo[salon];

    const match = salon.match(/vs(\d+)/);
    if (!match) return 0;

    const enemies = parseInt(match[1]);

    if (salon.includes("attaques")) return attaque[nbAllies][enemies];
    if (salon.includes("défenses")) return defense[nbAllies][enemies];

    return 0;
}

// ------------------------------
// DÉTECTION DES SCREENS
// ------------------------------

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.attachments.size > 0) {
        await message.react("👍");
        await message.react("👎");

        message.reply("💫 Screen détecté. Vote : 👍=valider / 👎=refuser (staff uniquement).");
    }
});

// ------------------------------
// GESTION DES VOTES (STAFF ONLY)
// ------------------------------

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    const message = reaction.message;
    const salon = message.channel.name;

    if (message.attachments.size === 0) return;

    const member = message.guild.members.cache.get(user.id);
    if (!member.roles.cache.some(r => r.name === nomRoleStaff)) return;

    if (reaction.emoji.name !== "👍") return;

    // ------------------------------
    // ANTI DOUBLE VALIDATION FIABLE
    // ------------------------------

    const validated = loadValidated();
    if (validated.includes(message.id)) {
        return; // déjà validé → on ignore
    }

    // ------------------------------
    // ANTI DOUBLE SCREEN
    // ------------------------------

    const screenURL = message.attachments.first().url;
    const screens = loadScreens();

    if (screens.includes(screenURL)) {
        return; // déjà validé → silencieux
    }

    // ------------------------------
    // COMPTER LES ALLIÉS
    // ------------------------------

    const regex = /<@!?(\d+)>/g;
    const nbAllies = [...message.content.matchAll(regex)].length;

    // ------------------------------
    // CALCUL DES POINTS
    // ------------------------------

    const pointsParPing = calculPoints(salon, nbAllies);
    const total = pointsParPing * nbAllies;

    // ------------------------------
    // AJOUT DANS SAISON.JSON
    // ------------------------------

    const saison = loadSaison();
    const auteur = message.author.id;

    if (!saison[auteur]) saison[auteur] = 0;
    saison[auteur] += total;

    saveSaison(saison);

    // ------------------------------
    // ENREGISTRER SCREEN + VALIDATION
    // ------------------------------

    screens.push(screenURL);
    saveScreens(screens);

    validated.push(message.id);
    saveValidated(validated);
});

// ------------------------------
// COMMANDE !ladder
// ------------------------------

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!ladder")) return;

    const saison = loadSaison();
    const entries = Object.entries(saison).sort((a, b) => b[1] - a[1]);

    const embed = new EmbedBuilder()
        .setTitle("🏆 Classement Saison")
        .setColor("Gold");

    let desc = "";

    for (let i = 0; i < entries.length; i++) {
        const [id, points] = entries[i];
        const user = await message.guild.members.fetch(id).catch(() => null);
        desc += `**${i + 1}.** ${user ? user.displayName : "Inconnu"} — **${points} pts**\n`;
    }

    embed.setDescription(desc || "Aucun point pour le moment.");

    message.channel.send({ embeds: [embed] });
});

// ------------------------------
// COMMANDE !newsaison
// ------------------------------

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!newsaison")) return;

    const member = message.guild.members.cache.get(message.author.id);
    if (!member.roles.cache.some(r => r.name === nomRoleStaff)) {
        return message.reply("❌ Commande réservée au staff.");
    }

    saveSaison({});
    saveScreens([]);
    saveValidated([]);

    message.reply("🔄 Nouvelle saison lancée !");
});

// ------------------------------
// LADDER AUTO 24H
// ------------------------------

setInterval(async () => {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const salon = guild.channels.cache.find(c => c.name === salonClassement);
    if (!salon) return;

    const saison = loadSaison();
    const entries = Object.entries(saison).sort((a, b) => b[1] - a[1]);

    const embed = new EmbedBuilder()
        .setTitle("🏆 Classement Saison (Auto 24h)")
        .setColor("Gold");

    let desc = "";

    for (let i = 0; i < entries.length; i++) {
        const [id, points] = entries[i];
        const user = await guild.members.fetch(id).catch(() => null);
        desc += `**${i + 1}.** ${user ? user.displayName : "Inconnu"} — **${points} pts**\n`;
    }

    embed.setDescription(desc || "Aucun point pour le moment.");

    salon.send({ embeds: [embed] });

}, 24 * 60 * 60 * 1000);

// ------------------------------
// LOGIN
// ------------------------------

client.login("process.env.TOKEN");
>>>>>>> 35f6daeb2523662081b80449146b9868992d24e2
