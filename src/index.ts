import { Client, GatewayIntentBits, Message } from "discord.js";

import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { MusicService } from "./features/music/musicService.js";
import { createCommandMap } from "./lib/commandRegistry.js";
import { logger } from "./lib/logger.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const music = new MusicService(client);
const commandMap = createCommandMap(commands);

async function onMessageCreate(message: Message) {
  if (!message.inGuild() || message.author.bot) {
    return;
  }

  if (!message.content.startsWith(config.prefix)) {
    return;
  }

  const input = message.content.slice(config.prefix.length).trim();
  if (!input) {
    return;
  }

  const [commandName, ...args] = input.split(/\s+/);
  const command = commandMap.get(commandName.toLowerCase());

  if (!command) {
    return;
  }

  logger.info("Command received", {
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    commandName: command.name,
  });

  try {
    await command.execute({
      message,
      args,
      music,
    });
  } catch (error) {
    logger.error("Unhandled command error", {
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      commandName: command.name,
      error: error instanceof Error ? error.message : String(error),
    });
    await message.reply("コマンド処理中にエラーが発生しました。");
  }
}

client.once("ready", () => {
  logger.info("musicBot is ready", {
    userTag: client.user?.tag,
    prefix: config.prefix,
  });
});

client.on("messageCreate", (message) => {
  void onMessageCreate(message);
});

void client.login(config.discordToken);
