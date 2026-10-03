export async function onRequestGet({params,env}){
  if(!/^[0-9a-f-]{36}$/.test(params.id))return new Response('Not found',{status:404});
  const v=await env.MENU.get('img:'+params.id,'arrayBuffer');
  if(!v)return new Response('Not found',{status:404});
  return new Response(v,{headers:{'content-type':'image/jpeg','cache-control':'public, max-age=31536000, immutable'}});
}