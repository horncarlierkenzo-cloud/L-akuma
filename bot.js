const { Client, GatewayIntentBits } = require('discord.js');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant : le bot ne se connecte pas.');
  return;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('error', console.error);

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Connexion Discord impossible :', err.message);
});
