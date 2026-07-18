const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const crypto = require('crypto');

// simpan sementara kode verifikasi (di memory, hilang kalau bot restart)
const pendingRegister = new Map(); // key: discordId, value: { username, code, expires }

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
}

// command buat nampilin tombol daftar (admin jalankan sekali di channel)
const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Cek statistik akun UCP')
    .addStringOption(opt => opt.setName('username').setDescription('Nama karakter SA-MP').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setup-register')
    .setDescription('Tampilkan tombol pendaftaran UCP (admin only)')
].map(c => c.toJSON());

client.on('interactionCreate', async interaction => {
  // === Slash command setup-register ===
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-register') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('daftar_ucp').setLabel('Daftar UCP').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ content: 'Klik tombol di bawah untuk mendaftarkan akun UCP kamu:', components: [row] });
  }

  // === Klik tombol "Daftar UCP" -> buka modal isi username ===
  if (interaction.isButton() && interaction.customId === 'daftar_ucp') {
    const modal = new ModalBuilder().setCustomId('modal_daftar_username').setTitle('Daftar Akun UCP');
    const usernameInput = new TextInputBuilder()
      .setCustomId('input_username')
      .setLabel('Nama karakter UCP yang diinginkan')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
    return interaction.showModal(modal);
  }

  // === Submit modal username -> cek DB, generate kode, DM kode ===
  if (interaction.isModalSubmit() && interaction.customId === 'modal_daftar_username') {
    const username = interaction.fields.getTextInputValue('input_username').trim();
    await interaction.deferReply({ ephemeral: true });

    try {
      const conn = await mysql.createConnection(dbConfig);
      const [rows] = await conn.execute('SELECT Username FROM players WHERE Username = ?', [username]);
      await conn.end();

      if (rows.length > 0) {
        return interaction.editReply('Username itu sudah terdaftar. Coba nama lain.');
      }

      const code = generateCode();
      pendingRegister.set(interaction.user.id, { username, code, expires: Date.now() + 10 * 60 * 1000 });

      await interaction.user.send(
        `Kode verifikasi kamu: **${code}**\nUsername yang didaftarkan: **${username}**\n\nKetik command \`/verify\` di server untuk memasukkan kode ini dan password yang mau kamu pakai di game.`
      );

      interaction.editReply('Kode verifikasi sudah dikirim lewat DM. Cek pesan pribadi kamu.');
    } catch (err) {
      console.error(err);
      interaction.editReply('Terjadi error, coba lagi nanti.');
    }
  }
});

// === Command /verify: masukkan kode + password ===
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
    const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('Verifikasi Akun UCP');
    const codeInput = new TextInputBuilder().setCustomId('input_code').setLabel('Kode verifikasi').setStyle(TextInputStyle.Short).setRequired(true);
    const passInput = new TextInputBuilder().setCustomId('input_password').setLabel('Password untuk di game').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(
      new ActionRowBuilder().addComponents(codeInput),
      new ActionRowBuilder().addComponents(passInput)
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_verify') {
    const inputCode = interaction.fields.getTextInputValue('input_code').trim();
    const password = interaction.fields.getTextInputValue('input_password').trim();
    await interaction.deferReply({ ephemeral: true });

    const pending = pendingRegister.get(interaction.user.id);
    if (!pending) {
      return interaction.editReply('Tidak ada pendaftaran yang tertunda. Klik tombol "Daftar UCP" dulu.');
    }
    if (Date.now() > pending.expires) {
      pendingRegister.delete(interaction.user.id);
      return interaction.editReply('Kode sudah kedaluwarsa. Silakan daftar ulang.');
    }
    if (inputCode !== pending.code) {
      return interaction.editReply('Kode salah. Coba periksa lagi DM kamu.');
    }

    try {
      const conn = await mysql.createConnection(dbConfig);
      await conn.execute(
        'INSERT INTO players (Username, Password, DiscordID) VALUES (?, ?, ?)',
        [pending.username, md5(password), interaction.user.id]
      );
      await conn.end();

      pendingRegister.delete(interaction.user.id);
      interaction.editReply(`Akun **${pending.username}** berhasil dibuat! Kamu bisa langsung login di game dengan password yang tadi diisi.`);
    } catch (err) {
      console.error(err);
      interaction.editReply('Gagal membuat akun. Kemungkinan format tabel tidak sesuai — cek dengan admin bot.');
    }
  }
});
