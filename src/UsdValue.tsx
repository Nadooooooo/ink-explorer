import {tokenUsd} from './token-data';

/** Keep comparisons and currency amounts isolated from surrounding RTL labels. */
export function UsdValue({value,locale,mode='exact'}:{
  value:unknown;locale:string;mode?:'price'|'cap'|'exact';
}) {
  return <bdi dir="ltr">{tokenUsd(value,locale,mode)}</bdi>;
}
