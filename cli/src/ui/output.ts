import { c, pad, symbols, truncate, width } from './colors';

export function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

export function printErr(line = ''): void {
  process.stderr.write(`${line}\n`);
}

export function success(message: string, detail?: string): void {
  print(`${c.green(symbols.tick)} ${message}${detail ? c.grey(`  ${detail}`) : ''}`);
}

export function failure(message: string, detail?: string): void {
  printErr(`${c.red(symbols.cross)} ${message}${detail ? c.grey(`  ${detail}`) : ''}`);
}

export function warn(message: string, detail?: string): void {
  print(`${c.yellow(symbols.warn)} ${message}${detail ? c.grey(`  ${detail}`) : ''}`);
}

export function info(message: string, detail?: string): void {
  print(`${c.cyan(symbols.info)} ${message}${detail ? c.grey(`  ${detail}`) : ''}`);
}

export function heading(title: string, subtitle?: string): void {
  print();
  print(`${c.bold(c.brightBlue(title))}${subtitle ? c.grey(`  ${subtitle}`) : ''}`);
  print(c.grey(symbols.line.repeat(Math.min(60, Math.max(20, width(title) + 8)))));
}

export function banner(): void {
  const art = [
    `${c.brightBlue('┌───┐')}  ${c.bold('fuse')} ${c.grey('· environment manager')}`,
    `${c.brightBlue('│')}${c.yellow('~')}${c.brightBlue('~')}${c.yellow('~')}${c.brightBlue('│')}  ${c.grey('encrypted env vars, everywhere you work')}`,
    `${c.brightBlue('└───┘')}`,
  ];
  print();
  art.forEach((line) => print(`  ${line}`));
  print();
}

export function keyValue(rows: Array<[string, string]>, indent = 2): void {
  const labelWidth = rows.reduce((max, [label]) => Math.max(max, width(label)), 0);
  rows.forEach(([label, value]) => {
    print(`${' '.repeat(indent)}${c.grey(pad(label, labelWidth))}  ${value}`);
  });
}

export function table(headers: string[], rows: string[][], maxWidths?: number[]): void {
  if (rows.length === 0) return;
  const columns = headers.length;
  const widths = headers.map((header, index) => {
    const longest = rows.reduce(
      (max, row) => Math.max(max, width(row[index] ?? '')),
      width(header),
    );
    const cap = maxWidths?.[index] ?? 60;
    return Math.min(longest, cap);
  });

  print(
    `  ${headers
      .map((header, index) => c.grey(c.bold(pad(truncate(header, widths[index]), widths[index]))))
      .join('  ')}`,
  );
  print(`  ${c.grey(widths.map((w) => symbols.line.repeat(w)).join('  '))}`);
  rows.forEach((row) => {
    const cells: string[] = [];
    for (let index = 0; index < columns; index += 1) {
      cells.push(pad(truncate(row[index] ?? '', widths[index]), widths[index]));
    }
    print(`  ${cells.join('  ')}`);
  });
}

export function bulletList(items: string[]): void {
  items.forEach((item) => print(`  ${c.grey(symbols.bullet)} ${item}`));
}

export function box(lines: string[], tone: 'info' | 'warn' | 'danger' = 'info'): void {
  const colour = tone === 'danger' ? c.red : tone === 'warn' ? c.yellow : c.blue;
  const inner = Math.max(...lines.map((line) => width(line)));
  print(`  ${colour('┌' + symbols.line.repeat(inner + 2) + '┐')}`);
  lines.forEach((line) => print(`  ${colour('│')} ${pad(line, inner)} ${colour('│')}`));
  print(`  ${colour('└' + symbols.line.repeat(inner + 2) + '┘')}`);
}

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 6) return '••••••';
  return `${'•'.repeat(8)}${value.slice(-4)}`;
}

export function diffLine(prefix: '+' | '-' | '~' | ' ', text: string): void {
  const colour =
    prefix === '+' ? c.green : prefix === '-' ? c.red : prefix === '~' ? c.yellow : c.grey;
  print(`  ${colour(prefix)} ${colour(text)}`);
}
