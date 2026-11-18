import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { locales, message, type Locale } from "./i18n";

const focusSelector='a[href],button,input,select,textarea,summary,[tabindex]';
function focusable(root:ParentNode):HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusSelector)).filter(element=>
    element.tabIndex>=0&&!element.matches(':disabled')&&!element.closest('[inert],[aria-hidden="true"]')&&
    element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden');
}

export function Info({ label, children, showLabel=false }: { label: string; children: ReactNode; showLabel?: boolean }) {
  const [open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),id=useId();
  const ref=useRef<HTMLSpanElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLSpanElement>(null),content=useRef<HTMLSpanElement>(null);
  const [position,setPosition]=useState({left:12,top:12});
  const language=document.documentElement.lang as Locale;
  const closeLabel=message(locales.includes(language)?language:'en','Close help');
  const close=useCallback((restoreFocus=false)=>{
    setOpen(false);
    if(restoreFocus){
      const button=trigger.current;
      const visible=button?.getClientRects().length&&getComputedStyle(button).visibility!=='hidden';
      (visible?button:document.getElementById('main-content'))?.focus({preventScroll:true});
    }
  },[]);
  useLayoutEffect(()=>()=>{
    const active=document.activeElement;
    if(!panel.current?.contains(active))return;
    queueMicrotask(()=>{
      if(document.activeElement!==document.body&&document.activeElement!==active)return;
      const target=trigger.current?.isConnected?trigger.current:document.getElementById('main-content');
      target?.focus({preventScroll:true});
    });
  },[]);

  useLayoutEffect(()=>{
    if(!open)return;
    const viewport=window.visualViewport;
    let anchorPosition='',frame=0;
    const positionKey=(box:DOMRect)=>`${box.left}:${box.top}:${box.width}:${box.height}`;
    const place=()=>{
      const anchor=ref.current?.getBoundingClientRect(),element=panel.current;
      if(!anchor||!element)return;
      anchorPosition=positionKey(anchor);
      const leftEdge=viewport?.offsetLeft||0,topEdge=viewport?.offsetTop||0;
      const rightEdge=leftEdge+(viewport?.width||innerWidth),bottomEdge=topEdge+(viewport?.height||innerHeight);
      element.style.width=`${Math.min(300,Math.max(0,rightEdge-leftEdge-24))}px`;
      element.style.maxHeight=`${Math.max(0,bottomEdge-topEdge-24)}px`;
      const box=element.getBoundingClientRect();
      if(!anchor.width||!anchor.height||anchor.bottom<topEdge||anchor.top>bottomEdge||anchor.right<leftEdge||anchor.left>rightEdge){close(element.contains(document.activeElement));return;}
      const left=Math.max(leftEdge+12,Math.min(anchor.right-box.width,rightEdge-box.width-12));
      const top=anchor.bottom+8+box.height<=bottomEdge-12?anchor.bottom+8:Math.max(topEdge+12,anchor.top-box.height-8);
      // Keep the close control for the rest of this opening once it is needed.
      // Shrinking async content must not remove the control under keyboard focus.
      if(top<anchor.bottom&&top+box.height>anchor.top&&left<anchor.right&&left+box.width>anchor.left)setExpanded(true);
      setPosition(previous=>previous.left===left&&previous.top===top?previous:{left,top});
    };
    place();
    // An ancestor can move without resizing the trigger or the panel. Track one
    // rectangle only while open; unchanged frames never reposition or re-render.
    const followAnchor=()=>{
      const anchor=ref.current?.getBoundingClientRect();
      if(anchor&&positionKey(anchor)!==anchorPosition)place();
      frame=requestAnimationFrame(followAnchor);
    };
    frame=requestAnimationFrame(followAnchor);
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(place):undefined;
    if(panel.current)resize?.observe(panel.current);
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    viewport?.addEventListener('resize',place);viewport?.addEventListener('scroll',place);
    return()=>{cancelAnimationFrame(frame);resize?.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);viewport?.removeEventListener('resize',place);viewport?.removeEventListener('scroll',place);};
  },[open,close]);
  useLayoutEffect(()=>{
    if(open&&expanded)content.current?.focus({preventScroll:true});
  },[open,expanded]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{
      if(!ref.current?.contains(event.target as Node)&&!panel.current?.contains(event.target as Node))close(!!panel.current?.contains(document.activeElement));
    };
    const blur=(event:FocusEvent)=>{
      if(!ref.current?.contains(event.target as Node)&&!panel.current?.contains(event.target as Node))close();
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close(true);return;}
      if(event.key!=='Tab'||!panel.current)return;
      const controls=focusable(panel.current);
      if(!event.shiftKey&&event.target===trigger.current&&controls.length){event.preventDefault();controls[0].focus();return;}
      if(!panel.current.contains(event.target as Node))return;
      if(event.shiftKey&&event.target===controls[0]){event.preventDefault();close(true);}
      else if(!event.shiftKey&&event.target===controls.at(-1)){
        event.preventDefault();
        const anchor=trigger.current;
        const next=focusable(document).find(element=>!panel.current?.contains(element)&&anchor&&Boolean(anchor.compareDocumentPosition(element)&Node.DOCUMENT_POSITION_FOLLOWING));
        close();(next||anchor)?.focus();
      }
    };
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);document.addEventListener('focusin',blur);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);document.removeEventListener('focusin',blur);};
  },[open,close]);

  return <span className={`info-disclosure${showLabel?' info-with-label':''}`} ref={ref}>
    <button ref={trigger} className="info-button" type="button" aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open?`${id}-text`:undefined} onClick={()=>{if(open)close(true);else{setExpanded(false);setOpen(true);}}}>
      {showLabel&&<span className="info-visible-label">{label}</span>}
      <svg className="info-symbol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="2.5" y="2.5" width="19" height="19" rx="4.5"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    </button>
    {open&&createPortal(<span ref={panel} id={id} className={`info-content info-floating${expanded?' info-expanded':''}`} style={position} role="note" dir={document.documentElement.dir||'ltr'}>
      {expanded&&<span className="info-panel-actions"><span className="info-panel-title" id={`${id}-label`}>{label}</span><button className="info-close" type="button" onClick={()=>close(true)} aria-label={closeLabel} title={closeLabel}><X size={18} aria-hidden="true"/></button></span>}
      <span ref={content} id={`${id}-text`} className="info-body" role={expanded?'region':undefined} aria-labelledby={expanded?`${id}-label`:undefined} tabIndex={expanded?0:undefined}>{children}</span>
    </span>,document.body)}
  </span>;
}
