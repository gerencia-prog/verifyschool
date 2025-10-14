import { Client, GatewayIntentBits, Routes, REST } from "discord.js";
import express from "express";

const app = express();
app.get("/", (req, res) => res.send("Bot ativo 🚀"));
app.listen(3000, () => console.log("🌐 Servidor web rodando na porta 3000"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const SECURITY_TOKEN = process.env.SECURITY_TOKEN;

const commands = [
  {
    name: "verificar",
    description: "Verifique seu e-mail para liberar o cargo de Aluno",
    options: [
      {
        name: "email",
        description: "Digite seu e-mail cadastrado",
        type: 3,
        required: true
      }
    ]
  }
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Comando /verificar registrado com sucesso!");
  } catch (err) {
    console.error("Erro ao registrar comando:", err);
  }
})();

async function verificarEmail(email) {
  try {
    const url = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email)}&token=${SECURITY_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Erro ao consultar o Apps Script");
    const data = await res.json();
    return data.autorizado === true;
  } catch (err) {
    console.error("Erro verificarEmail:", err);
    return false;
  }
}

client.on("ready", () => {
  console.log(`🤖 Logado como ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "verificar") {
    const email = interaction.options.getString("email");
    await interaction.deferReply({ ephemeral: true });

    const ok = await verificarEmail(email);
    if (ok) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(ROLE_ID);
      await interaction.editReply("✅ E-mail confirmado! Cargo **Aluno** atribuído.");
    } else {
      await interaction.editReply("❌ E-mail não encontrado ou não autorizado.");
    }
  }
});

client.login(TOKEN);
