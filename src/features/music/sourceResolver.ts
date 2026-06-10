import play from "play-dl";

import type { Track } from "./types.js";

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
  const source = input.trim();

  if (!source) {
    throw new Error("EMPTY_QUERY");
  }

  const ytType = play.yt_validate(source);

  if (ytType === "video") {
    const video = await play.video_info(source);
    return [normalizeVideoTrack(video.video_details, requestedBy, "youtube")];
  }

  if (ytType === "playlist") {
    const playlist = await play.playlist_info(source, { incomplete: true });
    const videos = await playlist.all_videos();

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

  const results = await play.search(source, {
    limit: 1,
    source: { youtube: "video" },
  });

  const first = results[0];

  if (!first?.url) {
    throw new Error("TRACK_NOT_FOUND");
  }

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
  return play.stream(track.url, {
    discordPlayerCompatibility: true,
  });
}
