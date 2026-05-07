import type { Extension } from '@codemirror/state';
import { yCollab } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { SOSEIN_BODY_TEXT_NAME, soseinWebSocketBaseUrl } from './sosein-cloud';

export type SoseinSyncStatus = 'ticket' | 'connecting' | 'connected' | 'disconnected' | 'syncing' | 'synced' | 'error';

export type SoseinSyncProvider = {
  awareness: Awareness;
  params: { ticket?: string };
  wsconnected: boolean;
  connect: () => void;
  disconnect: () => void;
  destroy: () => void;
  on: (eventName: string, handler: (...args: any[]) => void) => void;
};

export type SoseinSyncProviderFactory = (args: {
  serverUrl: string;
  room: string;
  documentId: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  ticket: string;
}) => SoseinSyncProvider;

export type SoseinCodeMirrorSync = {
  documentId: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: SoseinSyncProvider;
  extension: Extension;
  destroy: () => void;
};

export async function createSoseinCodeMirrorSync(args: {
  serverUrl: string;
  documentId: string;
  issueSyncTicket: () => Promise<string>;
  providerFactory?: SoseinSyncProviderFactory;
  userName?: string;
  userImage?: string;
  onStatus?: (status: SoseinSyncStatus) => void;
  onError?: (error: unknown) => void;
}): Promise<SoseinCodeMirrorSync> {
  args.onStatus?.('ticket');

  const ticket = await args.issueSyncTicket();
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText(SOSEIN_BODY_TEXT_NAME);
  const room = `v1/documents/${args.documentId}/sync`;
  const awareness = new Awareness(ydoc);
  const providerFactory = args.providerFactory ?? testProviderFactory() ?? defaultProviderFactory;
  const provider = providerFactory({
    serverUrl: args.serverUrl,
    room,
    documentId: args.documentId,
    ydoc,
    awareness,
    ticket
  });

  let destroyed = false;
  let refreshingTicket = false;

  provider.awareness.setLocalStateField('user', {
    name: args.userName || 'Margin',
    ...(args.userImage ? { image: args.userImage } : {})
  });

  const refreshTicketAndReconnect = async () => {
    if (destroyed || refreshingTicket) return;

    refreshingTicket = true;
    provider.disconnect();
    args.onStatus?.('ticket');

    try {
      provider.params.ticket = await args.issueSyncTicket();
      if (destroyed) return;

      args.onStatus?.('connecting');
      provider.connect();
    } catch(err) {
      if (!destroyed) {
        args.onStatus?.('error');
        args.onError?.(err);
      }
    } finally {
      refreshingTicket = false;
    }
  };

  provider.on('status', ({ status }: { status: 'connected' | 'disconnected' | 'connecting' }) => {
    args.onStatus?.(status);

    if (status === 'disconnected') {
      void refreshTicketAndReconnect();
    }
  });

  provider.on('connection-close', () => {
    globalThis.setTimeout(() => {
      if (!provider.wsconnected) void refreshTicketAndReconnect();
    }, 0);
  });

  provider.on('connection-error', (event: Event) => {
    args.onError?.(event);
  });

  provider.on('sync', (synced: boolean) => {
    args.onStatus?.(synced ? 'synced' : 'syncing');
  });

  const extension = yCollab(ytext, provider.awareness);

  args.onStatus?.('connecting');
  provider.connect();

  return {
    documentId: args.documentId,
    ydoc,
    ytext,
    provider,
    extension,
    destroy() {
      destroyed = true;
      provider.destroy();
      ydoc.destroy();
    }
  };
}

const defaultProviderFactory: SoseinSyncProviderFactory = ({ serverUrl, room, ydoc, ticket }) =>
  new WebsocketProvider(soseinWebSocketBaseUrl(serverUrl), room, ydoc, {
    connect: false,
    params: { ticket }
  }) as SoseinSyncProvider;

function testProviderFactory() {
  return (
    globalThis as typeof globalThis & {
      __marginSoseinSyncProviderFactory?: SoseinSyncProviderFactory;
    }
  ).__marginSoseinSyncProviderFactory;
}
