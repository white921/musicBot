import type { Message } from "discord.js";

import type { MusicService } from "../features/music/musicService.js";

export interface CommandContext {
  message: Message<true>;
  args: string[];
  music: MusicService;
}

export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  execute(context: CommandContext): Promise<void>;
}
