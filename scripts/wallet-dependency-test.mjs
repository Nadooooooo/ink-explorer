import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import * as schemas from '../node_modules/@reown/appkit-wallet/dist/esm/src/W3mFrameSchema.js';

test('The installed WalletConnect provider retains its initialization API', () => {
  assert.equal(typeof EthereumProvider.init, 'function');
});

test('Patched Zod preserves the wallet frame theme record contract', () => {
  const payload = { themeMode: 'dark', themeVariables: { '--w3m-accent': '#7c3aed', '--w3m-z-index': 1000 }, w3mThemeVariables: { '--w3m-color-mix': '#111' } };
  assert.deepEqual(schemas.AppSyncThemeRequest.parse(payload), payload);
  assert.equal(schemas.AppSyncThemeRequest.safeParse({ themeMode: 'invalid' }).success, false);
  assert.equal(schemas.AppSyncThemeRequest.safeParse({ themeVariables: { nested: { bad: true } } }).success, false);
});

test('Patched wallet schemas validate email and preserve chain identifiers', () => {
  assert.ok(schemas.AppConnectEmailRequest.safeParse({ email: 'wallet@example.com' }).success);
  assert.equal(schemas.AppConnectEmailRequest.safeParse({ email: 'invalid' }).success, false);
  assert.deepEqual(schemas.FrameGetChainIdResponse.parse({ chainId: '0xdef1' }), { chainId: '0xdef1' });
  assert.equal(schemas.FrameGetChainIdResponse.safeParse({ chainId: { bad: true } }).success, false);
});
