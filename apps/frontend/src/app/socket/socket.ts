import type { User } from 'oidc-client-ts';
import { Channel, Socket } from 'phoenix';
import { useSocketStore } from './store';
import { userManager } from '../auth/user-manager';
import type { InboxUpdated } from '@task-manager-v2/api/main/schemas';

export type ChannelId = 'notifications';

interface SocketEventsMap {
  notifications: {
    /** What a change did to the user's Inbox (main-service `notifications/updates.rs`). */
    'inbox.updated': InboxUpdated;
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

/** One subscriber: what it listens to, and its binding on the live channel, if there is one. */
interface Subscription {
  type: string;
  onMessage: (message: never) => void;
  onJoin?: () => void;
  onError?: () => void;
  ref?: number;
}

/**
 * Who wants each channel. It outlives the socket: a subscriber that came before the socket (the
 * session is still being read) waits here, and one mounted across a sign-out and a sign-in gets
 * its channel back on the new socket.
 */
const subscriptions = new Map<ChannelId, Set<Subscription>>();

/** The live channels: on the current socket only, gone with it. */
const channels = new Map<ChannelId, Channel>();

const bind = (channel: Channel, subscription: Subscription) => {
  subscription.ref = channel.on(
    subscription.type,
    subscription.onMessage as (message: unknown) => void,
  );
};

/** Opens the channel for its subscribers, once there is a socket and while anyone wants it. */
const open = (id: ChannelId) => {
  const wanted = subscriptions.get(id);

  if (!socket || channels.has(id) || !wanted?.size) {
    return;
  }

  const channel = socket.channel(id);

  channels.set(id, channel);
  wanted.forEach((subscription) => bind(channel, subscription));

  // The current subscribers at the time of each join: Phoenix rejoins after a dropped connection
  channel.join().receive('ok', () => {
    subscriptions.get(id)?.forEach((subscription) => subscription.onJoin?.());
  });

  channel.onError(() => {
    subscriptions.get(id)?.forEach((subscription) => subscription.onError?.());
  });
};

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

  subscriptions.forEach((_, id) => open(id));
};

export const disconnect = () => {
  if (socket) {
    socket.disconnect();
    // The channels die with the socket; their subscribers stay for the next one
    channels.clear();
    socket = null;
    useSocketStore.setState({ status: 'disconnected' });
  }
};

/**
 * Listens to `type` on a channel until the returned function is called. Works before the socket
 * exists: the subscription waits and the channel opens once the session is read and the socket
 * connects. Subscribers of one channel share it; the last one to leave closes it.
 */
export const subscribeToChannel = <
  Id extends ChannelId,
  Type extends keyof SocketEventsMap[Id] & string,
>(
  options: SubscribeOptions<Id, Type>,
) => {
  const subscription: Subscription = {
    type: options.type,
    onMessage: options.onMessage as (message: never) => void,
    onJoin: options.onJoin,
    onError: options.onError,
  };

  const wanted = subscriptions.get(options.channelId) ?? new Set();

  wanted.add(subscription);
  subscriptions.set(options.channelId, wanted);

  const channel = channels.get(options.channelId);

  if (channel) {
    bind(channel, subscription);

    // It joined before this subscriber came: tell it at once, as the earlier ones were told
    if (channel.state === 'joined') {
      options.onJoin?.();
    }
  } else {
    open(options.channelId);
  }

  return () => {
    wanted.delete(subscription);

    const live = channels.get(options.channelId);

    if (live && subscription.ref !== undefined) {
      live.off(subscription.type, subscription.ref);
    }

    if (wanted.size > 0) {
      return;
    }

    subscriptions.delete(options.channelId);

    if (live) {
      live.leave();
      channels.delete(options.channelId);
    }
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
