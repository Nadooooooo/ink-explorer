import { Interface, ZeroAddress, formatUnits } from "ethers";
export type Approval = {
  key: string; kind: "erc20" | "erc721" | "operator"; token: string; spender: string;
  tokenId?: string; block: number; logIndex: number; transactionHash: string;
  active?: boolean | null; standard?: string; amount?: string; symbol?: string; decimals?: number; error?: string;
};
export const revokeAbi = new Interface([
  "function approve(address,uint256)", "function setApprovalForAll(address,bool)",
]);
export function revokeData(item: Approval) {
  if (!item.active || item.standard === "unknown") throw new Error("approvalStateUnavailable");
  if (item.kind === "operator") return revokeAbi.encodeFunctionData("setApprovalForAll", [item.spender, false]);
  return revokeAbi.encodeFunctionData("approve", item.kind === "erc721" ? [ZeroAddress, BigInt(item.tokenId!)] : [item.spender, 0n]);
}
export function approvalAmount(item: Approval, unlimited: string, raw: string) {
  if (item.amount === undefined) return "—";
  if (BigInt(item.amount) === 2n ** 256n - 1n) return unlimited;
  return item.decimals === undefined ? `${item.amount} ${raw}` : `${formatUnits(item.amount, item.decimals)} ${item.symbol || ""}`.trim();
}
