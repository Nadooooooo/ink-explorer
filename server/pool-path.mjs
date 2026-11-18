// Contract Info uses Ethereum addresses for contract pools and bytes32 IDs for
// singleton pools (for example Uniswap v4). Only addresses support type probes.
export function validPoolPath(path) {
  return /^pools(?:\/(?:0x[\da-f]{40}(?:\/check)?|0x[\da-f]{64}))?$/i.test(path);
}
