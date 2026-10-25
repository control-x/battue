// Outils partagés par la création de battue et la fiche de préparation

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
