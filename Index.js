require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const mysql = require('mysql2/promise');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Cek statistik akun UCP')
    .addStringOption(opt => opt.setName('username').setDescription('Nama karakter SA-MP').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Slash command terdaftar.');
  } catch (err) {
    console.error('Gagal daftar command:', err);
  }
})();

client.once('ready', () => {
  console.log(`Bot online sebagai ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {
    const username = interaction.options.getString('username');
    try {
      const conn = await mysql.createConnection(dbConfig);
      const [rows] = await conn.execute(
        'SELECT Money, Level, AdminLevel FROM players WHERE Username = ?',
        [username]
      );
      await conn.end();

      if (rows.length === 0) {
        return interaction.reply(`Akun **${username}** tidak ditemukan.`);
      }

      const p = rows[0];
      interaction.reply(`**Stats ${username}**\nUang: $${p.Money}\nLevel: ${p.Level}\nAdmin: ${p.AdminLevel}`);
    } catch (err) {
      console.error(err);
      interaction.reply('Terjadi error saat mengambil data.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
