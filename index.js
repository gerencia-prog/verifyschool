import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  Events,
} from "discord.js";
import express from "express";

// ====== Servidor web (para manter o bot ativo) ======
const app = express();
app.get("/", (req, res) => res.send("✅ Bot ativo e rodando."));
app.listen(3000, () => console.log("🌐 Servidor web rodando na porta 3000"));

// ====== Configurações ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const SECURITY_TOKEN = process.env.SECURITY_TOKEN;

// ====== Função para verificar o e-mail via Apps Script ======
async function verificarEmail(email, claimerId) {
  try {
    const url = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email)}&token=${SECURITY_TOKEN}&consume=1&claimer=${encodeURIComponent(
      claimerId
    )}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}: ${text}`);
    const data = JSON.parse(text);
    return { ok: data.autorizado === true, reason: data.reason || "erro" };
  } catch (err) {
    console.error("❌ Erro verificarEmail:", err);
    return { ok: false, reason: "erro" };
  }
}

// ====== Evento quando o bot inicia ======
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logado como ${client.user.tag}`);
});

// ====== BOTÃO E MODAL ======
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ==== Clique no botão ====
    if (interaction.isButton() && interaction.customId === "abrir_modal_email") {
      const modal = new ModalBuilder()
        .setCustomId("modal_verificar_email")
        .setTitle("Verificação de Aluno");

      const inputEmail = new TextInputBuilder()
        .setCustomId("campo_email")
        .setLabel("Digite seu e-mail cadastrado:")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("exemplo@email.com");

      const row = new ActionRowBuilder().addComponents(inputEmail);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    // ==== Submissão do modal ====
    if (interaction.isModalSubmit() && interaction.customId === "modal_verificar_email") {
      const email = interaction.fields.getTextInputValue("campo_email");
      await interaction.deferReply({ ephemeral: true });

      const result = await verificarEmail(email, interaction.user.id);

      if (result.ok) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(ROLE_ID);
        await interaction.editReply(
          "✅ E-mail confirmado! Cargo **Aluno** atribuído com sucesso."
        );
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
    }
  } catch (err) {
    console.error("❌ Erro no InteractionCreate:", err);
  }
});

// ====== Comando opcional para criar a mensagem com o botão ======
client.on(Events.MessageCreate, async (message) => {
  if (!message.content.startsWith("!setupbotao")) return;
  if (!message.member.permissions.has("Administrator")) return;

  const botao = new ButtonBuilder()
    .setCustomId("abrir_modal_email")
    .setLabel("📧 Verificar E-mail")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(botao);

  await message.channel.send({
    content: "**Clique no botão abaixo para verificar seu e-mail:**",
    components: [row],
  });

  await message.reply("✅ Mensagem de verificação criada!");
});

client.login(TOKEN);
