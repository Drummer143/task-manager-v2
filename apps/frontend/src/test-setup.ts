import { afterEach } from 'vitest';
// Screens are built from kit components, which need what jsdom lacks
import '@task-manager-v2/ui-kit/testing';

// The session, the sign-in transaction and the shell's settings live in web storage: one test
// must not leave them to the next
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
