import { connect } from '../core/client';
import { restoreRevision } from '../core/mutations';
import { c, truncate } from '../ui/colors';
import { failure, heading, info, print, success, table } from '../ui/output';
import { confirm, isInteractive, select, type Choice } from '../ui/prompt';
import { flagBool, flagString, type ParsedArgs } from '../core/args';

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export async function history(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;
  const filter = args.positional[0]?.toLowerCase();
  const limit = Number(flagString(args, 'limit', 'n') ?? 30);

  const rows = data.revisions
    .filter((revision) =>
      filter
        ? revision.label.toLowerCase().includes(filter) ||
          revision.path.toLowerCase().includes(filter)
        : true,
    )
    .slice(0, Number.isFinite(limit) ? limit : 30);

  heading('History', filter ? `matching "${filter}"` : `${data.revisions.length} entries recorded`);

  if (rows.length === 0) {
    info('Nothing recorded yet');
    return 0;
  }

  table(
    ['id', 'when', 'what', 'where', 'from'],
    rows.map((revision) => [
      c.grey(revision.id.slice(0, 8)),
      relative(revision.at),
      `${colourKind(revision.kind)} ${revision.label}`,
      c.grey(truncate(revision.path, 44)),
      revision.source === 'cli' ? c.cyan('cli') : c.grey(revision.source),
    ]),
    [10, 12, 34, 46, 8],
  );

  print();
  info('Restore one with', 'fuse restore <id>');
  return 0;
}

function colourKind(kind: string): string {
  if (kind === 'create' || kind === 'restore') return c.green(kind);
  if (kind === 'delete') return c.red(kind);
  if (kind === 'import') return c.yellow(kind);
  return c.blue(kind);
}

export async function restore(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  let id = args.positional[0];
  if (!id) {
    if (!isInteractive()) {
      failure('Give an entry id: fuse restore 3f2a91c4');
      return 1;
    }
    if (data.revisions.length === 0) {
      info('Nothing has been recorded yet');
      return 0;
    }
    id = await select<string>(
      'Which change should be put back?',
      data.revisions.slice(0, 60).map<Choice<string>>((revision) => ({
        value: revision.id,
        label: `${colourKind(revision.kind)} ${revision.label}`,
        hint: `${relative(revision.at)} · ${truncate(revision.path, 40)}`,
      })),
      { filterable: true },
    );
  }

  const revision =
    data.revisions.find((r) => r.id === id) ?? data.revisions.find((r) => r.id.startsWith(id));
  if (!revision) {
    failure(`No history entry starts with "${id}"`);
    return 1;
  }

  if (!flagBool(args, 'yes', 'y') && isInteractive()) {
    const ok = await confirm(
      `Put back the state of ${revision.label} from ${relative(revision.at)}?`,
      true,
    );
    if (!ok) return 0;
  }

  await client.save((draft) => {
    restoreRevision(draft, revision.id);
  });

  success('Restored', `${revision.label} is back to how it was ${relative(revision.at)}`);
  return 0;
}
