export type ParsedArgs = {
  command: string;
  sub: string | null;
  positional: string[];
  flags: Record<string, string | boolean>;
  passthrough: string[];
};

const BOOLEAN_FLAGS = new Set([
  'yes',
  'y',
  'help',
  'h',
  'version',
  'v',
  'json',
  'all',
  'force',
  'quiet',
  'q',
  'direct',
  'no-color',
  'secrets',
  'no-secrets',
  'history',
  'encrypt',
  'plain',
  'dry-run',
  'verbose',
  'global',
  'recursive',
  'values',
  'reveal',
  'export',
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const passthroughIndex = argv.indexOf('--');
  const main = passthroughIndex === -1 ? argv : argv.slice(0, passthroughIndex);
  const passthrough = passthroughIndex === -1 ? [] : argv.slice(passthroughIndex + 1);

  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < main.length; i += 1) {
    const token = main[i];
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq > -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const next = main[i + 1];
      if (BOOLEAN_FLAGS.has(body) || next === undefined || next.startsWith('-')) {
        flags[body] = true;
      } else {
        flags[body] = next;
        i += 1;
      }
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      const body = token.slice(1);
      const next = main[i + 1];
      if (BOOLEAN_FLAGS.has(body) || next === undefined || next.startsWith('-')) {
        flags[body] = true;
      } else {
        flags[body] = next;
        i += 1;
      }
      continue;
    }
    positional.push(token);
  }

  const command = positional.shift() ?? '';
  const sub = positional[0] && !positional[0].includes('=') ? positional[0] : null;

  return { command, sub, positional, flags, passthrough };
}

export function flag(args: ParsedArgs, ...names: string[]): string | boolean | undefined {
  for (const name of names) {
    if (name in args.flags) return args.flags[name];
  }
  return undefined;
}

export function flagString(args: ParsedArgs, ...names: string[]): string | undefined {
  const value = flag(args, ...names);
  return typeof value === 'string' ? value : undefined;
}

export function flagBool(args: ParsedArgs, ...names: string[]): boolean {
  const value = flag(args, ...names);
  return value === true || value === 'true';
}
