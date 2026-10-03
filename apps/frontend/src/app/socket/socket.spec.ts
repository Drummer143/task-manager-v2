import type { User } from 'oidc-client-ts';

import { userManager } from '../auth/user-manager';
import { startRealtime, subscribe } from './socket';
import { useSocketStore } from './store';

// A stand-in for phoenix.js: records what the module asks of it and lets a test play the server
const fake = vi.hoisted(() => {
  type Callback = (payload?: unknown) => void;

  class FakePush {
    private okCallbacks: Callback[] = [];

    receive(status: string, callback: Callback) {
      if (status === 'ok') this.okCallbacks.push(callback);
      return this;
    }

    ok() {
      this.okCallbacks.forEach((callback) => callback());
    }
  }

  class FakeChannel {
    state = 'closed';
    readonly joinPush = new FakePush();
    readonly join = vi.fn(() => {
      this.state = 'joining';
      return this.joinPush;
    });
    readonly leave = vi.fn(() => {
      this.state = 'leaving';
    });
    private bindings: { event: string; ref: number; callback: Callback }[] = [];
    private errorCallbacks: Callback[] = [];
    private nextRef = 0;

    constructor(readonly topic: string) {}

    on(event: string, callback: Callback) {
      const ref = this.nextRef++;
      this.bindings.push({ event, ref, callback });
      return ref;
    }

    off(event: string, ref?: number) {
      this.bindings = this.bindings.filter((b) => b.event !== event || (ref !== undefined && b.ref !== ref));
    }

    onError(callback: Callback) {
      this.errorCallbacks.push(callback);
    }

    /** The server accepted the join (also after a rejoin). */
    joined() {
      this.state = 'joined';
      this.joinPush.ok();
    }

    /** The connection under the channel dropped. */
    errored() {
      this.state = 'errored';
      this.errorCallbacks.forEach((callback) => callback());
    }

    emit(event: string, payload: unknown) {
      this.bindings.filter((b) => b.event === event).forEach((b) => b.callback(payload));
    }
  }

  class FakeSocket {
    static instances: FakeSocket[] = [];
    readonly channels: FakeChannel[] = [];
    readonly connect = vi.fn();
    readonly disconnect = vi.fn();
    private callbacks = { open: [] as Callback[], error: [] as Callback[], close: [] as Callback[] };

    constructor(
      readonly url: string,
      readonly options: { params: () => { token: string } },
    ) {
      FakeSocket.instances.push(this);
    }

    channel(topic: string) {
      const channel = new FakeChannel(topic);
      this.channels.push(channel);
      return channel;
    }

    onOpen(callback: Callback) {
      this.callbacks.open.push(callback);
    }

    onError(callback: Callback) {
      this.callbacks.error.push(callback);
    }

    onClose(callback: Callback) {
      this.callbacks.close.push(callback);
    }

    /** The token the next (re)connect would send. */
    token() {
      return this.options.params().token;
    }

    fire(kind: 'open' | 'error' | 'close') {
      this.callbacks[kind].forEach((callback) => callback());
    }
  }

  return { FakeSocket };
});

vi.mock('phoenix', () => ({ Socket: fake.FakeSocket }));

const { FakeSocket } = fake;

const user = (accessToken: string, expired = false) => ({ access_token: accessToken, expired }) as User;

/** Lets `getUser()` and the event handlers that await it settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const status = () => useSocketStore.getState().status;

const lastSocket = () => {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error('No socket was created');
  return socket;
};

let stop: (() => void) | undefined;

/** Starts with `stored` in storage and waits until the startup check is done. */
const start = async (stored: User | null) => {
  vi.spyOn(userManager, 'getUser').mockResolvedValue(stored);
  stop = startRealtime();
  await settle();
};

const onMessage = () => vi.fn<(message: unknown) => void>();

afterEach(() => {
  stop?.();
  stop = undefined;
  FakeSocket.instances = [];
  useSocketStore.setState({ status: 'disconnected' });
  vi.restoreAllMocks();
});

describe('startRealtime', () => {
  it('connects at startup when a signed-in user is already in storage', async () => {
    await start(user('stored'));

    expect(FakeSocket.instances).toHaveLength(1);
    expect(lastSocket().connect).toHaveBeenCalledTimes(1);
    expect(lastSocket().token()).toBe('stored');
    expect(status()).toBe('connecting');
  });

  it('stays disconnected without a user, with an expired one, or when storage cannot be read', async () => {
    await start(null);
    stop?.();

    await start(user('old', true));
    stop?.();

    vi.spyOn(userManager, 'getUser').mockRejectedValue(new Error('broken storage'));
    stop = startRealtime();
    await settle();

    expect(FakeSocket.instances).toHaveLength(0);
    expect(status()).toBe('disconnected');
  });

  it('connects on sign-in and reconnects with a renewed token without a new socket', async () => {
    await start(null);

    await userManager.events.load(user('first'));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(lastSocket().token()).toBe('first');

    await userManager.events.load(user('renewed'));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(lastSocket().token()).toBe('renewed');
  });

  it('disconnects on sign-out', async () => {
    await start(user('stored'));
    const socket = lastSocket();

    await userManager.events.unload();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(status()).toBe('disconnected');
  });

  it('follows other tabs through storage: their sign-out and their renewed token', async () => {
    await start(user('stored'));
    const getUser = vi.spyOn(userManager, 'getUser');

    getUser.mockResolvedValue(user('renewed elsewhere'));
    window.dispatchEvent(new StorageEvent('storage'));
    await settle();
    expect(lastSocket().token()).toBe('renewed elsewhere');

    getUser.mockResolvedValue(null);
    window.dispatchEvent(new StorageEvent('storage'));
    await settle();
    expect(lastSocket().disconnect).toHaveBeenCalledTimes(1);
    expect(status()).toBe('disconnected');
  });

  it('stops: disconnects and no longer follows the session', async () => {
    await start(user('stored'));
    const socket = lastSocket();

    stop?.();
    stop = undefined;
    expect(socket.disconnect).toHaveBeenCalledTimes(1);

    await userManager.events.load(user('later'));
    window.dispatchEvent(new StorageEvent('storage'));
    await settle();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('ignores a startup check that resolves after it was stopped', async () => {
    let resolve: (user: User | null) => void = () => undefined;
    vi.spyOn(userManager, 'getUser').mockReturnValue(new Promise((r) => (resolve = r)));

    startRealtime()();
    resolve(user('too late'));
    await settle();

    expect(FakeSocket.instances).toHaveLength(0);
  });
});

describe('status', () => {
  it('is connected when open and connecting while phoenix reconnects', async () => {
    await start(user('stored'));
    const socket = lastSocket();

    socket.fire('open');
    expect(status()).toBe('connected');

    socket.fire('error');
    expect(status()).toBe('connecting');

    socket.fire('open');
    socket.fire('close');
    expect(status()).toBe('connecting');
  });

  it('is not overwritten by a socket that was already closed', async () => {
    await start(user('first'));
    const old = lastSocket();

    await userManager.events.unload();
    // The closed socket reports late, after the sign-out
    old.fire('close');
    expect(status()).toBe('disconnected');

    await userManager.events.load(user('second'));
    lastSocket().fire('open');
    old.fire('error');
    old.fire('close');
    expect(status()).toBe('connected');
  });
});

describe('subscribe', () => {
  it('throws before the socket exists', async () => {
    await start(null);

    expect(() => subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() })).toThrow(
      'Socket is not initialized',
    );
  });

  it('shares one channel per topic and joins it once', async () => {
    await start(user('stored'));

    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() });
    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() });

    const channels = lastSocket().channels;
    expect(channels).toHaveLength(1);
    expect(channels[0].topic).toBe('notifications');
    expect(channels[0].join).toHaveBeenCalledTimes(1);
  });

  it('delivers messages to every subscriber until it unsubscribes', async () => {
    await start(user('stored'));
    const first = onMessage();
    const second = onMessage();

    const unsubscribeFirst = subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: first });
    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: second });
    const [channel] = lastSocket().channels;

    channel.emit('new_notification', { id: 'n1' });
    channel.emit('some_other_event', { id: 'n2' });
    expect(first).toHaveBeenCalledExactlyOnceWith({ id: 'n1' });
    expect(second).toHaveBeenCalledExactlyOnceWith({ id: 'n1' });

    unsubscribeFirst();
    channel.emit('new_notification', { id: 'n3' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith({ id: 'n3' });
    expect(channel.leave).not.toHaveBeenCalled();
  });

  it('calls onJoin on every join, and at once for a subscriber that comes after it', async () => {
    await start(user('stored'));
    const early = vi.fn();
    const whileJoining = vi.fn();
    const late = vi.fn();

    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage(), onJoin: early });
    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage(), onJoin: whileJoining });
    const [channel] = lastSocket().channels;
    expect(early).not.toHaveBeenCalled();
    expect(whileJoining).not.toHaveBeenCalled();

    channel.joined();
    expect(early).toHaveBeenCalledTimes(1);
    expect(whileJoining).toHaveBeenCalledTimes(1);

    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage(), onJoin: late });
    expect(late).toHaveBeenCalledTimes(1);

    // Phoenix rejoins after a dropped connection: the moment to refetch what was missed
    channel.joined();
    expect([early, whileJoining, late].map((fn) => fn.mock.calls.length)).toEqual([2, 2, 2]);
  });

  it('forwards channel errors to its subscribers, and stops after they unsubscribe', async () => {
    await start(user('stored'));
    const stays = vi.fn();
    const leaves = vi.fn();

    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage(), onError: stays });
    const unsubscribe = subscribe({
      channelId: 'notifications',
      type: 'new_notification',
      onMessage: onMessage(),
      onError: leaves,
    });
    const [channel] = lastSocket().channels;

    channel.errored();
    expect(stays).toHaveBeenCalledTimes(1);
    expect(leaves).toHaveBeenCalledTimes(1);

    unsubscribe();
    channel.errored();
    expect(stays).toHaveBeenCalledTimes(2);
    expect(leaves).toHaveBeenCalledTimes(1);
  });

  it('leaves the channel with its last subscriber; the next one opens a new channel', async () => {
    await start(user('stored'));

    const unsubscribeFirst = subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() });
    const unsubscribeSecond = subscribe({
      channelId: 'notifications',
      type: 'new_notification',
      onMessage: onMessage(),
    });
    const [channel] = lastSocket().channels;

    unsubscribeFirst();
    expect(channel.leave).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(channel.leave).toHaveBeenCalledTimes(1);

    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() });
    expect(lastSocket().channels).toHaveLength(2);
    expect(lastSocket().channels[1].join).toHaveBeenCalledTimes(1);
  });

  it('opens channels on the new socket after signing in again', async () => {
    await start(user('first'));
    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() });

    await userManager.events.unload();
    await userManager.events.load(user('second'));
    subscribe({ channelId: 'notifications', type: 'new_notification', onMessage: onMessage() });

    expect(FakeSocket.instances).toHaveLength(2);
    expect(lastSocket().channels).toHaveLength(1);
    expect(lastSocket().channels[0].join).toHaveBeenCalledTimes(1);
  });
});
