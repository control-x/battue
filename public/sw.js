// Service worker minimal : Android n'affiche les notifications qu'à travers lui. Toucher l'alerte rouvre la carte.
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++)if(list[i].url===e.notification.data)return list[i].focus();
    return clients.openWindow(e.notification.data);
  }));
});
