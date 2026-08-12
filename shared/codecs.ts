import type { EnvFormat, QuoteMode } from './types';

export type ParsedEntry = {
  key: string;
  value: string;
  note: string;
  enabled: boolean;
};

export type ParseResult = {
  entries: ParsedEntry[];
  errors: string[];
};

export type SerializeEntry = {
  key: string;
  value: string;
  note: string;
  enabled: boolean;
  secret: boolean;
};

export type SerializeOptions = {
  quoteMode: QuoteMode;
  includeNotes: boolean;
  includeDisabled: boolean;
  maskSecrets: boolean;
  header: string;
  resourceName: string;
};

export const DEFAULT_SERIALIZE_OPTIONS: SerializeOptions = {
  quoteMode: 'auto',
  includeNotes: true,
  includeDisabled: true,
  maskSecrets: false,
  header: '',
  resourceName: 'fuse-env',
};

const ASSIGN_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=[ \t]?/;
const MASK = '********';
const GENERATED_NOTE = /^(?:pulled|merged|exported|synced|written)\s+from\s+fuse\b/i;

export function isGeneratedNote(note: string): boolean {
  return GENERATED_NOTE.test(note.trim());
}

function collectNote(pending: string, body: string): string {
  if (isGeneratedNote(body)) return pending;
  return pending ? `${pending} ${body}` : body;
}

function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function unescapeDouble(raw: string): string {
  return raw.replace(/\\(.)/g, (_m, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '0':
        return '\0';
      default:
        return ch;
    }
  });
}

function escapeDouble(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function needsQuotes(value: string): boolean {
  if (value === '') return false;
  return /[\s"'#$`\\=]|^[\s]|[\s]$/.test(value);
}

function quoteValue(value: string, mode: QuoteMode): string {
  if (value.includes('\n')) return `"${escapeDouble(value)}"`;
  if (mode === 'never') return value;
  if (mode === 'always') return `"${escapeDouble(value)}"`;
  return needsQuotes(value) ? `"${escapeDouble(value)}"` : value;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function yamlScalar(value: string, indent: string): string {
  if (value.includes('\n')) {
    const body = value
      .split('\n')
      .map((line) => `${indent}  ${line}`)
      .join('\n');
    return `|-\n${body}`;
  }
  if (value === '') return `''`;
  if (/^[\w./@+-]+$/.test(value) && !/^(?:true|false|null|yes|no|on|off|~)$/i.test(value)) {
    return value;
  }
  return `"${escapeDouble(value)}"`;
}

function stripInlineComment(raw: string): { value: string; note: string } {
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    if (ch === '#' && depth <= 0 && (i === 0 || /\s/.test(raw[i - 1] ?? ''))) {
      return { value: raw.slice(0, i).trimEnd(), note: raw.slice(i + 1).trim() };
    }
  }
  return { value: raw.trimEnd(), note: '' };
}

function toBase64(value: string): string {
  if (typeof globalThis.btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return globalThis.btoa(binary);
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

function fromBase64(value: string): string {
  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(value);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return value;
  }
}

function parseDotenv(text: string): ParseResult {
  const src = normaliseNewlines(text);
  const lines = src.split('\n');
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let pendingNote = '';
  let index = 0;

  const consumeQuoted = (rest: string, quote: string, lineNo: number): string | null => {
    const escaped = quote === '"';
    let buffer = rest;
    let cursor = 1;
    for (;;) {
      while (cursor < buffer.length) {
        const ch = buffer[cursor];
        if (escaped && ch === '\\') {
          cursor += 2;
          continue;
        }
        if (ch === quote) {
          const body = buffer.slice(1, cursor);
          return escaped ? unescapeDouble(body) : body;
        }
        cursor += 1;
      }
      if (index >= lines.length) {
        errors.push(`Line ${lineNo}: unterminated ${quote === '"' ? 'double' : 'single'} quote`);
        const body = buffer.slice(1);
        return escaped ? unescapeDouble(body) : body;
      }
      buffer += `\n${lines[index]}`;
      cursor += 1;
      index += 1;
    }
  };

  while (index < lines.length) {
    const lineNo = index + 1;
    const line = lines[index] ?? '';
    index += 1;
    const trimmed = line.trim();

    if (!trimmed) {
      pendingNote = '';
      continue;
    }

    let enabled = true;
    let work = trimmed;

    if (work.startsWith('#') || work.startsWith(';') || work.startsWith('//')) {
      const body = work.replace(/^(?:#+|;+|\/\/)[ \t]?/, '');
      if (ASSIGN_RE.test(body)) {
        enabled = false;
        work = body;
      } else {
        pendingNote = collectNote(pendingNote, body);
        continue;
      }
    }

    const match = ASSIGN_RE.exec(work);
    if (!match) {
      errors.push(`Line ${lineNo}: could not read "${trimmed.slice(0, 48)}"`);
      pendingNote = '';
      continue;
    }

    const key = match[1];
    const rest = work.slice(match[0].length);
    let value: string;
    let note = pendingNote;

    if (rest.startsWith('"') || rest.startsWith("'")) {
      const parsed = consumeQuoted(rest, rest[0], lineNo);
      value = parsed ?? '';
    } else {
      const stripped = stripInlineComment(rest);
      value = stripped.value;
      if (stripped.note) note = note ? `${note} ${stripped.note}` : stripped.note;
    }

    entries.push({ key, value, note, enabled });
    pendingNote = '';
  }

  return { entries, errors };
}

function scalarToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

function flattenJson(value: unknown, prefix: string, out: ParsedEntry[]): void {
  if (value === null || typeof value !== 'object') {
    out.push({ key: prefix, value: scalarToString(value), note: '', enabled: true });
    return;
  }
  if (Array.isArray(value)) {
    out.push({ key: prefix, value: JSON.stringify(value), note: '', enabled: true });
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenJson(v, key, out);
    } else if (Array.isArray(v)) {
      out.push({ key, value: JSON.stringify(v), note: '', enabled: true });
    } else {
      out.push({ key, value: scalarToString(v), note: '', enabled: true });
    }
  }
}

function parseJson(text: string): ParseResult {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { entries: [], errors: ['Expected a JSON object of keys and values'] };
    }
    const entries: ParsedEntry[] = [];
    flattenJson(parsed, '', entries);
    return { entries, errors: [] };
  } catch (err) {
    return { entries: [], errors: [err instanceof Error ? err.message : 'Invalid JSON'] };
  }
}

function unquoteYaml(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeDouble(value.slice(1, -1));
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseYaml(text: string, decodeBase64: boolean): ParseResult {
  const lines = normaliseNewlines(text).split('\n');
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];

  let dataIndent: number | null = null;
  let inData = false;
  let pendingNote = '';

  const hasDataBlock = lines.some((l) => /^\s*(?:data|stringData):\s*$/.test(l));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      pendingNote = '';
      continue;
    }
    if (/^\s*#/.test(line)) {
      const body = line.replace(/^\s*#+[ \t]?/, '').trim();
      pendingNote = collectNote(pendingNote, body);
      continue;
    }
    if (/^\s*---\s*$/.test(line)) continue;

    const indent = line.length - line.trimStart().length;

    if (hasDataBlock) {
      if (/^\s*(?:data|stringData):\s*$/.test(line)) {
        inData = true;
        dataIndent = indent;
        continue;
      }
      if (inData && dataIndent !== null && indent <= dataIndent) {
        inData = false;
      }
      if (!inData) continue;
    }

    const match = /^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s?(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    let raw = match[2] ?? '';

    if (raw === '|' || raw === '|-' || raw === '>' || raw === '>-' || raw === '|+') {
      const blockLines: string[] = [];
      let j = i + 1;
      let blockIndent: number | null = null;
      while (j < lines.length) {
        const next = lines[j] ?? '';
        if (!next.trim()) {
          blockLines.push('');
          j += 1;
          continue;
        }
        const nextIndent = next.length - next.trimStart().length;
        if (nextIndent <= indent) break;
        if (blockIndent === null) blockIndent = nextIndent;
        blockLines.push(next.slice(blockIndent));
        j += 1;
      }
      i = j - 1;
      const folded = raw.startsWith('>');
      let value = folded ? blockLines.join(' ').trim() : blockLines.join('\n');
      if (raw.endsWith('-')) value = value.replace(/\n+$/, '');
      entries.push({ key, value, note: pendingNote, enabled: true });
      pendingNote = '';
      continue;
    }

    if (raw === '' || raw === '{}' || raw === '[]') {
      if (!hasDataBlock) continue;
    }

    const inline = raw.indexOf(' #');
    if (inline > -1 && !raw.trim().startsWith('"') && !raw.trim().startsWith("'")) {
      raw = raw.slice(0, inline);
    }

    let value = unquoteYaml(raw);
    if (decodeBase64 && value) value = fromBase64(value);
    entries.push({ key, value, note: pendingNote, enabled: true });
    pendingNote = '';
  }

  if (entries.length === 0) errors.push('No key and value pairs were found');
  return { entries, errors };
}

function parseToml(text: string): ParseResult {
  const src = normaliseNewlines(text);
  const lines = src.split('\n');
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let pendingNote = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      pendingNote = '';
      continue;
    }
    if (trimmed.startsWith('#')) {
      const body = trimmed.replace(/^#+[ \t]?/, '');
      pendingNote = collectNote(pendingNote, body);
      continue;
    }
    if (trimmed.startsWith('[')) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) {
      errors.push(`Line ${i + 1}: could not read "${trimmed.slice(0, 48)}"`);
      continue;
    }
    const key = match[1];
    let raw = match[2] ?? '';

    if (raw.startsWith('"""')) {
      const collected: string[] = [raw.slice(3)];
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? '').includes('"""')) {
        collected.push(lines[j] ?? '');
        j += 1;
      }
      if (j < lines.length) collected.push((lines[j] ?? '').split('"""')[0]);
      i = j;
      entries.push({
        key,
        value: collected.join('\n').replace(/^\n/, ''),
        note: pendingNote,
        enabled: true,
      });
      pendingNote = '';
      continue;
    }

    const stripped = stripInlineComment(raw);
    raw = stripped.value;
    let value: string;
    if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
      value = unescapeDouble(raw.slice(1, -1));
    } else if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
      value = raw.slice(1, -1);
    } else {
      value = raw.trim();
    }
    const note = stripped.note ? `${pendingNote} ${stripped.note}`.trim() : pendingNote;
    entries.push({ key, value, note, enabled: true });
    pendingNote = '';
  }

  return { entries, errors };
}

function parseProperties(text: string): ParseResult {
  const src = normaliseNewlines(text);
  const lines = src.split('\n');
  const entries: ParsedEntry[] = [];
  let pendingNote = '';

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      pendingNote = '';
      continue;
    }
    if (/^[#!]/.test(trimmed)) {
      const body = trimmed.replace(/^[#!]+[ \t]?/, '');
      pendingNote = collectNote(pendingNote, body);
      continue;
    }
    while (line.trimEnd().endsWith('\\') && i + 1 < lines.length) {
      line = `${line.trimEnd().slice(0, -1)}${(lines[i + 1] ?? '').trimStart()}`;
      i += 1;
    }
    const match = /^\s*([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (!match) continue;
    entries.push({
      key: match[1].replace(/\./g, '_'),
      value: (match[2] ?? '').replace(/\\([:=\\ ])/g, '$1'),
      note: pendingNote,
      enabled: true,
    });
    pendingNote = '';
  }

  return { entries, errors: [] };
}

function parseXcconfig(text: string): ParseResult {
  const lines = normaliseNewlines(text).split('\n');
  const entries: ParsedEntry[] = [];
  let pendingNote = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pendingNote = '';
      continue;
    }
    if (trimmed.startsWith('//')) {
      const body = trimmed.replace(/^\/\/+[ \t]?/, '');
      pendingNote = collectNote(pendingNote, body);
      continue;
    }
    if (trimmed.startsWith('#include')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    entries.push({
      key: match[1],
      value: (match[2] ?? '').trim(),
      note: pendingNote,
      enabled: true,
    });
    pendingNote = '';
  }

  return { entries, errors: [] };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += ch;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text: string): ParseResult {
  const lines = normaliseNewlines(text)
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length === 0) return { entries: [], errors: ['The file is empty'] };

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const keyIdx = header.indexOf('key');
  const valueIdx = header.indexOf('value');
  const noteIdx = header.indexOf('note');
  const hasHeader = keyIdx > -1 && valueIdx > -1;

  const entries: ParsedEntry[] = [];
  const rows = hasHeader ? lines.slice(1) : lines;
  for (const row of rows) {
    const cells = splitCsvLine(row);
    const key = (hasHeader ? cells[keyIdx] : cells[0])?.trim() ?? '';
    if (!key) continue;
    entries.push({
      key,
      value: (hasHeader ? cells[valueIdx] : cells[1]) ?? '',
      note: (noteIdx > -1 ? cells[noteIdx] : '') ?? '',
      enabled: true,
    });
  }
  return { entries, errors: [] };
}

export function parseText(text: string, format: EnvFormat): ParseResult {
  switch (format) {
    case 'json':
      return parseJson(text);
    case 'yaml':
    case 'github-actions':
    case 'k8s-configmap':
      return parseYaml(text, false);
    case 'k8s-secret':
      return parseYaml(text, true);
    case 'toml':
      return parseToml(text);
    case 'properties':
      return parseProperties(text);
    case 'xcconfig':
      return parseXcconfig(text);
    case 'csv':
      return parseCsv(text);
    case 'ini':
    case 'dotenv':
    case 'docker':
    case 'shell':
    case 'netlify':
    case 'dart-define':
    default:
      return parseDotenv(text);
  }
}

function activeEntries(entries: SerializeEntry[], options: SerializeOptions): SerializeEntry[] {
  const list = options.includeDisabled ? entries : entries.filter((e) => e.enabled);
  return list.map((e) => ({
    ...e,
    note: isGeneratedNote(e.note) ? '' : e.note,
    value: options.maskSecrets && e.secret ? MASK : e.value,
  }));
}

function headerLines(options: SerializeOptions, commentToken: string): string[] {
  if (!options.header) return [];
  return options.header.split('\n').map((line) => `${commentToken} ${line}`.trimEnd());
}

export function serialize(
  entries: SerializeEntry[],
  format: EnvFormat,
  overrides: Partial<SerializeOptions> = {},
): string {
  const options: SerializeOptions = { ...DEFAULT_SERIALIZE_OPTIONS, ...overrides };
  const list = activeEntries(entries, options);

  switch (format) {
    case 'json': {
      const obj: Record<string, string> = {};
      for (const e of list) {
        if (!e.enabled) continue;
        obj[e.key] = e.value;
      }
      return `${JSON.stringify(obj, null, 2)}\n`;
    }

    case 'yaml': {
      const out = headerLines(options, '#');
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`# ${e.note}`);
        const line = `${e.key}: ${yamlScalar(e.value, '')}`;
        out.push(e.enabled ? line : `# ${line}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'toml': {
      const out = headerLines(options, '#');
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`# ${e.note}`);
        const value = e.value.includes('\n') ? `"""\n${e.value}"""` : `"${escapeDouble(e.value)}"`;
        const line = `${e.key} = ${value}`;
        out.push(e.enabled ? line : `# ${line}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'shell': {
      const out = ['#!/usr/bin/env bash', ...headerLines(options, '#')];
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`# ${e.note}`);
        const line = `export ${e.key}=${shellQuote(e.value)}`;
        out.push(e.enabled ? line : `# ${line}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'properties': {
      const out = headerLines(options, '#');
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`# ${e.note}`);
        const line = `${e.key}=${e.value.replace(/\n/g, '\\n')}`;
        out.push(e.enabled ? line : `# ${line}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'xcconfig': {
      const out = headerLines(options, '//');
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`// ${e.note}`);
        const line = `${e.key} = ${e.value.replace(/\n/g, ' ')}`;
        out.push(e.enabled ? line : `// ${line}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'ini': {
      const out = headerLines(options, ';');
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`; ${e.note}`);
        const line = `${e.key}=${e.value.replace(/\n/g, '\\n')}`;
        out.push(e.enabled ? line : `; ${line}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'csv': {
      const cell = (v: string): string => `"${v.replace(/"/g, '""')}"`;
      const out = ['key,value,note,enabled'];
      for (const e of list) {
        out.push(
          [cell(e.key), cell(e.value), cell(e.note), e.enabled ? 'true' : 'false'].join(','),
        );
      }
      return `${out.join('\n')}\n`;
    }

    case 'docker': {
      const out = headerLines(options, '#');
      for (const e of list) {
        if (!e.enabled) continue;
        out.push(`${e.key}=${e.value.replace(/\n/g, '\\n')}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'k8s-configmap':
    case 'k8s-secret': {
      const isSecret = format === 'k8s-secret';
      const out = [
        'apiVersion: v1',
        `kind: ${isSecret ? 'Secret' : 'ConfigMap'}`,
        'metadata:',
        `  name: ${options.resourceName}`,
      ];
      if (isSecret) out.push('type: Opaque');
      out.push('data:');
      for (const e of list) {
        if (!e.enabled) continue;
        const value = isSecret ? toBase64(e.value) : yamlScalar(e.value, '  ');
        out.push(`  ${e.key}: ${isSecret ? `"${value}"` : value}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'github-actions': {
      const out = ['env:'];
      for (const e of list) {
        if (!e.enabled) continue;
        if (options.includeNotes && e.note) out.push(`  # ${e.note}`);
        out.push(
          e.secret
            ? `  ${e.key}: \${{ secrets.${e.key} }}`
            : `  ${e.key}: ${yamlScalar(e.value, '  ')}`,
        );
      }
      return `${out.join('\n')}\n`;
    }

    case 'netlify': {
      const out = ['#!/usr/bin/env bash', ...headerLines(options, '#')];
      for (const e of list) {
        if (!e.enabled) continue;
        out.push(`netlify env:set ${e.key} ${shellQuote(e.value)}`);
      }
      return `${out.join('\n')}\n`;
    }

    case 'dart-define': {
      const out: string[] = [];
      for (const e of list) {
        if (!e.enabled) continue;
        out.push(`--dart-define=${e.key}=${e.value.replace(/\n/g, ' ')}`);
      }
      return `${out.join(' \\\n')}\n`;
    }

    case 'dotenv':
    default: {
      const out = headerLines(options, '#');
      for (const e of list) {
        if (options.includeNotes && e.note) out.push(`# ${e.note}`);
        const line = `${e.key}=${quoteValue(e.value, options.quoteMode)}`;
        out.push(e.enabled ? line : `# ${line}`);
      }
      return `${out.join('\n')}\n`;
    }
  }
}

export function detectFormat(fileName: string, text: string): EnvFormat {
  const name = fileName.toLowerCase();
  const body = text.slice(0, 4000);

  if (/kind:\s*Secret/.test(body)) return 'k8s-secret';
  if (/kind:\s*ConfigMap/.test(body)) return 'k8s-configmap';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.toml')) return 'toml';
  if (name.endsWith('.properties')) return 'properties';
  if (name.endsWith('.xcconfig')) return 'xcconfig';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.ini') || name.endsWith('.cfg')) return 'ini';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh')) return 'shell';
  if (name.includes('.env') || name === 'env') return 'dotenv';

  const trimmed = body.trim();
  if (trimmed.startsWith('{')) return 'json';
  if (/^\s*export\s+[A-Za-z_]/m.test(body)) return 'shell';
  if (/^[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*(?:"|')/m.test(body) && /^\[[^\]]+\]/m.test(body)) {
    return 'toml';
  }
  if (/^[A-Za-z_][A-Za-z0-9_.-]*:\s/m.test(body) && !/^[A-Za-z_][A-Za-z0-9_.]*=/m.test(body)) {
    return 'yaml';
  }
  return 'dotenv';
}

export function fileNameFor(name: string, format: EnvFormat): string {
  if (name.includes('.')) return name;
  const ext: Record<EnvFormat, string> = {
    dotenv: '.env',
    docker: '.env',
    json: '.json',
    yaml: '.yaml',
    toml: '.toml',
    shell: '.sh',
    properties: '.properties',
    xcconfig: '.xcconfig',
    ini: '.ini',
    csv: '.csv',
    'k8s-configmap': '.yaml',
    'k8s-secret': '.yaml',
    'github-actions': '.yml',
    netlify: '.sh',
    'dart-define': '.txt',
  };
  return `${name}${ext[format]}`;
}
