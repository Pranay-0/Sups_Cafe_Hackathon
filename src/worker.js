const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hmac=async(k,m)=>b64(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',enc.encode(k),{name:'HMAC',hash:'SHA-256'},false,['sign']),enc.encode(m)));
const sha=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const same=(a,b)=>{let d=a.length^b.length;for(let i=0;i<a.length&&i<b.length;i++)d|=a[i]^b[i];return d===0};
const json=(o,status=200,h={})=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json','cache-control':'no-store',...h}});
const cookie=v=>`session=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${v?28800:0}`;
const DEFAULT={cafeName:"SUP's Cafe",specials:[],bakes:[],categories:[{name:'Coffee',items:[{name:'Flat white',price:38,description:''}]}]};
const s=(v,n=120)=>String(v??'').trim().slice(0,n);
const p=v=>Math.min(Math.max(Number(v)||0,0),100000);
const arr=a=>Array.isArray(a)?a.slice(0,200):[];

async function authed(req,env){
  const c=(req.headers.get('cookie')||'').match(/(?:^|; )session=([^;]+)/);if(!c)return false;
  const[exp,sig]=c[1].split('.');if(!exp||!sig||!(Date.now()<+exp))return false;
  return same(enc.encode(sig),enc.encode(await hmac(env.SESSION_SECRET,exp)));
}

export default{async fetch(req,env){
  const path=new URL(req.url).pathname,method=req.method;
  if(path==='/api/menu'&&method==='GET'){
    return new Response(await env.MENU.get('menu')||JSON.stringify(DEFAULT),{headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
  if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return json({error:'Server not configured'},500);
  if(path==='/api/login'&&method==='POST'){
    const key='fail:'+(req.headers.get('cf-connecting-ip')||'x');
    const fails=+(await env.MENU.get(key))||0;
    if(fails>=5)return json({error:'Too many attempts. Try again in 15 minutes.'},429);
    let b={};try{b=await req.json()}catch{}
    if(!same(await sha(String(b.password||'')),await sha(env.ADMIN_PASSWORD))){
      await env.MENU.put(key,String(fails+1),{expirationTtl:900});return json({error:'Wrong password'},401);
    }
    await env.MENU.delete(key);
    const exp=String(Date.now()+8*3600e3);
    return json({ok:true},200,{'set-cookie':cookie(exp+'.'+await hmac(env.SESSION_SECRET,exp))});
  }
  if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'set-cookie':cookie('')});
  if(path==='/api/session')return json({ok:await authed(req,env)},await authed(req,env)?200:401);
  if(path==='/api/admin/menu'&&method==='PUT'){
    if(!await authed(req,env))return json({error:'Please sign in again'},401);
    let d;try{d=await req.json()}catch{return json({error:'Bad data'},400)}
    const clean={cafeName:s(d.cafeName,60)||"SUP's Cafe",updated:new Date().toISOString(),
      specials:arr(d.specials).map(x=>({name:s(x.name),price:p(x.price),description:s(x.description,200)})).filter(x=>x.name),
      bakes:arr(d.bakes).map(x=>({name:s(x.name),price:p(x.price),soldOut:!!x.soldOut})).filter(x=>x.name),
      categories:arr(d.categories).slice(0,30).map(c=>({name:s(c.name,60),items:arr(c.items).map(i=>({name:s(i.name),price:p(i.price),description:s(i.description,200),available:i.available!==false})).filter(i=>i.name)})).filter(c=>c.name)};
    await env.MENU.put('menu',JSON.stringify(clean));
    return json({ok:true});
  }
  return json({error:'Not found'},404);
}};
