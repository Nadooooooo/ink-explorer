import {createContext} from 'react';
// Only the small update control consumes this value. Full tables do not render
// on every chain frame; their rows change only when a snapshot is accepted.
export const IndexedHeadContext=createContext<string|undefined>(undefined);
