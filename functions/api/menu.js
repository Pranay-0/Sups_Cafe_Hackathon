// Public: anyone can read the menu.
const DEFAULT={cafeName:"SUP's Cafe",specials:[],bakes:[],categories:[{name:'Coffee',items:[{name:'Flat white',price:38,description:''}]}]};
export async function onRequestGet({env}){
  const raw=await env.MENU.get('menu');
  return new Response(raw||JSON.stringify(DEFAULT),{headers:{'content-type':'application/json','cache-control':'no-store'}});
}
