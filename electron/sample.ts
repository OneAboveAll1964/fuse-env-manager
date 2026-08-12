import { randomUUID } from 'node:crypto';
import { emptyVault } from '../shared/defaults';
import { generateSecret } from '../shared/vault-crypto';
import { looksSecret, suggestType } from '../shared/env-types';
import type { EnvFolder, EnvVar, Project, Tone, VaultData, Workspace } from '../shared/types';

type Seed = {
  workspace: string;
  tone: Tone;
  icon: string;
  description: string;
  projects: Array<{
    name: string;
    icon: string;
    tone: Tone;
    description: string;
    tags: string[];
    folders: Array<{
      name: string;
      tone: Tone;
      files: Array<{ name: string; vars: Array<[string, string]> }>;
    }>;
  }>;
};

const SEEDS: Seed[] = [
  {
    workspace: 'Acme Studio',
    tone: 'brand',
    icon: 'Building2',
    description: 'Client work and internal services',
    projects: [
      {
        name: 'Storefront API',
        icon: 'Server',
        tone: 'brand',
        description: 'Node service behind the shop',
        tags: ['node', 'api'],
        folders: [
          {
            name: 'development',
            tone: 'emerald',
            files: [
              {
                name: '.env',
                vars: [
                  ['NODE_ENV', 'development'],
                  ['PORT', '4000'],
                  ['DATABASE_URL', 'postgres://acme:acme@localhost:5432/storefront_dev'],
                  ['REDIS_URL', 'redis://localhost:6379'],
                  ['JWT_SECRET', generateSecret('jwt-secret')],
                  ['LOG_LEVEL', 'debug'],
                  ['ENABLE_PLAYGROUND', 'true'],
                ],
              },
            ],
          },
          {
            name: 'production',
            tone: 'rose',
            files: [
              {
                name: '.env',
                vars: [
                  ['NODE_ENV', 'production'],
                  ['PORT', '8080'],
                  ['DATABASE_URL', 'postgres://acme:REPLACE_ME@db.internal:5432/storefront'],
                  ['REDIS_URL', 'rediss://cache.internal:6380'],
                  ['JWT_SECRET', generateSecret('jwt-secret')],
                  ['LOG_LEVEL', 'warn'],
                  ['SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0'],
                  ['ENABLE_PLAYGROUND', 'false'],
                ],
              },
              {
                name: 'worker.env',
                vars: [
                  ['QUEUE_CONCURRENCY', '8'],
                  ['QUEUE_TIMEOUT', '30s'],
                  ['STRIPE_SECRET_KEY', generateSecret('api-key')],
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Storefront Web',
        icon: 'Monitor',
        tone: 'violet',
        description: 'Vite front end',
        tags: ['react', 'vite'],
        folders: [
          {
            name: 'development',
            tone: 'emerald',
            files: [
              {
                name: '.env.local',
                vars: [
                  ['VITE_API_URL', 'http://localhost:4000'],
                  ['VITE_SENTRY_ENABLED', 'false'],
                  ['VITE_FEATURE_FLAGS', 'checkout,wishlist'],
                ],
              },
            ],
          },
          {
            name: 'production',
            tone: 'rose',
            files: [
              {
                name: '.env.production',
                vars: [
                  ['VITE_API_URL', 'https://api.acme.example'],
                  ['VITE_SENTRY_ENABLED', 'true'],
                  ['VITE_FEATURE_FLAGS', 'checkout'],
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    workspace: 'Side projects',
    tone: 'accent',
    icon: 'Rocket',
    description: 'Personal experiments',
    projects: [
      {
        name: 'Weekend Bot',
        icon: 'Bot',
        tone: 'teal',
        description: 'Small Telegram helper',
        tags: ['bot'],
        folders: [
          {
            name: 'development',
            tone: 'emerald',
            files: [
              {
                name: '.env',
                vars: [
                  ['TELEGRAM_TOKEN', generateSecret('api-key')],
                  ['POLL_INTERVAL', '15s'],
                  ['ADMIN_CHAT_ID', '123456789'],
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export function seedSampleVault(): VaultData {
  const data = emptyVault();
  const now = new Date().toISOString();

  SEEDS.forEach((seed, workspaceIndex) => {
    const workspace: Workspace = {
      id: randomUUID(),
      name: seed.workspace,
      description: seed.description,
      tone: seed.tone,
      icon: seed.icon,
      order: workspaceIndex,
      createdAt: now,
      updatedAt: now,
    };
    data.workspaces.push(workspace);

    seed.projects.forEach((projectSeed, projectIndex) => {
      const project: Project = {
        id: randomUUID(),
        workspaceId: workspace.id,
        name: projectSeed.name,
        description: projectSeed.description,
        tone: projectSeed.tone,
        icon: projectSeed.icon,
        tags: projectSeed.tags,
        links: [],
        order: projectIndex,
        createdAt: now,
        updatedAt: now,
      };
      data.projects.push(project);

      projectSeed.folders.forEach((folderSeed, folderIndex) => {
        const folder: EnvFolder = {
          id: randomUUID(),
          projectId: project.id,
          parentId: null,
          name: folderSeed.name,
          description: '',
          tone: folderSeed.tone,
          order: folderIndex,
          createdAt: now,
          updatedAt: now,
        };
        data.folders.push(folder);

        folderSeed.files.forEach((fileSeed, fileIndex) => {
          const fileId = randomUUID();
          data.files.push({
            id: fileId,
            projectId: project.id,
            folderId: folder.id,
            name: fileSeed.name,
            description: '',
            format: 'dotenv',
            order: fileIndex,
            createdAt: now,
            updatedAt: now,
          });

          fileSeed.vars.forEach(([key, value], varIndex) => {
            const variable: EnvVar = {
              id: randomUUID(),
              fileId,
              key,
              value,
              type: suggestType(key, value),
              secret: looksSecret(key),
              enabled: true,
              note: '',
              options: [],
              order: varIndex,
              createdAt: now,
              updatedAt: now,
            };
            data.vars.push(variable);
          });
        });
      });
    });
  });

  data.settings.activeWorkspaceId = data.workspaces[0]?.id ?? null;
  return data;
}
