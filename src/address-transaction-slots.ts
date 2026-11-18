type Row = Record<string, any>;
export type TransactionSlot = {key:number; hash:string; row?:Row};

// Automatic updates replace content in stable positions. While reading, keep
// each position attached to its identity: a removed inclusion becomes a gap,
// never a different transaction beneath a focused link or an active pointer.
export function addressTransactionSlots(previous:TransactionSlot[], rows:Row[], holding:boolean):TransactionSlot[] {
  if(!holding)return rows.map((row,key)=>({key,hash:row.hash,row}));
  const current=new Map(rows.map(row=>[row.hash,row]));
  const known=new Set(previous.map(slot=>slot.hash));
  const next=previous.map(slot=>({...slot,row:current.get(slot.hash)}));
  let key=previous.reduce((maximum,slot)=>Math.max(maximum,slot.key),-1)+1;
  for(const row of rows)if(!known.has(row.hash)){next.push({key:key++,hash:row.hash,row});known.add(row.hash);}
  return next;
}
