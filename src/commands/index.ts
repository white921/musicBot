import type { CommandDefinition } from "./types.js";
import { logger } from "../lib/logger.js";

function formatAddedMessage(count: number) {
  return count === 1 ? "曲をキューに追加しました。" : `${count} 曲をキューに追加しました。`;
}

export const commands: CommandDefinition[] = [
  {
    name: "play",
    aliases: ["p"],
    description: "URL または検索語で曲を再生します",
    async execute({ message, args, music }) {
      const query = args.join(" ").trim();

      if (!query) {
        await message.reply("使い方: `m!p <url|query>`");
        return;
      }

      if (!message.member) {
        await message.reply("サーバー内のメッセージで使ってください。");
        return;
      }

      await message.channel.sendTyping();

      try {
        logger.info("Play command started", {
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          query,
          argsCount: args.length,
        });

        const result = await music.play(query, message.member, message.channelId);
        const [firstTrack] = result.tracks;

        if (!firstTrack) {
          logger.warn("Play command resolved no tracks", {
            guildId: message.guildId,
            channelId: message.channelId,
            userId: message.author.id,
            query,
          });
          await message.channel.send("曲を見つけられませんでした。");
          return;
        }

        logger.info("Play command resolved successfully", {
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          query,
          startedNow: result.startedNow,
          trackCount: result.tracks.length,
          firstTrackTitle: firstTrack.title,
          firstTrackUrl: firstTrack.url,
          firstTrackSourceType: firstTrack.sourceType,
        });

        if (result.startedNow && result.tracks.length === 1) {
          return;
        }

        await message.channel.send(
          `${formatAddedMessage(result.tracks.length)} 先頭: **${firstTrack.title}**`,
        );
      } catch (error) {
        const code = error instanceof Error ? error.message : String(error);

        logger.warn("Play command failed", {
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          query,
          errorCode: code,
          errorName: error instanceof Error ? error.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined,
        });

        if (code === "VOICE_CHANNEL_REQUIRED") {
          await message.channel.send("先にボイスチャンネルに参加してください。");
          return;
        }

        if (code === "VOICE_CHANNEL_IN_USE") {
          await message.channel.send("Bot は別のボイスチャンネルで使用中です。");
          return;
        }

        if (code === "TRACK_NOT_FOUND" || code === "EMPTY_QUERY") {
          await message.channel.send("曲を見つけられませんでした。URL または検索語を確認してください。");
          return;
        }

        if (code === "YOUTUBE_RATE_LIMITED" || code === "YOUTUBE_BOT_PROTECTION") {
          await message.channel.send(
            "YouTube 側の制限で曲情報を取得できませんでした。少し時間を置くか、Bot に YouTube Cookie を設定して再試行してください。",
          );
          return;
        }

        await message.channel.send("再生に失敗しました。少し時間を置いてもう一度試してください。");
      }
    },
  },
  {
    name: "join",
    aliases: [],
    description: "Bot を VC に参加させます",
    async execute({ message, music }) {
      if (!message.member) {
        await message.reply("サーバー内のメッセージで使ってください。");
        return;
      }

      try {
        await music.join(message.member, message.channelId);
        await message.reply("VC に参加しました。");
      } catch (error) {
        const code = error instanceof Error ? error.message : String(error);
        if (code === "VOICE_CHANNEL_REQUIRED") {
          await message.reply("先にボイスチャンネルに参加してください。");
          return;
        }
        if (code === "VOICE_CHANNEL_IN_USE") {
          await message.reply("Bot は別のボイスチャンネルで使用中です。");
          return;
        }
        await message.reply("VC 参加に失敗しました。");
      }
    },
  },
  {
    name: "leave",
    aliases: [],
    description: "VC から退出し、キューを破棄します",
    async execute({ message, music }) {
      const left = music.leave(message.guildId);
      await message.reply(left ? "再生を終了して VC から退出しました。" : "現在 VC に接続していません。");
    },
  },
  {
    name: "stop",
    aliases: [],
    description: "再生を停止してキューを空にします",
    async execute({ message, music }) {
      const stopped = music.stop(message.guildId);
      await message.reply(stopped ? "再生を停止し、キューをクリアしました。" : "停止する再生はありません。");
    },
  },
  {
    name: "skip",
    aliases: ["s"],
    description: "現在の曲をスキップします",
    async execute({ message, music }) {
      const skipped = music.skip(message.guildId);
      await message.reply(skipped ? "現在の曲をスキップしました。" : "スキップできる曲がありません。");
    },
  },
  {
    name: "pause",
    aliases: [],
    description: "現在の曲を一時停止します",
    async execute({ message, music }) {
      const paused = music.pause(message.guildId);
      await message.reply(paused ? "一時停止しました。" : "一時停止できる曲がありません。");
    },
  },
  {
    name: "resume",
    aliases: [],
    description: "一時停止中の曲を再開します",
    async execute({ message, music }) {
      const resumed = music.resume(message.guildId);
      await message.reply(resumed ? "再開しました。" : "再開できる曲がありません。");
    },
  },
  {
    name: "queue",
    aliases: ["q"],
    description: "キュー一覧を表示します",
    async execute({ message, music }) {
      const queue = music.formatQueue(message.guildId);
      await message.reply(queue ?? "キューは空です。");
    },
  },
  {
    name: "nowplaying",
    aliases: ["np"],
    description: "現在再生中の曲を表示します",
    async execute({ message, music }) {
      const nowPlaying = music.formatNowPlaying(message.guildId);
      await message.reply(nowPlaying ?? "現在再生中の曲はありません。");
    },
  },
  {
    name: "help",
    aliases: [],
    description: "コマンド一覧を表示します",
    async execute({ message }) {
      const lines = commands.map((command) => {
        const aliases = command.aliases.length > 0 ? ` (別名: ${command.aliases.join(", ")})` : "";
        return `- \`m!${command.name}\`${aliases}: ${command.description}`;
      });

      await message.reply(lines.join("\n"));
    },
  },
];
