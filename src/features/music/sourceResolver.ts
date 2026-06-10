import { demuxProbe } from "@discordjs/voice";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import YTDlpWrapImport from "yt-dlp-wrap";

import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import type { Track } from "./types.js";

type YtDlpInfo = {
  title?: string;
  webpage_url?: string;
  url?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
  extractor?: string;
  entries?: YtDlpInfo[];
};

interface YtDlpWrapInstance {
  getVersion(): Promise<string>;
  getVideoInfo(args: string | string[]): Promise<unknown>;
  execStream(args: string[]): {
    ytDlpProcess?: { kill(signal?: string): void };
    destroy(error?: Error): void;
    on(event: "ytDlpEvent", listener: (eventType: string, eventData: string) => void): unknown;
    on(event: "error", listener: (error: Error) => void): unknown;
  } & NodeJS.ReadableStream;
}

interface YtDlpWrapStatic {
  new (binaryPath?: string): YtDlpWrapInstance;
  downloadFromGithub(filePath?: string, version?: string, platform?: NodeJS.Platform): Promise<void>;
}

const YTDlpWrap = YTDlpWrapImport as unknown as YtDlpWrapStatic;

const DEFAULT_YTDLP_BINARY_PATH = path.join(
  process.cwd(),
  ".bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);
const AUDIO_FORMAT_SELECTOR = "bestaudio[acodec^=opus]/bestaudio/best";

let ytDlpSetupPromise: Promise<YtDlpWrapInstance> | null = null;

function normalizeYtDlpError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("429")) {
    return new Error("YOUTUBE_RATE_LIMITED");
  }

  if (message.toLowerCase().includes("captcha")) {
    return new Error("YOUTUBE_BOT_PROTECTION");
  }

  return error instanceof Error ? error : new Error(message);
}

function normalizeInput(input: string): string {
  const source = input.trim();

  if (source.startsWith("https://music.youtube.com/")) {
    return source.replace("https://music.youtube.com/", "https://www.youtube.com/");
  }

  if (source.startsWith("http://music.youtube.com/")) {
    return source.replace("http://music.youtube.com/", "https://www.youtube.com/");
  }

  return source;
}

function getYtDlpBinaryPath() {
  return config.ytDlpBinaryPath || DEFAULT_YTDLP_BINARY_PATH;
}

function createCommonArgs(options?: { noPlaylist?: boolean }) {
  const args = [
    "--no-warnings",
    "--prefer-free-formats",
    "--extractor-retries",
    "2",
  ];

  if (options?.noPlaylist ?? true) {
    args.push("--no-playlist");
  }

  if (config.youtubeCookie) {
    args.push("--add-header", `Cookie:${config.youtubeCookie}`);
  }

  if (config.youtubeUserAgent) {
    args.push("--user-agent", config.youtubeUserAgent);
  }

  return args;
}

async function ensureYtDlp() {
  if (ytDlpSetupPromise) {
    return ytDlpSetupPromise;
  }

  ytDlpSetupPromise = (async () => {
    const binaryPath = getYtDlpBinaryPath();

    if (!existsSync(binaryPath)) {
      mkdirSync(path.dirname(binaryPath), { recursive: true });
      logger.info("Downloading yt-dlp binary", {
        binaryPath,
      });
      await YTDlpWrap.downloadFromGithub(binaryPath);
    }

    const ytDlp = new YTDlpWrap(binaryPath);
    const version = (await ytDlp.getVersion()).trim();

    logger.info("yt-dlp is ready", {
      binaryPath,
      version,
      hasYoutubeCookie: Boolean(config.youtubeCookie),
      hasYoutubeUserAgent: Boolean(config.youtubeUserAgent),
    });

    return ytDlp;
  })();

  return ytDlpSetupPromise;
}

function toDurationSec(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return 0;
}

function normalizeTrack(info: YtDlpInfo, requestedBy: string, sourceType: Track["sourceType"]): Track {
  return {
    title: info.title || "Unknown title",
    artist: info.uploader || info.channel || null,
    url: info.webpage_url || info.url || "",
    durationSec: toDurationSec(info.duration),
    requestedBy,
    sourceType,
  };
}

function isProbablyUrl(value: string) {
  return /^https?:\/\//.test(value);
}

function isPlaylistUrl(value: string) {
  return /[?&]list=/.test(value);
}

async function getInfo(args: string[]) {
  const ytDlp = await ensureYtDlp();
  return ytDlp.getVideoInfo(args).catch((error: unknown) => {
    throw normalizeYtDlpError(error);
  }) as Promise<YtDlpInfo | YtDlpInfo[]>;
}

export async function resolveTracks(input: string, requestedBy: string): Promise<Track[]> {
  const source = normalizeInput(input);

  if (!source) {
    throw new Error("EMPTY_QUERY");
  }

  logger.info("Resolving tracks with yt-dlp", {
    requestedBy,
    input: source,
    mode: isProbablyUrl(source) ? "url" : "search",
  });

  if (isProbablyUrl(source)) {
    const info = await getInfo([
      ...createCommonArgs({ noPlaylist: !isPlaylistUrl(source) }),
      source,
      "-f",
      AUDIO_FORMAT_SELECTOR,
    ]);

    if (Array.isArray(info)) {
      const tracks = info.map((entry) => normalizeTrack(entry, requestedBy, "youtube")).filter((track) => track.url);

      logger.info("Resolved playlist/url entries with yt-dlp", {
        requestedBy,
        input: source,
        trackCount: tracks.length,
      });

      if (tracks.length === 0) {
        throw new Error("TRACK_NOT_FOUND");
      }

      return tracks;
    }

    const track = normalizeTrack(info, requestedBy, "youtube");

    logger.info("Resolved single track with yt-dlp", {
      requestedBy,
      input: source,
      title: track.title,
      url: track.url,
      artist: track.artist,
    });

    if (!track.url) {
      throw new Error("TRACK_NOT_FOUND");
    }

    return [track];
  }

  const info = await getInfo([
    ...createCommonArgs({ noPlaylist: true }),
    `ytsearch1:${source}`,
    "-f",
    AUDIO_FORMAT_SELECTOR,
  ]);
  const first = Array.isArray(info) ? info[0] : info;

  if (!first) {
    logger.warn("yt-dlp search returned no result", {
      requestedBy,
      input: source,
    });
    throw new Error("TRACK_NOT_FOUND");
  }

  const track = normalizeTrack(first, requestedBy, "search");

  logger.info("Resolved search track with yt-dlp", {
    requestedBy,
    input: source,
    title: track.title,
    url: track.url,
    artist: track.artist,
  });

  if (!track.url) {
    throw new Error("TRACK_NOT_FOUND");
  }

  return [track];
}

export async function createTrackStream(track: Track) {
  const ytDlp = await ensureYtDlp();
  const stream = ytDlp.execStream([
    ...createCommonArgs({ noPlaylist: true }),
    track.url,
    "-f",
    AUDIO_FORMAT_SELECTOR,
  ]);

  const cleanup = () => {
    stream.ytDlpProcess?.kill("SIGKILL");
    stream.destroy();
  };

  logger.info("Creating yt-dlp stream", {
    title: track.title,
    url: track.url,
    sourceType: track.sourceType,
    requestedBy: track.requestedBy,
  });

  stream.on("ytDlpEvent", (eventType: string, eventData: string) => {
    if (eventType === "download" || eventType === "ExtractAudio") {
      logger.info("yt-dlp event", {
        title: track.title,
        eventType,
        eventData,
      });
    }
  });

  stream.on("error", (error: Error) => {
    logger.warn("yt-dlp stream failed", {
      title: track.title,
      url: track.url,
      sourceType: track.sourceType,
      requestedBy: track.requestedBy,
      error: normalizeYtDlpError(error).message,
    });
  });

  const probed = await demuxProbe(stream as Readable).catch((error: unknown) => {
    cleanup();
    throw normalizeYtDlpError(error);
  });

  return {
    cleanup,
    stream: probed.stream,
    type: probed.type,
  };
}
