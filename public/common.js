// Outils partagés par les pages : création de battue, carte, fiche de préparation, admin

// localStorage sans planter (navigation privée, stockage bloqué)
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);}catch(e){return null;}}
// Texte sûr dans du HTML
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x];});}
// Script tiers chargé à la demande, vérifié par son empreinte
function loadScript(src,integrity){
  return new Promise(function(ok,ko){var el=document.createElement("script");el.src=src;el.integrity=integrity;el.crossOrigin="anonymous";el.onload=ok;el.onerror=ko;document.head.appendChild(el);});
}
// QR code en image (qrcode-generator, chargé à la première demande)
function qrDataUrl(text){
  return (window.qrcode?Promise.resolve():loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js","sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1")).then(function(){
    var qr=qrcode(0,"M"); qr.addData(text); qr.make(); return qr.createDataURL(8,2);
  });
}

// Base Adresse Nationale, appelée depuis le navigateur
function geocode(q,limit){
  return fetch("https://api-adresse.data.gouv.fr/search/?limit="+limit+"&q="+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(j){return j.features||[];});
}
// Suggestions d'adresses dans une datalist ; found[libellé] garde la réponse pour éviter un second appel
function suggestAddresses(input,datalist,found){
  var timer;
  input.addEventListener("input",function(){
    clearTimeout(timer); var q=input.value.trim(); if(q.length<4||found[q])return;
    timer=setTimeout(function(){geocode(q,5).then(function(fs){
      datalist.innerHTML=fs.map(function(f){found[f.properties.label]=f;return '<option value="'+f.properties.label.replace(/"/g,"&quot;")+'">';}).join("");
    }).catch(function(){});},300);
  });
}
// Adresse choisie dans les suggestions, sinon premier résultat ; null si introuvable
function resolveAddress(q,found){
  return found[q]?Promise.resolve(found[q]):geocode(q,1).then(function(fs){return fs[0]||null;});
}
// Photo réduite dans le navigateur : 800 px, JPEG
function shrink(file){
  if(!file)return Promise.resolve("");
  return createImageBitmap(file).then(function(img){
    var k=Math.min(1,800/Math.max(img.width,img.height)), c=document.createElement("canvas");
    c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    return c.toDataURL("image/jpeg",.75);
  });
}
