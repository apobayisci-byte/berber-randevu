"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Appointment = {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_note: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  price_at_booking: number | null;
  total_price: number | null;
  is_archived: boolean;
  archived_at: string | null;
  total_duration_minutes: number | null;
  booking_ip: string | null;
  services: { name: string; price: number | null } | null;
  appointment_services: {
    service_id: number;
    service_name: string;
    price_at_booking: number | null;
    duration_minutes: number;
  }[];
};

type BlockedIp = {
  id: number;
  ip: string;
  reason: string | null;
  created_at: string;
};

type Service = {
  id: number;
  name: string;
  price: number | null;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number | null;
};

type WorkingHour = {
  id: number;
  day_of_week: number;
  day_name: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

type BusinessSettings = {
  id: number;
  barber_name: string;
  phone: string;
  instagram: string;
  address: string | null;
  appointment_interval: number;
};

type ActivityLog = {
  id: number;
  appointment_id: number | null;
  action_type: string;
  description: string;
  created_at: string;
};

type BlockedTimeRange = {
  id: number;
  block_date: string;
  start_time: string;
  end_time: string;
};

type ErrorLog = {
  id: number;
  endpoint: string;
  stage: string;
  http_status: number;
  error_code: string | null;
  customer_message: string;
  technical_message: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  service_ids: number[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Tab =
  | "appointments"
  | "statistics"
  | "history"
  | "logs"
  | "errors"
  | "services"
  | "hours"
  | "business";

export default function AdminPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("appointments");
  const [showRevenueSummary, setShowRevenueSummary] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [serviceChangeAppointment, setServiceChangeAppointment] =
    useState<Appointment | null>(null);
  const [serviceChangeId, setServiceChangeId] = useState<number | null>(null);
  const [serviceChangeSaving, setServiceChangeSaving] = useState(false);

  const [manualSlot, setManualSlot] = useState<{ date: string; time: string } | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualServiceId, setManualServiceId] = useState<number | null>(null);
  const [manualSaving, setManualSaving] = useState(false);

  const [moveAppointment, setMoveAppointment] = useState<Appointment | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [ipActionLoading, setIpActionLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [blockedTimeRanges, setBlockedTimeRanges] = useState<BlockedTimeRange[]>([]);
  const [blockDay, setBlockDay] = useState<string | null>(null);
  const [blockStartTime, setBlockStartTime] = useState("15:00");
  const [blockEndTime, setBlockEndTime] = useState("17:00");
  const [blockSaving, setBlockSaving] = useState(false);

  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [newAppointmentNotice, setNewAppointmentNotice] = useState<{
    name: string;
    date: string;
    time: string;
  } | null>(null);

  const showNotice = (type: "success" | "error", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3000);
  };

  const localDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDate = (date: string) => {
    if (!date) return "-";
    const [year, month, day] = date.split("-");
    return `${day}.${month}.${year}`;
  };

  const formatLogDate = (value: string) => {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

  const appointmentDuration = (appointment: Appointment) => {
    const stored = Number(appointment.total_duration_minutes);
    if (stored > 0) return stored;

    const snapshotTotal = (appointment.appointment_services ?? []).reduce(
      (sum, item) => sum + Number(item.duration_minutes || 0),
      0
    );

    return snapshotTotal > 0 ? snapshotTotal : business?.appointment_interval ?? 30;
  };

  const isSlotAvailable = (
    date: string,
    time: string,
    duration: number,
    excludeAppointmentId?: number
  ) => {
    const start = timeToMinutesAdmin(time);
    const end = start + duration;

    const blocked = blockedTimeRanges.some((item) =>
      item.block_date === date &&
      start < timeToMinutesAdmin(item.end_time) &&
      timeToMinutesAdmin(item.start_time) < end
    );
    if (blocked) return false;

    return !appointments.some((appointment) => {
      if (
        appointment.id === excludeAppointmentId ||
        appointment.is_archived ||
        appointment.appointment_date !== date ||
        ["cancelled", "rejected"].includes(appointment.status)
      ) {
        return false;
      }

      const existingStart = timeToMinutesAdmin(appointment.appointment_time);
      const existingEnd = existingStart + appointmentDuration(appointment);

      return start < existingEnd && existingStart < end;
    });
  };

  const isManualSlotAvailable = (
    date: string,
    time: string,
    duration: number
  ) => isSlotAvailable(date, time, duration);

  const loadAppointments = async () => {
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        customer_name,
        customer_phone,
        customer_note,
        appointment_date,
        appointment_time,
        status,
        price_at_booking,
        total_price,
        is_archived,
        archived_at,
        total_duration_minutes,
        booking_ip,
        services (name, price),
        appointment_services (
          service_id,
          service_name,
          price_at_booking,
          duration_minutes
        )
      `)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (error) throw error;
    setAppointments((data ?? []) as unknown as Appointment[]);
  };

  const loadBlockedIps = async () => {
    const { data, error } = await supabase
      .from("blocked_ips")
      .select("id,ip,reason,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setBlockedIps((data ?? []) as BlockedIp[]);
  };

  const loadActivityLogs = async () => {
    const { data, error } = await supabase
      .from("admin_activity_logs")
      .select("id,appointment_id,action_type,description,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    setActivityLogs((data ?? []) as ActivityLog[]);
  };

  const loadErrorLogs = async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("error_logs")
      .select("id,endpoint,stage,http_status,error_code,customer_message,technical_message,appointment_date,appointment_time,service_ids,metadata,created_at")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    setErrorLogs((data ?? []) as ErrorLog[]);
  };

  const loadSettings = async () => {
    // Kritik panel verilerini eski çalışan sürümdeki gibi yükle.
    // Saat kapatma kayıtları panelin/login'in açılmasını BLOKE ETMEZ.
    const [servicesResult, hoursResult, businessResult] = await Promise.all([
      supabase
        .from("services")
        .select("id,name,price,duration_minutes,is_active,sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("working_hours")
        .select("id,day_of_week,day_name,is_open,open_time,close_time")
        .order("day_of_week", { ascending: true }),
      supabase
        .from("business_settings")
        .select("id,barber_name,phone,instagram,address,appointment_interval")
        .limit(1)
        .single(),
    ]);

    if (servicesResult.error) throw servicesResult.error;
    if (hoursResult.error) throw hoursResult.error;
    if (businessResult.error) throw businessResult.error;

    setServices((servicesResult.data ?? []) as Service[]);
    setWorkingHours((hoursResult.data ?? []) as WorkingHour[]);
    setBusiness(businessResult.data as BusinessSettings);
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
        loadAppointments(),
        loadActivityLogs(),
        loadErrorLogs(),
        loadSettings(),
      ]);
    } catch (err) {
      console.error(err);
      setError("Panel verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { data: isAdmin, error: adminError } =
          await supabase.rpc("is_admin");

        if (!adminError && isAdmin === true) {
          setLoggedIn(true);
          await loadAll();
        } else {
          await supabase.auth.signOut();
        }
      }

      setChecking(false);
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    // IP engel listesi yardımcı veridir. Bu sorgu gecikse bile
    // admin panelinin açılışını ve ana randevu listesini bekletmez.
    loadBlockedIps().catch((err) => {
      console.error("Engellenen IP listesi yüklenemedi:", err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;

    const channel = supabase
      .channel("admin-new-appointments")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
        },
        async (payload) => {
          const row = payload.new as {
            customer_name?: string;
            appointment_date?: string;
            appointment_time?: string;
          };

          setNewAppointmentNotice({
            name: row.customer_name || "Yeni müşteri",
            date: row.appointment_date || "",
            time: row.appointment_time?.slice(0, 5) || "",
          });

          try {
            await loadAppointments();
          } catch (err) {
            console.error("Yeni randevu sonrası liste yenilenemedi:", err);
          }

          window.setTimeout(() => {
            setNewAppointmentNotice(null);
          }, 7000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (loginError) {
      setError("E-posta veya şifre hatalı.");
      setLoading(false);
      return;
    }

    const { data: isAdmin, error: adminError } =
      await supabase.rpc("is_admin");

    if (adminError || isAdmin !== true) {
      await supabase.auth.signOut();
      setError("Bu hesabın yönetim paneline erişim yetkisi yok.");
      setLoading(false);
      return;
    }

    setLoggedIn(true);
    setPassword("");
    await loadAll();
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    return Uint8Array.from(
      [...rawData].map((char) => char.charCodeAt(0))
    );
  };

  const enablePushNotifications = async () => {
    if (pushLoading) return;

    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      showNotice("error", "Bu tarayıcı push bildirimlerini desteklemiyor.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      showNotice("error", "Push bildirim anahtarı bulunamadı.");
      return;
    }

    setPushLoading(true);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        showNotice("error", "Bildirim izni verilmedi.");
        setPushLoading(false);
        return;
      }

      const registration =
        await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const subscriptionJson = subscription.toJSON();
      const endpoint = subscriptionJson.endpoint;
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        throw new Error("Push abonelik bilgileri eksik.");
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw userError ?? new Error("Admin oturumu bulunamadı.");
      }

      const { error: saveError } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

      if (saveError) throw saveError;

      setPushEnabled(true);
      showNotice("success", "Telefon bildirimleri açıldı.");
    } catch (err) {
      console.error("Push bildirimi açılamadı:", err);
      showNotice("error", "Telefon bildirimleri açılamadı.");
    } finally {
      setPushLoading(false);
    }
  };

  useEffect(() => {
    if (!loggedIn) return;

    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }

    const checkPush = async () => {
      try {
        const registration =
          await navigator.serviceWorker.register("/sw.js");
        const subscription =
          await registration.pushManager.getSubscription();

        setPushEnabled(
          Notification.permission === "granted" &&
            subscription !== null
        );
      } catch (err) {
        console.error("Push durumu kontrol edilemedi:", err);
      }
    };

    checkPush();
  }, [loggedIn]);

  const logout = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setAppointments([]);
    setBlockedIps([]);
    setActivityLogs([]);
    setErrorLogs([]);
    setServices([]);
    setWorkingHours([]);
    setBlockedTimeRanges([]);
    setBusiness(null);
  };

  const addActivityLog = async (
    appointmentId: number | null,
    actionType: string,
    description: string
  ) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw userError ?? new Error("Admin oturumu bulunamadı.");
    }

    const { error: logError } = await supabase
      .from("admin_activity_logs")
      .insert({
        admin_user_id: user.id,
        appointment_id: appointmentId,
        action_type: actionType,
        description,
      });

    if (logError) throw logError;
  };

  const toggleIpBlock = async (appointment: Appointment) => {
    const ip = appointment.booking_ip?.trim();
    if (!ip || ip === "::1") {
      showNotice("error", "Bu randevuda engellenebilir bir IP adresi yok.");
      return;
    }

    if (ipActionLoading) return;
    const existing = blockedIps.find((item) => item.ip === ip);
    const confirmed = window.confirm(
      existing
        ? `${ip} IP adresinin engeli kaldırılsın mı?`
        : `${ip} IP adresi tamamen engellensin mi?`
    );
    if (!confirmed) return;

    setIpActionLoading(true);
    try {
      if (existing) {
        const { error } = await supabase
          .from("blocked_ips")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        showNotice("success", "IP engeli kaldırıldı.");
      } else {
        const { error } = await supabase.from("blocked_ips").insert({
          ip,
          reason: `${appointment.customer_name} adlı müşterinin randevusundan admin tarafından engellendi.`,
        });
        if (error) throw error;
        showNotice("success", "IP adresi engellendi.");
      }
      await loadBlockedIps();
    } catch (err) {
      console.error("IP engelleme işlemi başarısız:", err);
      showNotice("error", "IP engelleme işlemi yapılamadı.");
    } finally {
      setIpActionLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    if (updatingId !== null) return;

    const target = appointments.find((item) => item.id === id);

    if (!target) {
      showNotice("error", "Randevu bulunamadı.");
      return;
    }

    setUpdatingId(id);

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .select("id,status")
      .single();

    if (error || !data) {
      console.error(error);
      showNotice("error", "İşlem gerçekleştirilemedi.");
      setUpdatingId(null);
      return;
    }

    setAppointments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: data.status } : item
      )
    );

    const actionLabels: Record<string, string> = {
      approved: "onaylandı",
      completed: "tamamlandı",
      rejected: "reddedildi",
      cancelled: "iptal edildi",
    };

    const actionTypeLabels: Record<string, string> = {
      approved: "appointment_approved",
      completed: "appointment_completed",
      rejected: "appointment_rejected",
      cancelled: "appointment_cancelled",
    };

    try {
      await addActivityLog(
        id,
        actionTypeLabels[status] ?? "appointment_updated",
        `${target.customer_name} adlı müşterinin ${formatDate(
          target.appointment_date
        )} ${target.appointment_time.slice(0, 5)} randevusu ${
          actionLabels[status] ?? "güncellendi"
        }.`
      );
      await loadActivityLogs();
    } catch (logError) {
      console.error("İşlem logu kaydedilemedi:", logError);
      showNotice(
        "error",
        "Randevu güncellendi fakat işlem geçmişi kaydedilemedi."
      );
      setUpdatingId(null);
      return;
    }

    const messages: Record<string, string> = {
      approved: "Randevu başarıyla onaylandı.",
      completed: "Randevu başarıyla tamamlandı.",
      rejected: "Randevu reddedildi.",
      cancelled: "Randevu iptal edildi.",
    };

    showNotice(
      "success",
      messages[status] ?? "Randevu güncellendi."
    );
    setUpdatingId(null);
  };

  const openServiceChange = (appointment: Appointment) => {
    const currentServiceName =
      appointment.appointment_services?.[0]?.service_name ??
      appointment.services?.name ??
      "";

    const currentService = services.find(
      (service) => service.name === currentServiceName
    );

    setServiceChangeAppointment(appointment);
    setServiceChangeId(currentService?.id ?? null);
    setSelectedAppointment(null);
  };

  const saveServiceChange = async () => {
    if (
      !serviceChangeAppointment ||
      !serviceChangeId ||
      serviceChangeSaving
    ) {
      return;
    }

    const selectedService = services.find(
      (service) => service.id === serviceChangeId && service.is_active
    );

    if (!selectedService) {
      showNotice("error", "Seçilen hizmet bulunamadı.");
      return;
    }

    if (
      !isSlotAvailable(
        serviceChangeAppointment.appointment_date,
        serviceChangeAppointment.appointment_time.slice(0, 5),
        selectedService.duration_minutes,
        serviceChangeAppointment.id
      )
    ) {
      showNotice(
        "error",
        "Bu hizmetin süresi sonraki randevuyla çakışıyor. Önce saati değiştir."
      );
      return;
    }

    const oldServiceName =
      getAppointmentServicesText(serviceChangeAppointment);
    const oldPrice = serviceChangeAppointment.total_price;
    const oldDuration = serviceChangeAppointment.total_duration_minutes;
    const oldPrimaryPrice = serviceChangeAppointment.price_at_booking;
    const oldSnapshots = serviceChangeAppointment.appointment_services ?? [];
    const oldServiceId = oldSnapshots[0]?.service_id ?? null;

    setServiceChangeSaving(true);

    try {
      const { error: appointmentError } = await supabase
        .from("appointments")
        .update({
          service_id: selectedService.id,
          price_at_booking: selectedService.price ?? 0,
          total_price: selectedService.price ?? 0,
          total_duration_minutes: selectedService.duration_minutes,
        })
        .eq("id", serviceChangeAppointment.id);

      if (appointmentError) throw appointmentError;

      const { error: deleteSnapshotError } = await supabase
        .from("appointment_services")
        .delete()
        .eq("appointment_id", serviceChangeAppointment.id);

      if (deleteSnapshotError) throw deleteSnapshotError;

      const { error: insertSnapshotError } = await supabase
        .from("appointment_services")
        .insert({
          appointment_id: serviceChangeAppointment.id,
          service_id: selectedService.id,
          service_name: selectedService.name,
          price_at_booking: selectedService.price ?? 0,
          duration_minutes: selectedService.duration_minutes,
        });

      if (insertSnapshotError) throw insertSnapshotError;

      try {
        await addActivityLog(
          serviceChangeAppointment.id,
          "appointment_service_changed",
          `${serviceChangeAppointment.customer_name} adlı müşterinin hizmeti ${oldServiceName} → ${selectedService.name} olarak değiştirildi.`
        );
      } catch (logError) {
        console.error("Hizmet değişikliği logu kaydedilemedi:", logError);
      }

      await Promise.all([loadAppointments(), loadActivityLogs()]);
      setServiceChangeAppointment(null);
      setServiceChangeId(null);
      showNotice(
        "success",
        `Hizmet ${selectedService.name} olarak değiştirildi. Kazanç ve süre güncellendi.`
      );
    } catch (err) {
      console.error("Hizmet değiştirilemedi:", err);

      // Ana randevu veya snapshot adımlarından biri hata verirse
      // eski hizmet/fiyat/süre bilgilerini mümkün olduğunca geri yükle.
      const rollbackAppointment: Record<string, number | null> = {
        price_at_booking: oldPrimaryPrice,
        total_price: oldPrice,
        total_duration_minutes: oldDuration,
      };

      if (oldServiceId !== null) {
        rollbackAppointment.service_id = oldServiceId;
      }

      await supabase
        .from("appointments")
        .update(rollbackAppointment)
        .eq("id", serviceChangeAppointment.id);

      if (oldSnapshots.length > 0) {
        await supabase
          .from("appointment_services")
          .delete()
          .eq("appointment_id", serviceChangeAppointment.id);

        await supabase
          .from("appointment_services")
          .insert(
            oldSnapshots.map((snapshot) => ({
              appointment_id: serviceChangeAppointment.id,
              service_id: snapshot.service_id,
              service_name: snapshot.service_name,
              price_at_booking: snapshot.price_at_booking,
              duration_minutes: snapshot.duration_minutes,
            }))
          );
      }

      showNotice("error", "Hizmet değiştirilemedi. Eski hizmet korunmaya çalışıldı.");
      await loadAppointments();
    } finally {
      setServiceChangeSaving(false);
    }
  };

  const openManualAppointment = (date: string, time: string) => {
    setManualSlot({ date, time });
    setManualName("");
    setManualPhone("");
    setManualServiceId(null);
  };

  const saveManualAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualSlot || manualSaving) return;

    const name = manualName.trim();
    const phone = manualPhone.trim();
    const selectedService = services.find(
      (service) => service.id === manualServiceId && service.is_active
    );

    if (name.length < 2) {
      showNotice("error", "Müşteri adını gir.");
      return;
    }

    if (phone && phone.replace(/\\D/g, "").length < 10) {
      showNotice("error", "Telefon gireceksen geçerli bir numara gir.");
      return;
    }

    if (!selectedService) {
      showNotice("error", "Bir hizmet seç.");
      return;
    }

    if (
      !isManualSlotAvailable(
        manualSlot.date,
        manualSlot.time,
        selectedService.duration_minutes
      )
    ) {
      showNotice(
        "error",
        "Bu saat seçilen işlemin süresi nedeniyle uygun değil."
      );
      return;
    }

    setManualSaving(true);

    try {
      const { data, error: insertError } = await supabase
        .from("appointments")
        .insert({
          service_id: selectedService.id,
          customer_name: name,
          customer_phone: phone,
          customer_note: "Admin panelinden manuel eklendi.",
          appointment_date: manualSlot.date,
          appointment_time: manualSlot.time,
          status: "approved",
          price_at_booking: selectedService.price ?? 0,
          total_price: selectedService.price ?? 0,
          total_duration_minutes: selectedService.duration_minutes,
          is_archived: false,
        })
        .select("id")
        .single();

      if (insertError || !data) throw insertError ?? new Error("Randevu oluşturulamadı.");

      const { error: serviceSnapshotError } = await supabase
        .from("appointment_services")
        .insert({
          appointment_id: data.id,
          service_id: selectedService.id,
          service_name: selectedService.name,
          price_at_booking: selectedService.price ?? 0,
          duration_minutes: selectedService.duration_minutes,
        });

      if (serviceSnapshotError) {
        console.error("Manuel randevu hizmet kaydı eklenemedi:", serviceSnapshotError);
        await supabase
          .from("appointments")
          .delete()
          .eq("id", data.id)
          .eq("customer_note", "Admin panelinden manuel eklendi.");
        throw serviceSnapshotError;
      }

      try {
        await addActivityLog(
          data.id,
          "appointment_created_manually",
          `${name} adlı müşteri ${formatDate(manualSlot.date)} ${manualSlot.time} saatine admin panelinden manuel eklendi.`
        );
      } catch (logError) {
        console.error("Manuel randevu işlem logu kaydedilemedi:", logError);
      }

      await Promise.all([loadAppointments(), loadActivityLogs()]);
      showNotice("success", `${name} ${manualSlot.time} saatine eklendi.`);
      setManualSlot(null);
      setManualName("");
      setManualPhone("");
      setManualServiceId(null);
    } catch (err) {
      console.error("Manuel randevu eklenemedi:", err);
      showNotice("error", "Müşteri eklenemedi. Saat dolu olabilir.");
    } finally {
      setManualSaving(false);
    }
  };

  const getDateSchedule = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`);
    const jsDay = parsed.getDay();
    if (jsDay === 0) {
      return { isOpen: false, openTime: "10:00", closeTime: "22:00" };
    }

    // Veritabanında Pazartesi=1 ... Pazar=7 düzenini kullanıyoruz.
    const normal = workingHours.find((item) => item.day_of_week === jsDay);
    return {
      isOpen: normal?.is_open ?? true,
      openTime: normal?.open_time?.slice(0, 5) ?? "10:00",
      closeTime: normal?.close_time?.slice(0, 5) ?? "22:00",
    };
  };

  const getMoveDates = () => {
    const result: string[] = [];
    const today = new Date();

    for (let i = 0; result.length < 20 && i < 40; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const key = localDateKey(date);
      if (getDateSchedule(key).isOpen) result.push(key);
    }

    return result;
  };

  const getMoveTimes = (appointment: Appointment, date: string) => {
    if (!date) return [];

    const schedule = getDateSchedule(date);
    if (!schedule.isOpen) return [];

    const duration = appointmentDuration(appointment);
    const interval = Math.max(15, Number(business?.appointment_interval || 15));
    const open = timeToMinutesAdmin(schedule.openTime);
    const close = timeToMinutesAdmin(schedule.closeTime);
    const result: string[] = [];

    for (let minute = open; minute + duration <= close; minute += interval) {
      const time = minutesToTimeAdmin(minute);
      if (isSlotAvailable(date, time, duration, appointment.id)) {
        result.push(time);
      }
    }

    return result;
  };

  const openMoveAppointment = (appointment: Appointment) => {
    const dates = getMoveDates();
    const initialDate = dates.includes(appointment.appointment_date)
      ? appointment.appointment_date
      : dates[0] ?? "";

    setMoveAppointment(appointment);
    setMoveDate(initialDate);
    setMoveTime("");
    setSelectedAppointment(null);
  };

  const saveMovedAppointment = async () => {
    if (!moveAppointment || !moveDate || !moveTime || moveSaving) return;

    const duration = appointmentDuration(moveAppointment);
    if (!isSlotAvailable(moveDate, moveTime, duration, moveAppointment.id)) {
      showNotice("error", "Seçtiğin saat artık dolu. Başka bir saat seç.");
      return;
    }

    const oldDate = moveAppointment.appointment_date;
    const oldTime = moveAppointment.appointment_time.slice(0, 5);

    setMoveSaving(true);

    const { error: moveError } = await supabase
      .from("appointments")
      .update({
        appointment_date: moveDate,
        appointment_time: moveTime,
      })
      .eq("id", moveAppointment.id);

    if (moveError) {
      console.error("Randevu taşınamadı:", moveError);
      showNotice("error", "Randevu taşınamadı. Saat dolmuş olabilir.");
      setMoveSaving(false);
      return;
    }

    try {
      await addActivityLog(
        moveAppointment.id,
        "appointment_moved",
        `${moveAppointment.customer_name} adlı müşterinin randevusu ${formatDate(
          oldDate
        )} ${oldTime} saatinden ${formatDate(moveDate)} ${moveTime} saatine taşındı.`
      );
    } catch (logError) {
      console.error("Taşıma işlem logu kaydedilemedi:", logError);
    }

    await Promise.all([loadAppointments(), loadActivityLogs()]);
    showNotice(
      "success",
      `Randevu ${formatDate(moveDate)} ${moveTime} saatine taşındı.`
    );
    setMoveAppointment(null);
    setMoveDate("");
    setMoveTime("");
    setMoveSaving(false);
  };

  const deleteManualAppointment = async (appointment: Appointment) => {
    if (updatingId !== null) return;

    const confirmed = window.confirm(
      `${appointment.customer_name} adlı manuel randevu tamamen silinsin mi?`
    );
    if (!confirmed) return;

    setUpdatingId(appointment.id);

    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id)
      .eq("customer_note", "Admin panelinden manuel eklendi.");

    if (deleteError) {
      console.error("Manuel randevu silinemedi:", deleteError);
      showNotice("error", "Manuel randevu silinemedi.");
      setUpdatingId(null);
      return;
    }

    try {
      await addActivityLog(
        null,
        "appointment_deleted_manually",
        `${appointment.customer_name} adlı müşterinin ${formatDate(
          appointment.appointment_date
        )} ${appointment.appointment_time.slice(0, 5)} manuel randevusu silindi.`
      );
    } catch (logError) {
      console.error("Silme işlem logu kaydedilemedi:", logError);
    }

    setSelectedAppointment(null);
    await Promise.all([loadAppointments(), loadActivityLogs()]);
    showNotice("success", "Manuel randevu silindi.");
    setUpdatingId(null);
  };

  const archiveDay = async () => {
    if (archiving) return;

    const todayKey = localDateKey(new Date());

    const archivable = appointments.filter(
      (appointment) =>
        !appointment.is_archived &&
        appointment.appointment_date <= todayKey &&
        ["completed", "rejected", "cancelled"].includes(
          appointment.status
        )
    );

    if (archivable.length === 0) {
      showNotice(
        "error",
        "Arşivlenecek tamamlanmış, reddedilmiş veya iptal edilmiş randevu yok."
      );
      return;
    }

    const confirmed = window.confirm(
      `${archivable.length} randevu arşive taşınacak. Kayıtlar silinmeyecek. Devam edilsin mi?`
    );

    if (!confirmed) return;

    setArchiving(true);

    const ids = archivable.map((appointment) => appointment.id);
    const archivedAt = new Date().toISOString();

    const { error: archiveError } = await supabase
      .from("appointments")
      .update({
        is_archived: true,
        archived_at: archivedAt,
      })
      .in("id", ids);

    if (archiveError) {
      console.error(archiveError);
      showNotice("error", "Randevular arşivlenemedi.");
      setArchiving(false);
      return;
    }

    try {
      await addActivityLog(
        null,
        "day_archived",
        `${formatDate(todayKey)} tarihinde ${archivable.length} randevu arşive taşındı.`
      );
    } catch (logError) {
      console.error("Arşiv logu kaydedilemedi:", logError);
    }

    await Promise.all([loadAppointments(), loadActivityLogs()]);
    setActiveTab("history");
    showNotice(
      "success",
      `${archivable.length} randevu geçmişe taşındı.`
    );
    setArchiving(false);
  };

  const saveService = async (service: Service) => {
    setSaving(true);

    const { error } = await supabase
      .from("services")
      .update({
        name: service.name.trim(),
        price: service.price,
        duration_minutes: service.duration_minutes,
        is_active: service.is_active,
      })
      .eq("id", service.id);

    setSaving(false);

    if (error) {
      console.error(error);
      showNotice("error", "Hizmet kaydedilemedi.");
      return;
    }

    showNotice("success", `${service.name} kaydedildi.`);
  };

  const addService = async () => {
    setSaving(true);

    const nextSort = services.length
      ? Math.max(...services.map((s) => s.sort_order ?? 0)) + 1
      : 1;

    const { data, error } = await supabase
      .from("services")
      .insert({
        name: "Yeni Hizmet",
        price: null,
        duration_minutes: business?.appointment_interval ?? 45,
        is_active: true,
        sort_order: nextSort,
      })
      .select("id,name,price,duration_minutes,is_active,sort_order")
      .single();

    setSaving(false);

    if (error || !data) {
      console.error(error);
      showNotice("error", "Yeni hizmet eklenemedi.");
      return;
    }

    setServices((current) => [...current, data as Service]);
    showNotice(
      "success",
      "Yeni hizmet eklendi. Adını ve fiyatını düzenleyebilirsin."
    );
  };

  const saveWorkingHour = async (day: WorkingHour) => {
    setSaving(true);

    const { error } = await supabase
      .from("working_hours")
      .update({
        is_open: day.is_open,
        open_time: day.open_time,
        close_time: day.close_time,
      })
      .eq("id", day.id);

    setSaving(false);

    if (error) {
      console.error(error);
      showNotice("error", `${day.day_name} kaydedilemedi.`);
      return;
    }

    showNotice(
      "success",
      `${day.day_name} çalışma saati kaydedildi.`
    );
  };

  const loadBlockedTimeRanges = async () => {
    const { data, error } = await supabase.from("blocked_time_ranges").select("id,block_date,start_time,end_time").order("block_date", { ascending: true }).order("start_time", { ascending: true });
    if (error) throw error;
    setBlockedTimeRanges((data ?? []) as BlockedTimeRange[]);
  };

  useEffect(() => {
    if (!loggedIn) return;

    // Saat kapatma verisi ayrı yüklenir. Bu sorgu gecikse bile
    // giriş ekranı ve haftalık randevu takvimi beklemez.
    loadBlockedTimeRanges().catch((err) => {
      console.error("Kapalı saatler yüklenemedi:", err);
      showNotice("error", "Kapalı saatler yüklenemedi. Takvim yine kullanılabilir.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);
  const openBlockDay = (date: string) => { setBlockDay(date); const schedule = getDateSchedule(date); setBlockStartTime(schedule.openTime); setBlockEndTime(schedule.closeTime); };
  const saveBlockedTimeRange = async () => {
    if (!blockDay || blockSaving) return;
    if (!blockStartTime || !blockEndTime || blockStartTime >= blockEndTime) return showNotice("error", "Başlangıç ve bitiş saatlerini kontrol et.");
    const start=timeToMinutesAdmin(blockStartTime), end=timeToMinutesAdmin(blockEndTime);
    const hasAppointment=appointments.some(a=>!a.is_archived && a.appointment_date===blockDay && !["cancelled","rejected"].includes(a.status) && start < timeToMinutesAdmin(a.appointment_time)+appointmentDuration(a) && timeToMinutesAdmin(a.appointment_time)<end);
    if(hasAppointment) return showNotice("error","Bu saat aralığında mevcut randevu var. Önce randevuyu taşı veya iptal et.");
    const overlaps=blockedTimeRanges.some(i=>i.block_date===blockDay && start<timeToMinutesAdmin(i.end_time) && timeToMinutesAdmin(i.start_time)<end);
    if(overlaps) return showNotice("error","Bu aralık daha önce kapatılmış bir saatle çakışıyor.");
    setBlockSaving(true); const {error}=await supabase.from("blocked_time_ranges").insert({block_date:blockDay,start_time:blockStartTime,end_time:blockEndTime}); setBlockSaving(false);
    if(error){console.error(error);return showNotice("error","Saat aralığı kapatılamadı.");}
    await loadBlockedTimeRanges(); showNotice("success",`${formatDate(blockDay)} • ${blockStartTime}-${blockEndTime} kapatıldı.`);
  };
  const deleteBlockedTimeRange = async (id:number) => { const {error}=await supabase.from("blocked_time_ranges").delete().eq("id",id); if(error){console.error(error);return showNotice("error","Kapalı saat kaldırılamadı.");} await loadBlockedTimeRanges(); showNotice("success","Kapalı saat tekrar açıldı."); };
  const isTimeBlocked = (date:string,time:string) => { const m=timeToMinutesAdmin(time); return blockedTimeRanges.some(i=>i.block_date===date && m>=timeToMinutesAdmin(i.start_time) && m<timeToMinutesAdmin(i.end_time)); };

  const saveBusiness = async () => {
    if (!business) return;

    setSaving(true);

    const { error } = await supabase
      .from("business_settings")
      .update({
        barber_name: business.barber_name.trim(),
        phone: business.phone.trim(),
        instagram: business.instagram.trim(),
        address: business.address?.trim() || null,
        appointment_interval: business.appointment_interval,
      })
      .eq("id", business.id);

    setSaving(false);

    if (error) {
      console.error(error);
      showNotice("error", "İşletme ayarları kaydedilemedi.");
      return;
    }

    showNotice(
      "success",
      "İşletme ayarları başarıyla kaydedildi."
    );
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] text-white">
        <p className="text-white/40">Admin paneli yükleniyor...</p>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <form
          onSubmit={login}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101010] p-7 shadow-2xl"
        >
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a35b]/30 bg-[#c9a35b]/10 text-2xl text-[#c9a35b]">
              ✂
            </div>
            <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-[#c9a35b]">
              MURATHAN YAZAR
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              Yönetim Paneli
            </h1>
          </div>

          <label className="mt-8 block text-xs text-white/40">
            E-POSTA
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-4 outline-none focus:border-[#c9a35b]/60"
          />

          <label className="mt-5 block text-xs text-white/40">
            ŞİFRE
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-4 outline-none focus:border-[#c9a35b]/60"
          />

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-[#c9a35b] py-4 font-bold text-black transition hover:bg-[#dfbd76] disabled:opacity-50"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </main>
    );
  }

  const today = new Date();
  const todayKey = localDateKey(today);

  const monday = new Date(today);
  const dayNumber = monday.getDay();
  const diffToMonday = dayNumber === 0 ? -6 : 1 - dayNumber;
  monday.setDate(monday.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const weekStartKey = localDateKey(monday);
  const weekEndKey = localDateKey(sunday);

  const activeAppointments = appointments.filter(
    (appointment) => !appointment.is_archived
  );

  const archivedAppointments = appointments
    .filter((appointment) => appointment.is_archived)
    .sort((a, b) => {
      const dateCompare =
        b.appointment_date.localeCompare(a.appointment_date);

      if (dateCompare !== 0) return dateCompare;

      return b.appointment_time.localeCompare(a.appointment_time);
    });

  const pending = activeAppointments.filter(
    (appointment) => appointment.status === "pending"
  ).length;

  const todayAppointments = activeAppointments.filter(
    (appointment) =>
      appointment.appointment_date === todayKey &&
      !["rejected", "cancelled"].includes(appointment.status)
  ).length;

  const istanbulNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" })
  );
  const currentTimeKey = `${String(istanbulNow.getHours()).padStart(
    2,
    "0"
  )}:${String(istanbulNow.getMinutes()).padStart(2, "0")}`;

  // Haftalık müşteri ve kazanç, randevu oluşturulduğu anda hesaba girer.
  // İptal/reddedilen randevu ise otomatik olarak toplamdan çıkar.
  const weeklyRealized = appointments.filter(
    (appointment) =>
      !["cancelled", "rejected"].includes(appointment.status) &&
      appointment.appointment_date >= weekStartKey &&
      appointment.appointment_date <= weekEndKey
  );

  const weeklyCustomers = weeklyRealized.length;

  const appointmentRevenue = (appointment: Appointment) => {
    const snapshotServicesTotal = (appointment.appointment_services ?? []).reduce(
      (sum, service) => sum + Number(service.price_at_booking ?? 0),
      0
    );

    const appointmentTotal = Number(appointment.total_price ?? 0);
    const primaryPrice = Number(
      appointment.price_at_booking ?? appointment.services?.price ?? 0
    );

    return appointmentTotal > 0
      ? appointmentTotal
      : snapshotServicesTotal > 0
        ? snapshotServicesTotal
        : primaryPrice;
  };

  const todayActive = appointments.filter(
    (appointment) =>
      appointment.appointment_date === todayKey &&
      !["cancelled", "rejected"].includes(appointment.status)
  );

  const todayRevenue = todayActive.reduce(
    (total, appointment) => total + appointmentRevenue(appointment),
    0
  );

  const tomorrowDate = new Date(today);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrowDate);

  const tomorrowActive = appointments.filter(
    (appointment) =>
      appointment.appointment_date === tomorrowKey &&
      !["cancelled", "rejected"].includes(appointment.status)
  );

  const tomorrowAppointments = tomorrowActive.length;

  const tomorrowRevenue = tomorrowActive.reduce(
    (total, appointment) => total + appointmentRevenue(appointment),
    0
  );

  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthEndKey = localDateKey(monthEndDate);

  const monthlyActive = appointments.filter(
    (appointment) =>
      !["cancelled", "rejected"].includes(appointment.status) &&
      appointment.appointment_date >= monthStartKey &&
      appointment.appointment_date <= monthEndKey
  );

  const monthlyCustomers = monthlyActive.length;
  const monthlyRevenue = monthlyActive.reduce(
    (total, appointment) => total + appointmentRevenue(appointment),
    0
  );

  const weeklyCancelled = appointments.filter(
    (appointment) =>
      ["cancelled", "rejected"].includes(appointment.status) &&
      appointment.appointment_date >= weekStartKey &&
      appointment.appointment_date <= weekEndKey
  ).length;

  const nextAppointment = appointments
    .filter((appointment) => {
      if (["cancelled", "rejected"].includes(appointment.status)) return false;
      if (appointment.appointment_date > todayKey) return true;
      if (appointment.appointment_date < todayKey) return false;
      return appointment.appointment_time.slice(0, 5) >= currentTimeKey;
    })
    .sort((a, b) => {
      const dateCompare = a.appointment_date.localeCompare(b.appointment_date);
      return dateCompare !== 0
        ? dateCompare
        : a.appointment_time.localeCompare(b.appointment_time);
    })[0];

  const nextAppointmentValue = nextAppointment
    ? `${nextAppointment.customer_name} • ${
        nextAppointment.appointment_date === todayKey
          ? `Bugün ${nextAppointment.appointment_time.slice(0, 5)}`
          : nextAppointment.appointment_date === tomorrowKey
            ? `Yarın ${nextAppointment.appointment_time.slice(0, 5)}`
            : `${nextAppointment.appointment_date.slice(8, 10)}/${nextAppointment.appointment_date.slice(5, 7)} ${nextAppointment.appointment_time.slice(0, 5)}`
      }`
    : "Randevu yok";

  const nextAppointmentService = nextAppointment
    ? getAppointmentServicesText(nextAppointment)
    : "";

  const weeklyRevenue = weeklyRealized.reduce(
    (total, appointment) => total + appointmentRevenue(appointment),
    0
  );

  const archivableCount = activeAppointments.filter(
    (appointment) =>
      appointment.appointment_date <= todayKey &&
      ["completed", "rejected", "cancelled"].includes(
        appointment.status
      )
  ).length;

  // Takvim her zaman Pazartesi–Cumartesi sırasını gösterir.
  // Pazar admin takviminde yer almaz; ileri/geri kontrolleri gerçek hafta bazında çalışır.
  const calendarMonday = new Date(today);
  const calendarDayNumber = calendarMonday.getDay();
  const calendarDiffToMonday =
    calendarDayNumber === 0 ? -6 : 1 - calendarDayNumber;

  calendarMonday.setDate(
    calendarMonday.getDate() + calendarDiffToMonday + weekOffset * 7
  );
  calendarMonday.setHours(0, 0, 0, 0);

  const calendarDays = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(calendarMonday);
    date.setDate(calendarMonday.getDate() + index);

    const key = localDateKey(date);
    const dayAppointments = appointments
      .filter(
        (appointment) =>
          !appointment.is_archived &&
          appointment.appointment_date === key &&
          !["cancelled", "rejected"].includes(appointment.status)
      )
      .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));

    return {
      date,
      key,
      appointments: dayAppointments,
    };
  });

  const calendarStart = calendarDays[0].date;
  const calendarEnd = calendarDays[calendarDays.length - 1].date;
  const calendarRangeLabel = `${calendarStart.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  })} – ${calendarEnd.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;

  // Randevu yönetimi takvimi 15 dakikalık sabit aralıklarla çalışır.
  const calendarSlots: string[] = [];
  for (let totalMinutes = 10 * 60; totalMinutes <= 22 * 60; totalMinutes += 15) {
    calendarSlots.push(minutesToTimeAdmin(totalMinutes));
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      {showRevenueSummary && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowRevenueSummary(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#c9a35b]/25 bg-[#101010] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-[0.22em] text-[#c9a35b]">FİNANS</p>
                <h2 className="mt-1 text-2xl font-bold">Kazanç Özeti</h2>
                <p className="mt-1 text-xs leading-5 text-white/35">
                  Aktif randevuların planlanan kazanç toplamları.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRevenueSummary(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/45 hover:text-white"
              >
                Kapat
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <RevenueStat title="Bugünkü Kazanç" value={`${todayRevenue.toLocaleString("tr-TR")} ₺`} />
              <RevenueStat title="Yarınki Kazanç" value={`${tomorrowRevenue.toLocaleString("tr-TR")} ₺`} />
              <RevenueStat title="Bu Haftaki Kazanç" value={`${weeklyRevenue.toLocaleString("tr-TR")} ₺`} />
              <RevenueStat title="Bu Ayki Kazanç" value={`${monthlyRevenue.toLocaleString("tr-TR")} ₺`} />
            </div>
          </div>
        </div>
      )}

      {blockDay && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => !blockSaving && setBlockDay(null)}>
          <div className="w-full max-w-md rounded-2xl border border-[#c9a35b]/25 bg-[#111] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] tracking-[0.25em] text-[#c9a35b]">SAAT KAPAT</p><h2 className="mt-2 text-xl font-bold">{formatDate(blockDay)}</h2><p className="mt-1 text-xs text-white/40">Müşteriye kapalı olacak saat aralığını seç.</p></div><button type="button" onClick={() => setBlockDay(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50">Kapat</button></div>
            <div className="mt-6 grid grid-cols-2 gap-3"><Field label="Başlangıç"><input type="time" step="900" value={blockStartTime} onChange={(e)=>setBlockStartTime(e.target.value)} className={inputClass}/></Field><Field label="Bitiş"><input type="time" step="900" value={blockEndTime} onChange={(e)=>setBlockEndTime(e.target.value)} className={inputClass}/></Field></div>
            <button type="button" disabled={blockSaving} onClick={saveBlockedTimeRange} className="mt-5 w-full rounded-xl bg-[#c9a35b] py-3.5 text-sm font-bold text-black disabled:opacity-40">{blockSaving ? "Kapatılıyor..." : "Bu Saat Aralığını Kapat"}</button>
            <div className="mt-6 border-t border-white/10 pt-5"><p className="text-xs font-semibold text-white/55">BU GÜN KAPATILAN SAATLER</p><div className="mt-3 space-y-2">{blockedTimeRanges.filter(i=>i.block_date===blockDay).length===0 ? <p className="rounded-xl border border-white/10 px-4 py-3 text-xs text-white/30">Henüz kapatılmış saat yok.</p> : blockedTimeRanges.filter(i=>i.block_date===blockDay).map(i=><div key={i.id} className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3"><span className="text-sm font-semibold text-red-200">{i.start_time.slice(0,5)} – {i.end_time.slice(0,5)}</span><button type="button" onClick={()=>deleteBlockedTimeRange(i.id)} className="rounded-lg border border-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-300">Kaldır</button></div>)}</div></div>
          </div>
        </div>
      )}

      {manualSlot && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !manualSaving && setManualSlot(null)}
        >
          <form
            onSubmit={saveManualAppointment}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-[0.25em] text-[#c9a35b]">MANUEL RANDEVU</p>
                <h2 className="mt-2 text-xl font-bold">Müşteri Ekle</h2>
                <p className="mt-1 text-xs text-white/40">
                  {formatDate(manualSlot.date)} • {manualSlot.time}
                </p>
              </div>
              <button
                type="button"
                disabled={manualSaving}
                onClick={() => setManualSlot(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 disabled:opacity-40"
              >
                Kapat
              </button>
            </div>

            <label className="mt-6 block text-xs text-white/40">AD SOYAD</label>
            <input
              autoFocus
              required
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="Müşteri adı soyadı"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#c9a35b]/60"
            />

            <label className="mt-4 block text-xs text-white/40">
              TELEFON <span className="text-white/20">(OPSİYONEL)</span>
            </label>
            <input
              type="tel"
              value={manualPhone}
              onChange={(event) => setManualPhone(event.target.value)}
              placeholder="05xx xxx xx xx"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#c9a35b]/60"
            />

            <label className="mt-4 block text-xs text-white/40">HİZMET</label>
            <select
              required
              value={manualServiceId ?? ""}
              onChange={(event) =>
                setManualServiceId(event.target.value ? Number(event.target.value) : null)
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#c9a35b]/60"
            >
              <option value="">Hizmet seç</option>
              {services.filter((service) => service.is_active).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                  {service.price !== null ? ` • ${Number(service.price).toLocaleString("tr-TR")} ₺` : ""}
                  {` • ${service.duration_minutes} dk`}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={manualSaving}
              className="mt-6 w-full rounded-xl bg-[#c9a35b] py-3.5 text-sm font-bold text-black transition hover:bg-[#dfbd76] disabled:opacity-50"
            >
              {manualSaving ? "Ekleniyor..." : "Randevuyu Ekle"}
            </button>
          </form>
        </div>
      )}

      {moveAppointment && (
        <div
          className="fixed inset-0 z-[170] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => !moveSaving && setMoveAppointment(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-[0.25em] text-[#c9a35b]">
                  RANDEVUYU TAŞI
                </p>
                <h2 className="mt-2 text-xl font-bold">
                  {moveAppointment.customer_name}
                </h2>
                <p className="mt-1 text-xs text-white/40">
                  Şu an: {formatDate(moveAppointment.appointment_date)} •{" "}
                  {moveAppointment.appointment_time.slice(0, 5)}
                </p>
              </div>
              <button
                type="button"
                disabled={moveSaving}
                onClick={() => setMoveAppointment(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 disabled:opacity-40"
              >
                Kapat
              </button>
            </div>

            <label className="mt-6 block text-xs text-white/40">YENİ TARİH</label>
            <select
              value={moveDate}
              onChange={(event) => {
                setMoveDate(event.target.value);
                setMoveTime("");
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#c9a35b]/60"
            >
              {getMoveDates().map((date) => (
                <option key={date} value={date}>
                  {formatDate(date)}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-xs text-white/40">YENİ SAAT</label>
            <div className="mt-2 grid max-h-48 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
              {getMoveTimes(moveAppointment, moveDate).map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setMoveTime(time)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                    moveTime === time
                      ? "border-[#c9a35b] bg-[#c9a35b] text-black"
                      : "border-white/10 bg-[#171717] text-white/70 hover:border-[#c9a35b]/50"
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>

            {getMoveTimes(moveAppointment, moveDate).length === 0 && (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-xs text-white/40">
                Bu tarihte işlemin sığacağı boş saat yok.
              </div>
            )}

            <p className="mt-3 text-[11px] leading-5 text-white/35">
              Yalnızca {appointmentDuration(moveAppointment)} dakikalık işlemin
              tamamının boş olduğu saatler gösterilir.
            </p>

            <button
              type="button"
              disabled={!moveTime || moveSaving}
              onClick={saveMovedAppointment}
              className="mt-5 w-full rounded-xl bg-[#c9a35b] py-3.5 text-sm font-bold text-black transition hover:bg-[#dfbd76] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {moveSaving ? "Taşınıyor..." : "Randevuyu Taşı"}
            </button>
          </div>
        </div>
      )}

      {serviceChangeAppointment && (
        <div
          className="fixed inset-0 z-[175] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() =>
            !serviceChangeSaving && setServiceChangeAppointment(null)
          }
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-[0.25em] text-[#c9a35b]">
                  HİZMET DEĞİŞTİR
                </p>
                <h2 className="mt-2 text-xl font-bold">
                  {serviceChangeAppointment.customer_name}
                </h2>
                <p className="mt-1 text-xs text-white/40">
                  Şu an: {getAppointmentServicesText(serviceChangeAppointment)}
                </p>
              </div>
              <button
                type="button"
                disabled={serviceChangeSaving}
                onClick={() => setServiceChangeAppointment(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 disabled:opacity-40"
              >
                Kapat
              </button>
            </div>

            <label className="mt-6 block text-xs text-white/40">
              YENİ HİZMET
            </label>
            <select
              value={serviceChangeId ?? ""}
              onChange={(event) =>
                setServiceChangeId(
                  event.target.value ? Number(event.target.value) : null
                )
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm text-white outline-none focus:border-[#c9a35b]/60"
            >
              <option value="">Hizmet seç</option>
              {services
                .filter((service) => service.is_active)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                    {service.price !== null
                      ? ` • ${Number(service.price).toLocaleString("tr-TR")} ₺`
                      : ""}
                    {` • ${service.duration_minutes} dk`}
                  </option>
                ))}
            </select>

            <p className="mt-3 text-xs leading-5 text-white/35">
              Hizmet değişince randevunun fiyatı ve süresi de yeni hizmete göre
              güncellenir. Kazanç özeti yeni fiyatı kullanır.
            </p>

            <button
              type="button"
              disabled={!serviceChangeId || serviceChangeSaving}
              onClick={saveServiceChange}
              className="mt-5 w-full rounded-xl bg-[#c9a35b] py-3.5 text-sm font-bold text-black transition hover:bg-[#dfbd76] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {serviceChangeSaving ? "Değiştiriliyor..." : "Hizmeti Değiştir"}
            </button>
          </div>
        </div>
      )}

      {selectedAppointment && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setSelectedAppointment(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-[0.25em] text-[#c9a35b]">
                  RANDEVU DETAYI
                </p>
                <h2
                  className={`mt-2 text-xl font-bold ${
                    selectedAppointment.status === "cancelled"
                      ? "text-white/35 line-through"
                      : "text-white"
                  }`}
                >
                  {selectedAppointment.customer_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50"
              >
                Kapat
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Info label="Telefon" value={selectedAppointment.customer_phone} />
              <Info
                label="Hizmet"
                value={getAppointmentServicesText(selectedAppointment)}
              />
              <Info
                label="Tarih"
                value={formatDate(selectedAppointment.appointment_date)}
              />
              <Info
                label="Saat"
                value={selectedAppointment.appointment_time.slice(0, 5)}
              />
              <Info
                label="IP Adresi"
                value={selectedAppointment.booking_ip || "Eski kayıt / IP yok"}
              />
            </div>

            {selectedAppointment.booking_ip && selectedAppointment.booking_ip !== "::1" && (
              <button
                type="button"
                disabled={ipActionLoading}
                onClick={() => toggleIpBlock(selectedAppointment)}
                className={`mt-3 w-full rounded-xl border px-3 py-3 text-xs font-semibold disabled:opacity-40 ${
                  blockedIps.some((item) => item.ip === selectedAppointment.booking_ip)
                    ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-300"
                    : "border-red-500/25 bg-red-500/[0.07] text-red-300"
                }`}
              >
                {ipActionLoading
                  ? "İşleniyor..."
                  : blockedIps.some((item) => item.ip === selectedAppointment.booking_ip)
                    ? "IP Engelini Kaldır"
                    : "IP'yi Engelle"}
              </button>
            )}

            {selectedAppointment.status === "cancelled" ? (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-center text-sm font-bold text-red-300">
                İPTAL EDİLDİ
              </div>
            ) : (
              <>
                {selectedAppointment.status === "completed" && (
                  <div className="mt-5 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.07] px-4 py-3 text-center text-sm font-bold text-emerald-300">
                    ✓ TAMAMLANDI
                  </div>
                )}

                {selectedAppointment.customer_note ===
                "Admin panelinden manuel eklendi." ? (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {selectedAppointment.customer_phone?.trim() && (
                      <a
                        href={`https://wa.me/${
                          (() => {
                            const phoneDigits =
                              selectedAppointment.customer_phone.replace(/\D/g, "");

                            if (phoneDigits.startsWith("0")) {
                              return `90${phoneDigits.slice(1)}`;
                            }

                            if (phoneDigits.length === 10) {
                              return `90${phoneDigits}`;
                            }

                            return phoneDigits;
                          })()
                        }`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-3 text-center text-xs font-semibold text-emerald-300"
                      >
                        WhatsApp
                      </a>
                    )}

                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={() => openMoveAppointment(selectedAppointment)}
                      className="rounded-xl border border-[#c9a35b]/30 bg-[#c9a35b]/[0.08] px-2 py-3 text-xs font-semibold text-[#dfbd76] disabled:opacity-40"
                    >
                      Taşı
                    </button>

                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={() => openServiceChange(selectedAppointment)}
                      className="rounded-xl border border-blue-400/30 bg-blue-400/[0.07] px-2 py-3 text-xs font-semibold text-blue-300 disabled:opacity-40"
                    >
                      Hizmet Değiştir
                    </button>

                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={async () => {
                        const nextStatus =
                          selectedAppointment.status === "completed"
                            ? "approved"
                            : "completed";
                        await updateStatus(selectedAppointment.id, nextStatus);
                        setSelectedAppointment((current) =>
                          current ? { ...current, status: nextStatus } : current
                        );
                      }}
                      className="rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-2 py-3 text-xs font-semibold text-emerald-300 disabled:opacity-40"
                    >
                      {updatingId === selectedAppointment.id
                        ? "İşleniyor..."
                        : selectedAppointment.status === "completed"
                        ? "Geri Al"
                        : "Tamamlandı"}
                    </button>

                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={() => deleteManualAppointment(selectedAppointment)}
                      className="col-span-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-2 py-3 text-xs font-semibold text-red-300 disabled:opacity-40"
                    >
                      {updatingId === selectedAppointment.id
                        ? "Siliniyor..."
                        : "Sil"}
                    </button>
                  </div>                ) : (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <a
                      href={`https://wa.me/${
                        (() => {
                          const phoneDigits =
                            selectedAppointment.customer_phone.replace(/\D/g, "");

                          if (phoneDigits.startsWith("0")) {
                            return `90${phoneDigits.slice(1)}`;
                          }

                          if (phoneDigits.length === 10) {
                            return `90${phoneDigits}`;
                          }

                          return phoneDigits;
                        })()
                      }`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-3 text-center text-xs font-semibold text-emerald-300"
                    >
                      WhatsApp
                    </a>
                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={() => openMoveAppointment(selectedAppointment)}
                      className="rounded-xl border border-[#c9a35b]/30 bg-[#c9a35b]/[0.08] px-2 py-3 text-xs font-semibold text-[#dfbd76] disabled:opacity-40"
                    >
                      Taşı
                    </button>
                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={() => openServiceChange(selectedAppointment)}
                      className="rounded-xl border border-blue-400/30 bg-blue-400/[0.07] px-2 py-3 text-xs font-semibold text-blue-300 disabled:opacity-40"
                    >
                      Hizmet Değiştir
                    </button>
                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={async () => {
                        const nextStatus =
                          selectedAppointment.status === "completed"
                            ? "approved"
                            : "completed";
                        await updateStatus(selectedAppointment.id, nextStatus);
                        setSelectedAppointment((current) =>
                          current ? { ...current, status: nextStatus } : current
                        );
                      }}
                      className="rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-2 py-3 text-xs font-semibold text-emerald-300 disabled:opacity-40"
                    >
                      {updatingId === selectedAppointment.id
                        ? "İşleniyor..."
                        : selectedAppointment.status === "completed"
                        ? "Geri Al"
                        : "Tamamlandı"}
                    </button>
                    <button
                      type="button"
                      disabled={updatingId !== null}
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `${selectedAppointment.customer_name} adlı müşterinin randevusu iptal edilsin mi?`
                        );
                        if (!confirmed) return;

                        await updateStatus(selectedAppointment.id, "cancelled");
                        setSelectedAppointment((current) =>
                          current ? { ...current, status: "cancelled" } : current
                        );
                      }}
                      className="col-span-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-2 py-3 text-xs font-semibold text-red-300 disabled:opacity-40"
                    >
                      {updatingId === selectedAppointment.id
                        ? "İptal..."
                        : "İptal Et"}
                    </button>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      )}
      {newAppointmentNotice && (
        <div className="fixed right-5 top-5 z-[110] w-[calc(100%-2.5rem)] max-w-sm">
          <button
            type="button"
            onClick={() => {
              setActiveTab("appointments");
              setNewAppointmentNotice(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="w-full rounded-2xl border border-[#c9a35b]/45 bg-[#111111]/95 p-5 text-left shadow-2xl backdrop-blur-xl transition hover:border-[#c9a35b]/75"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c9a35b]/35 bg-[#c9a35b]/10 text-xl">
                🔔
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#c9a35b]">
                  Yeni randevu geldi
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {newAppointmentNotice.name}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  {newAppointmentNotice.date}
                  {newAppointmentNotice.time
                    ? ` • ${newAppointmentNotice.time}`
                    : ""}
                </p>
                <p className="mt-3 text-[11px] text-white/35">
                  Randevuyu görüntülemek için tıkla
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {notice && (
        <div className="fixed left-1/2 top-5 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div
            className={`rounded-2xl border px-5 py-4 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
              notice.type === "success"
                ? "border-emerald-500/30 bg-emerald-950/95 text-emerald-200"
                : "border-red-500/30 bg-red-950/95 text-red-200"
            }`}
          >
            {notice.type === "success" ? "✓ " : "⚠ "}
            {notice.text}
          </div>
        </div>
      )}

      <header className="border-b border-white/10 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-5">
          <div>
            <p className="text-sm font-bold leading-tight sm:text-base">MURATHAN YAZAR</p>
            <p className="mt-1 text-[8px] tracking-[0.22em] text-[#c9a35b] sm:text-[10px] sm:tracking-[0.3em]">
              YÖNETİM PANELİ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={enablePushNotifications}
              disabled={pushLoading || pushEnabled}
              className={`rounded-lg border px-2.5 py-2 text-[10px] font-semibold transition sm:rounded-xl sm:px-4 sm:text-sm ${
                pushEnabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-[#c9a35b]/35 bg-[#c9a35b]/5 text-[#c9a35b] hover:bg-[#c9a35b]/10"
              } disabled:cursor-default`}
            >
              {pushLoading
                ? "Açılıyor..."
                : pushEnabled
                ? "🔔 Bildirimler Açık"
                : "🔔 Bildirimleri Aç"}
            </button>

            <button
              onClick={logout}
              className="rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-white/60 hover:text-white sm:rounded-xl sm:px-4 sm:text-sm"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-5 sm:py-6">
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-1 sm:overflow-x-auto sm:pb-1.5">
          <TabButton
            active={activeTab === "appointments"}
            onClick={() => setActiveTab("appointments")}
          >
            Aktif Randevular
          </TabButton>
          <TabButton
            active={activeTab === "statistics"}
            onClick={() => setActiveTab("statistics")}
          >
            İstatistikler
          </TabButton>
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          >
            Geçmiş ({archivedAppointments.length})
          </TabButton>
          <TabButton
            active={activeTab === "logs"}
            onClick={() => setActiveTab("logs")}
          >
            İşlem Geçmişi
          </TabButton>
          <TabButton
            active={activeTab === "errors"}
            onClick={() => setActiveTab("errors")}
          >
            Hata Logları{errorLogs.length > 0 ? ` (${errorLogs.length})` : ""}
          </TabButton>
          <TabButton
            active={activeTab === "services"}
            onClick={() => setActiveTab("services")}
          >
            Hizmetler & Fiyatlar
          </TabButton>
          <TabButton
            active={activeTab === "hours"}
            onClick={() => setActiveTab("hours")}
          >
            Çalışma Saatleri
          </TabButton>
          <TabButton
            active={activeTab === "business"}
            onClick={() => setActiveTab("business")}
          >
            İşletme Ayarları
          </TabButton>
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
            {error}
          </p>
        )}

        {activeTab === "appointments" && (
          <section className="mt-4 sm:mt-6">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div>
                <p className="text-[9px] tracking-[0.2em] text-[#c9a35b] sm:text-xs sm:tracking-[0.25em]">
                  HAFTALIK RANDEVU TAKVİMİ
                </p>
                <h1 className="mt-1.5 text-2xl font-bold sm:mt-2 sm:text-3xl">Randevu Yönetimi</h1>
                <p className="mt-1.5 text-xs text-white/40 sm:mt-2 sm:text-sm">
                  Takvim Pazartesi–Cumartesi sırasıyla haftalık randevuları gösterir.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                <button
                  type="button"
                  onClick={() => setWeekOffset((current) => current - 1)}
                  className="rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-[10px] text-white/65 transition hover:text-white sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  ← Önceki
                </button>

                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="rounded-lg border border-[#c9a35b]/30 bg-[#c9a35b]/5 px-2 py-2 text-[10px] font-semibold text-[#c9a35b] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  Bu Hafta
                </button>

                <button
                  type="button"
                  onClick={() => setWeekOffset((current) => current + 1)}
                  className="rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-[10px] text-white/65 transition hover:text-white sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  Sonraki →
                </button>

                <button
                  type="button"
                  onClick={loadAll}
                  className="rounded-lg border border-white/10 px-2 py-2 text-[10px] text-white/60 hover:text-white sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  Yenile
                </button>

                <button
                  type="button"
                  onClick={archiveDay}
                  disabled={archiving || archivableCount === 0}
                  className="col-span-2 rounded-lg border border-[#c9a35b]/35 bg-[#c9a35b]/10 px-2 py-2 text-[10px] font-bold text-[#c9a35b] transition hover:bg-[#c9a35b]/15 disabled:cursor-not-allowed disabled:opacity-35 sm:col-span-1 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  {archiving
                    ? "Arşivleniyor..."
                    : `Günü Arşivle (${archivableCount})`}
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-[#101010] px-4 py-3">
              <p className="text-sm font-semibold text-white/75">
                {calendarRangeLabel}
              </p>
              <p className="text-xs text-white/30">
                {calendarDays.reduce(
                  (total, day) => total + day.appointments.length,
                  0
                )}{" "}
                randevu
              </p>
            </div>

            {loading ? (
              <p className="mt-8 text-white/40">Randevular yükleniyor...</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d] sm:rounded-2xl">
                <div className="w-full">
                  <div className="grid grid-cols-[38px_repeat(6,minmax(0,1fr))] border-b border-white/10 bg-[#111111] sm:grid-cols-[54px_repeat(6,minmax(0,1fr))] lg:grid-cols-[62px_repeat(6,minmax(0,1fr))]">
                    <div className="flex items-center justify-center border-r border-white/10 px-0.5 py-1.5 text-[6px] font-semibold text-white/30 sm:px-1 sm:py-2 sm:text-[8px] lg:text-[9px]">
                      SAAT
                    </div>

                    {calendarDays.map((day) => (
                      <button
                        type="button"
                        onClick={() => openBlockDay(day.key)}
                        key={day.key}
                        title={`${formatDate(day.key)} için saat kapat`}
                        className={`border-r border-white/10 px-1 py-2 text-center last:border-r-0 ${
                          day.key === todayKey ? "bg-[#c9a35b]/10" : ""
                        }`}
                      >
                        <p className={`truncate text-[6px] font-bold uppercase tracking-normal sm:text-[8px] sm:tracking-[0.08em] ${
                          day.key === todayKey ? "text-[#c9a35b]" : "text-white/45"
                        }`}>
                          <span className="sm:hidden">
                            {["Pzr", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][
                              day.date.getDay()
                            ]}
                          </span>
                          <span className="hidden sm:inline">
                            {day.date.toLocaleDateString("tr-TR", {
                              weekday: "long",
                            })}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[6px] font-bold text-white/70 sm:text-[9px] lg:text-[10px]">
                          {day.date.toLocaleDateString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    {calendarSlots.map((slot) => (
                      <div
                        key={slot}
                        className="grid grid-cols-[38px_repeat(6,minmax(0,1fr))] border-b border-white/[0.07] last:border-b-0 sm:grid-cols-[54px_repeat(6,minmax(0,1fr))] lg:grid-cols-[62px_repeat(6,minmax(0,1fr))]"
                      >
                        <div className="flex h-[44px] items-center justify-center border-r border-white/10 bg-[#101010] px-1 text-[9px] font-bold text-[#c9a35b] lg:text-[10px]">
                          {slot}
                        </div>

                        {calendarDays.map((day) => {
                          const slotMinutes = timeToMinutesAdmin(slot);
                          const blocked = isTimeBlocked(day.key, slot);
                          const occupied = day.appointments.some((appointment) => {
                            if (
                              appointment.is_archived ||
                              ["cancelled", "rejected"].includes(appointment.status)
                            ) return false;

                            const appointmentStart = timeToMinutesAdmin(appointment.appointment_time);
                            const appointmentEnd = appointmentStart + appointmentDuration(appointment);
                            return slotMinutes >= appointmentStart && slotMinutes < appointmentEnd;
                          });

                          return (
                            <div
                              key={`${day.key}-${slot}`}
                              className={`h-[44px] border-r border-white/[0.07] last:border-r-0 ${
                                day.key === todayKey ? "bg-[#c9a35b]/[0.025]" : ""
                              }`}
                            >
                              {blocked ? (
                                <div className="flex h-[44px] w-full items-center justify-center bg-red-500/[0.08] text-[7px] font-bold text-red-300 sm:text-[8px]">KAPALI</div>
                              ) : !occupied && (
                                <button
                                  type="button"
                                  onClick={() => openManualAppointment(day.key, slot)}
                                  className="group flex h-[44px] w-full items-center justify-center gap-1 text-white/15 transition hover:bg-[#c9a35b]/[0.06] hover:text-[#c9a35b]"
                                  title={`${formatDate(day.key)} ${slot} saatine müşteri ekle`}
                                >
                                  <span className="text-[11px] font-semibold sm:text-sm">+</span>
                                  <span className="hidden text-[7px] sm:inline lg:text-[8px]">Boş</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    <div className="pointer-events-none absolute inset-0 grid grid-cols-[38px_repeat(6,minmax(0,1fr))] sm:grid-cols-[54px_repeat(6,minmax(0,1fr))] lg:grid-cols-[62px_repeat(6,minmax(0,1fr))]">
                      <div />
                      {calendarDays.map((day) => (
                        <div key={`appointments-${day.key}`} className="relative">
                          {day.appointments
                            .filter(
                              (appointment) =>
                                !appointment.is_archived &&
                                !["cancelled", "rejected"].includes(appointment.status)
                            )
                            .map((appointment) => {
                              const firstMinute = timeToMinutesAdmin(calendarSlots[0]);
                              const startMinute = timeToMinutesAdmin(appointment.appointment_time);
                              const duration = appointmentDuration(appointment);
                              // Kartı sabit piksel biriktirerek değil, doğrudan 15 dakikalık
                              // takvim satırı indeksine göre yerleştiriyoruz. Böylece mobil/PC farkında
                              // aşağı indikçe oluşan kümülatif kayma ortadan kalkar.
                              const rowHeight = 45;
                              const slotIndex = (startMinute - firstMinute) / 15;
                              const durationSlots = Math.max(duration / 15, 1);
                              const topPercent = (slotIndex / calendarSlots.length) * 100;
                              const heightPercent = (durationSlots / calendarSlots.length) * 100;

                              // Takvim 15 dakikalık satır yapısını aynen korur.
                              // Kart, hizmetin kapattığı TÜM satırların alanını kullanır.
                              // Örn. 30 dk = 2 satır, 45 dk = 3 satır.
                              // Üstten ve alttan 4px boşluk bırakılır.
                              if (slotIndex < 0 || slotIndex >= calendarSlots.length) return null;

                              return (
                                <button
                                  key={appointment.id}
                                  type="button"
                                  onClick={() => setSelectedAppointment(appointment)}
                                  className={`pointer-events-auto absolute left-1 right-1 z-30 flex overflow-hidden rounded-md border px-1.5 sm:px-2 lg:px-2.5 text-left shadow-lg transition ${
                                    appointment.status === "completed"
                                      ? "border-emerald-500/70 bg-[#0b2118] hover:border-emerald-400/85 hover:bg-[#102b20]"
                                      : "border-[#c9a35b]/45 bg-[#17150f] hover:border-[#c9a35b]/70 hover:bg-[#1d1a12]"
                                  }`}
                                  style={{
                                    top: `calc(${topPercent}% + 6px)`,
                                    height: `calc(${heightPercent}% - 12px)`,
                                    minHeight: "33px",
                                  }}
                                >
                                  <div className="my-auto min-w-0 w-full overflow-hidden py-0.5">
                                    <p className="whitespace-nowrap text-[5px] font-bold leading-[7px] text-white sm:text-[7px] sm:leading-[9px] lg:text-[9px] lg:leading-[11px]">
                                      {appointment.customer_name}
                                    </p>
                                    <p className="mt-0.5 whitespace-nowrap text-[5px] font-semibold leading-[7px] text-emerald-300 sm:text-[7px] sm:leading-[9px] lg:text-[8px] lg:leading-[10px]">
                                      {appointment.customer_phone}
                                    </p>
                                    <p className="mt-0.5 whitespace-nowrap text-[4px] leading-[6px] text-white/55 sm:text-[6px] sm:leading-[8px] lg:text-[7px] lg:leading-[9px]">
                                      {getAppointmentServicesText(appointment)} • {duration} dk
                                    </p>
                                    {appointment.status === "completed" && (
                                      <p className="mt-0.5 whitespace-nowrap text-[4px] font-bold leading-[6px] text-emerald-300 sm:text-[6px] sm:leading-[8px] lg:text-[7px] lg:leading-[9px]">
                                        ✓ Tamamlandı
                                      </p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="mt-2 text-[10px] text-white/25">
              Takvim 15 dakikalık saat aralıklarıyla çalışır.
            </p>
          </section>
        )}

        {activeTab === "statistics" && (
          <section className="mt-6">
            <SectionTitle
              eyebrow="İSTATİSTİKLER"
              title="İşletme Özeti"
              description="Günlük ve haftalık randevu performansını buradan takip edebilirsin."
            />

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat title="Bugünkü Randevu" value={todayAppointments} />
              <Stat title="Yarınki Randevu" value={tomorrowAppointments} />
              <Stat title="Bu Haftaki Müşteri" value={weeklyCustomers} />
              <Stat title="Bu Ayki Müşteri" value={monthlyCustomers} />
              <Stat
                title="Sıradaki Randevu"
                value={nextAppointmentValue}
                subtitle={nextAppointmentService}
                compactValue
                compactSubtitle
              />
              <div className="flex min-h-[74px] items-end justify-end sm:min-h-[82px]">
                <button
                  type="button"
                  onClick={() => setShowRevenueSummary(true)}
                  className="rounded-lg border border-[#c9a35b]/35 bg-[#c9a35b]/[0.07] px-3 py-2 text-[9px] font-semibold text-[#d9b45f] transition hover:border-[#c9a35b]/60 hover:bg-[#c9a35b]/[0.12] sm:text-[10px]"
                >
                  Kazanç Özeti
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "history" && (
          <section className="mt-6">
            <SectionTitle
              eyebrow="ARŞİV"
              title="Geçmiş Randevular"
              description="Günü Arşivle ile geçmişe taşınan kayıtlar burada saklanır. Müşteri, hizmet, o günkü fiyat ve randevu sonucu kaybolmaz."
            />

            {archivedAppointments.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-white/35">
                Henüz arşivlenmiş randevu yok.
              </div>
            ) : (
              <div className="mt-7 grid gap-4">
                {archivedAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="rounded-2xl border border-white/10 bg-[#101010] p-5 md:p-6"
                  >
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
                      <Info
                        label="Müşteri"
                        value={appointment.customer_name}
                      />
                      <WhatsAppPhone appointment={appointment} />
                      <Info
                        label="Hizmet"
                        value={getAppointmentServicesText(appointment)}
                      />
                      <Info
                        label="Tarih / Saat"
                        value={`${formatDate(
                          appointment.appointment_date
                        )} • ${appointment.appointment_time.slice(0, 5)}`}
                      />
                      <Info
                        label="Randevu Fiyatı"
                        value={`${Number(
                          appointment.price_at_booking ??
                            appointment.services?.price ??
                            0
                        ).toLocaleString("tr-TR")} ₺`}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                      <StatusBadge status={appointment.status} />
                      {appointment.customer_note && (
                        <span className="text-xs text-white/35">
                          Not: {appointment.customer_note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "logs" && (
          <section className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <SectionTitle
                eyebrow="KAYITLAR"
                title="İşlem Geçmişi"
                description="Admin panelinde yapılan randevu durum değişiklikleri ve arşivleme işlemleri tarih ve saatleriyle burada tutulur."
              />

              <button
                onClick={loadActivityLogs}
                className="shrink-0 rounded-xl border border-white/10 px-4 py-3 text-sm text-white/60 hover:text-white"
              >
                Yenile
              </button>
            </div>

            {activityLogs.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-white/35">
                Henüz işlem kaydı yok.
              </div>
            ) : (
              <div className="mt-7 overflow-hidden rounded-2xl border border-white/10 bg-[#101010]">
                {activityLogs.map((log, index) => (
                  <div
                    key={log.id}
                    className={`flex flex-col gap-2 p-5 md:flex-row md:items-center md:justify-between ${
                      index !== activityLogs.length - 1
                        ? "border-b border-white/10"
                        : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-white/80">
                        {log.description}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-[#c9a35b]/60">
                        {activityLabel(log.action_type)}
                      </p>
                    </div>

                    <p className="shrink-0 text-xs text-white/35">
                      {formatLogDate(log.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "errors" && (
          <section className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <SectionTitle
                eyebrow="SİSTEM TAKİBİ"
                title="Hata Logları"
                description="Müşteri sitesinde son 7 gün içinde oluşan gerçek teknik hatalar burada günlük olarak görünür. Müşteri adı, telefon numarası veya gizli anahtarlar kaydedilmez."
              />
              <button
                onClick={loadErrorLogs}
                className="shrink-0 rounded-xl border border-white/10 px-4 py-3 text-sm text-white/60 hover:text-white"
              >
                Yenile
              </button>
            </div>

            {errorLogs.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-8 text-center text-emerald-300/70">
                Son 7 günde kaydedilmiş teknik hata yok.
              </div>
            ) : (
              <div className="mt-7 space-y-6">
                {Object.entries(
                  errorLogs.reduce<Record<string, ErrorLog[]>>((groups, log) => {
                    const day = localDateKey(new Date(log.created_at));
                    (groups[day] ??= []).push(log);
                    return groups;
                  }, {})
                ).map(([day, logs]) => (
                  <div key={day} className="overflow-hidden rounded-2xl border border-red-500/15 bg-[#101010]">
                    <div className="flex items-center justify-between border-b border-white/10 bg-red-500/5 px-5 py-4">
                      <div>
                        <p className="font-semibold text-white">{formatDate(day)}</p>
                        <p className="mt-1 text-xs text-white/35">{logs.length} hata kaydı</p>
                      </div>
                      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-300">
                        Teknik Hata
                      </span>
                    </div>

                    {logs.map((log, index) => (
                      <div
                        key={log.id}
                        className={`p-5 ${index !== logs.length - 1 ? "border-b border-white/10" : ""}`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-red-200">{log.customer_message}</p>
                            <p className="mt-2 break-words text-sm text-white/55">
                              {log.technical_message || "Teknik detay bulunmuyor."}
                            </p>
                          </div>
                          <p className="shrink-0 text-xs text-white/35">{formatLogDate(log.created_at)}</p>
                        </div>

                        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                          <Info label="Aşama" value={log.stage} />
                          <Info label="HTTP / Kod" value={`${log.http_status}${log.error_code ? ` • ${log.error_code}` : ""}`} />
                          <Info label="Randevu" value={log.appointment_date ? `${formatDate(log.appointment_date)}${log.appointment_time ? ` • ${log.appointment_time.slice(0, 5)}` : ""}` : "-"} />
                          <Info label="Hizmet ID" value={log.service_ids?.length ? log.service_ids.join(", ") : "-"} />
                        </div>

                        <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[#c9a35b]">Ayrıntılı teknik kayıt</summary>
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-white/45">
                            {JSON.stringify({ endpoint: log.endpoint, stage: log.stage, metadata: log.metadata }, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "services" && (
          <section className="mt-6">
            <SectionTitle
              eyebrow="HİZMETLER"
              title="Hizmetler & Fiyatlar"
              description="İsim, fiyat ve hizmet süresini değiştir. Kapattığın hizmet müşteri tarafında görünmez."
            />

            <div className="mt-6 grid gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-xl border border-white/10 bg-[#101010] p-3 sm:rounded-2xl sm:p-5"
                >
                  <div className="grid gap-4 md:grid-cols-[1.4fr_0.7fr_0.7fr_auto] md:items-end">
                    <Field label="Hizmet Adı">
                      <input
                        value={service.name}
                        onChange={(e) =>
                          setServices((all) =>
                            all.map((item) =>
                              item.id === service.id
                                ? { ...item, name: e.target.value }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Fiyat (TL)">
                      <input
                        type="number"
                        min="0"
                        value={service.price ?? ""}
                        placeholder="Belirlenmedi"
                        onChange={(e) =>
                          setServices((all) =>
                            all.map((item) =>
                              item.id === service.id
                                ? {
                                    ...item,
                                    price:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Süre (dk)">
                      <input
                        type="number"
                        min="5"
                        step="5"
                        value={service.duration_minutes}
                        onChange={(e) =>
                          setServices((all) =>
                            all.map((item) =>
                              item.id === service.id
                                ? {
                                    ...item,
                                    duration_minutes: Number(
                                      e.target.value
                                    ),
                                  }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </Field>

                    <button
                      disabled={saving}
                      onClick={() => saveService(service)}
                      className="rounded-xl bg-[#c9a35b] px-5 py-3 font-bold text-black disabled:opacity-40"
                    >
                      Kaydet
                    </button>
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-white/60">
                    <input
                      type="checkbox"
                      checked={service.is_active}
                      onChange={(e) =>
                        setServices((all) =>
                          all.map((item) =>
                            item.id === service.id
                              ? {
                                  ...item,
                                  is_active: e.target.checked,
                                }
                              : item
                          )
                        )
                      }
                      className="h-4 w-4 accent-[#c9a35b]"
                    />
                    Hizmet aktif
                  </label>
                </div>
              ))}
            </div>

            <button
              disabled={saving}
              onClick={addService}
              className="mt-4 rounded-xl border border-[#c9a35b]/30 bg-[#c9a35b]/5 px-5 py-3 text-sm font-semibold text-[#c9a35b] disabled:opacity-40"
            >
              + Yeni Hizmet Ekle
            </button>
          </section>
        )}

        {activeTab === "hours" && (
          <section className="mt-6">
            <SectionTitle
              eyebrow="ÇALIŞMA PLANI"
              title="Çalışma Günleri & Saatleri"
              description="Kapalı yaptığın gün müşteriye randevu günü olarak gösterilmez."
            />

            <div className="mt-6 grid gap-3">
              {workingHours.map((day) => (
                <div
                  key={day.id}
                  className={`rounded-2xl border p-5 ${
                    day.is_open
                      ? "border-white/10 bg-[#101010]"
                      : "border-red-500/15 bg-red-500/[0.03]"
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-end">
                    <label className="flex min-w-44 cursor-pointer items-center gap-3 pb-3 font-semibold">
                      <input
                        type="checkbox"
                        checked={day.is_open}
                        onChange={(e) =>
                          setWorkingHours((all) =>
                            all.map((item) =>
                              item.id === day.id
                                ? {
                                    ...item,
                                    is_open: e.target.checked,
                                  }
                                : item
                            )
                          )
                        }
                        className="h-4 w-4 accent-[#c9a35b]"
                      />
                      {day.day_name}
                    </label>

                    <div className="grid flex-1 grid-cols-2 gap-3">
                      <Field label="Açılış">
                        <input
                          type="time"
                          disabled={!day.is_open}
                          value={day.open_time.slice(0, 5)}
                          onChange={(e) =>
                            setWorkingHours((all) =>
                              all.map((item) =>
                                item.id === day.id
                                  ? {
                                      ...item,
                                      open_time: e.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Kapanış">
                        <input
                          type="time"
                          disabled={!day.is_open}
                          value={day.close_time.slice(0, 5)}
                          onChange={(e) =>
                            setWorkingHours((all) =>
                              all.map((item) =>
                                item.id === day.id
                                  ? {
                                      ...item,
                                      close_time: e.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                          className={inputClass}
                        />
                      </Field>
                    </div>

                    <button
                      disabled={saving}
                      onClick={() => saveWorkingHour(day)}
                      className="rounded-xl bg-[#c9a35b] px-5 py-3 font-bold text-black disabled:opacity-40"
                    >
                      Kaydet
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "business" && business && (
          <section className="mt-6">
            <SectionTitle
              eyebrow="İŞLETME"
              title="İşletme Ayarları"
              description="Buradaki bilgiler müşteri tarafında kullanılabilir. Değişiklikten sonra Kaydet'e bas."
            />

            <div className="mt-6 rounded-2xl border border-white/10 bg-[#101010] p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Berber Adı">
                  <input
                    value={business.barber_name}
                    onChange={(e) =>
                      setBusiness({
                        ...business,
                        barber_name: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Telefon">
                  <input
                    value={business.phone}
                    onChange={(e) =>
                      setBusiness({
                        ...business,
                        phone: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Instagram">
                  <input
                    value={business.instagram}
                    onChange={(e) =>
                      setBusiness({
                        ...business,
                        instagram: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Randevu Aralığı (dk)">
                  <select
                    value={business.appointment_interval}
                    onChange={(e) =>
                      setBusiness({
                        ...business,
                        appointment_interval: Number(e.target.value),
                      })
                    }
                    className={inputClass}
                  >
                    <option value={15}>15 dakika</option>
                    <option value={30}>30 dakika</option>
                    <option value={45}>45 dakika</option>
                    <option value={60}>60 dakika</option>
                    <option value={90}>90 dakika</option>
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field label="Adres">
                    <textarea
                      rows={3}
                      value={business.address ?? ""}
                      onChange={(e) =>
                        setBusiness({
                          ...business,
                          address: e.target.value,
                        })
                      }
                      placeholder="Adres henüz girilmedi"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>

              <button
                disabled={saving}
                onClick={saveBusiness}
                className="mt-6 rounded-xl bg-[#c9a35b] px-6 py-3 font-bold text-black disabled:opacity-40"
              >
                {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function timeToMinutesAdmin(time: string) {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTimeAdmin(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-white outline-none transition focus:border-[#c9a35b]/60 disabled:cursor-not-allowed disabled:opacity-35";

function getAppointmentServicesText(appointment: Appointment) {
  const childServices = appointment.appointment_services ?? [];

  if (childServices.length > 0) {
    return childServices.map((item) => item.service_name).join(" + ");
  }

  return appointment.services?.name ?? "-";
}

function TimetableAppointment({
  appointment,
  onClick,
}: {
  appointment: Appointment;
  onClick: () => void;
}) {
  const service = getAppointmentServicesText(appointment);
  const cancelled = appointment.status === "cancelled";
  const completed = appointment.status === "completed";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full min-w-0 overflow-hidden rounded-[4px] border px-0.5 py-0.5 text-left sm:rounded-md sm:px-1 lg:px-1.5 lg:py-1 ${
        cancelled
          ? "border-red-500/15 bg-red-500/[0.035] opacity-55"
          : completed
          ? "border-emerald-500/45 bg-emerald-500/[0.08]"
          : "border-[#c9a35b]/20 bg-[#c9a35b]/[0.055]"
      }`}
    >
      {cancelled && (
        <p className="truncate text-[4px] font-black leading-[6px] text-red-300 sm:text-[6px] sm:leading-3 lg:text-[7px]">
          İPTAL
        </p>
      )}
      {completed && (
        <p className="truncate text-[4px] font-black leading-[6px] text-emerald-300 sm:text-[6px] sm:leading-3 lg:text-[7px]">
          ✓ TAMAMLANDI
        </p>
      )}
      <p
        className={`truncate text-[5px] font-bold leading-[7px] sm:text-[7px] sm:leading-3 lg:text-[8px] ${
          cancelled ? "text-white/40 line-through" : "text-white"
        }`}
      >
        {appointment.customer_name}
      </p>
      <p
        className={`truncate text-[4px] leading-[6px] sm:text-[6px] sm:leading-3 lg:text-[7px] ${
          cancelled
            ? "text-white/25 line-through"
            : completed
            ? "text-emerald-300"
            : "text-emerald-300"
        }`}
      >
        {appointment.customer_phone}
      </p>
      <p
        className={`truncate text-[4px] leading-[6px] sm:text-[6px] sm:leading-3 lg:text-[7px] ${
          cancelled ? "text-white/20 line-through" : "text-white/40"
        }`}
      >
        {service}
      </p>
    </button>
  );
}

function AppointmentCard({
  appointment,
  updatingId,
  onUpdateStatus,
}: {
  appointment: Appointment;
  updatingId: number | null;
  onUpdateStatus: (id: number, status: string) => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition md:p-6 ${
        appointment.status === "completed"
          ? "border-emerald-500/35 bg-emerald-500/[0.07]"
          : appointment.status === "rejected"
          ? "border-red-500/35 bg-red-500/[0.07]"
          : appointment.status === "cancelled"
          ? "border-white/10 bg-white/[0.025] opacity-55"
          : appointment.status === "approved"
          ? "border-blue-400/35 bg-blue-400/[0.06]"
          : "border-amber-400/30 bg-amber-400/[0.05]"
      }`}
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="grid flex-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Info label="Müşteri" value={appointment.customer_name} />
          <WhatsAppPhone appointment={appointment} />
          <Info
            label="Hizmet"
            value={getAppointmentServicesText(appointment)}
          />
          <Info
            label="Tarih / Saat"
            value={`${appointment.appointment_date} • ${appointment.appointment_time.slice(
              0,
              5
            )}`}
          />
          <Info
            label="Fiyat"
            value={`${Number(
              appointment.price_at_booking ??
                appointment.services?.price ??
                0
            ).toLocaleString("tr-TR")} ₺`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={
              updatingId !== null || appointment.status === "approved"
            }
            onClick={() =>
              onUpdateStatus(appointment.id, "approved")
            }
            kind="gold"
          >
            {updatingId === appointment.id
              ? "İşleniyor..."
              : "Onayla"}
          </ActionButton>

          <ActionButton
            disabled={
              updatingId !== null || appointment.status === "completed"
            }
            onClick={() =>
              onUpdateStatus(appointment.id, "completed")
            }
            kind="green"
          >
            Tamamlandı
          </ActionButton>

          <ActionButton
            disabled={
              updatingId !== null || appointment.status === "rejected"
            }
            onClick={() =>
              onUpdateStatus(appointment.id, "rejected")
            }
            kind="red"
          >
            Reddet
          </ActionButton>

          <ActionButton
            disabled={
              updatingId !== null || appointment.status === "cancelled"
            }
            onClick={() =>
              onUpdateStatus(appointment.id, "cancelled")
            }
            kind="gray"
          >
            İptal
          </ActionButton>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <StatusBadge status={appointment.status} />

        {appointment.customer_note && (
          <span
            className={`text-xs text-white/35 ${
              appointment.status === "cancelled"
                ? "line-through"
                : ""
            }`}
          >
            Not: {appointment.customer_note}
          </span>
        )}
      </div>
    </div>
  );
}

function WhatsAppPhone({
  appointment,
}: {
  appointment: Appointment;
}) {
  const phoneDigits = appointment.customer_phone.replace(/\D/g, "");
  let whatsappNumber = phoneDigits;

  if (phoneDigits.startsWith("0")) {
    whatsappNumber = `90${phoneDigits.slice(1)}`;
  } else if (phoneDigits.length === 10) {
    whatsappNumber = `90${phoneDigits}`;
  }

  const date = appointment.appointment_date
    ? appointment.appointment_date.split("-").reverse().join(".")
    : "";

  const time = appointment.appointment_time?.slice(0, 5) ?? "";
  const service = appointment.services?.name ?? "Randevu";

  const statusMessages: Record<string, string> = {
    approved: `Merhaba ${appointment.customer_name} 👋\nRandevunuz onaylandı. ✅\n\n📅 ${date}\n🕒 ${time}\n✂️ ${service}\n\nGörüşmek üzere.\nMurathan Yazar`,
    completed: `Merhaba ${appointment.customer_name} 👋\nBugün bizi tercih ettiğiniz için teşekkür ederiz.\n\nGörüşmek üzere.\nMurathan Yazar`,
    rejected: `Merhaba ${appointment.customer_name} 👋\n${date} saat ${time} için oluşturduğunuz randevu talebi uygunluk nedeniyle onaylanamamıştır.\n\nFarklı bir saat için bizimle iletişime geçebilirsiniz.\nMurathan Yazar`,
    cancelled: `Merhaba ${appointment.customer_name} 👋\n${date} saat ${time}'daki randevunuz iptal edilmiştir.\n\nYeni randevu için bizimle iletişime geçebilirsiniz.\nMurathan Yazar`,
    pending: `Merhaba ${appointment.customer_name} 👋\n${date} saat ${time} için oluşturduğunuz ${service} randevu talebiniz hakkında iletişime geçiyoruz.\n\nMurathan Yazar`,
  };

  const message =
    statusMessages[appointment.status] ??
    `Merhaba ${appointment.customer_name}, Murathan Yazar Berber'den yazıyoruz.`;

  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    message
  )}`;

  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] text-white/25">
        TELEFON
      </p>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp'ta mesaj gönder"
        className="mt-1 inline-flex items-center gap-1.5 font-medium text-emerald-300 transition hover:text-emerald-200 hover:underline"
      >
        {appointment.customer_phone}
        <span className="text-xs">↗</span>
      </a>
    </div>
  );
}

function RevenueStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-4">
      <p className="text-[9px] text-white/35 sm:text-[10px]">{title}</p>
      <p className="mt-1.5 text-xl font-bold text-[#c9a35b] sm:text-2xl">{value}</p>
    </div>
  );
}

function Stat({
  title,
  value,
  subtitle,
  compactValue = false,
  compactSubtitle = false,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  compactValue?: boolean;
  compactSubtitle?: boolean;
}) {
  return (
    <div className="flex min-h-[74px] min-w-0 flex-col justify-center rounded-xl border border-white/10 bg-[#101010] px-3 py-2.5 sm:min-h-[82px] sm:px-4">
      <p className="truncate text-[8px] leading-3 text-white/35 sm:text-[10px]">
        {title}
      </p>
      <p
        className={
          compactValue
            ? "mt-1 whitespace-normal break-words text-[10px] font-semibold leading-[14px] text-white sm:text-[11px] sm:leading-4"
            : "mt-1 truncate text-[17px] font-bold leading-6 text-[#c9a35b] sm:text-xl"
        }
      >
        {value}
      </p>
      {subtitle && (
        <p
          className={
            compactSubtitle
              ? "mt-0.5 truncate text-[7px] leading-[10px] text-[#c9a35b]/70 sm:text-[8px]"
              : "mt-1 truncate text-[7px] leading-3 text-white/25 sm:text-[9px]"
          }
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] text-white/25">
        {label.toUpperCase()}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-w-0 truncate whitespace-nowrap rounded-lg border px-1.5 py-2 text-[8px] font-semibold transition sm:px-3 sm:text-xs ${
        active
          ? "border-[#c9a35b]/40 bg-[#c9a35b]/10 text-[#c9a35b]"
          : "border-white/10 bg-[#101010] text-white/45 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-white/40">
      {label}
      {children}
    </label>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs tracking-[0.25em] text-[#c9a35b]">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-bold">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
        {description}
      </p>
    </div>
  );
}

function ActionButton({
  disabled,
  onClick,
  kind,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  kind: "gold" | "green" | "red" | "gray";
  children: React.ReactNode;
}) {
  const styles =
    kind === "gold"
      ? "bg-[#c9a35b] text-black"
      : kind === "green"
      ? "border border-emerald-500/30 text-emerald-300"
      : kind === "red"
      ? "border border-red-500/30 text-red-300"
      : "border border-white/15 text-white/50";

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
        status === "completed"
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
          : status === "rejected"
          ? "border-red-500/35 bg-red-500/10 text-red-300"
          : status === "cancelled"
          ? "border-white/15 bg-white/5 text-white/35 line-through"
          : status === "approved"
          ? "border-blue-400/35 bg-blue-400/10 text-blue-300"
          : "border-amber-400/35 bg-amber-400/10 text-amber-300"
      }`}
    >
      {statusIcon(status)} {statusLabel(status)}
    </span>
  );
}

function activityLabel(action: string) {
  if (action === "appointment_approved") return "Randevu Onayı";
  if (action === "appointment_completed") return "Randevu Tamamlama";
  if (action === "appointment_rejected") return "Randevu Reddi";
  if (action === "appointment_cancelled") return "Randevu İptali";
  if (action === "appointment_service_changed") return "Hizmet Değişikliği";
  if (action === "day_archived") return "Gün Arşivleme";
  return "Panel İşlemi";
}

function statusIcon(status: string) {
  if (status === "pending") return "◷";
  if (status === "approved") return "✓";
  if (status === "completed") return "✓";
  if (status === "rejected") return "✕";
  if (status === "cancelled") return "—";
  return "•";
}

function statusLabel(status: string) {
  if (status === "pending") return "Onay Bekliyor";
  if (status === "approved") return "Onaylandı";
  if (status === "completed") return "Tamamlandı";
  if (status === "rejected") return "Reddedildi";
  if (status === "cancelled") return "İptal";
  return status;
}