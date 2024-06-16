const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { token, supportRoleId, logsChannelId, embedSettings, clientId, guildId } = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ]
});

client.once('ready', () => {
    console.log('Bot is ready!');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.commandName === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('Ticket Support')
                .setDescription('Select an option below to open a support ticket.')
                .setColor(embedSettings.color)
                .setFooter({ text: embedSettings.footer });

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select')
                        .setPlaceholder('Nothing selected')
                        .addOptions([
                            {
                                label: 'Purchase',
                                description: 'Press this if you are looking to purchase',
                                value: 'purchase'
                            },
                            {
                                label: 'Support',
                                description: 'Press this if you need support',
                                value: 'support'
                            }
                        ])
                );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select') {
            const selectedValue = interaction.values[0];
            const channelName = `ticket-${interaction.user.username}`;

            let ticketsCategory = interaction.guild.channels.cache.find(c => c.name === 'tickets' && c.type === ChannelType.GuildCategory);
            if (!ticketsCategory) {
                ticketsCategory = await interaction.guild.channels.create({
                    name: 'tickets',
                    type: ChannelType.GuildCategory
                });
            }

            const channel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: ticketsCategory.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: supportRoleId,
                        allow: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            });

            const welcomeEmbed = new EmbedBuilder()
                .setColor(embedSettings.color)
                .setTitle('Ticket Created')
                .setDescription(`Welcome ${interaction.user}, the support team will be with you shortly.`)
                .addFields(
                    { name: 'Opened By', value: interaction.user.toString() },
                    { name: 'Type', value: selectedValue },
                    { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                )
                .setFooter({ text: embedSettings.footer });

            const closeButton = new ButtonBuilder()
                .setCustomId('closeTicket')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger);

            const claimButton = new ButtonBuilder()
                .setCustomId('claimTicket')
                .setLabel('Claim Ticket')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder()
                .addComponents(closeButton, claimButton);

            await channel.send({ embeds: [welcomeEmbed], components: [row] });
            const creationEmbed = new EmbedBuilder()
                .setColor(embedSettings.color)
                .setTitle('Ticket Creation')
                .setDescription(`Your ticket has been created! You can access it here: <#${channel.id}>`)
                .setFooter({ text: embedSettings.footer });

            await interaction.reply({ embeds: [creationEmbed], ephemeral: true });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'closeTicket') {
            const channel = interaction.channel;
            const closeTimestamp = Math.floor((Date.now() + 10000) / 1000);
            const startTimestamp = Math.floor(channel.createdTimestamp / 1000);

            const closeEmbed = new EmbedBuilder()
                .setColor(embedSettings.color)
                .setTitle('Ticket Closing')
                .setDescription(`This ticket will close <t:${closeTimestamp}:R>`)
                .setFooter({ text: embedSettings.footer });

            await interaction.reply({ embeds: [closeEmbed] });

            setTimeout(async () => {
                const messages = await channel.messages.fetch();
                const messageContent = messages.map(m => `${m.author.tag}: ${m.content}`).join('\n');

                const logEmbed = new EmbedBuilder()
                    .setColor(embedSettings.color)
                    .setTitle('Ticket Closed')
                    .addFields([
                        { name: 'Opened By', value: interaction.user.tag },
                        { name: 'Closed By', value: interaction.user.tag },
                        { name: 'Opened At', value: `<t:${startTimestamp}:F>` },
                        { name: 'Closed At', value: `<t:${closeTimestamp}:F>` }
                    ])
                    .setFooter({ text: embedSettings.footer });

                const dmChannel = await interaction.user.createDM();
                try {
                    await dmChannel.send({ embeds: [logEmbed], files: [{ attachment: Buffer.from(messageContent), name: `${interaction.user.username}-ticket-log.txt` }] });
                } catch (error) {
                    console.error("Failed to send DM:", error);
                    const logsChannel = await client.channels.fetch(logsChannelId);
                    await logsChannel.send(`Failed to send a DM to ${interaction.user.tag}. They might have DMs disabled or have blocked the bot.`);
                }

                const logsChannel = await client.channels.fetch(logsChannelId);
                await logsChannel.send({ embeds: [logEmbed], files: [{ attachment: Buffer.from(messageContent), name: `${interaction.user.username}-ticket-log.txt` }] });

                await channel.delete();
            }, 10000);
        } else if (interaction.customId === 'claimTicket') {
            await interaction.deferUpdate();

            const claimedEmbed = new EmbedBuilder()
                .setColor(embedSettings.color)
                .setDescription(`Ticket claimed by: ${interaction.user}`)
                .setFooter({ text: embedSettings.footer });

            await interaction.channel.send({ embeds: [claimedEmbed] });
        }
    }
});

client.login(token);

const commands = [
    {
        name: 'panel',
        description: 'Display the ticket panel'
    }
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();