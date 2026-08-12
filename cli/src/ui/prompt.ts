import readline from 'node:readline';
import { ansi, c, pad, stripAnsi, symbols, width } from './colors';

export class PromptCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'PromptCancelled';
  }
}

export type Choice<T> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
  group?: string;
};

const stdin = process.stdin;
const stdout = process.stdout;

export function isInteractive(): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

function requireInteractive(): void {
  if (!isInteractive()) {
    throw new Error(
      'This command needs an interactive terminal. Pass the values as flags instead.',
    );
  }
}

type Key = {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
};

function listen(handler: (key: Key) => void): () => void {
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  const onKey = (_str: string, key: Key): void => handler(key);
  stdin.on('keypress', onKey);
  stdin.resume();
  return () => {
    stdin.off('keypress', onKey);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  };
}

function clearBlock(rows: number): void {
  if (rows <= 0) return;
  if (rows > 1) stdout.write(ansi.cursorUp(rows - 1));
  stdout.write(ansi.cursorLeft);
  stdout.write(ansi.clearDown);
}

function rowsFor(lines: string[]): number {
  const columns = stdout.columns && stdout.columns > 0 ? stdout.columns : 80;
  return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(width(line) / columns)), 0);
}

function paint(lines: string[], previousRows: number): number {
  clearBlock(previousRows);
  stdout.write(lines.join('\n'));
  return rowsFor(lines);
}

const MAX_VISIBLE = 12;

export function select<T>(
  message: string,
  choices: Choice<T>[],
  options: { initial?: number; filterable?: boolean } = {},
): Promise<T> {
  requireInteractive();
  if (choices.length === 0) return Promise.reject(new Error('There is nothing to choose from'));

  const filterable = options.filterable ?? choices.length > 8;

  return new Promise<T>((resolve, reject) => {
    let filter = '';
    let cursor = options.initial ?? 0;
    let offset = 0;
    let painted = 0;

    const visible = (): Choice<T>[] => {
      if (!filter) return choices;
      const term = filter.toLowerCase();
      return choices.filter(
        (choice) =>
          choice.label.toLowerCase().includes(term) ||
          (choice.hint ?? '').toLowerCase().includes(term) ||
          (choice.group ?? '').toLowerCase().includes(term),
      );
    };

    const render = (): void => {
      const list = visible();
      if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
      if (cursor < offset) offset = cursor;
      if (cursor >= offset + MAX_VISIBLE) offset = cursor - MAX_VISIBLE + 1;

      const lines: string[] = [];
      lines.push(
        `${c.brightCyan('?')} ${c.bold(message)}${
          filterable ? c.grey(`  ${filter ? `filter: ${filter}` : 'type to filter'}`) : ''
        }`,
      );

      const window = list.slice(offset, offset + MAX_VISIBLE);
      let lastGroup: string | undefined;
      window.forEach((choice, index) => {
        const actual = offset + index;
        if (choice.group && choice.group !== lastGroup) {
          lines.push(`  ${c.grey(choice.group)}`);
          lastGroup = choice.group;
        }
        const active = actual === cursor;
        const marker = active ? c.brightCyan(symbols.pointer) : ' ';
        const label = choice.disabled
          ? c.grey(choice.label)
          : active
            ? c.brightCyan(choice.label)
            : choice.label;
        const hint = choice.hint ? c.grey(`  ${choice.hint}`) : '';
        lines.push(`${marker} ${label}${hint}`);
      });

      if (list.length === 0) lines.push(`  ${c.grey('nothing matched')}`);
      if (list.length > MAX_VISIBLE) {
        lines.push(
          c.grey(
            `  ${offset + 1}-${Math.min(offset + MAX_VISIBLE, list.length)} of ${list.length}`,
          ),
        );
      }
      lines.push(c.grey('  ↑↓ move · enter select · esc cancel'));

      painted = paint(lines, painted);
    };

    const finish = (value: T | null, error?: Error): void => {
      stop();
      clearBlock(painted);
      painted = 0;
      stdout.write(ansi.showCursor);
      if (error) {
        reject(error);
        return;
      }
      const chosen = choices.find((choice) => choice.value === value);
      stdout.write(
        `${c.green(symbols.tick)} ${c.bold(message)} ${c.grey(symbols.arrow)} ${c.brightCyan(chosen?.label ?? '')}\n`,
      );
      resolve(value as T);
    };

    const stop = listen((key) => {
      const list = visible();
      if (key.ctrl && key.name === 'c') {
        finish(null, new PromptCancelled());
        return;
      }
      switch (key.name) {
        case 'escape':
          finish(null, new PromptCancelled());
          return;
        case 'up':
        case 'k':
          if (key.name === 'k' && filterable && filter !== '') break;
          cursor = cursor > 0 ? cursor - 1 : Math.max(0, list.length - 1);
          render();
          return;
        case 'down':
        case 'j':
          if (key.name === 'j' && filterable && filter !== '') break;
          cursor = cursor < list.length - 1 ? cursor + 1 : 0;
          render();
          return;
        case 'return':
        case 'enter': {
          const choice = list[cursor];
          if (!choice || choice.disabled) return;
          finish(choice.value);
          return;
        }
        case 'backspace':
          if (filterable) {
            filter = filter.slice(0, -1);
            cursor = 0;
            offset = 0;
            render();
          }
          return;
        default:
          break;
      }
      if (
        filterable &&
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        key.sequence >= ' '
      ) {
        filter += key.sequence;
        cursor = 0;
        offset = 0;
        render();
      }
    });

    stdout.write(ansi.hideCursor);
    render();
  });
}

export function multiselect<T>(
  message: string,
  choices: Choice<T>[],
  options: { initial?: T[] } = {},
): Promise<T[]> {
  requireInteractive();
  if (choices.length === 0) return Promise.resolve([]);

  return new Promise<T[]>((resolve, reject) => {
    let cursor = 0;
    let offset = 0;
    let painted = 0;
    const picked = new Set<T>(options.initial ?? []);

    const render = (): void => {
      if (cursor < offset) offset = cursor;
      if (cursor >= offset + MAX_VISIBLE) offset = cursor - MAX_VISIBLE + 1;

      const lines: string[] = [];
      lines.push(`${c.brightCyan('?')} ${c.bold(message)} ${c.grey(`(${picked.size} selected)`)}`);
      choices.slice(offset, offset + MAX_VISIBLE).forEach((choice, index) => {
        const actual = offset + index;
        const active = actual === cursor;
        const on = picked.has(choice.value);
        const marker = active ? c.brightCyan(symbols.pointer) : ' ';
        const box = on ? c.green(symbols.checkOn) : c.grey(symbols.checkOff);
        const label = active ? c.brightCyan(choice.label) : choice.label;
        lines.push(`${marker} ${box} ${label}${choice.hint ? c.grey(`  ${choice.hint}`) : ''}`);
      });
      if (choices.length > MAX_VISIBLE) {
        lines.push(
          c.grey(
            `  ${offset + 1}-${Math.min(offset + MAX_VISIBLE, choices.length)} of ${choices.length}`,
          ),
        );
      }
      lines.push(c.grey('  ↑↓ move · space toggle · a all · enter confirm · esc cancel'));

      painted = paint(lines, painted);
    };

    const stop = listen((key) => {
      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        stop();
        clearBlock(painted);
        painted = 0;
        stdout.write(ansi.showCursor);
        reject(new PromptCancelled());
        return;
      }
      if (key.name === 'up') {
        cursor = cursor > 0 ? cursor - 1 : choices.length - 1;
        render();
        return;
      }
      if (key.name === 'down') {
        cursor = cursor < choices.length - 1 ? cursor + 1 : 0;
        render();
        return;
      }
      if (key.name === 'space') {
        const choice = choices[cursor];
        if (choice && !choice.disabled) {
          if (picked.has(choice.value)) picked.delete(choice.value);
          else picked.add(choice.value);
        }
        render();
        return;
      }
      if (key.name === 'a') {
        if (picked.size === choices.length) picked.clear();
        else choices.forEach((choice) => picked.add(choice.value));
        render();
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        stop();
        clearBlock(painted);
        painted = 0;
        stdout.write(ansi.showCursor);
        stdout.write(
          `${c.green(symbols.tick)} ${c.bold(message)} ${c.grey(symbols.arrow)} ${c.brightCyan(`${picked.size} selected`)}\n`,
        );
        resolve(choices.filter((choice) => picked.has(choice.value)).map((choice) => choice.value));
      }
    });

    stdout.write(ansi.hideCursor);
    render();
  });
}

export function text(
  message: string,
  options: {
    initial?: string;
    placeholder?: string;
    validate?: (value: string) => string | null;
  } = {},
): Promise<string> {
  requireInteractive();
  return new Promise<string>((resolve, reject) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const suffix = options.initial
      ? c.grey(` (${options.initial})`)
      : options.placeholder
        ? c.grey(` (${options.placeholder})`)
        : '';
    const ask = (): void => {
      rl.question(`${c.brightCyan('?')} ${c.bold(message)}${suffix} `, (answer) => {
        const value = answer.trim() || options.initial || '';
        const error = options.validate?.(value);
        if (error) {
          stdout.write(`${c.red(symbols.cross)} ${c.red(error)}\n`);
          ask();
          return;
        }
        rl.close();
        resolve(value);
      });
    };
    rl.on('SIGINT', () => {
      rl.close();
      reject(new PromptCancelled());
    });
    ask();
  });
}

export function password(message: string): Promise<string> {
  requireInteractive();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    stdout.write(`${c.brightCyan('?')} ${c.bold(message)} `);
    const stop = listen((key) => {
      if (key.ctrl && key.name === 'c') {
        stop();
        stdout.write('\n');
        reject(new PromptCancelled());
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        stop();
        stdout.write('\n');
        resolve(value);
        return;
      }
      if (key.name === 'backspace') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      if (key.sequence && key.sequence.length === 1 && key.sequence >= ' ') {
        value += key.sequence;
        stdout.write(c.grey('•'));
      }
    });
  });
}

export function confirm(message: string, initial = true): Promise<boolean> {
  requireInteractive();
  return new Promise<boolean>((resolve, reject) => {
    const hint = initial ? c.grey('(Y/n)') : c.grey('(y/N)');
    stdout.write(`${c.brightCyan('?')} ${c.bold(message)} ${hint} `);
    const stop = listen((key) => {
      const answer = (key.sequence ?? '').toLowerCase();
      if (key.ctrl && key.name === 'c') {
        stop();
        stdout.write('\n');
        reject(new PromptCancelled());
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        stop();
        stdout.write(`${initial ? c.green('yes') : c.red('no')}\n`);
        resolve(initial);
        return;
      }
      if (answer === 'y' || answer === 'n') {
        stop();
        stdout.write(`${answer === 'y' ? c.green('yes') : c.red('no')}\n`);
        resolve(answer === 'y');
      }
    });
  });
}

export function renderTree(lines: Array<{ depth: number; label: string; last: boolean }>): string {
  return lines
    .map((line) => {
      const indent = '  '.repeat(Math.max(0, line.depth - 1));
      const branch =
        line.depth === 0 ? '' : line.last ? `${symbols.lastBranch} ` : `${symbols.branch} `;
      return `  ${indent}${c.grey(branch)}${line.label}`;
    })
    .join('\n');
}

export function columns(rows: Array<[string, string]>): string {
  const size = rows.reduce((max, [left]) => Math.max(max, stripAnsi(left).length), 0);
  return rows.map(([left, right]) => `  ${pad(left, size)}  ${c.grey(right)}`).join('\n');
}
