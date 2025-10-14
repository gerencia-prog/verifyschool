import { Client, GatewayIntentBits, Routes, REST } from "discord.js";
import express from "express";

// ====== Servidor Web (mantém o bot ativo) ======
const app = express();
app.get("/", (req, res) => res.send("✅ Bot ativo e rodando."));
app.listen(3000, () => console.log("🌐 Servidor web rodando na porta 3000"));

// ====== Configurações do Discord ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const SECURITY_TOKEN = process.env.SECURITY_TOKEN;

// ====== Registro do comando /verificar ======
const commands = [
  {
    name: "verificar",
    description: "Verifique seu e-mail para liberar o cargo de Aluno",
    options: [
      {
        name: "email",
        description: "Digite o e-mail que você usou no cadastro",
        type: 3, // string
        required: true,
      },
    ],
  },
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
    console.error("❌ Erro ao registrar o comando:", err);
  }
})();

// ====== Função de verificação via Apps Script ======
async function verificarEmail(email, claimerId) {
  try {
    const url = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email)}&token=${SECURITY_TOKEN}&consume=1&claimer=${encodeURIComponent(
      claimerId
    )}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Erro ao consultar o Apps Script");

    const data = await res.json();

    return {
      ok: data.autorizado === true,
      reason: data.reason || "erro",
    };
  } catch (err) {
    console.error("❌ Erro verificarEmail:", err);
    return { ok: false, reason: "erro" };
  }
}

// ====== Eventos do bot ======
client.on("ready", () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "verificar") return;

  const email = interaction.options.getString("email");
  await interaction.deferReply({ ephemeral: true });

  const result = await verificarEmail(email, interaction.user.id);

  // Respostas conforme o motivo
  if (result.ok) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(ROLE_ID);
      await interaction.editReply(
        "✅ E-mail confirmado! Cargo **Aluno** atribuído com sucesso."
      );
    } catch (err) {
      console.error("Erro ao adicionar cargo:", err);
      await interaction.editReply(
        "⚠️ E-mail verificado, mas houve um erro ao atribuir o cargo. Contate o suporte."
      );
    }
  } else {
    switch (result.reason) {
      case "ja_usado":
        await interaction.editReply(
          "❌ Este e-mail **já foi utilizado anteriormente**. Se acredita que é um erro, contate o suporte."
        );
        break;

      case "status_nao_ok":
        await interaction.editReply(
          "⚠️ Seu e-mail foi encontrado, mas não está autorizado (status diferente de OK)."
        );
        break;

      case "not_found":
        await interaction.editReply(
          "❌ Este e-mail **não foi encontrado** na lista de alunos. Verifique se digitou corretamente."
        );
        break;

      default:
        await interaction.editReply(
          "❌ Ocorreu um erro durante a verificação. Tente novamente mais tarde."
        );
    }
  }
});

client.login(TOKEN);
