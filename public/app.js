const P={
    image:'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
coffee:'M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1',
star:'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1z',
sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
plus:'M5 12h14M12 5v14',
trash:'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
eyeoff:'M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.4 0-10-7-10-7a17.8 17.8 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.8 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20',
back:'M19 12H5M12 19l-7-7 7-7',
lock:'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'};
function icon(n){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
for(const[k,v]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.75,'stroke-linecap':'round','stroke-linejoin':'round',class:'icon','aria-hidden':'true'}))s.setAttribute(k,v);
const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',P[n]);s.append(p);return s}
function el(tag,props={},...kids){const e=document.createElement(tag);
for(const[k,v]of Object.entries(props)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e[k]=v}
e.append(...kids.flat().filter(k=>k!=null&&k!==false));return e}
const money=n=>'R'+Number(n||0).toFixed(2);