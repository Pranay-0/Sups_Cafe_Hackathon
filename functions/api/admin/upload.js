const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
export async function onRequestPost({request,env}){
 
  if(request.headers.get('content-type')!=='image/jpeg')return json({error:'JPEG only'},415);
  const buf=await request.arrayBuffer();
  if(!buf.byteLength||buf.byteLength>600*1024)return json({error:'Image too large'},413);
  const id=crypto.randomUUID();
  await env.MENU.put('img:'+id,buf);
  return json({id});
}