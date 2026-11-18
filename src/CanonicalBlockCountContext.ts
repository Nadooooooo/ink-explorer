import {createContext} from 'react';

// Only the small total consumes chain updates. Charts keep their current state
// and do not rerender or refetch whenever a new block arrives.
export const CanonicalBlockCountContext = createContext<number | null>(null);
