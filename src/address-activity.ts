import {currentNetworkObservation} from './network-observation';
import {readLedgerPage, type LedgerFrame} from './ledger-page';

type Row = Record<string, any>;
const addressPattern = /^0x[\da-f]{40}$/i;
const hashPattern = /^0x[\da-f]{64}$/i;
const addressOf = (value: unknown) => typeof value === 'string' ? value : (value as Row)?.hash;
export function transactionInvolves(row: Row, address: string): boolean {
  return addressPattern.test(address) && [row.from, row.to, row.created_contract].some(value => {
    const hash = addressOf(value);
    return typeof hash === 'string' && hash.toLowerCase() === address.toLowerCase();
  });
}

export function readAddressTransactions(value: unknown, address: string, chainId: number) {
  const page = readLedgerPage(value);
  if ((value as Row).chainId != null && (value as Row).chainId !== chainId) throw new Error('invalidApiResponse');
  if (page.items.some(row => !hashPattern.test(row.hash || '') || !transactionInvolves(row, address))) throw new Error('invalidApiResponse');
  return page;
}

// Only a fresh, matching-chain observation can add or invalidate live rows.
// Retain the full block hash sets: unrelated transactions still establish
// that a previously displayed transaction was removed by a replacement.
export function addressActivityFrame(frame: LedgerFrame, address: string, chainId: number, now = Date.now()): LedgerFrame {
  const node = currentNetworkObservation(frame, chainId, now);
  if (!node || node.online !== true || node.synced !== true || node.stale === true || frame.block?.height !== node.head || !hashPattern.test(frame.block?.hash || '')) return {...frame, connected:false, blocks:[], transactions:[]};
  const blocks = (frame.blocks?.length ? frame.blocks : frame.block ? [frame.block] : []).filter(block => hashPattern.test(block.hash || '') && Number.isSafeInteger(block.height));
  const transactions = (frame.transactions || []).filter(tx => {
    if (!hashPattern.test(tx.hash || '') || !transactionInvolves(tx, address)) return false;
    const block = blocks.find(block => block.height === tx.block_number);
    if (!block || tx.block_hash && tx.block_hash !== block.hash) return false;
    return Array.isArray(block.transaction_hashes) ? block.transaction_hashes.includes(tx.hash) : tx.block_hash === block.hash;
  });
  return {...frame, blocks, transactions};
}
