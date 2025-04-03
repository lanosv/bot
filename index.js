const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Fichier qui stocke les membres ayant reçu le message de bienvenue
const welcomeFilePath = path.join(__dirname, 'welcome_members.json');
let welcomeMembers = {};
if (fs.existsSync(welcomeFilePath)) {
    welcomeMembers = JSON.parse(fs.readFileSync(welcomeFilePath));
}

// Stocker les demandes en attente
const pendingRequests = new Map(); // Clé : ID membre, Valeur : département

// Configuration des rôles et canaux
const departmentRoles = {
    REF: "1356909813241741412",
    "Chef REF": "1356910146286260230",
    DEVDESIGN: "1356909956594663504",
    "Chef DEVDESIGN": "1356910272559714386",
    "Chef RPI": "1356910332953624586",
    ITK: "1356909994309583040",
    "Chef ITK": "1356910442995515442",
    SAISIE: "1356910022977912872",
    "Chef SAISIE": "1356910384535179351",
    RPI: "1356910070230810700",
    ADM: "1356910106251624488",
    "Chef ADM": "1356965441129680922",
    "Chef CC": "1356964773761253518",
    CC: "1356964773761253518"
};

const departmentChannels = {
    REF: "1356910935603810335",
    DEVDESIGN: "1356911176474431643",
    ITK: "1356891077260476538",
    SAISIE: "1356910987479089203",
    RPI: "1356911211207327844",
    ADM: "1356911252831731799",
    CC: "1356964733730820176"
};

// Au démarrage du bot
client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
});

// Quand un membre rejoint
client.on('guildMemberAdd', async (member) => {
    const welcomeChannel = member.guild.systemChannel;
    if (!welcomeChannel) return;

    // Vérifier si le membre a déjà reçu le message
    if (welcomeMembers[member.id]) return; // Il a déjà reçu le message, on ne fait rien

    const embed = new EmbedBuilder()
        .setTitle("Bienvenue sur le réseau de SOFTIBOX ! 🎉")
        .setDescription(`Salut ${member}, merci d'avoir rejoint le serveur !\n\nChoisis un ou plusieurs départements que tu veux rejoindre :`)
        .setColor("Blue");

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("choix_REF").setLabel("REF").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("choix_DEVDESIGN").setLabel("DEVDESIGN").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("choix_ITK").setLabel("ITK").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("choix_SAISIE").setLabel("SAISIE").setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("choix_RPI").setLabel("RPI").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("choix_ADM").setLabel("ADM").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("choix_CC").setLabel("CC").setStyle(ButtonStyle.Primary)
    );

    await welcomeChannel.send({ embeds: [embed], components: [row1, row2] });

    // Enregistrer que ce membre a reçu le message
    welcomeMembers[member.id] = true;
    fs.writeFileSync(welcomeFilePath, JSON.stringify(welcomeMembers, null, 2));
});

// Gestion des interactions (boutons)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const member = interaction.member;
    const department = interaction.customId.replace("choix_", "");
    const roleID = departmentRoles[department];
    const channelID = departmentChannels[department];

    if (!roleID || !channelID) {
        return interaction.reply({ content: "❌ Erreur : département non reconnu.", ephemeral: true });
    }

    const channel = interaction.guild.channels.cache.get(channelID);
    if (!channel) {
        return interaction.reply({ content: "❌ Erreur : le canal du département est introuvable.", ephemeral: true });
    }

    if (pendingRequests.has(member.id)) {
        return interaction.reply({
            content: `⏳ Tu as déjà fait une demande pour **${pendingRequests.get(member.id)}**. Attends la validation du chef.`,
            ephemeral: true
        });
    }

    if (channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) {
        return interaction.reply({ content: "❌ Tu fais déjà partie de ce département.", ephemeral: true });
    }

    const chefRoleID = departmentRoles[`Chef ${department}`];
    if (!chefRoleID) {
        return interaction.reply({ content: "❌ Erreur : Aucun chef défini pour ce département.", ephemeral: true });
    }

    const botMember = interaction.guild.members.me;
    if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({ content: "❌ Je n'ai pas la permission d'envoyer des messages dans ce salon.", ephemeral: true });
    }

    const message = await channel.send(
        `<@&${chefRoleID}>, ${member} a choisi **${department}**. Veuillez confirmer avec ✅ ou refuser avec ❌.`
    );

    await message.react("✅");
    await message.react("❌");

    pendingRequests.set(member.id, department);

    interaction.reply({ content: `✅ Tu as choisi **${department}**. En attente de validation du chef.`, ephemeral: true });
});

// Événement pour gérer la validation du chef
client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.partial) await reaction.fetch();
    if (!reaction.message.guild) return;

    const { message } = reaction;
    const member = message.mentions.members.first();
    if (!member) return;

    const departmentMatch = message.content.match(/\*\*(.*?)\*\*/);
    if (!departmentMatch) return;

    const department = departmentMatch[1];
    const roleID = departmentRoles[department];
    if (!roleID) return;

    const chefRoleID = departmentRoles[`Chef ${department}`];
    const chef = message.guild.members.cache.get(user.id);

    if (!chef || !chef.roles.cache.has(chefRoleID)) return;

    if (reaction.emoji.name === "✅") {
        await member.roles.add(roleID);
        await message.reply(`✅ **${member.displayName}** a été accepté dans **${department}**.`);
        pendingRequests.delete(member.id);
    } else if (reaction.emoji.name === "❌") {
        await message.reply(`❌ **${member.displayName}** a été refusé dans **${department}**.`);
        pendingRequests.delete(member.id);
    }
});

// Démarrer le bot
client.login(process.env.TOKEN);
