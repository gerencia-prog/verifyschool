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
  Events,
  REST,
  Routes,
  PermissionsBitField,
} from "discord.js";
import express from "express";

console.log("🚀 INICIANDO SCRIPT...");

// ====== Servidor Web ======
const app = express();
app.get("/", (req, res) => res.send("✅ Bot ativo e rodando."));
app.listen(3000, () => console.log("🌐 Passo 1: Servidor web rodando na porta 3000"));

// ====== Variáveis de ambiente (Com TRIM para limpar espaços fantasmas) ======
const TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();
const ROLE_ID = (process.env.ROLE_ID || "").trim();
const APPS_SCRIPT_URL = (process.env.GOOGLE_APPS_SCRIPT_URL || "").trim();
const SECURITY_TOKEN = (process.env.SECURITY_TOKEN || "").trim();

console.log(`🔍 Passo 2: Variáveis limpas. Tamanho do Token: ${TOKEN.length} caracteres.`);

// ====== Tratamento de erros globais ======
process.on("unhandledRejection", (err) => console.error("🚨 Erro não tratado (Rejection):", err));
process.on("uncaughtException", (err) => console.error("🚨 Erro não tratado (Exception):", err));

// ====== Inicialização do bot ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ====== Comando /verificar ======
const commands = [
  {
    name: "verificar",
    description: "Verifique seu e-mail para liberar o cargo de Aluno",
    options: [
      {
        name: "email",
        description: "Digite o e-mail cadastrado",
        type: 3,
        required: true,
      },
    ],
  },
];

// ====== Quando o bot estiver online ======
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Passo 4: SUCESSO! Logado como ${client.user.tag}`);
  
  // Registra os comandos SOMENTE após conectar com sucesso
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    console.log("⏳ Passo 5: Registrando comando /verificar...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Passo 6: Comando /verificar registrado!");
  } catch (err) {
    console.error("❌ Erro ao registrar comandos:", err);
  }
});

// ====== Função de verificação via Google Apps Script ======
async function verificarEmail(email, claimerId) {
  try {
    const url = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email)}&token=${SECURITY_TOKEN}&consume=1&claimer=${encodeURIComponent(claimerId)}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(text);
    return { ok: data.autorizado === true, reason: data.reason || "erro" };
  } catch (err) {
    console.error("❌ Erro verificarEmail:", err);
    return { ok: false, reason: "erro" };
  }
}

// ====== Manipular interações ======
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "verificar") {
      const email = interaction.options.getString("email");
      await interaction.deferReply({ ephemeral: true });
      const result = await verificarEmail(email, interaction.user.id);
      await responderVerificacao(interaction, result);
      return;
    }

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

    if (interaction.isModalSubmit() && interaction.customId === "modal_verificar_email") {
      const email = interaction.fields.getTextInputValue("campo_email");
      await interaction.deferReply({ ephemeral: true });
      const result = await verificarEmail(email, interaction.user.id);
      await responderVerificacao(interaction, result);
      return;
    }
  } catch (err) {
    console.error("❌ Erro em InteractionCreate:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Ocorreu um erro inesperado.", ephemeral: true }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.editReply({ content: "❌ Ocorreu um erro inesperado." }).catch(() => {});
    }
  }
});

// ====== Resposta da verificação ======
async function responderVerificacao(interaction, result) {
  try {
    if (result.ok) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(ROLE_ID);
      await interaction.editReply("✅ E-mail confirmado! Cargo **Aluno** atribuído com sucesso.");
    } else {
      const mensagensErro = {
        "ja_usado": "❌ Este e-mail **já foi utilizado anteriormente**.",
        "status_nao_ok": "⚠️ Seu e-mail foi encontrado, mas não está autorizado.",
        "not_found": "❌ Este e-mail **não foi encontrado** na lista de alunos.",
        "erro": "❌ Ocorreu um erro na comunicação."
      };
      await interaction.editReply(mensagensErro[result.reason] || "❌ Erro desconhecido.");
    }
  } catch (err) {
    console.error("Erro ao adicionar cargo ou responder:", err);
    await interaction.editReply("⚠️ Erro ao processar a solicitação (talvez falta de permissão do bot).").catch(() => {});
  }
}

// ====== Comando !setupbotao ======
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || message.content.trim() !== "!setupbotao") return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await message.reply("❌ Apenas administradores podem usar este comando.");
      return;
    }
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
  } catch (err) {
    console.error("❌ Erro no !setupbotao:", err);
  }
});

// ====== Login ======
console.log("⏳ Passo 3: Tentando conectar ao Discord...");
client.login(TOKEN)
  .then(() => console.log("✅ Passo 3.1: Sinal de login aceito!"))
  .catch(err => console.error("🚨 ERRO FATAL NO LOGIN:", err));
