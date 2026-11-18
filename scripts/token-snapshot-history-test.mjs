if(process.env.TOKEN_HISTORY_OUTPUT&&!process.env.HOLDER_HISTORY_OUTPUT)process.env.HOLDER_HISTORY_OUTPUT=process.env.TOKEN_HISTORY_OUTPUT;
await import('./holder-snapshot-history-test.mjs');
