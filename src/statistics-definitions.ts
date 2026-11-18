import type {Counter} from './statistics-data';

// API metric definitions keep missing values identifiable without inventing counts.
export const statisticsDefinitions:Counter[]=[
  {
    "id": "averageBlockTime",
    "title": "Average block time",
    "description": "Average time taken in seconds for a block to be included in the blockchain",
    "units": "s",
    "value": null
  },
  {
    "id": "completedTxns",
    "title": "Completed txns",
    "description": "Number of transactions with success status",
    "value": null
  },
  {
    "id": "lastNewContracts",
    "title": "Number of contracts today",
    "description": "Number of deployed contracts today (UTC)",
    "value": null
  },
  {
    "id": "lastNewVerifiedContracts",
    "title": "Number of verified contracts today",
    "description": "Number of contracts verified today (UTC)",
    "value": null
  },
  {
    "id": "totalAccounts",
    "title": "Total accounts",
    "description": "Number of EOAs that sent at least 1 transaction",
    "value": null
  },
  {
    "id": "totalAddresses",
    "title": "Total addresses",
    "description": "Number of addresses that participated in the blockchain",
    "value": null
  },
  {
    "id": "totalBlocks",
    "title": "Total blocks",
    "description": "Number of blocks over all time",
    "value": null
  },
  {
    "id": "totalContracts",
    "title": "Total contracts",
    "description": "Number of contracts",
    "value": null
  },
  {
    "id": "totalNativeCoinTransfers",
    "title": "Total ETH transfers",
    "description": "Number of transactions with the transfer of the ETH",
    "value": null
  },
  {
    "id": "totalTokens",
    "title": "Total tokens",
    "description": "Number of all token contracts",
    "value": null
  },
  {
    "id": "totalTxns",
    "title": "Total txns",
    "description": "All transactions including pending, dropped, replaced, failed transactions",
    "value": null
  },
  {
    "id": "totalUserOps",
    "title": "Total user operations",
    "description": "Number of user operations as per the ERC-4337 standard",
    "value": null
  },
  {
    "id": "totalAccountAbstractionWallets",
    "title": "Total AA wallets",
    "description": "Number of account abstraction wallets (ERC-4337) that sent at least 1 user operation",
    "value": null
  },
  {
    "id": "totalVerifiedContracts",
    "title": "Total verified contracts",
    "description": "Number of verified contracts",
    "value": null
  },
  {
    "id": "newTxns24h",
    "title": "Transactions (24h)",
    "description": "Number of new transactions within the last 24 hours",
    "value": null
  },
  {
    "id": "pendingTxns30m",
    "title": "Pending transactions (30m)",
    "description": "Transactions in the past 30 minutes waiting to be processed by the network",
    "value": null
  },
  {
    "id": "txnsFee24h",
    "title": "Transaction fees · 24h",
    "description": "Sum of ETH spent on gas fees within the last 24 hours",
    "units": "ETH",
    "value": null
  },
  {
    "id": "averageTxnFee24h",
    "title": "Avg. tx fee · 24h",
    "description": "Average amount of ETH spent on gas fees per transaction within the last 24 hours",
    "units": "ETH",
    "value": null
  }
];
