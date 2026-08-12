import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, KeyRound, Search } from 'lucide-react';
import { searchVault } from '@shared/tree';
import { VAR_TYPE_LABELS } from '@shared/env-types';
import {
  Badge,
  Card,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  SegmentedControl,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { maskValue, truncateMiddle } from '@/lib/format';
import { useVault } from '@/lib/vault';

type Scope = 'workspace' | 'all';

export function SearchPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, activeWorkspace } = useVault();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('workspace');
  const [revealed, setRevealed] = useState<string[]>([]);

  useEffect(() => {
    setRevealed([]);
  }, [query, scope]);

  const hits = useMemo(() => {
    const all = searchVault(data, query, 400);
    if (scope === 'all' || !activeWorkspace) return all;
    return all.filter((hit) => hit.workspaceId === activeWorkspace.id);
  }, [data, query, scope, activeWorkspace]);

  const copy = async (value: string, key: string): Promise<void> => {
    try {
      await getBridge().system.copySecret(value, data.settings.clipboardClearSeconds);
      toast.success(`${key} copied`);
    } catch (err) {
      toast.error('Could not copy', errorMessage(err));
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow="Search"
        title="Search variables"
        description="Look through keys, values, notes and paths across your projects."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-lg">
          <Input
            size="lg"
            value={query}
            autoFocus
            placeholder="DATABASE_URL, postgres://, stripe…"
            leading={<Search size={16} />}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SegmentedControl
          value={scope}
          onChange={setScope}
          items={[
            { value: 'workspace', label: activeWorkspace?.name ?? 'This workspace' },
            { value: 'all', label: 'Every workspace' },
          ]}
        />
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Values of variables marked as secret are not searched. Search their key or note instead.
      </p>

      {query.trim() === '' ? (
        <Card className="mt-5" padding="none">
          <EmptyState
            icon={<Search size={20} />}
            title="Start typing"
            description="Results appear as you type. Press ⌘K anywhere for the quick switcher."
          />
        </Card>
      ) : hits.length === 0 ? (
        <Card className="mt-5" padding="none">
          <EmptyState
            icon={<Search size={20} />}
            title="Nothing matched"
            description={`No variable matched “${query}” in ${scope === 'all' ? 'any workspace' : (activeWorkspace?.name ?? 'this workspace')}.`}
          />
        </Card>
      ) : (
        <Card className="mt-5" padding="none">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
            <Badge variant="brand">{hits.length} results</Badge>
            <span className="text-[11px] text-slate-400">Click a row to open it in the vault</span>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>Value</TH>
                <TH>Location</TH>
                <TH className="w-28">Matched</TH>
                <TH align="end" className="w-24">
                  Actions
                </TH>
              </TR>
            </THead>
            <TBody>
              {hits.map((hit) => {
                const isRevealed = revealed.includes(hit.varId);
                const hide = hit.secret && data.settings.maskSecrets && !isRevealed;
                return (
                  <TR
                    key={hit.varId}
                    clickable
                    onClick={() => navigate(`/vault?file=${hit.fileId}&var=${hit.varId}`)}
                  >
                    <TD>
                      <div className="flex items-center gap-1.5">
                        {hit.secret && (
                          <KeyRound
                            size={11}
                            className="shrink-0 text-accent-600 dark:text-accent-400"
                          />
                        )}
                        <span className="mono-value text-[12.5px] font-medium text-slate-800 dark:text-slate-100">
                          {hit.key}
                        </span>
                      </div>
                    </TD>
                    <TD className="mono-value text-[12px] text-slate-500 dark:text-slate-400">
                      {hide ? maskValue(hit.value) : truncateMiddle(hit.value || '—', 44)}
                    </TD>
                    <TD className="text-[12px] text-slate-500 dark:text-slate-400">
                      {truncateMiddle(hit.path, 52)}
                    </TD>
                    <TD>
                      <Badge variant="neutral">{hit.matchedIn}</Badge>
                    </TD>
                    <TD align="end">
                      <div
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {hit.secret && (
                          <IconButton
                            size="sm"
                            label={isRevealed ? 'Hide' : 'Reveal'}
                            icon={isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            onClick={() =>
                              setRevealed((prev) =>
                                prev.includes(hit.varId)
                                  ? prev.filter((id) => id !== hit.varId)
                                  : [...prev, hit.varId],
                              )
                            }
                          />
                        )}
                        <IconButton
                          size="sm"
                          label="Copy value"
                          icon={<Copy size={13} />}
                          onClick={() => void copy(hit.value, hit.key)}
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="border-t border-slate-100 px-6 py-2 text-[11px] text-slate-400 dark:border-slate-800">
            Types shown in the vault: {Object.values(VAR_TYPE_LABELS).slice(0, 6).join(', ')} and
            more
          </div>
        </Card>
      )}
    </div>
  );
}
