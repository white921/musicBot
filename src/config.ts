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
} as const;
