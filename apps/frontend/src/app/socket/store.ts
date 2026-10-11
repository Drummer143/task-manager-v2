import { create } from 'zustand';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

export interface SocketState {
  status: SocketStatus;
}

export const useSocketStore = create<SocketState>(() => ({
  status: 'disconnected',
}));
