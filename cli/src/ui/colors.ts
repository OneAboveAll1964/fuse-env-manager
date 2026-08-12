const FORCE = process.env.FORCE_COLOR;
const NO_COLOR = process.env.NO_COLOR;

export const supportsColor = (() => {
  if (NO_COLOR) return false;
  if (FORCE && FORCE !== '0') return true;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(process.stdout.isTTY);
})();

const ESC = '[';

function wrap(open: number, close: number) {
  return (value: string): string =>
    supportsColor ? `${ESC}${open}m${value}${ESC}${close}m` : value;
}

export const c = {
  reset: wrap(0, 0),
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  inverse: wrap(7, 27),
  black: wrap(30, 39),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  grey: wrap(90, 39),
  brightRed: wrap(91, 39),
  brightGreen: wrap(92, 39),
  brightYellow: wrap(93, 39),
  brightBlue: wrap(94, 39),
  brightMagenta: wrap(95, 39),
  brightCyan: wrap(96, 39),
  bgBlue: wrap(44, 49),
  bgGreen: wrap(42, 49),
  bgRed: wrap(41, 49),
  bgYellow: wrap(43, 49),
  bgGrey: wrap(100, 49),
};

const WIN = process.platform === 'win32';

export const symbols = {
  tick: WIN ? '√' : '✔',
  cross: WIN ? '×' : '✖',
  warn: WIN ? '!' : '⚠',
  info: WIN ? 'i' : 'ℹ',
  pointer: WIN ? '>' : '❯',
  bullet: '•',
  arrow: WIN ? '->' : '→',
  radioOn: WIN ? '(*)' : '◉',
  radioOff: WIN ? '( )' : '◯',
  checkOn: WIN ? '[x]' : '◼',
  checkOff: WIN ? '[ ]' : '◻',
  line: '─',
  cornerTopLeft: '┌',
  cornerTopRight: '┐',
  cornerBottomLeft: '└',
  cornerBottomRight: '┘',
  vertical: '│',
  branch: '├',
  lastBranch: '└',
};

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, '');
}

export function width(value: string): number {
  return stripAnsi(value).length;
}

export function pad(value: string, size: number): string {
  const diff = size - width(value);
  return diff > 0 ? value + ' '.repeat(diff) : value;
}

export function truncate(value: string, size: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= size) return value;
  if (plain === value) return `${plain.slice(0, Math.max(1, size - 1))}…`;
  return value;
}

export const ansi = {
  hideCursor: `${ESC}?25l`,
  showCursor: `${ESC}?25h`,
  clearLine: `${ESC}2K`,
  cursorUp: (n: number) => `${ESC}${n}A`,
  cursorLeft: `${ESC}G`,
};
