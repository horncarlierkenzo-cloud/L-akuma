const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// Serveur web pour que Render garde le bot allumé
const app = express();
app.get('/', (req, res) => res.send('Bot en ligne'));
app.listen(process.env.PORT || 3000, () => {
  console.log('Serveur web démarré');
});

// Connexion à Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('error', console.error);

client.login(process.env.DISCORD_TOKEN);
