import { useEffect, useId, useRef, useState, type FormEvent, type PointerEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import { message, formatMessage, type Locale } from './i18n';
import { activityValidation, type ActivityFilters, type ActivityValidation } from './activity-data';
import { normalizeTransactionFilters, transactionFilterCount, type TransactionFilterState } from './transaction-filters';
import { transferValidation } from './transfer-directory';
import { TOKEN_STANDARDS } from './token-data';
import './activity.css';

const labels: Record<keyof ActivityFilters, string> = {
  transaction_types:'activityType', methods:'methodSelector', age_from:'dateFrom', age_to:'dateTo',
  from_address_hashes_to_include:'from', to_address_hashes_to_include:'to', address_relation:'addressMatch',
  amount_from:'minimumAmount', amount_to:'maximumAmount', token_contract_address_hashes_to_include:'tokenContract',
};
const typeLabels: Record<string,string> = {COIN_TRANSFER:'nativeTransfer',CONTRACT_INTERACTION:'contractCall',CONTRACT_CREATION:'contractCreation'};
function localDate(value?:string) {
  const date=new Date(value || '');
  return Number.isFinite(+date) ? new Date(+date-date.getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
}

export function TransactionFilters({locale,value,onApply,kind='transactions'}: {locale:Locale;value:TransactionFilterState;onApply:(value:TransactionFilterState)=>void;kind?:'transactions'|'transfers'}) {
  const t=(key:string)=>message(locale,key), count=transactionFilterCount(value);
  const [open,setOpen]=useState(false), [draft,setDraft]=useState(value);
  const [error,setError]=useState<(ActivityValidation|{field:'status';message:string})|null>(null);
  const dialog=useRef<HTMLDialogElement>(null), trigger=useRef<HTMLButtonElement>(null), pointerOutside=useRef(false);
  const opener=useRef<HTMLButtonElement|null>(null);
  const id=useId(),titleId=useId(),errorId=useId(),methodId=useId();
  useEffect(()=>setOpen(false),[value]);
  useEffect(()=>{
    if(!open)return;
    const element=dialog.current!;
    const previousOverflow=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return()=>{element.close();document.body.style.overflow=previousOverflow;(opener.current?.getClientRects().length?opener.current:trigger.current)?.focus({preventScroll:true});};
  },[open]);
  const show=(event:MouseEvent<HTMLButtonElement>)=>{opener.current=event.currentTarget;setDraft({filters:{...value.filters},status:value.status});setError(null);setOpen(true);};
  const apply=(next:TransactionFilterState)=>{onApply(normalizeTransactionFilters(next.filters,next.status));setOpen(false);trigger.current?.focus({preventScroll:true});};
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const next=normalizeTransactionFilters(draft.filters,draft.status);
    const invalid=(kind==='transfers'?transferValidation(next.filters):activityValidation(next.filters)) || (next.status && !['success','failed'].includes(next.status)?{field:'status' as const,message:'Invalid status'}:null) || (kind==='transactions'&&next.status==='failed'&&/^ERC-(20|721|1155)$/.test(next.filters.transaction_types||'')?{field:'transaction_types' as const,message:'Failed transactions cannot emit token transfer events. Choose Contract interaction to find failed token calls.'}:null);
    setDraft(next);setError(invalid);
    if(invalid){const form=event.currentTarget;requestAnimationFrame(()=>(form.elements.namedItem(invalid.field) as HTMLElement|null)?.focus());return;}
    apply(next);
  };
  const update=(key:keyof ActivityFilters,text:string)=>{setDraft(old=>({...old,filters:{...old.filters,[key]:text}}));setError(null);};
  const validation=(key:keyof ActivityFilters|'status')=>({name:key,'aria-invalid':error?.field===key||undefined,'aria-describedby':error?.field===key?errorId:undefined});
  const field=(key:keyof ActivityFilters,placeholder='',type='text')=><label data-filter-field={key}><span>{t(labels[key])}</span><input {...validation(key)} list={key==='methods'?methodId:undefined} type={type} value={type==='datetime-local'?localDate(draft.filters[key]):draft.filters[key]||''} placeholder={placeholder} onChange={event=>{
    const raw=event.target.value,date=type==='datetime-local'&&raw?new Date(raw):null;
    update(key,date&&Number.isFinite(+date)?date.toISOString():raw);
  }} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label>;
  const display=(key:keyof ActivityFilters,text:string)=>{
    if(key==='transaction_types')return t(typeLabels[text]||text);
    if(key==='age_from'||key==='age_to'){const date=new Date(text);if(Number.isFinite(+date))return new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'short'}).format(date);}
    return text.length>22?text.slice(0,8)+'…'+text.slice(-6):text;
  };
  const mobileDisplay=(key:keyof ActivityFilters,text:string)=>{
    if(key==='transaction_types')return display(key,text);
    if(key==='age_from'||key==='age_to'){
      const date=new Date(text);
      if(Number.isFinite(+date))return `${key==='age_from'?'≥':'≤'} ${new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date)}`;
    }
    return null;
  };
  const outside=(event:PointerEvent<HTMLDialogElement>)=>{const box=event.currentTarget.getBoundingClientRect();return event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;};
  const keepFocus=(event:KeyboardEvent<HTMLDialogElement>)=>{
    if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
    const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')].filter(element=>element.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  return <>
    <div className="transaction-filter-bar" role="group" aria-label={t('advancedFilters')}>
      <div className="transaction-filter-actions">
        <button ref={trigger} className={count?'filter-trigger active':'filter-trigger'} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show}><SlidersHorizontal size={18} aria-hidden="true"/>{t('advancedFilters')}{count>0&&<span className="filter-count" aria-label={`${count} ${t('filtersActive')}`}>{count}</span>}</button>
        {count>0&&<button className="filter-reset" type="button" title={t('resetFilters')} aria-label={t('resetFilters')} onClick={()=>apply({filters:{},status:''})}><RotateCcw size={16} aria-hidden="true"/><span>{t('resetFilters')}</span></button>}
      </div>
      {count>0&&<div className="transaction-filter-chips" data-overflow={count>2}>
        {value.status&&<button className="filter-chip" type="button" aria-label={`${t('Remove filter')}: ${t('Status')}, ${t(value.status==='success'?'Success':value.status==='failed'?'Failed':value.status)}`} onClick={()=>apply({...value,status:''})}><span>{t('Status')}: {t(value.status==='success'?'Success':value.status==='failed'?'Failed':value.status)}</span><X size={14} aria-hidden="true"/></button>}
        {Object.entries(value.filters).filter(([key])=>key!=='address_relation').map(([rawKey,text])=>{
          const key=rawKey as keyof ActivityFilters,label=t(key==='transaction_types'?'Type':key==='methods'?'method':labels[key]);
          const compact=mobileDisplay(key,text!);
          return <button className="filter-chip" key={key} type="button" title={`${label}: ${text}`} aria-label={`${t('Remove filter')}: ${label}, ${text}`} onClick={()=>{const filters={...value.filters};delete filters[key];apply({filters,status:value.status});}}><span className={compact?'filter-chip-full':undefined}>{label}: <bdi>{display(key,text!)}</bdi></span>{compact&&<span className="filter-chip-compact" aria-hidden="true"><bdi>{compact}</bdi></span>}<X size={14} aria-hidden="true"/></button>;
        })}
        {count>2&&<button className="filter-more" type="button" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} aria-label={formatMessage(locale,'Show {count} more filters',{count:count-2})} onClick={show}>+{count-2}</button>}
        {value.filters.from_address_hashes_to_include&&value.filters.to_address_hashes_to_include&&<span className="filter-relation">{t(value.filters.address_relation==='or'?'matchEither':'matchBoth')}</span>}
      </div>}
    </div>
    <dialog ref={dialog} id={id} className="transaction-filter-dialog" aria-labelledby={titleId} onKeyDown={keepFocus} onCancel={event=>{event.preventDefault();setOpen(false);}} onPointerDown={event=>{pointerOutside.current=outside(event);}} onPointerUp={event=>{if(pointerOutside.current&&outside(event))setOpen(false);pointerOutside.current=false;}}>
      <div className="transaction-filter-dialog-content">
        <div className="filter-dialog-heading"><h2 id={titleId}><SlidersHorizontal size={20} aria-hidden="true"/>{t('advancedFilters')}</h2><button type="button" className="filter-close" aria-label={t('Close')} onClick={()=>setOpen(false)}><X size={20} aria-hidden="true"/></button></div>
        <form className="activity-filter-form" onSubmit={submit}>
          <div className="filter-dialog-scroll" onFocusCapture={event=>{
            const field=event.target;
            if(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)requestAnimationFrame(()=>{if(field.isConnected)field.scrollIntoView({block:'nearest',inline:'nearest'});});
          }}>
            <div className="activity-filter-grid">
              <label data-filter-field="transaction_types"><span>{t(kind==='transfers'?'Token standard':'activityType')}</span><select {...validation('transaction_types')} value={draft.filters.transaction_types||''} onChange={event=>update('transaction_types',event.target.value)}>
                {kind==='transfers'?<><option value="">{t('All types')}</option>{TOKEN_STANDARDS.map(type=><option key={type}>{type}</option>)}</>:<><option value="">{t('allTransactions')}</option><option value="COIN_TRANSFER">{t('nativeTransfer')}</option><option value="CONTRACT_INTERACTION">{t('contractCall')}</option><option value="CONTRACT_CREATION">{t('contractCreation')}</option><option>ERC-20</option><option>ERC-721</option><option>ERC-1155</option></>}
              </select></label>
              {kind!=='transfers'&&<label data-filter-field="status"><span>{t('Status')}</span><select {...validation('status')} value={draft.status} onChange={event=>{setDraft(old=>({...old,status:event.target.value}));setError(null);}}><option value="">{t('All')}</option><option value="success">{t('Success')}</option><option value="failed">{t('Failed')}</option></select></label>}
              {field('methods','0xa9059cbb')}
              <datalist id={methodId}><option value="0xa9059cbb">transfer</option><option value="0x095ea7b3">approve</option><option value="0x23b872dd">transferFrom</option><option value="0xa22cb465">setApprovalForAll</option><option value="0x42842e0e">safeTransferFrom</option><option value="0x2e1a7d4d">withdraw</option><option value="0xd0e30db0">deposit</option></datalist>
              {field('from_address_hashes_to_include','0x…')}{field('to_address_hashes_to_include','0x…')}
              {draft.filters.from_address_hashes_to_include&&draft.filters.to_address_hashes_to_include&&<label data-filter-field="address_relation"><span>{t('addressMatch')}</span><select {...validation('address_relation')} value={draft.filters.address_relation||'and'} onChange={event=>update('address_relation',event.target.value)}><option value="and">{t('matchBoth')}</option><option value="or">{t('matchEither')}</option></select></label>}
              {field('age_from','','datetime-local')}{field('age_to','','datetime-local')}
              {kind==='transfers'&&<>{field('token_contract_address_hashes_to_include','0x…')}{field('amount_from')}{field('amount_to')}</>}
            </div>
            {error&&<p id={errorId} className="activity-form-error" role="alert">{t(error.message)}</p>}
          </div>
          <div className="activity-actions"><button type="button" onClick={()=>apply({filters:{},status:''})}>{t('resetFilters')}</button><button type="submit" className="primary-action">{t('applyFilters')}</button></div>
        </form>
      </div>
    </dialog>
  </>;
}
