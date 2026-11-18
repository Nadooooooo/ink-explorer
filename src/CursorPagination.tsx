import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { message, formatMessage, type Locale } from './i18n';
import { tokenCursorQuery } from './token-data';
import { focusPrimaryPagination, usePaginationFocus } from './pagination-focus';

export function useCursorPages(scope: string) {
  const [state,setState] = useState({scope,cursors:[''],index:0});
  const current = state.scope === scope ? state : {scope,cursors:[''],index:0};
  useEffect(()=>setState({scope,cursors:[''],index:0}),[scope]);
  return {
    query:current.cursors[current.index], page:current.index+1,
    reset:()=>setState({scope,cursors:[''],index:0}),
    previous:()=>setState(value=>value.scope===scope ? {...value,index:Math.max(0,value.index-1)} : {scope,cursors:[''],index:0}),
    next:(cursor:Record<string,unknown>)=>{
      const query=tokenCursorQuery(cursor);
      if(!query||query===current.cursors[current.index])return;
      setState({scope,cursors:[...current.cursors.slice(0,current.index+1),query],index:current.index+1});
    },
  };
}
export function CursorPagination({page,previous,next,hasNext,pending=false,bottom=false}:{page:number;previous:()=>void;next:()=>void;hasNext:boolean;pending?:boolean;bottom?:boolean}) {
  const locale=document.documentElement.lang as Locale,t=(key:string)=>message(locale,key);
  const pageNumber=new Intl.NumberFormat(locale).format(page);
  const Root = bottom ? 'div' : 'nav';
  const navigationRef = usePaginationFocus(bottom, pending, `${page}:${hasNext}`);
  return <Root ref={node => { navigationRef.current = node; }} className="cursor-pagination" role={bottom ? 'group' : undefined} aria-label={t('Pagination')}>
    <button disabled={page===1||pending} onClick={event=>{focusPrimaryPagination(event.currentTarget);previous();}} aria-label={t('Previous page')} title={t('Previous page')}><ChevronLeft aria-hidden="true" size={19}/></button>
    <span><span className="cursor-page-full">{formatMessage(locale,'Page {page}',{page:pageNumber})}</span><span className="cursor-page-compact" aria-hidden="true">{pageNumber}</span></span>
    <button disabled={!hasNext||pending} onClick={event=>{focusPrimaryPagination(event.currentTarget);next();}} aria-label={t('Next page')} title={t('Next page')}><ChevronRight aria-hidden="true" size={19}/></button>
  </Root>;
}
