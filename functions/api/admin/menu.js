// Owner only: this path sits behind Cloudflare Access (see README).
const img=v=>/^[0-9a-f-]{36}$/.test(String(v||''))?String(v):'';
const s=(v,n=120)=>String(v??'').trim().slice(0,n);
const p=v=>Math.min(Math.max(Number(v)||0,0),100000);
export async function onRequestPut({request,env}){
  // Access adds this header after login. Missing header = request never went through Access.
  
  let d;try{d=await request.json()}catch{return new Response('Bad JSON',{status:400})}
  const arr=a=>Array.isArray(a)?a.slice(0,200):[];
  const clean={
    cafeName:s(d.cafeName,60)||"SUP's Cafe",updated:new Date().toISOString(),
    specials:arr(d.specials).map(x=>({name:s(x.name),price:p(x.price),description:s(x.description,200),image:img(x.image)})).filter(x=>x.name),
    bakes:arr(d.bakes).map(x=>({name:s(x.name),price:p(x.price),soldOut:!!x.soldOut,image:img(x.image)})).filter(x=>x.name),
    categories:arr(d.categories).slice(0,30).map(c=>({name:s(c.name,60),items:arr(c.items).map(i=>({name:s(i.name),price:p(i.price),description:s(i.description,200),available:i.available!==false})).filter(i=>i.name)})).filter(c=>c.name),
    items: arr(c.items).map(i=>({name:s(i.name),price:p(i.price),description:s(i.description,200),available:i.available!==false,image:img(i.image)})).filter(i=>i.name||i.image)
  };
  await env.MENU.put('menu',JSON.stringify(clean));
  return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});
}
