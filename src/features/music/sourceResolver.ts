import play from "play-dl";

import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import type { Track } from "./types.js";

let tokenSetupPromise: Promise<void> | null = null;

function normalizePlayDlError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Got 429")) {
    return new Error("YOUTUBE_RATE_LIMITED");
  }

  if (message.includes("Captcha page")) {
    return new Error("YOUTUBE_BOT_PROTECTION");
  }

  return error instanceof Error ? error : new Error(message);
}

async function ensurePlayDlConfigured() {
  if (tokenSetupPromise) {
    return tokenSetupPromise;
  }

  tokenSetupPromise = (async () => {
    const options: {
      youtube?: { cookie: string };
      useragent?: string[];
    } = {};

    if (config.youtubeCookie) {
      options.youtube = { cookie: config.youtubeCookie };
    }

    if (config.youtubeUserAgent) {
      options.useragent = [config.youtubeUserAgent];
    }

    if (options.youtube || options.useragent) {
      logger.info("Configuring play-dl token options", {
        hasYoutubeCookie: Boolean(options.youtube),
        hasYoutubeUserAgent: Boolean(options.useragent?.length),
      });
      await play.setToken(options);
    }
  })();

  return tokenSetupPromise;
}

function toDurationSec(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeVideoTrack(
  video: {
    title?: string;
    url?: string;
    durationInSec?: string | number;
    channel?: { name?: string };
  },
  requestedBy: string,
  sourceType: Track["sourceType"],
): Track {
  return {
    title: video.title || "Unknown title",
    artist: video.channel?.name || null,
    url: video.url || "",
    durationSec: toDurationSec(video.durationInSec),
    requestedBy,
    sourceType,
  };
}

export async function resolveTracks(input: string, requestedBy: string): Promise<Track[]> {
  await ensurePlayDlConfigured();
  const source = input.trim();

  if (!source) {
    throw new Error("EMPTY_QUERY");
  }

  const ytType = play.yt_validate(source);

  logger.info("Resolving tracks", {
    requestedBy,
    input: source,
    ytType,
  });

  if (ytType === "video") {
    const video = await play.video_info(source).catch((error) => {
      const normalized = normalizePlayDlError(error);
      logger.warn("YouTube video_info failed", {
        requestedBy,
        input: source,
        ytType,
        error: normalized.message,
      });
      throw normalized;
    });
    logger.info("YouTube video resolved", {
      requestedBy,
      input: source,
      title: video.video_details.title,
      url: video.video_details.url,
    });
    return [normalizeVideoTrack(video.video_details, requestedBy, "youtube")];
  }

  if (ytType === "playlist") {
    const playlist = await play.playlist_info(source, { incomplete: true }).catch((error) => {
      const normalized = normalizePlayDlError(error);
      logger.warn("YouTube playlist_info failed", {
        requestedBy,
        input: source,
        ytType,
        error: normalized.message,
      });
      throw normalized;
    });
    const videos = await playlist.all_videos().catch((error) => {
      const normalized = normalizePlayDlError(error);
      logger.warn("YouTube playlist all_videos failed", {
        requestedBy,
        input: source,
        ytType,
        playlistTitle: playlist.title,
        error: normalized.message,
      });
      throw normalized;
    });

    logger.info("YouTube playlist resolved", {
      requestedBy,
      input: source,
      playlistTitle: playlist.title,
      videoCount: videos.length,
    });

    return videos
      .filter((video) => Boolean(video.url))
      .map((video) =>
        normalizeVideoTrack(
          {
            title: video.title,
            url: video.url,
            durationInSec: video.durationInSec,
            channel: { name: video.channel?.name },
          },
          requestedBy,
          "youtube",
        ),
      );
  }

  const results = await play
    .search(source, {
      limit: 1,
      source: { youtube: "video" },
    })
    .catch((error) => {
      const normalized = normalizePlayDlError(error);
      logger.warn("YouTube search failed", {
        requestedBy,
        input: source,
        ytType,
        error: normalized.message,
      });
      throw normalized;
    });

  const first = results[0];

  if (!first?.url) {
    logger.warn("Search returned no playable result", {
      requestedBy,
      input: source,
      ytType,
      resultCount: results.length,
    });
    throw new Error("TRACK_NOT_FOUND");
  }

  logger.info("Search resolved track", {
    requestedBy,
    input: source,
    ytType,
    title: first.title,
    url: first.url,
    channelName: first.channel?.name,
  });

  return [
    normalizeVideoTrack(
      {
        title: first.title,
        url: first.url,
        durationInSec: first.durationInSec,
        channel: { name: first.channel?.name },
      },
      requestedBy,
      "search",
    ),
  ];
}

export async function createTrackStream(track: Track) {
  await ensurePlayDlConfigured();

  logger.info("Creating track stream", {
    title: track.title,
    url: track.url,
    sourceType: track.sourceType,
    requestedBy: track.requestedBy,
  });

  return play
    .stream(track.url, {
      discordPlayerCompatibility: true,
    })
    .catch((error) => {
      const normalized = normalizePlayDlError(error);
      logger.warn("Track stream creation failed", {
        title: track.title,
        url: track.url,
        sourceType: track.sourceType,
        requestedBy: track.requestedBy,
        error: normalized.message,
      });
      throw normalized;
    });
}
