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
    "5-10": 100,
    "10-20": 200,
    "20-25": 300,
    "25-30": 350,
    "30+": 400,
    "50+": 750,
};

// =========================
// CONFIG GITHUB (pour backup uniquement)
// =========================
const owner = "Gbot01";
const repo = "cqls-bot";
const filePath = "saison.json";
const token = process.env.GITHUB_TOKEN;

// =========================
// SAISON LOCAL + HISTORIQUE DES VALIDATIONS
// =========================
// Tout est enregistré dans saison.json pour que points et annulations
// soient sauvegardés ensemble. L'ancien format de saison.json est accepté.
const SAISON_FILE = "./saison.json";
const SAISON_FORMAT = "cqls-saison-v2";
let saison = {};
let validations = {};

function saisonSnapshot() {
    return {
        format: SAISON_FORMAT,
        points: saison,
        validations: validations
    };
}

function loadLocalSaison() {
    if (!fs.existsSync(SAISON_FILE)) return;

    // Ne jamais effacer les points si le JSON existant est illisible.
    const data = JSON.parse(fs.readFileSync(SAISON_FILE, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Format de saison.json invalide");
    }

    if (data.format === SAISON_FORMAT) {
        if (!data.points || !data.validations ||
            typeof data.points !== "object" ||
            typeof data.validations !== "object" ||
            Array.isArray(data.points) || Array.isArray(data.validations)) {
            throw new Error("Données de saison.json invalides");
        }
        saison = data.points;
        validations = data.validations;
    } else {
        // Ancien format : { "idJoueur": totalPoints, ... }
        if (!Object.entries(data).every(([id, points]) => /^\d+$/.test(id) &&
            typeof points === "number" && Number.isFinite(points))) {
            throw new Error("Ancien format de saison.json non reconnu");
        }
        saison = data;
        validations = {};
    }
}

function saveLocalSaison() {
    // Écriture atomique : pas de fichier JSON partiellement écrit.
    const tmp = `${SAISON_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(saisonSnapshot(), null, 2), "utf8");
    fs.renameSync(tmp, SAISON_FILE);
}

// Applique une modification des points ET du journal en une seule sauvegarde.
// Si l'écriture échoue, on remet l'état en mémoire comme avant.
function modifierSaison(modification) {
    const ancienneSaison = { ...saison };
    const anciennesValidations = { ...validations };
    try {
        modification();
        saveLocalSaison();
    } catch (error) {
        saison = ancienneSaison;
        validations = anciennesValidations;
        throw error;
    }
}

loadLocalSaison();

// =========================
// BACKUP MANUEL
// =========================
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

    const updatedContent = Buffer.from(JSON.stringify(saisonSnapshot(), null, 2)).toString("base64");

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
    client.guilds.cache.forEach(g => g.members.fetch());
});

// =========================
// CALCUL POINTS VSX
// =========================
function calculPoints(salon, mentionsCount) {
    salon = salon.toLowerCase();

if (salon.includes("tempo")) {
    if (salon.includes("5-10")) return tempo["5-10"];
    if (salon.includes("10-20")) return tempo["10-20"];
    if (salon.includes("20-25")) return tempo["20-25"];
    if (salon.includes("25-30")) return tempo["25-30"];
    if (salon.includes("plus-de-30")) return tempo["30+"];
    if (salon.includes("plus-de-50")) return tempo["50+"];
    return 0;
}
    if (salon.includes("attaques-no-def") || salon.includes("attaque-no-def")) {
        return 50;
    }

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
// ANTI-SPAM SCREENS JOUEURS
// =========================
const lastScreenTime = new Map();
const SCREEN_COOLDOWN = 1000;

// =========================
// MESSAGE CREATE (screens + commandes)
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
        modifierSaison(() => {
            saison = {};
            validations = {}; // Les boutons d'annulation de l'ancienne saison deviennent inactifs.
        });
        return message.reply("🌟 Nouvelle saison lancée !");
    }

    // BACKUP MANUEL
    if (message.content.startsWith("!backup")) {
        await backupToGitHub();
        return message.reply("💾 Saison sauvegardée sur GitHub !");
    }
});

// =========================
// BOUTONS : VALIDATION / REFUS / ANNULATION
// =========================
const lastChefValidation = new Map();
const validationQueue = new Set();

function boutonAnnulation(messageId) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`annuler_${messageId}`)
            .setLabel("↩️ Annuler la validation")
            .setStyle(ButtonStyle.Danger)
    )];
}

function affichageValidation(messageId, record) {
    const total = record.pointsParJoueur * record.joueurs.length;
    if (record.statut === "validee") {
        return {
            content: `🟩 Screen validé par <@${record.chefId}> — +${record.pointsParJoueur} points chacun (total ${total})`,
            components: boutonAnnulation(messageId)
        };
    }
    if (record.statut === "annulee") {
        return {
            content: `↩️ Validation annulée par <@${record.annulePar}> — ${record.pointsParJoueur} points retirés par mention (total retiré ${total})`,
            components: []
        };
    }
    return {
        content: `🟥 Screen refusé par <@${record.chefId}>`,
        components: []
    };
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    const parsed = /^(valider|refuser|annuler)_(\d+)$/.exec(interaction.customId);
    if (!parsed) return;

    // Seuls les membres ayant le rôle « chef » peuvent agir.
    if (!interaction.member.roles.cache.some(r => r.name.toLowerCase() === "chef")) {
        return interaction.reply({
            content: "⛔ Seul un chef peut valider, refuser ou annuler un screen.",
            ephemeral: true
        });
    }

    const [, action, messageId] = parsed;
    const chefId = interaction.user.id;
    const last = lastChefValidation.get(chefId);
    const now = Date.now();
    if (last && now - last < 1500) {
        return interaction.reply({
            content: "⚠️ Action ignorée (trop rapide).",
            ephemeral: true
        });
    }
    lastChefValidation.set(chefId, now);

    // Accuse réception avant toute récupération de message Discord.
    await interaction.deferReply({ ephemeral: true });
    if (validationQueue.has(messageId)) {
        return interaction.editReply("⚠️ Une action est déjà en cours sur ce screen.");
    }
    validationQueue.add(messageId);

    try {
        const dejaTraitee = validations[messageId];

        // ANNULER : utilise les points et joueurs sauvegardés lors de la validation.
        // Ne recalcule jamais le barème actuel, même si les barèmes ont changé.
        if (action === "annuler") {
            if (!dejaTraitee) {
                return interaction.editReply("⚠️ Validation introuvable dans la saison actuelle (ancienne validation ou ancienne saison).");
            }
            if (dejaTraitee.statut === "annulee") {
                await interaction.message.edit(affichageValidation(messageId, dejaTraitee))
                    .catch(err => console.error("Impossible de mettre à jour le bouton :", err));
                return interaction.editReply("ℹ️ Cette validation a déjà été annulée. Aucun point retiré.");
            }
            if (dejaTraitee.statut !== "validee") {
                return interaction.editReply("⚠️ Ce screen n'a pas été validé : rien à annuler.");
            }

            // Vérifier que la saison contient encore suffisamment de points :
            // par exemple si les données ont été restaurées depuis un ancien backup.
            const aRetirer = new Map();
            for (const id of dejaTraitee.joueurs) {
                aRetirer.set(id, (aRetirer.get(id) || 0) + dejaTraitee.pointsParJoueur);
            }
            for (const [id, montant] of aRetirer) {
                if ((saison[id] || 0) < montant) {
                    return interaction.editReply(
                        "⚠️ Annulation bloquée : les points actuels d'un joueur ne correspondent plus à l'historique. Aucun point retiré."
                    );
                }
            }

            modifierSaison(() => {
                for (const [id, montant] of aRetirer) {
                    saison[id] -= montant;
                    if (saison[id] === 0) delete saison[id];
                }
                validations[messageId] = {
                    ...dejaTraitee,
                    statut: "annulee",
                    annulePar: chefId
                };
            });

            const miseAJour = await interaction.message.edit(
                affichageValidation(messageId, validations[messageId])
            ).then(() => true).catch(err => {
                console.error("Annulation enregistrée, mais affichage Discord non modifié :", err);
                return false;
            });
            return interaction.editReply(miseAJour
                ? "↩️ Validation annulée. Les points ont été retirés du classement."
                : "↩️ Points retirés et sauvegardés, mais impossible de mettre à jour le message Discord.");
        }

        // VALIDER / REFUSER : bloquer toute double attribution (même après un redémarrage).
        if (dejaTraitee) {
            await interaction.message.edit(affichageValidation(messageId, dejaTraitee))
                .catch(err => console.error("Impossible de réparer l'affichage :", err));
            return interaction.editReply("ℹ️ Ce screen a déjà été traité. Aucun point ajouté.");
        }

        const screenMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (!screenMessage) {
            return interaction.editReply("⚠️ Screen introuvable.");
        }

        if (action === "refuser") {
            modifierSaison(() => {
                validations[messageId] = {
                    statut: "refusee", chefId, pointsParJoueur: 0, joueurs: []
                };
            });
            await screenMessage.react("👎").catch(() => {});
            await interaction.message.edit(affichageValidation(messageId, validations[messageId]))
                .catch(err => console.error("Refus enregistré, mais affichage non modifié :", err));
            return interaction.editReply("✖ Screen refusé.");
        }

        if (action === "valider") {
            const joueurs = [...screenMessage.content.matchAll(/<@!?(\d+)>/g)]
                .map(match => match[1]);
            if (joueurs.length === 0) {
                return interaction.editReply("⚠️ Aucun ping détecté.");
            }

            const points = calculPoints(screenMessage.channel.name, joueurs.length);
            if (!Number.isFinite(points) || points <= 0) {
                return interaction.editReply("⚠️ Aucun point attribué.");
            }

            modifierSaison(() => {
                for (const id of joueurs) {
                    saison[id] = (saison[id] || 0) + points;
                }
                validations[messageId] = {
                    statut: "validee",
                    chefId,
                    pointsParJoueur: points,
                    joueurs
                };
            });

            await screenMessage.react("👍").catch(() => {});
            const miseAJour = await interaction.message.edit(
                affichageValidation(messageId, validations[messageId])
            ).then(() => true).catch(err => {
                console.error("Validation enregistrée, mais affichage non modifié :", err);
                return false;
            });
            return interaction.editReply(miseAJour
                ? "✔ Validation prise en compte. Le bouton d'annulation est disponible."
                : "✔ Points enregistrés, mais impossible d'afficher le bouton d'annulation. Réessayez le bouton Valider pour actualiser le message sans doubler les points.");
        }
    } catch (error) {
        console.error("Erreur traitement screen :", error);
        return interaction.editReply("❌ Erreur lors de l'action. Vérifie les logs Railway et la sauvegarde saison.json.");
    } finally {
        validationQueue.delete(messageId);
    }
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
