import type { TreeNode } from '@shared/types';

export type Location = { kind: 'root' } | { kind: 'workspace' | 'project' | 'folder'; id: string };

export const ROOT: Location = { kind: 'root' };

export function sameLocation(a: Location, b: Location): boolean {
  if (a.kind === 'root' || b.kind === 'root') return a.kind === b.kind;
  return a.kind === b.kind && a.id === b.id;
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function chainTo(nodes: TreeNode[], id: string): TreeNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const deeper = chainTo(node.children, id);
    if (deeper.length > 0) return [node, ...deeper];
  }
  return [];
}

export function locationOf(node: TreeNode): Location {
  if (node.kind === 'file') return ROOT;
  return { kind: node.kind, id: node.id };
}

export function childrenAt(nodes: TreeNode[], location: Location): TreeNode[] {
  if (location.kind === 'root') return nodes;
  return findNode(nodes, location.id)?.children ?? [];
}

export function breadcrumbsFor(nodes: TreeNode[], location: Location): TreeNode[] {
  if (location.kind === 'root') return [];
  return chainTo(nodes, location.id);
}

export function parentLocation(nodes: TreeNode[], location: Location): Location | null {
  if (location.kind === 'root') return null;
  const chain = chainTo(nodes, location.id);
  if (chain.length <= 1) return ROOT;
  const parent = chain[chain.length - 2];
  return locationOf(parent);
}

export function locationExists(nodes: TreeNode[], location: Location): boolean {
  if (location.kind === 'root') return true;
  return findNode(nodes, location.id) !== null;
}

export function locationForFile(nodes: TreeNode[], fileId: string): Location {
  const chain = chainTo(nodes, fileId);
  if (chain.length <= 1) return ROOT;
  return locationOf(chain[chain.length - 2]);
}
