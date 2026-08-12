import type { EnvFormat, VarType } from './types';

export const VAR_TYPES: VarType[] = [
  'string',
  'multiline',
  'number',
  'boolean',
  'json',
  'list',
  'url',
  'email',
  'port',
  'path',
  'secret',
  'token',
  'connection',
  'duration',
  'base64',
  'uuid',
  'date',
  'color',
  'regex',
  'enum',
];

export const VAR_TYPE_LABELS: Record<VarType, string> = {
  string: 'Text',
  multiline: 'Multiline text',
  number: 'Number',
  boolean: 'Boolean',
  json: 'JSON',
  list: 'List',
  url: 'URL',
  email: 'Email',
  port: 'Port',
  path: 'File path',
  secret: 'Secret',
  token: 'API token',
  connection: 'Connection',
  duration: 'Duration',
  base64: 'Base64',
  uuid: 'UUID',
  date: 'Date',
  color: 'Colour',
  regex: 'Regular expression',
  enum: 'Choice',
};

export const SECRET_TYPES: VarType[] = ['secret', 'token', 'connection'];

export const FORMATS: EnvFormat[] = [
  'dotenv',
  'json',
  'yaml',
  'toml',
  'shell',
  'properties',
  'xcconfig',
  'ini',
  'csv',
  'docker',
  'k8s-configmap',
  'k8s-secret',
  'github-actions',
  'netlify',
  'dart-define',
];

export const FORMAT_LABELS: Record<EnvFormat, string> = {
  dotenv: '.env',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  shell: 'Shell exports',
  properties: 'Java properties',
  xcconfig: 'Xcode xcconfig',
  ini: 'INI',
  csv: 'CSV',
  docker: 'Docker env-file',
  'k8s-configmap': 'Kubernetes ConfigMap',
  'k8s-secret': 'Kubernetes Secret',
  'github-actions': 'GitHub Actions',
  netlify: 'Netlify CLI',
  'dart-define': 'Dart defines',
};

export const FORMAT_EXTENSIONS: Record<EnvFormat, string> = {
  dotenv: '.env',
  json: '.json',
  yaml: '.yaml',
  toml: '.toml',
  shell: '.sh',
  properties: '.properties',
  xcconfig: '.xcconfig',
  ini: '.ini',
  csv: '.csv',
  docker: '.env',
  'k8s-configmap': '.yaml',
  'k8s-secret': '.yaml',
  'github-actions': '.yml',
  netlify: '.sh',
  'dart-define': '.txt',
};

export const READABLE_FORMATS: EnvFormat[] = [
  'dotenv',
  'json',
  'yaml',
  'toml',
  'shell',
  'properties',
  'xcconfig',
  'ini',
  'csv',
  'docker',
  'k8s-configmap',
  'k8s-secret',
];

const SECRET_HINTS = [
  'secret',
  'password',
  'passwd',
  'pwd',
  'token',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'credential',
  'auth',
  'signature',
  'salt',
  'cert',
  'jwt',
  'session',
  'client_secret',
  'clientsecret',
  'dsn',
  'webhook',
  'passphrase',
  'encryption',
  'sentry',
  'stripe',
  'twilio',
];

const CONNECTION_PREFIXES = [
  'postgres://',
  'postgresql://',
  'mysql://',
  'mongodb://',
  'mongodb+srv://',
  'redis://',
  'rediss://',
  'amqp://',
  'amqps://',
  'sqlserver://',
  'mssql://',
  'clickhouse://',
];

const DURATION_RE = /^\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w|y|sec|secs|min|mins|hour|hours|day|days)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const BASE64_RE = /^[A-Za-z0-9+/]{16,}={0,2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATH_RE = /^(?:\.{1,2}\/|~\/|\/|[A-Za-z]:[\\/])[^\n]*$/;

export function looksSecret(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_HINTS.some((hint) => k.includes(hint));
}

export function suggestType(key: string, value: string): VarType {
  if (value.includes('\n')) return 'multiline';

  const trimmed = value.trim();
  const lowerKey = key.toLowerCase();

  if (CONNECTION_PREFIXES.some((p) => trimmed.toLowerCase().startsWith(p))) return 'connection';
  if (lowerKey.endsWith('_url') || lowerKey.endsWith('url') || /^https?:\/\//i.test(trimmed)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return 'url';
  }
  if (lowerKey.includes('token')) return 'token';
  if (looksSecret(key)) return 'secret';
  if (lowerKey.endsWith('port') && /^\d{1,5}$/.test(trimmed)) return 'port';
  if (EMAIL_RE.test(trimmed)) return 'email';
  if (UUID_RE.test(trimmed)) return 'uuid';
  if (COLOR_RE.test(trimmed)) return 'color';
  if (/^(?:true|false|yes|no|on|off|1|0)$/i.test(trimmed) && trimmed !== '') {
    if (/^(?:true|false|yes|no|on|off)$/i.test(trimmed)) return 'boolean';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed) && trimmed !== '') return 'number';
  if (DURATION_RE.test(trimmed)) return 'duration';
  if (DATE_RE.test(trimmed)) return 'date';
  if (/^[[{]/.test(trimmed) && /[\]}]$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* not json */
    }
  }
  if (trimmed.includes(',') && !trimmed.includes(' ')) return 'list';
  if (PATH_RE.test(trimmed)) return 'path';
  if (trimmed.length >= 24 && BASE64_RE.test(trimmed)) return 'base64';
  return 'string';
}

export type ValidationResult = { ok: boolean; message: string };

const OK: ValidationResult = { ok: true, message: '' };

export function validateValue(type: VarType, value: string, options: string[]): ValidationResult {
  if (value === '') return OK;
  const trimmed = value.trim();

  switch (type) {
    case 'number':
      return /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)
        ? OK
        : { ok: false, message: 'Expected a number' };
    case 'boolean':
      return /^(?:true|false|yes|no|on|off|1|0)$/i.test(trimmed)
        ? OK
        : { ok: false, message: 'Expected true or false' };
    case 'port': {
      const n = Number(trimmed);
      return Number.isInteger(n) && n > 0 && n <= 65535
        ? OK
        : { ok: false, message: 'Expected a port between 1 and 65535' };
    }
    case 'json':
      try {
        JSON.parse(trimmed);
        return OK;
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Invalid JSON' };
      }
    case 'url':
    case 'connection':
      return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(trimmed)
        ? OK
        : { ok: false, message: 'Expected a URL with a scheme' };
    case 'email':
      return EMAIL_RE.test(trimmed) ? OK : { ok: false, message: 'Expected an email address' };
    case 'uuid':
      return UUID_RE.test(trimmed) ? OK : { ok: false, message: 'Expected a UUID' };
    case 'color':
      return COLOR_RE.test(trimmed) ? OK : { ok: false, message: 'Expected a hex colour' };
    case 'date':
      return DATE_RE.test(trimmed) ? OK : { ok: false, message: 'Expected an ISO date' };
    case 'duration':
      return DURATION_RE.test(trimmed)
        ? OK
        : { ok: false, message: 'Expected a duration such as 30s or 2h' };
    case 'base64':
      return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)
        ? OK
        : { ok: false, message: 'Expected base64 characters only' };
    case 'regex':
      try {
        RegExp(value);
        return OK;
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Invalid expression' };
      }
    case 'enum':
      if (options.length === 0) return OK;
      return options.includes(value)
        ? OK
        : { ok: false, message: `Expected one of: ${options.join(', ')}` };
    default:
      return OK;
  }
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export function validateKey(key: string): ValidationResult {
  if (!key.trim()) return { ok: false, message: 'A key is required' };
  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      message: 'Use letters, digits, underscores and dots, starting with a letter or underscore',
    };
  }
  return OK;
}

export function normaliseKey(key: string): string {
  return key
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_.]/g, '');
}
