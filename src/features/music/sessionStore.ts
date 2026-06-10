import { AudioPlayerStatus, NoSubscriberBehavior, createAudioPlayer } from "@discordjs/voice";

import type { GuildSession } from "./types.js";

const sessions = new Map<string, GuildSession>();

export function getSession(guildId: string): GuildSession | undefined {
  return sessions.get(guildId);
}

export function createSession(guildId: string): GuildSession {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  const session: GuildSession = {
    guildId,
    textChannelId: null,
    voiceChannelId: null,
    connection: null,
    player,
    queue: [],
    currentTrack: null,
    isPaused: false,
  };

  player.on(AudioPlayerStatus.Paused, () => {
    session.isPaused = true;
  });

  player.on(AudioPlayerStatus.Playing, () => {
    session.isPaused = false;
  });

  sessions.set(guildId, session);

  return session;
}

export function getOrCreateSession(guildId: string): GuildSession {
  return getSession(guildId) ?? createSession(guildId);
}

export function destroySession(guildId: string) {
  const session = sessions.get(guildId);

  if (!session) {
    return;
  }

  session.player.stop(true);
  session.connection?.destroy();
  sessions.delete(guildId);
}
