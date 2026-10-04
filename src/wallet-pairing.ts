type PairingClient = {
  proposal: { getAll(): { id: number; pairingTopic?: string }[] };
  core: { expirer: { set(key: string | number, expiry: number): void } };
};
export function pairingTopic(uri: string) {
  return /^wc:([\da-f]{64})@2\?/i.exec(uri)?.[1];
}
export function expireWalletPairing(client: PairingClient, topic: string) {
  if (!/^[\da-f]{64}$/i.test(topic)) throw new Error("Invalid pairing topic");
  // abortPairingAttempt() is a no-op in the SDK. Expire this proposal and
  // pairing through Core instead; never clean up unrelated active sessions.
  for (const proposal of client.proposal.getAll())
    if (proposal.pairingTopic === topic && Number.isSafeInteger(proposal.id)) client.core.expirer.set(proposal.id, 0);
  client.core.expirer.set(topic, 0);
}
