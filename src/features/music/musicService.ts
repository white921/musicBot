import {
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { Client, GuildMember } from "discord.js";

import { logger } from "../../lib/logger.js";
import { createTrackStream, resolveTracks } from "./sourceResolver.js";
import { createSession, destroySession, getOrCreateSession, getSession } from "./sessionStore.js";
import type { GuildSession, Track } from "./types.js";

function formatDuration(durationSec: number): string {
  if (durationSec <= 0) {
    return "LIVE/Unknown";
  }

  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = durationSec % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function mentionUser(userId: string) {
  return `<@${userId}>`;
}

interface PlayResult {
  tracks: Track[];
  startedNow: boolean;
}

export class MusicService {
  private readonly playNextLocks = new Set<string>();

  constructor(private readonly client: Client) {}

  setupSession(guildId: string) {
    const existing = getSession(guildId);
    if (existing) {
      return existing;
    }

    const session = createSession(guildId);

    session.player.on(AudioPlayerStatus.Idle, () => {
      session.currentTrack = null;
      session.isPaused = false;

      void this.playNext(guildId);
    });

    session.player.on("error", (error) => {
      logger.error("Audio player error", {
        guildId,
        message: error.message,
      });
      session.currentTrack = null;
      void this.safeSend(session.textChannelId, "再生中にエラーが発生しました。次の曲へ進みます。");
      void this.playNext(guildId);
    });

    return session;
  }

  private async safeSend(channelId: string | null, content: string) {
    if (!channelId) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (channel?.isSendable()) {
        await channel.send(content);
      }
    } catch (error) {
      logger.warn("Failed to send channel message", {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private ensureVoiceMember(member: GuildMember | null) {
    if (!member?.voice.channel) {
      throw new Error("VOICE_CHANNEL_REQUIRED");
    }

    return member.voice.channel;
  }

  private async connectToMemberVoice(member: GuildMember, textChannelId: string) {
    const voiceChannel = this.ensureVoiceMember(member);
    const session = this.setupSession(member.guild.id);

    if (session.connection && session.voiceChannelId && session.voiceChannelId !== voiceChannel.id) {
      throw new Error("VOICE_CHANNEL_IN_USE");
    }

    if (session.connection && session.voiceChannelId === voiceChannel.id) {
      session.textChannelId = textChannelId;
      return session;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

    session.connection = connection;
    session.voiceChannelId = voiceChannel.id;
    session.textChannelId = textChannelId;
    session.connection.subscribe(session.player);

    return session;
  }

  async join(member: GuildMember, textChannelId: string) {
    await this.connectToMemberVoice(member, textChannelId);
  }

  async play(input: string, member: GuildMember, textChannelId: string): Promise<PlayResult> {
    const startedAt = performance.now();
    const session = await this.connectToMemberVoice(member, textChannelId);
    const afterConnect = performance.now();
    const tracks = await resolveTracks(input, member.user.id);
    const afterResolve = performance.now();
    const startedNow = !session.currentTrack && session.player.state.status !== AudioPlayerStatus.Playing;

    session.textChannelId = textChannelId;
    session.queue.push(...tracks);

    logger.info("Resolved track(s)", {
      guildId: member.guild.id,
      userId: member.user.id,
      query: input,
      count: tracks.length,
      connectMs: Math.round(afterConnect - startedAt),
      resolveMs: Math.round(afterResolve - afterConnect),
    });

    if (startedNow) {
      await this.playNext(member.guild.id);
    }

    return { tracks, startedNow };
  }

  private async playNext(guildId: string): Promise<boolean> {
    if (this.playNextLocks.has(guildId)) {
      return false;
    }

    this.playNextLocks.add(guildId);

    try {
      const session = getSession(guildId);

      if (!session?.connection) {
        return false;
      }

      const nextTrack = session.queue.shift();

      if (!nextTrack) {
        session.currentTrack = null;
        session.isPaused = false;
        return false;
      }

      const streamStart = performance.now();
      const stream = await createTrackStream(nextTrack);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        metadata: nextTrack,
      });

      session.currentTrack = nextTrack;
      session.player.play(resource);

      logger.info("Playback started", {
        guildId,
        title: nextTrack.title,
        url: nextTrack.url,
        streamMs: Math.round(performance.now() - streamStart),
      });

      await this.safeSend(
        session.textChannelId,
        `▶️ 再生開始: **${nextTrack.title}** (${formatDuration(nextTrack.durationSec)})`,
      );

      return true;
    } catch (error) {
      logger.error("Failed to play next track", {
        guildId,
        error: error instanceof Error ? error.message : String(error),
      });

      const session = getSession(guildId);
      if (session) {
        session.currentTrack = null;
        await this.safeSend(session.textChannelId, "次の曲の再生に失敗しました。次へ進みます。");
        return this.playNext(guildId);
      }

      return false;
    } finally {
      this.playNextLocks.delete(guildId);
    }
  }

  getQueue(guildId: string) {
    return getSession(guildId);
  }

  pause(guildId: string): boolean {
    const session = getSession(guildId);

    if (!session?.currentTrack) {
      return false;
    }

    return session.player.pause();
  }

  resume(guildId: string): boolean {
    const session = getSession(guildId);

    if (!session?.currentTrack) {
      return false;
    }

    return session.player.unpause();
  }

  skip(guildId: string): boolean {
    const session = getSession(guildId);

    if (!session?.currentTrack) {
      return false;
    }

    return session.player.stop();
  }

  stop(guildId: string): boolean {
    const session = getSession(guildId);

    if (!session) {
      return false;
    }

    session.queue = [];
    session.currentTrack = null;
    session.isPaused = false;
    destroySession(guildId);

    return true;
  }

  leave(guildId: string): boolean {
    return this.stop(guildId);
  }

  formatNowPlaying(guildId: string): string | null {
    const session = getSession(guildId);
    const track = session?.currentTrack;

    if (!track) {
      return null;
    }

    const state = session?.isPaused ? "一時停止中" : "再生中";

    return [
      `**${track.title}**`,
      `状態: ${state}`,
      `長さ: ${formatDuration(track.durationSec)}`,
      `URL: ${track.url}`,
      `追加者: ${mentionUser(track.requestedBy)}`,
    ].join("\n");
  }

  formatQueue(guildId: string): string | null {
    const session = getSession(guildId);

    if (!session) {
      return null;
    }

    const lines: string[] = [];

    if (session.currentTrack) {
      lines.push(
        `再生中: **${session.currentTrack.title}** (${formatDuration(session.currentTrack.durationSec)})`,
      );
    } else {
      lines.push("再生中: なし");
    }

    if (session.queue.length === 0) {
      lines.push("キュー: 空です");
      return lines.join("\n");
    }

    lines.push(`キュー件数: ${session.queue.length}`);

    for (const [index, track] of session.queue.slice(0, 10).entries()) {
      lines.push(`${index + 1}. ${track.title} (${formatDuration(track.durationSec)})`);
    }

    return lines.join("\n");
  }
}
