import {useContext} from 'react';
import {CanonicalBlockCountContext} from './CanonicalBlockCountContext';
import {Info} from './Info';

export default function CanonicalBlockCounter({t}: {t:(key:string)=>string}) {
  const count = useContext(CanonicalBlockCountContext);
  return <article data-counter="totalBlocks" data-source="local-node">
    <div><span>{t('Total blocks')}</span><Info label={t('Total blocks')}>{t('Canonical blocks from the local node, including genesis (block 0).')}{count === null && <><br/>{t('Data source unavailable')}</>}</Info></div>
    <strong title={count === null ? undefined : String(count)}><span>{count === null ? 'N/A' : count.toLocaleString(document.documentElement.lang)}</span></strong>
  </article>;
}
