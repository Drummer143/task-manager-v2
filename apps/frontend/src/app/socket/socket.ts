import type { User } from 'oidc-client-ts';
import { Channel, Socket } from 'phoenix';
import { useSocketStore } from './store';
import { userManager } from '../auth/user-manager';

export type ChannelId = 'notifications';

interface ChannelData {
  connections: number;
  channel: Channel;
  joinHandlers: Array<() => void>;
  errorHandlers: Array<() => void>;
}

interface SocketEventsMap {
  notifications: {
    new_notification: unknown;
  };
}

interface SubscribeOptions<
  Id extends ChannelId,
  Type extends keyof SocketEventsMap[Id] & string,
> {
  channelId: Id;
  type: Type;

  onMessage: (message: SocketEventsMap[Id][Type]) => void;

  onJoin?: () => void;

  onError?: () => void;
}

const channelsMap = new Map<ChannelId, ChannelData>();

let socket: Socket | null = null;

// The latest token of the signed-in user. Every (re)connect reads it, so a renewed token is
// picked up without recreating the socket
let accessToken = '';

const init = () => {
  if (socket) {
    return;
  }

  const endpoint = `${import.meta.env.VITE_SOCKET_URL.replace(/\/+$/, '')}/socket`;
  const s = new Socket(endpoint, {
    params: () => ({ token: accessToken }),
  });

  s.connect();

  useSocketStore.setState({ status: 'connecting' });

  s.onOpen(() => {
    if (socket === s) {
      useSocketStore.setState({ status: 'connected' });
    }
  });

  s.onError(() => {
    if (socket === s) {
      useSocketStore.setState({ status: 'connecting' });
    }
  });

  s.onClose(() => {
    if (socket === s) {
      useSocketStore.setState({ status: 'connecting' });
    }
  });

  socket = s;
};

export const disconnect = () => {
  if (socket) {
    socket.disconnect();
    channelsMap.clear();
    socket = null;
    useSocketStore.setState({ status: 'disconnected' });
  }
};

export const subscribe = <
  Id extends ChannelId,
  Type extends keyof SocketEventsMap[Id] & string,
>(
  options: SubscribeOptions<Id, Type>,
) => {
  if (!socket) {
    throw new Error('Socket is not initialized');
  }

  const channelData = channelsMap.get(options.channelId);

  let channel: Channel;

  if (!channelData) {
    const c = socket.channel(options.channelId);

    const data: ChannelData = {
      channel: c,
      connections: 1,
      joinHandlers: options.onJoin ? [options.onJoin] : [],
      errorHandlers: options.onError ? [options.onError] : [],
    };

    channelsMap.set(options.channelId, data);

    channel = c;

    channel.join().receive('ok', () => {
      data.joinHandlers.forEach((handler) => handler());
    });

    channel.onError(() => {
      data.errorHandlers.forEach((handler) => handler());
    });
  } else {
    channel = channelData.channel;
    channelData.connections++;

    if (options.onJoin) {
      if (channel.state === 'joined') {
        options.onJoin();
      }

      channelData.joinHandlers.push(options.onJoin);
    }

    if (options.onError) {
      channelData.errorHandlers.push(options.onError);
    }
  }

  const ref = channel.on(options.type, options.onMessage);

  return () => {
    const channelData = channelsMap.get(options.channelId);

    if (!channelData) return;

    if (channelData.connections > 1) {
      channelData.connections--;
      channelData.channel.off(options.type, ref);
      channelData.joinHandlers = channelData.joinHandlers.filter(
        (handler) => handler !== options.onJoin,
      );
      channelData.errorHandlers = channelData.errorHandlers.filter(
        (handler) => handler !== options.onError,
      );
      return;
    }

    channelData.channel.leave();
    channelsMap.delete(options.channelId);
  };
};

export const startRealtime = () => {
  let stopped = false;

  const sync = (user: User | null) => {
    if (stopped) return;

    if (user && !user.expired) {
      accessToken = user.access_token;
      init();
    } else {
      accessToken = '';
      disconnect();
    }
  };

  const signedOut = () => sync(null);

  const syncFromStore = () => {
    userManager.getUser().then(sync, signedOut);
  };

  userManager.events.addUserLoaded(sync);
  userManager.events.addUserUnloaded(signedOut);
  window.addEventListener('storage', syncFromStore);
  syncFromStore();

  return () => {
    stopped = true;
    userManager.events.removeUserLoaded(sync);
    userManager.events.removeUserUnloaded(signedOut);
    window.removeEventListener('storage', syncFromStore);
    disconnect();
  };
};

// The socket and its channels belong to one instance of this module: a hot swap would leave the
// old connection open next to an empty registry, so an edit here reloads the page instead
import.meta.hot?.accept(() => window.location.reload());
