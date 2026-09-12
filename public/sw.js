self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Yeni randevu",
      body: event.data
        ? event.data.text()
        : "Yeni bir randevu oluşturuldu.",
    };
  }

  const title = data.title || "Yeni randevu";

  const options = {
    body: data.body || "Yeni bir randevu oluşturuldu.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: data.tag || "new-appointment",
    renotify: true,
    data: {
      url: data.url || "/admin",
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url || "/admin";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});