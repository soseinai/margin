import type { Extension } from '@codemirror/state';
import { yCollab } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { SOSEIN_BODY_TEXT_NAME, soseinWebSocketBaseUrl } from './sosein-cloud';

export type SoseinSyncStatus = 'ticket' | 'connecting' | 'connected' | 'disconnected' | 'syncing' | 'synced' | 'error';

export type SoseinCodeMirrorSync = {
  documentId: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: WebsocketProvider;
  extension: Extension;
  destroy: () => void;
};

export async function createSoseinCodeMirrorSync(args: {
  serverUrl: string;
  documentId: string;
  issueSyncTicket: () => Promise<string>;
  userName?: string;
  onStatus?: (status: SoseinSyncStatus) => void;
  onError?: (error: unknown) => void;
}): Promise<SoseinCodeMirrorSync> {
  args.onStatus?.('ticket');

  const ticket = await args.issueSyncTicket();
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText(SOSEIN_BODY_TEXT_NAME);
  const provider = new WebsocketProvider(
    soseinWebSocketBaseUrl(args.serverUrl),
    `v1/documents/${args.documentId}/sync`,
    ydoc,
    {
      connect: false,
      params: { ticket }
    }
  );

  let destroyed = false;
  let refreshingTicket = false;

  provider.awareness.setLocalStateField('user', { name: args.userName || 'Margin' });

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
