import type { CommandDefinition } from "../commands/types.js";

export function createCommandMap(definitions: CommandDefinition[]) {
  const map = new Map<string, CommandDefinition>();

  for (const definition of definitions) {
    map.set(definition.name, definition);

    for (const alias of definition.aliases) {
      map.set(alias, definition);
    }
  }

  return map;
}
