import type { AudioPlayer, VoiceConnection } from "@discordjs/voice";

export type SourceType = "youtube" | "search";

export interface Track {
  title: string;
  artist: string | null;
  url: string;
  durationSec: number;
  requestedBy: string;
  sourceType: SourceType;
}

export interface GuildSession {
  guildId: string;
  textChannelId: string | null;
  voiceChannelId: string | null;
  connection: VoiceConnection | null;
  player: AudioPlayer;
  queue: Track[];
  currentTrack: Track | null;
  isPaused: boolean;
  streamCleanup: (() => void) | null;
}
