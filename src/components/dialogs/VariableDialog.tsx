import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { VAR_TYPES, VAR_TYPE_LABELS, normaliseKey, suggestType, validateKey, validateValue } from '@shared/env-types';
import type { EnvVar, GeneratedSecretKind, VarType } from '@shared/types';
import {
  Button,
  Input,
  Menu,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

const GENERATORS: Array<{ kind: GeneratedSecretKind; label: string }> = [
  { kind: 'password', label: 'Strong password' },
  { kind: 'hex', label: 'Hex (32 bytes)' },
  { kind: 'base64', label: 'Base64 (32 bytes)' },
  { kind: 'jwt-secret', label: 'JWT signing secret' },
  { kind: 'api-key', label: 'API key' },
  { kind: 'uuid', label: 'UUID v4' },
  { kind: 'pin', label: 'Numeric PIN' },
];

export function VariableDialog({
  open,
  variable,
  fileId,
  onClose,
}: {
  open: boolean;
  variable: EnvVar | null;
  fileId: string | null;
  onClose: () => void;
}): JSX.Element {
  const toast = useToast();
  const { setData } = useVault();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<VarType>('string');
  const [secret, setSecret] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');
  const [options, setOptions] = useState('');
  const [reveal, setReveal] = useState(false);
  const [typeTouched, setTypeTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKey(variable?.key ?? '');
    setValue(variable?.value ?? '');
    setType(variable?.type ?? 'string');
    setSecret(variable?.secret ?? false);
    setEnabled(variable?.enabled ?? true);
    setNote(variable?.note ?? '');
    setOptions(variable?.options.join(', ') ?? '');
    setReveal(!variable?.secret);
    setTypeTouched(Boolean(variable));
  }, [open, variable]);

  useEffect(() => {
    if (typeTouched || !key) return;
    setType(suggestType(key, value));
  }, [key, value, typeTouched]);

  const parsedOptions = useMemo(
    () =>
      options
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    [options],
  );

  const keyCheck = key ? validateKey(key) : { ok: true, message: '' };
  const valueCheck = validateValue(type, value, parsedOptions);
  const multiline = type === 'multiline' || type === 'json' || value.includes('\n');

  const generate = async (kind: GeneratedSecretKind): Promise<void> => {
    try {
      const generated = await getBridge().system.generateSecret(kind, 32);
      setValue(generated);
      setSecret(true);
      setReveal(true);
    } catch (err) {
      toast.error('Could not generate a value', errorMessage(err));
    }
  };

  const submit = async (): Promise<void> => {
    const check = validateKey(key);
    if (!check.ok) {
      toast.warning('That key is not valid', check.message);
      return;
    }
    setBusy(true);
    try {
      if (variable) {
        const next = await getBridge().vars.update(variable.id, {
          key: key.trim(),
          value,
          type,
          secret,
          enabled,
          note: note.trim(),
          options: parsedOptions,
        });
        setData(next);
        toast.success(`${key} saved`);
      } else {
        if (!fileId) {
          toast.warning('Pick a file first');
          return;
        }
        const result = await getBridge().vars.create({
          fileId,
          key: key.trim(),
          value,
          type,
          secret,
          enabled,
          note: note.trim(),
          options: parsedOptions,
        });
        setData(result.data);
        toast.success(`${key} added`);
      }
      onClose();
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Variable"
      title={variable ? `Edit ${variable.key}` : 'New variable'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()} disabled={!key.trim()}>
            {variable ? 'Save changes' : 'Add variable'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Key"
            value={key}
            autoFocus
            spellCheck={false}
            placeholder="DATABASE_URL"
            className="font-mono"
            error={key && !keyCheck.ok ? keyCheck.message : undefined}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            onBlur={() => setKey((k) => normaliseKey(k))}
          />
          <Select
            label="Type"
            value={type}
            searchable
            onChange={(next) => {
              setType(next);
              setTypeTouched(true);
            }}
            options={VAR_TYPES.map((t) => ({ value: t, label: VAR_TYPE_LABELS[t] }))}
          />
        </div>

        {multiline ? (
          <Textarea
            label="Value"
            value={value}
            rows={6}
            spellCheck={false}
            className="font-mono text-[13px]"
            error={valueCheck.ok ? undefined : valueCheck.message}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <Input
            label="Value"
            type={secret && !reveal ? 'password' : 'text'}
            value={value}
            spellCheck={false}
            className="font-mono"
            error={valueCheck.ok ? undefined : valueCheck.message}
            onChange={(e) => setValue(e.target.value)}
            trailing={
              <span className="flex items-center gap-0.5">
                {secret && (
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    aria-label={reveal ? 'Hide' : 'Reveal'}
                    className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
                <Menu
                  label="Generate a value"
                  width={220}
                  className="h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  trigger={<Wand2 size={14} />}
                  items={GENERATORS.map((g) => ({
                    key: g.kind,
                    label: g.label,
                    onSelect: () => void generate(g.kind),
                  }))}
                />
              </span>
            }
          />
        )}

        {type === 'enum' && (
          <Input
            label="Allowed values"
            value={options}
            hint="Separate the choices with commas"
            onChange={(e) => setOptions(e.target.value)}
          />
        )}

        <Textarea
          label="Note"
          value={note}
          rows={2}
          placeholder="Why this exists, where it comes from"
          hint="Notes are written as comments when the file is rendered"
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2 dark:border-slate-800 dark:bg-slate-800/30">
          <Switch
            checked={secret}
            onChange={(next) => {
              setSecret(next);
              setReveal(!next);
            }}
            size="sm"
            label="Treat as a secret"
            description="Masked in lists and can be left out of exports."
          />
          <Switch
            checked={enabled}
            onChange={setEnabled}
            size="sm"
            label="Active"
            description="Inactive variables are written as comments."
          />
        </div>
      </div>
    </Modal>
  );
}
