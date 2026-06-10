import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  discordToken: requireEnv("DISCORD_TOKEN"),
  prefix: process.env.BOT_PREFIX?.trim() || "m!",
  youtubeCookie: process.env.YOUTUBE_COOKIE?.trim() || null,
  youtubeUserAgent: process.env.YOUTUBE_USER_AGENT?.trim() || null,
  ytDlpBinaryPath: process.env.YTDLP_BINARY_PATH?.trim() || null,
} as const;
