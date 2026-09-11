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
  services: { name: string; price: number | null } | null;
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

type Tab = "appointments" | "services" | "hours" | "business";

export default function AdminPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("appointments");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);

  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const showNotice = (type: "success" | "error", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3000);
  };

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
        services (name, price)
      `)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (error) throw error;
    setAppointments((data ?? []) as unknown as Appointment[]);
  };

  const loadSettings = async () => {
    const [servicesResult, hoursResult, businessResult] = await Promise.all([
      supabase.from("services").select("id,name,price,duration_minutes,is_active,sort_order").order("sort_order", { ascending: true }),
      supabase.from("working_hours").select("id,day_of_week,day_name,is_open,open_time,close_time").order("day_of_week", { ascending: true }),
      supabase.from("business_settings").select("id,barber_name,phone,instagram,address,appointment_interval").limit(1).single(),
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
      await Promise.all([loadAppointments(), loadSettings()]);
    } catch (err) {
      console.error(err);
      setError("Panel verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
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

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (loginError) {
      setError("E-posta veya şifre hatalı.");
      setLoading(false);
      return;
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
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

  const logout = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setAppointments([]);
    setServices([]);
    setWorkingHours([]);
    setBusiness(null);
  };

  const updateStatus = async (id: number, status: string) => {
    if (updatingId !== null) return;
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
      current.map((item) => item.id === id ? { ...item, status: data.status } : item)
    );

    const messages: Record<string, string> = {
      approved: "Randevu başarıyla onaylandı.",
      completed: "Randevu başarıyla tamamlandı.",
      rejected: "Randevu reddedildi.",
      cancelled: "Randevu iptal edildi.",
    };
    showNotice("success", messages[status] ?? "Randevu güncellendi.");
    setUpdatingId(null);
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
    const nextSort = services.length ? Math.max(...services.map((s) => s.sort_order ?? 0)) + 1 : 1;
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
    showNotice("success", "Yeni hizmet eklendi. Adını ve fiyatını düzenleyebilirsin.");
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
    showNotice("success", `${day.day_name} çalışma saati kaydedildi.`);
  };

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
    showNotice("success", "İşletme ayarları başarıyla kaydedildi.");
  };

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-[#080808] text-white"><p className="text-white/40">Admin paneli yükleniyor...</p></main>;
  }

  if (!loggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-5 text-white">
        <form onSubmit={login} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101010] p-7 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a35b]/30 bg-[#c9a35b]/10 text-2xl text-[#c9a35b]">✂</div>
            <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-[#c9a35b]">MURATHAN YAZAR</p>
            <h1 className="mt-2 text-3xl font-bold">Yönetim Paneli</h1>
          </div>
          <label className="mt-8 block text-xs text-white/40">E-POSTA</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-4 outline-none focus:border-[#c9a35b]/60" />
          <label className="mt-5 block text-xs text-white/40">ŞİFRE</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-4 outline-none focus:border-[#c9a35b]/60" />
          {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">{error}</p>}
          <button disabled={loading} className="mt-6 w-full rounded-xl bg-[#c9a35b] py-4 font-bold text-black transition hover:bg-[#dfbd76] disabled:opacity-50">
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </main>
    );
  }

  const pending = appointments.filter((a) => a.status === "pending").length;

  const localDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

  const todayAppointments = appointments.filter(
    (a) =>
      a.appointment_date === todayKey &&
      !["rejected", "cancelled"].includes(a.status)
  ).length;

  const weeklyCompleted = appointments.filter(
    (a) =>
      a.status === "completed" &&
      a.appointment_date >= weekStartKey &&
      a.appointment_date <= weekEndKey
  );

  const weeklyCustomers = weeklyCompleted.length;
  const weeklyRevenue = weeklyCompleted.reduce(
    (total, a) => total + Number(a.services?.price ?? 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      {notice && (
        <div className="fixed left-1/2 top-5 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold shadow-2xl backdrop-blur-xl ${notice.type === "success" ? "border-emerald-500/30 bg-emerald-950/95 text-emerald-200" : "border-red-500/30 bg-red-950/95 text-red-200"}`}>
            {notice.type === "success" ? "✓ " : "⚠ "}{notice.text}
          </div>
        </div>
      )}

      <header className="border-b border-white/10 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div>
            <p className="font-bold">MURATHAN YAZAR</p>
            <p className="text-[10px] tracking-[0.3em] text-[#c9a35b]">YÖNETİM PANELİ</p>
          </div>
          <button onClick={logout} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white">Çıkış Yap</button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            title="Bugünkü Randevu"
            value={todayAppointments}
            subtitle="İptal ve reddedilenler hariç"
          />
          <Stat
            title="Bu Haftaki Müşteri"
            value={weeklyCustomers}
            subtitle="Tamamlanan randevular"
          />
          <Stat
            title="Bu Haftaki Kazanç"
            value={`${weeklyRevenue.toLocaleString("tr-TR")} ₺`}
            subtitle="Tamamlanan hizmetlerden"
          />
          <Stat
            title="Onay Bekleyen"
            value={pending}
            subtitle="İşlem bekleyen randevular"
          />
        </div>

        <div className="mt-7 flex gap-2 overflow-x-auto pb-2">
          <TabButton active={activeTab === "appointments"} onClick={() => setActiveTab("appointments")}>Randevular</TabButton>
          <TabButton active={activeTab === "services"} onClick={() => setActiveTab("services")}>Hizmetler & Fiyatlar</TabButton>
          <TabButton active={activeTab === "hours"} onClick={() => setActiveTab("hours")}>Çalışma Saatleri</TabButton>
          <TabButton active={activeTab === "business"} onClick={() => setActiveTab("business")}>İşletme Ayarları</TabButton>
        </div>

        {error && <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">{error}</p>}

        {activeTab === "appointments" && (
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-xs tracking-[0.25em] text-[#c9a35b]">RANDEVULAR</p><h1 className="mt-2 text-3xl font-bold">Randevu Yönetimi</h1></div>
              <button onClick={loadAll} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/60 hover:text-white">Yenile</button>
            </div>

            {loading ? <p className="mt-8 text-white/40">Randevular yükleniyor...</p> : appointments.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-white/35">Henüz randevu yok.</div>
            ) : (
              <div className="mt-7 grid gap-4">
                {appointments.map((a) => (
                  <div key={a.id} className={`rounded-2xl border p-5 transition md:p-6 ${a.status === "completed" ? "border-emerald-500/35 bg-emerald-500/[0.07]" : a.status === "rejected" ? "border-red-500/35 bg-red-500/[0.07]" : a.status === "cancelled" ? "border-white/10 bg-white/[0.025] opacity-55" : a.status === "approved" ? "border-blue-400/35 bg-blue-400/[0.06]" : "border-amber-400/30 bg-amber-400/[0.05]"}`}>
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                      <div className="grid flex-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        <Info label="Müşteri" value={a.customer_name} />
                        <Info label="Telefon" value={a.customer_phone} />
                        <Info label="Hizmet" value={a.services?.name ?? "-"} />
                        <Info label="Tarih / Saat" value={`${a.appointment_date} • ${a.appointment_time.slice(0, 5)}`} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton disabled={updatingId !== null || a.status === "approved"} onClick={() => updateStatus(a.id, "approved")} kind="gold">{updatingId === a.id ? "İşleniyor..." : "Onayla"}</ActionButton>
                        <ActionButton disabled={updatingId !== null || a.status === "completed"} onClick={() => updateStatus(a.id, "completed")} kind="green">Tamamlandı</ActionButton>
                        <ActionButton disabled={updatingId !== null || a.status === "rejected"} onClick={() => updateStatus(a.id, "rejected")} kind="red">Reddet</ActionButton>
                        <ActionButton disabled={updatingId !== null || a.status === "cancelled"} onClick={() => updateStatus(a.id, "cancelled")} kind="gray">İptal</ActionButton>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${a.status === "completed" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : a.status === "rejected" ? "border-red-500/35 bg-red-500/10 text-red-300" : a.status === "cancelled" ? "border-white/15 bg-white/5 text-white/35 line-through" : a.status === "approved" ? "border-blue-400/35 bg-blue-400/10 text-blue-300" : "border-amber-400/35 bg-amber-400/10 text-amber-300"}`}>
                        {statusIcon(a.status)} {statusLabel(a.status)}
                      </span>
                      {a.customer_note && <span className={`text-xs text-white/35 ${a.status === "cancelled" ? "line-through" : ""}`}>Not: {a.customer_note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "services" && (
          <section className="mt-6">
            <SectionTitle eyebrow="HİZMETLER" title="Hizmetler & Fiyatlar" description="İsim, fiyat ve hizmet süresini değiştir. Kapattığın hizmet müşteri tarafında görünmez." />
            <div className="mt-6 grid gap-4">
              {services.map((service) => (
                <div key={service.id} className="rounded-2xl border border-white/10 bg-[#101010] p-5">
                  <div className="grid gap-4 md:grid-cols-[1.4fr_0.7fr_0.7fr_auto] md:items-end">
                    <Field label="Hizmet Adı">
                      <input value={service.name} onChange={(e) => setServices((all) => all.map((s) => s.id === service.id ? { ...s, name: e.target.value } : s))} className={inputClass} />
                    </Field>
                    <Field label="Fiyat (TL)">
                      <input type="number" min="0" value={service.price ?? ""} placeholder="Belirlenmedi" onChange={(e) => setServices((all) => all.map((s) => s.id === service.id ? { ...s, price: e.target.value === "" ? null : Number(e.target.value) } : s))} className={inputClass} />
                    </Field>
                    <Field label="Süre (dk)">
                      <input type="number" min="5" step="5" value={service.duration_minutes} onChange={(e) => setServices((all) => all.map((s) => s.id === service.id ? { ...s, duration_minutes: Number(e.target.value) } : s))} className={inputClass} />
                    </Field>
                    <button disabled={saving} onClick={() => saveService(service)} className="rounded-xl bg-[#c9a35b] px-5 py-3 font-bold text-black disabled:opacity-40">Kaydet</button>
                  </div>
                  <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-white/60">
                    <input type="checkbox" checked={service.is_active} onChange={(e) => setServices((all) => all.map((s) => s.id === service.id ? { ...s, is_active: e.target.checked } : s))} className="h-4 w-4 accent-[#c9a35b]" />
                    Hizmet aktif
                  </label>
                </div>
              ))}
            </div>
            <button disabled={saving} onClick={addService} className="mt-4 rounded-xl border border-[#c9a35b]/30 bg-[#c9a35b]/5 px-5 py-3 text-sm font-semibold text-[#c9a35b] disabled:opacity-40">+ Yeni Hizmet Ekle</button>
          </section>
        )}

        {activeTab === "hours" && (
          <section className="mt-6">
            <SectionTitle eyebrow="ÇALIŞMA PLANI" title="Çalışma Günleri & Saatleri" description="Kapalı yaptığın gün müşteriye randevu günü olarak gösterilmez." />
            <div className="mt-6 grid gap-3">
              {workingHours.map((day) => (
                <div key={day.id} className={`rounded-2xl border p-5 ${day.is_open ? "border-white/10 bg-[#101010]" : "border-red-500/15 bg-red-500/[0.03]"}`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-end">
                    <label className="flex min-w-44 cursor-pointer items-center gap-3 pb-3 font-semibold">
                      <input type="checkbox" checked={day.is_open} onChange={(e) => setWorkingHours((all) => all.map((d) => d.id === day.id ? { ...d, is_open: e.target.checked } : d))} className="h-4 w-4 accent-[#c9a35b]" />
                      {day.day_name}
                    </label>
                    <div className="grid flex-1 grid-cols-2 gap-3">
                      <Field label="Açılış"><input type="time" disabled={!day.is_open} value={day.open_time.slice(0,5)} onChange={(e) => setWorkingHours((all) => all.map((d) => d.id === day.id ? { ...d, open_time: e.target.value } : d))} className={inputClass} /></Field>
                      <Field label="Kapanış"><input type="time" disabled={!day.is_open} value={day.close_time.slice(0,5)} onChange={(e) => setWorkingHours((all) => all.map((d) => d.id === day.id ? { ...d, close_time: e.target.value } : d))} className={inputClass} /></Field>
                    </div>
                    <button disabled={saving} onClick={() => saveWorkingHour(day)} className="rounded-xl bg-[#c9a35b] px-5 py-3 font-bold text-black disabled:opacity-40">Kaydet</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "business" && business && (
          <section className="mt-6">
            <SectionTitle eyebrow="İŞLETME" title="İşletme Ayarları" description="Buradaki bilgiler müşteri tarafında kullanılabilir. Değişiklikten sonra Kaydet'e bas." />
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#101010] p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Berber Adı"><input value={business.barber_name} onChange={(e) => setBusiness({ ...business, barber_name: e.target.value })} className={inputClass} /></Field>
                <Field label="Telefon"><input value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} className={inputClass} /></Field>
                <Field label="Instagram"><input value={business.instagram} onChange={(e) => setBusiness({ ...business, instagram: e.target.value })} className={inputClass} /></Field>
                <Field label="Randevu Aralığı (dk)">
                  <select value={business.appointment_interval} onChange={(e) => setBusiness({ ...business, appointment_interval: Number(e.target.value) })} className={inputClass}>
                    <option value={15}>15 dakika</option><option value={30}>30 dakika</option><option value={45}>45 dakika</option><option value={60}>60 dakika</option><option value={90}>90 dakika</option>
                  </select>
                </Field>
                <div className="md:col-span-2"><Field label="Adres"><textarea rows={3} value={business.address ?? ""} onChange={(e) => setBusiness({ ...business, address: e.target.value })} placeholder="Adres henüz girilmedi" className={inputClass} /></Field></div>
              </div>
              <button disabled={saving} onClick={saveBusiness} className="mt-6 rounded-xl bg-[#c9a35b] px-6 py-3 font-bold text-black disabled:opacity-40">{saving ? "Kaydediliyor..." : "Ayarları Kaydet"}</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-white outline-none transition focus:border-[#c9a35b]/60 disabled:cursor-not-allowed disabled:opacity-35";

function Stat({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101010] p-5">
      <p className="text-xs text-white/35">{title}</p>
      <p className="mt-2 text-3xl font-bold text-[#c9a35b]">{value}</p>
      {subtitle && <p className="mt-2 text-[11px] text-white/25">{subtitle}</p>}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] tracking-[0.15em] text-white/25">{label.toUpperCase()}</p><p className="mt-1 font-medium">{value}</p></div>;
}
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-semibold transition ${active ? "border-[#c9a35b]/40 bg-[#c9a35b]/10 text-[#c9a35b]" : "border-white/10 bg-[#101010] text-white/45 hover:text-white"}`}>{children}</button>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-white/40">{label}{children}</label>;
}
function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="text-xs tracking-[0.25em] text-[#c9a35b]">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">{description}</p></div>;
}
function ActionButton({ disabled, onClick, kind, children }: { disabled: boolean; onClick: () => void; kind: "gold" | "green" | "red" | "gray"; children: React.ReactNode }) {
  const styles = kind === "gold" ? "bg-[#c9a35b] text-black" : kind === "green" ? "border border-emerald-500/30 text-emerald-300" : kind === "red" ? "border border-red-500/30 text-red-300" : "border border-white/15 text-white/50";
  return <button disabled={disabled} onClick={onClick} className={`rounded-lg px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>{children}</button>;
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
