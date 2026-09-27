/* Presentation only: match the iOS status-area sample to the surface beneath it.
   This module does not read or write ledger state, browser storage, or the network. */
(function(){
  'use strict';

  const body=document.body;
  if(!body)return;
  const root=document.documentElement;
  const meta=document.querySelector('meta[name="theme-color"]');
  const home=document.getElementById('s-home');
  const hero=document.getElementById('hero-section');
  const scroll=document.getElementById('home-scroll');
  let cap=document.getElementById('app-status-guard');
  if(!cap){cap=document.createElement('div');cap.id='app-status-guard';}
  cap.setAttribute('aria-hidden','true');
  if(cap.parentElement!==body)body.appendChild(cap);

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function color(value,fallback){
    const text=String(value||'').trim();
    if(text==='transparent')return [0,0,0,0];
    if(/^#[\da-f]{3,8}$/i.test(text)){
      let hex=text.slice(1);
      if(hex.length===3||hex.length===4)hex=[...hex].map(c=>c+c).join('');
      if(hex.length===6||hex.length===8)return [
        parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),
        parseInt(hex.slice(4,6),16),hex.length===8?parseInt(hex.slice(6,8),16)/255:1
      ];
    }
    const match=text.match(/^rgba?\((.*)\)$/i);
    if(match){
      const parts=match[1].replace(/[,/]/g,' ').trim().split(/\s+/);
      if(parts.length===3||parts.length===4){
        const channels=parts.map((part,index)=>{
          const number=parseFloat(part);
          return part.endsWith('%')?number*(index<3?2.55:.01):number;
        });
        if(channels.every(Number.isFinite))return [
          ...channels.slice(0,3).map(n=>clamp(n,0,255)),
          clamp(channels.length===4?channels[3]:1,0,1)
        ];
      }
    }
    return fallback;
  }
  function composite(base,overlay){
    const alpha=overlay[3];
    return base.map((channel,index)=>channel*(1-alpha)+overlay[index]*alpha);
  }

  let frame=0;
  function paint(){
    const theme=getComputedStyle(body);
    const page=color(theme.getPropertyValue('--bg'),[14,14,18,1]);
    let rgb=page.slice(0,3);
    const capStyle=getComputedStyle(cap);
    const capHeight=cap.getBoundingClientRect().height;
    // min-height resolves env(safe-area-inset-top); height remains at least 12px
    // even for older installs whose web viewport starts below the system bar.
    const safeTop=Math.max(0,parseFloat(capStyle.minHeight)||0);
    if(home&&hero&&home.classList.contains('active')){
      const rect=hero.getBoundingClientRect();
      if(rect.bottom>capHeight){
        const top=color(theme.getPropertyValue('--hero-top'),page);
        const bottom=color(theme.getPropertyValue('--hero-bottom'),top);
        const solidEnd=safeTop+32;
        const gradientHeight=rect.height-solidEnd;
        const progress=gradientHeight>0?clamp((capHeight-rect.top-solidEnd)/gradientHeight,0,1):0;
        rgb=top.slice(0,3).map((channel,index)=>channel+(bottom[index]-channel)*progress);
      }
    }

    // The cap sits ABOVE the backdrops. Composite them here exactly once so a
    // native fixed-edge sample and the adjacent dimmed web surface stay alike.
    // DOM order breaks ties between equal z-index overlays, as it does in CSS.
    const overlays=[...document.querySelectorAll('.modal-wrap.open')]
      .map((element,index)=>({element,index,style:getComputedStyle(element)}))
      .filter(({element,style})=>element.getClientRects().length&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.display!=='none')
      .sort((a,b)=>(parseFloat(a.style.zIndex)||0)-(parseFloat(b.style.zIndex)||0)||a.index-b.index);
    for(const {style} of overlays){
      const backdrop=color(style.backgroundColor,[0,0,0,0]);
      backdrop[3]*=clamp(parseFloat(style.opacity)||0,0,1);
      rgb=composite(rgb,backdrop);
    }

    const css='rgb('+rgb.map(n=>Math.round(clamp(n,0,255))).join(', ')+')';
    // Avoid redundant writes, including observer-triggered tab and theme updates.
    if(cap.style.backgroundColor!==css)cap.style.backgroundColor=css;
    if(root.style.backgroundColor!==css)root.style.backgroundColor=css;
    if(meta&&meta.content!==css)meta.content=css;
  }
  function repaintNow(){
    if(frame){cancelAnimationFrame(frame);frame=0;}
    paint();
  }
  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;paint();});
  }

  // Existing theme/tab callers can keep their interface and ledger code intact.
  window.updateBrowserChrome=repaintNow;
  const observer=new MutationObserver(schedule);
  for(const element of [body,...document.querySelectorAll('.screen,.modal-wrap')]){
    observer.observe(element,{attributes:true,attributeFilter:['class']});
  }
  if(scroll)scroll.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('pageshow',repaintNow);
  window.addEventListener('resize',schedule,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',schedule,{passive:true});
    window.visualViewport.addEventListener('scroll',schedule,{passive:true});
  }
  if(hero&&window.ResizeObserver)new ResizeObserver(schedule).observe(hero);
  repaintNow();
})();
