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

// ====== Servidor Web (mantém o bot ativo no Render) ======
const app = express();
app.get("/", (req, res) => res.send("✅ Bot ativo e rodando."));
app.listen(3000, () => console.log("🌐 Servidor web rodando na porta 3000"));

// ====== Variáveis de ambiente ======
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const SECURITY_TOKEN = process.env.SECURITY_TOKEN;
console.log("🔍 DIAGNÓSTICO DE VARIÁVEIS:");
console.log("- TOKEN existe?", !!TOKEN);
console.log("- CLIENT_ID existe?", !!CLIENT_ID);
console.log("- GUILD_ID existe?", !!GUILD_ID);

// ====== Tratamento de erros globais ======
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ====== Inicialização do bot ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // <- NECESSÁRIO pro !setupbotao
  ],
  partials: [Partials.Channel],
});

// ====== Registrar o comando /verificar ======
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

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Comando /verificar registrado!");
  } catch (err) {
    console.error("❌ Erro ao registrar comandos:", err);
  }
})();

// ====== Função de verificação via Google Apps Script ======
async function verificarEmail(email, claimerId) {
  try {
    const url = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(
      email
    )}&token=${SECURITY_TOKEN}&consume=1&claimer=${encodeURIComponent(
      claimerId
    )}`;
    console.log("🔗 Consultando:", url);

    const res = await fetch(url);
    const text = await res.text();
    console.log("📡 Status:", res.status);
    console.log("📨 Resposta:", text);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = JSON.parse(text);
    return { ok: data.autorizado === true, reason: data.reason || "erro" };
  } catch (err) {
    console.error("❌ Erro verificarEmail:", err);
    return { ok: false, reason: "erro" };
  }
}

// ====== Quando o bot estiver online ======
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logado como ${client.user.tag}`);
});

// ====== Manipular interações (Slash, Botão, Modal) ======
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ---------- SLASH COMMAND ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "verificar") {
      const email = interaction.options.getString("email");
      await interaction.deferReply({ ephemeral: true });

      const result = await verificarEmail(email, interaction.user.id);
      await responderVerificacao(interaction, result);
      return;
    }

    // ---------- CLIQUE NO BOTÃO ----------
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

    // ---------- ENVIO DO MODAL ----------
    if (interaction.isModalSubmit() && interaction.customId === "modal_verificar_email") {
      const email = interaction.fields.getTextInputValue("campo_email");
      await interaction.deferReply({ ephemeral: true });

      const result = await verificarEmail(email, interaction.user.id);
      await responderVerificacao(interaction, result);
      return;
    }
  } catch (err) {
    console.error("❌ Erro em InteractionCreate:", err);
    if (!interaction.replied)
      await interaction.reply({
        content: "❌ Ocorreu um erro inesperado.",
        ephemeral: true,
      });
  }
});

// ====== Resposta da verificação ======
async function responderVerificacao(interaction, result) {
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
}

// ====== Comando !setupbotao ======
client.on(Events.MessageCreate, async (message) => {
  try {
    // Ignora mensagens de bots
    if (message.author.bot) return;

    // Comando só funciona com "!setupbotao"
    if (message.content.trim() !== "!setupbotao") return;

    // Verifica se o usuário é admin
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await message.reply("❌ Apenas administradores podem usar este comando.");
      return;
    }

    // Cria botão
    const botao = new ButtonBuilder()
      .setCustomId("abrir_modal_email")
      .setLabel("📧 Verificar E-mail")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(botao);

    // Envia mensagem com o botão
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
client.login(TOKEN).then(() => {
  console.log("✅ Pedido de login enviado ao Discord com sucesso!");
}).catch(err => {
  console.error("🚨 FALHA CRÍTICA NO LOGIN DO DISCORD:", err);
});
