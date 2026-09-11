"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type View = "home" | "appointment";
type AppointmentStep = 1 | 2 | 3 | 4 | 5;

type Service = {
  id: number;
  name: string;
  price: number | null;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
};

function formatServicePrice(price: number | null) {
  if (price === null) return "Fiyat belirlenmedi";

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(price);
}

type DateOption = {
  value: string;
  dayName: string;
  dayNumber: string;
  monthName: string;
  fullLabel: string;
  dayOfWeek: number;
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

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function createTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes: number
) {
  const slots: string[] = [];
  let totalMinutes = timeToMinutes(openTime);
  const closingMinutes = timeToMinutes(closeTime);

  while (totalMinutes < closingMinutes) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    slots.push(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    );

    totalMinutes += intervalMinutes;
  }

  return slots;
}

function createDateOptions(workingHours: WorkingHour[]): DateOption[] {
  const dates: DateOption[] = [];

  const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
  });

  const monthFormatter = new Intl.DateTimeFormat("tr-TR", {
    month: "short",
  });

  const fullFormatter = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + i);

    const jsDay = date.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const workingDay = workingHours.find(
      (item) => item.day_of_week === dayOfWeek
    );

    if (!workingDay?.is_open) continue;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    dates.push({
      value: `${year}-${month}-${day}`,
      dayName: i === 0 ? "Bugün" : dayFormatter.format(date),
      dayNumber: String(date.getDate()),
      monthName: monthFormatter.format(date),
      fullLabel: fullFormatter.format(date),
      dayOfWeek,
    });
  }

  return dates;
}

export default function Home() {
  const [intro, setIntro] = useState(true);
  const [view, setView] = useState<View>("home");

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");

  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettings | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");

  const [appointmentStep, setAppointmentStep] =
    useState<AppointmentStep>(1);

  const [selectedService, setSelectedService] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  const [appointmentCreated, setAppointmentCreated] =
    useState(false);
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentError, setAppointmentError] = useState("");
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);
  const [occupiedTimesLoading, setOccupiedTimesLoading] = useState(false);

  const dateOptions = useMemo(
    () => createDateOptions(workingHours),
    [workingHours]
  );

  const appointmentInterval = businessSettings?.appointment_interval ?? 45;

  useEffect(() => {
    const loadServices = async () => {
      setServicesLoading(true);
      setServicesError("");

      const supabase = createClient();

      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, price, duration_minutes, is_active, sort_order"
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Hizmetler alınamadı:", error);
        setServices([]);
        setServicesError(
          "Hizmetler şu anda yüklenemedi. Lütfen sayfayı yenileyin."
        );
        setServicesLoading(false);
        return;
      }

      setServices((data ?? []) as Service[]);
      setServicesLoading(false);
    };

    loadServices();
  }, []);

  useEffect(() => {
    const loadSchedule = async () => {
      setScheduleLoading(true);
      setScheduleError("");

      const supabase = createClient();

      const [workingHoursResult, settingsResult] = await Promise.all([
        supabase
          .from("working_hours")
          .select("id, day_of_week, day_name, is_open, open_time, close_time")
          .order("day_of_week", { ascending: true }),
        supabase
          .from("business_settings")
          .select("id, barber_name, phone, instagram, address, appointment_interval")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (workingHoursResult.error || settingsResult.error) {
        console.error("Çalışma düzeni alınamadı:", {
          workingHoursError: workingHoursResult.error,
          settingsError: settingsResult.error,
        });
        setScheduleError(
          "Çalışma günleri ve saatleri şu anda yüklenemedi. Lütfen sayfayı yenileyin."
        );
        setScheduleLoading(false);
        return;
      }

      setWorkingHours((workingHoursResult.data ?? []) as WorkingHour[]);
      setBusinessSettings(settingsResult.data as BusinessSettings | null);
      setScheduleLoading(false);
    };

    loadSchedule();
  }, []);

  useEffect(() => {
    const loadOccupiedTimes = async () => {
      if (!selectedDate) {
        setOccupiedTimes([]);
        setOccupiedTimesLoading(false);
        return;
      }

      setOccupiedTimesLoading(true);

      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_occupied_times", {
        requested_date: selectedDate,
      });

      if (error) {
        console.error("Dolu saatler alınamadı:", error);
        setOccupiedTimes([]);
        setOccupiedTimesLoading(false);
        return;
      }

      const times = (data ?? []).map(
        (row: { appointment_time: string }) =>
          row.appointment_time.slice(0, 5)
      );

      setOccupiedTimes(times);

      if (selectedTime && times.includes(selectedTime)) {
        setSelectedTime("");
      }

      setOccupiedTimesLoading(false);
    };

    loadOccupiedTimes();
  }, [selectedDate, selectedTime]);

  const selectedDateInfo = dateOptions.find(
    (date) => date.value === selectedDate
  );

  const selectedWorkingDay = workingHours.find(
    (item) => item.day_of_week === selectedDateInfo?.dayOfWeek
  );

  const timeSlots = useMemo(() => {
    if (!selectedWorkingDay?.is_open) return [];

    return createTimeSlots(
      selectedWorkingDay.open_time,
      selectedWorkingDay.close_time,
      appointmentInterval
    );
  }, [selectedWorkingDay, appointmentInterval]);

  const selectedServiceInfo = services.find(
    (service) => service.name === selectedService
  );

  const resetAppointment = () => {
    setAppointmentStep(1);
    setSelectedService("");
    setSelectedDate("");
    setSelectedTime("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNote("");
    setAppointmentCreated(false);
    setAppointmentSaving(false);
    setAppointmentError("");
    setOccupiedTimes([]);
    setOccupiedTimesLoading(false);
  };

  const goHome = () => {
    setView("home");

    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }, 50);
  };

  const goAppointment = () => {
    setView("appointment");

    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }, 50);
  };

  const startAppointmentWithService = (serviceName: string) => {
    setSelectedService(serviceName);
    setSelectedDate("");
    setSelectedTime("");
    setAppointmentStep(2);
    setAppointmentCreated(false);
    goAppointment();
  };

  const scrollToSection = (id: string) => {
    if (view !== "home") {
      setView("home");

      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);

      return;
    }

    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const goToStep = (step: AppointmentStep) => {
    if (step === 2 && !selectedService) return;
    if (step === 3 && (!selectedService || !selectedDate)) return;

    if (
      step === 4 &&
      (!selectedService || !selectedDate || !selectedTime)
    ) {
      return;
    }

    setAppointmentStep(step);

    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }, 50);
  };

  const handleServiceContinue = () => {
    if (!selectedService) return;

    setAppointmentStep(2);
  };

  const handleDateContinue = () => {
    if (!selectedDate) return;

    setAppointmentStep(3);
  };

  const handleTimeContinue = () => {
    if (!selectedTime) return;

    setAppointmentStep(4);
  };

  const handleCustomerContinue = () => {
    if (!customerName.trim() || !customerPhone.trim()) return;

    setAppointmentStep(5);
  };

  const handleCreateAppointment = async () => {
    if (
      !selectedServiceInfo ||
      !selectedDate ||
      !selectedTime ||
      !customerName.trim() ||
      !customerPhone.trim() ||
      appointmentSaving
    ) {
      return;
    }

    setAppointmentSaving(true);
    setAppointmentError("");

    const supabase = createClient();

    const { error } = await supabase.from("appointments").insert({
      service_id: selectedServiceInfo.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_note: customerNote.trim() || null,
      appointment_date: selectedDate,
      appointment_time: selectedTime,
      status: "pending",
    });

    if (error) {
      console.error("Randevu oluşturulamadı:", error);

      if (error.code === "23505") {
        setAppointmentError(
          "Bu saat az önce başka bir müşteri tarafından alındı. Lütfen farklı bir saat seç."
        );
        setSelectedTime("");
        setAppointmentStep(3);
      } else {
        setAppointmentError(
          "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin."
        );
      }

      setAppointmentSaving(false);
      return;
    }

    setAppointmentCreated(true);
    setAppointmentSaving(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // =========================================================
  // GİRİŞ EKRANI
  // =========================================================

  if (intro) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-6 text-white">
        <div
          className="absolute inset-0 scale-[1.02] bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/berber-bg.png')",
          }}
        />

        <div className="absolute inset-0 bg-black/25" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.05)_45%,rgba(0,0,0,0.08)_100%)]" />

        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/25" />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-400px] h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-[#c9a35b]/10 blur-[180px]" />
        </div>

        <div className="relative z-10 w-full max-w-xl text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a35b]/40 bg-black/30 text-2xl text-[#c9a35b] shadow-2xl backdrop-blur-sm">
            ✂
          </div>

          <p className="mb-4 text-xs font-semibold tracking-[0.45em] text-[#c9a35b]">
            BERBER
          </p>

          <h1 className="text-5xl font-bold tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)] sm:text-6xl">
            MURATHAN
            <span className="block text-[#c9a35b]">
              YAZAR
            </span>
          </h1>

          <div className="mx-auto my-7 h-px w-20 bg-[#c9a35b]/70" />

          <p className="mx-auto max-w-sm leading-7 text-white/75 drop-shadow-lg">
            Tarzına uygun kesim, sana uygun saat.
          </p>

          <div className="mx-auto mt-10 flex max-w-sm flex-col gap-3">
            <button
              onClick={() => setIntro(false)}
              className="w-full rounded-xl bg-[#c9a35b] px-8 py-4 font-bold text-black shadow-2xl transition hover:-translate-y-0.5 hover:bg-[#dfbd76]"
            >
              SİTEYE GİR
            </button>

            <button
              onClick={() => {
                setIntro(false);
                setView("appointment");
              }}
              className="w-full rounded-xl border border-white/25 bg-black/20 px-8 py-4 font-semibold text-white/90 shadow-xl backdrop-blur-sm transition hover:border-[#c9a35b]/60 hover:bg-black/30 hover:text-[#c9a35b]"
            >
              Direkt Randevu Al
            </button>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-white/60">
            <a
              href="tel:+905331288639"
              className="transition hover:text-[#c9a35b]"
            >
              +90 533 128 86 39
            </a>

            <span>•</span>

            <span>@murathanyazar</span>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================
  // RANDEVU SİSTEMİ
  // =========================================================

  if (view === "appointment") {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#080808] text-white">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute -left-40 top-[20%] h-[500px] w-[500px] rounded-full bg-[#c9a35b]/[0.04] blur-[130px]" />
          <div className="absolute -right-40 top-[50%] h-[500px] w-[500px] rounded-full bg-[#c9a35b]/[0.04] blur-[130px]" />
        </div>

        {/* ÜST MENÜ */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080808]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <button onClick={goHome} className="text-left">
              <p className="font-bold tracking-wider">
                MURATHAN YAZAR
              </p>

              <p className="text-[10px] tracking-[0.35em] text-[#c9a35b]">
                BERBER
              </p>
            </button>

            <div className="flex items-center gap-5">
              <button
                onClick={goHome}
                className="hidden text-sm text-white/50 transition hover:text-white sm:block"
              >
                Ana Sayfa
              </button>

              <span className="text-xs tracking-wider text-[#c9a35b]">
                ONLINE RANDEVU
              </span>
            </div>
          </div>
        </header>

        <div className="relative z-10 mx-auto max-w-5xl px-5 py-10 md:py-14">
          {/* =================================================
              BAŞARILI DEMO RANDEVU
          ================================================= */}

          {appointmentCreated ? (
            <div className="mx-auto max-w-2xl py-8 text-center md:py-16">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#c9a35b]/40 bg-[#c9a35b]/10 text-3xl text-[#c9a35b]">
                ✓
              </div>

              <p className="mt-8 text-xs font-semibold tracking-[0.35em] text-[#c9a35b]">
                RANDEVU OLUŞTURULDU
              </p>

              <h1 className="mt-4 text-3xl font-bold md:text-5xl">
                Randevu talebin alındı.
              </h1>

              <p className="mx-auto mt-4 max-w-lg leading-7 text-white/45">
                Bu ekran şu an demo olarak çalışıyor.
                Veritabanını bağladığımızda randevu Murathan&apos;ın
                yönetim paneline düşecek.
              </p>

              <div className="mt-10 rounded-3xl border border-[#c9a35b]/25 bg-[#c9a35b]/[0.06] p-7 text-left">
                <p className="text-xs tracking-[0.3em] text-[#c9a35b]">
                  RANDEVU ÖZETİ
                </p>

                <div className="mt-6 space-y-4">
                  <SummaryRow
                    label="Müşteri"
                    value={customerName}
                  />

                  <SummaryRow
                    label="Telefon"
                    value={customerPhone}
                  />

                  <SummaryRow
                    label="Hizmet"
                    value={selectedService}
                  />

                  <SummaryRow
                    label="Tarih"
                    value={
                      selectedDateInfo?.fullLabel ||
                      selectedDate
                    }
                  />

                  <SummaryRow
                    label="Saat"
                    value={selectedTime}
                  />
                </div>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    resetAppointment();
                  }}
                  className="rounded-xl border border-white/15 px-6 py-4 font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Yeni Randevu Oluştur
                </button>

                <button
                  onClick={goHome}
                  className="rounded-xl bg-[#c9a35b] px-6 py-4 font-bold text-black transition hover:bg-[#dfbd76]"
                >
                  Ana Sayfaya Dön
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* =============================================
                  RANDEVU BAŞLIK
              ============================================= */}

              <section>
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.35em] text-[#c9a35b]">
                      RANDEVU SİSTEMİ
                    </p>

                    <h1 className="mt-3 text-3xl font-bold md:text-4xl">
                      Randevunu Oluştur
                    </h1>

                    <p className="mt-3 text-sm text-white/45">
                      Birkaç adımda sana uygun randevuyu seç.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-[10px] tracking-[0.2em] text-white/25">
                      RANDEVU ARALIĞI
                    </p>

                    <p className="mt-1 text-sm font-semibold text-[#c9a35b]">
                      {scheduleLoading
                        ? "Yükleniyor..."
                        : `${appointmentInterval} dakika`}
                    </p>
                  </div>
                </div>

                {/* İLERLEME ÇUBUĞU */}
                <div className="mt-8 grid grid-cols-4 gap-2">
                  {[
                    { number: 1, label: "Hizmet" },
                    { number: 2, label: "Tarih" },
                    { number: 3, label: "Saat" },
                    { number: 4, label: "Bilgiler" },
                  ].map((step) => {
                    const completed =
                      appointmentStep > step.number;

                    const active =
                      appointmentStep === step.number ||
                      (appointmentStep === 5 &&
                        step.number === 4);

                    return (
                      <button
                        key={step.number}
                        onClick={() => {
                          if (
                            step.number <= appointmentStep
                          ) {
                            goToStep(
                              step.number as AppointmentStep
                            );
                          }
                        }}
                        className="text-left"
                      >
                        <div
                          className={`h-1 rounded-full transition ${
                            completed || active
                              ? "bg-[#c9a35b]"
                              : "bg-white/10"
                          }`}
                        />

                        <p
                          className={`mt-2 text-[11px] transition ${
                            active
                              ? "text-[#c9a35b]"
                              : completed
                              ? "text-white/65"
                              : "text-white/25"
                          }`}
                        >
                          {completed ? "✓" : step.number}.{" "}
                          {step.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* =============================================
                  1 - HİZMET
              ============================================= */}

              {appointmentStep === 1 && (
                <section className="mt-12">
                  <p className="text-xs tracking-[0.3em] text-[#c9a35b]">
                    01 / HİZMET
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    Ne yaptırmak istiyorsun?
                  </h2>

                  <p className="mt-2 text-sm text-white/35">
                    Bir hizmet seçerek devam et.
                  </p>

                  {servicesLoading && (
                    <div className="mt-7 rounded-2xl border border-white/10 bg-[#111] p-6 text-sm text-white/40">
                      Hizmetler yükleniyor...
                    </div>
                  )}

                  {servicesError && (
                    <div className="mt-7 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
                      {servicesError}
                    </div>
                  )}

                  {!servicesLoading && !servicesError && (
                  <div className="mt-7 grid gap-3 md:grid-cols-3">
                    {services.map((service) => {
                      const active =
                        selectedService === service.name;

                      return (
                        <button
                          key={service.name}
                          onClick={() => {
                            setSelectedService(
                              service.name
                            );

                            setSelectedDate("");
                            setSelectedTime("");
                          }}
                          className={`rounded-2xl border p-6 text-left transition ${
                            active
                              ? "border-[#c9a35b] bg-[#c9a35b]/10"
                              : "border-white/10 bg-[#111] hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-2xl text-[#c9a35b]">
                              ✂
                            </span>

                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                                active
                                  ? "border-[#c9a35b] bg-[#c9a35b]"
                                  : "border-white/20"
                              }`}
                            >
                              {active && (
                                <span className="text-xs font-bold text-black">
                                  ✓
                                </span>
                              )}
                            </div>
                          </div>

                          <h3 className="mt-8 text-lg font-semibold">
                            {service.name}
                          </h3>

                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-sm text-white/35">
                              {formatServicePrice(service.price)}
                            </p>

                            <p className="text-xs text-[#c9a35b]">
                              {service.duration_minutes} dk
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  )}

                  <button
                    onClick={handleServiceContinue}
                    disabled={!selectedService}
                    className={`mt-8 w-full rounded-xl py-4 font-bold transition ${
                      selectedService
                        ? "bg-[#c9a35b] text-black hover:bg-[#dfbd76]"
                        : "cursor-not-allowed bg-white/5 text-white/20"
                    }`}
                  >
                    {selectedService
                      ? "Tarih Seçimine Devam Et →"
                      : "Devam etmek için hizmet seç"}
                  </button>
                </section>
              )}

              {/* =============================================
                  2 - TARİH
              ============================================= */}

              {appointmentStep === 2 && (
                <section className="mt-12">
                  <div className="flex items-end justify-between gap-5">
                    <div>
                      <p className="text-xs tracking-[0.3em] text-[#c9a35b]">
                        02 / TARİH
                      </p>

                      <h2 className="mt-2 text-2xl font-semibold">
                        Hangi gün gelsin?
                      </h2>

                      <p className="mt-2 text-sm text-white/35">
                        Önümüzdeki 14 günden birini seç.
                      </p>
                    </div>

                    <button
                      onClick={() => goToStep(1)}
                      className="shrink-0 text-sm text-white/40 transition hover:text-white"
                    >
                      ← Hizmeti değiştir
                    </button>
                  </div>

                  {scheduleLoading && (
                    <div className="mt-7 rounded-2xl border border-white/10 bg-[#111] p-6 text-sm text-white/40">
                      Çalışma günleri yükleniyor...
                    </div>
                  )}

                  {scheduleError && (
                    <div className="mt-7 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
                      {scheduleError}
                    </div>
                  )}

                  {!scheduleLoading && !scheduleError && dateOptions.length === 0 && (
                    <div className="mt-7 rounded-2xl border border-white/10 bg-[#111] p-6 text-sm text-white/40">
                      Önümüzdeki 14 gün için açık çalışma günü bulunmuyor.
                    </div>
                  )}

                  {!scheduleLoading && !scheduleError && dateOptions.length > 0 && (
                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                    {dateOptions.map((date) => {
                      const active =
                        selectedDate === date.value;

                      return (
                        <button
                          key={date.value}
                          onClick={() => {
                            setSelectedDate(date.value);
                            setSelectedTime("");
                          }}
                          className={`rounded-2xl border px-3 py-5 text-center transition ${
                            active
                              ? "border-[#c9a35b] bg-[#c9a35b] text-black"
                              : "border-white/10 bg-[#111] hover:border-[#c9a35b]/40"
                          }`}
                        >
                          <p
                            className={`text-xs font-semibold ${
                              active
                                ? "text-black/60"
                                : "text-white/35"
                            }`}
                          >
                            {date.dayName}
                          </p>

                          <p className="mt-2 text-2xl font-bold">
                            {date.dayNumber}
                          </p>

                          <p
                            className={`mt-1 text-xs ${
                              active
                                ? "text-black/60"
                                : "text-[#c9a35b]"
                            }`}
                          >
                            {date.monthName}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  )}

                  {selectedDateInfo && (
                    <div className="mt-5 rounded-xl border border-[#c9a35b]/20 bg-[#c9a35b]/[0.05] px-5 py-4">
                      <p className="text-xs text-white/35">
                        SEÇİLEN TARİH
                      </p>

                      <p className="mt-1 font-semibold capitalize text-[#c9a35b]">
                        {selectedDateInfo.fullLabel}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleDateContinue}
                    disabled={!selectedDate}
                    className={`mt-8 w-full rounded-xl py-4 font-bold transition ${
                      selectedDate
                        ? "bg-[#c9a35b] text-black hover:bg-[#dfbd76]"
                        : "cursor-not-allowed bg-white/5 text-white/20"
                    }`}
                  >
                    {selectedDate
                      ? "Saat Seçimine Devam Et →"
                      : "Devam etmek için tarih seç"}
                  </button>
                </section>
              )}

              {/* =============================================
                  3 - SAAT
              ============================================= */}

              {appointmentStep === 3 && (
                <section className="mt-12">
                  <div className="flex items-end justify-between gap-5">
                    <div>
                      <p className="text-xs tracking-[0.3em] text-[#c9a35b]">
                        03 / SAAT
                      </p>

                      <h2 className="mt-2 text-2xl font-semibold">
                        Sana uygun saati seç.
                      </h2>

                      <p className="mt-2 text-sm text-white/35">
                        {selectedWorkingDay
                          ? `Çalışma saatleri ${selectedWorkingDay.open_time.slice(0, 5)}–${selectedWorkingDay.close_time.slice(0, 5)}.`
                          : "Çalışma saatleri veritabanından yükleniyor."}
                      </p>
                    </div>

                    <button
                      onClick={() => goToStep(2)}
                      className="shrink-0 text-sm text-white/40 transition hover:text-white"
                    >
                      ← Tarihi değiştir
                    </button>
                  </div>

                  <div className="mt-7 rounded-2xl border border-white/10 bg-[#0d0d0d] p-5 md:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
                      <div>
                        <p className="text-xs text-white/30">
                          SEÇİLEN GÜN
                        </p>

                        <p className="mt-1 font-semibold capitalize">
                          {selectedDateInfo?.fullLabel}
                        </p>
                      </div>

                      <div className="rounded-full border border-[#c9a35b]/20 bg-[#c9a35b]/5 px-4 py-2 text-xs text-[#c9a35b]">
                        {appointmentInterval} dk aralık
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                      {timeSlots.map((time) => {
                        const active = selectedTime === time;
                        const occupied = occupiedTimes.includes(time);

                        return (
                          <button
                            key={time}
                            disabled={occupied || occupiedTimesLoading}
                            onClick={() => {
                              if (!occupied) setSelectedTime(time);
                            }}
                            className={`rounded-xl border px-3 py-4 text-sm font-semibold transition ${
                              occupied
                                ? "cursor-not-allowed border-red-500/15 bg-red-500/[0.04] text-white/20 line-through"
                                : active
                                ? "border-[#c9a35b] bg-[#c9a35b] text-black"
                                : occupiedTimesLoading
                                ? "cursor-wait border-white/10 bg-[#131313] text-white/25"
                                : "border-white/10 bg-[#131313] text-white/70 hover:border-[#c9a35b]/40 hover:text-white"
                            }`}
                          >
                            {time}
                            {occupied && (
                              <span className="mt-1 block text-[9px] font-normal no-underline text-red-300/50">
                                DOLU
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-6 flex items-center gap-2 text-xs text-white/25">
                      <span className="h-2 w-2 rounded-full bg-[#c9a35b]" />

                      Gün ve saatler artık veritabanındaki çalışma düzeninden geliyor.
                      Bir sonraki adımda dolu saatleri otomatik kapatacağız.
                    </div>
                  </div>

                  <button
                    onClick={handleTimeContinue}
                    disabled={!selectedTime}
                    className={`mt-8 w-full rounded-xl py-4 font-bold transition ${
                      selectedTime
                        ? "bg-[#c9a35b] text-black hover:bg-[#dfbd76]"
                        : "cursor-not-allowed bg-white/5 text-white/20"
                    }`}
                  >
                    {selectedTime
                      ? "Bilgilerime Devam Et →"
                      : "Devam etmek için saat seç"}
                  </button>
                </section>
              )}

              {/* =============================================
                  4 - MÜŞTERİ BİLGİLERİ
              ============================================= */}

              {appointmentStep === 4 && (
                <section className="mt-12">
                  <div className="flex items-end justify-between gap-5">
                    <div>
                      <p className="text-xs tracking-[0.3em] text-[#c9a35b]">
                        04 / BİLGİLER
                      </p>

                      <h2 className="mt-2 text-2xl font-semibold">
                        Son olarak seni tanıyalım.
                      </h2>

                      <p className="mt-2 text-sm text-white/35">
                        Randevu için iletişim bilgilerini gir.
                      </p>
                    </div>

                    <button
                      onClick={() => goToStep(3)}
                      className="shrink-0 text-sm text-white/40 transition hover:text-white"
                    >
                      ← Saati değiştir
                    </button>
                  </div>

                  <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
                    {/* FORM */}
                    <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 md:p-8">
                      <div>
                        <label
                          htmlFor="customerName"
                          className="text-xs font-semibold tracking-[0.15em] text-white/45"
                        >
                          AD SOYAD *
                        </label>

                        <input
                          id="customerName"
                          type="text"
                          value={customerName}
                          onChange={(event) =>
                            setCustomerName(
                              event.target.value
                            )
                          }
                          placeholder="Adınızı ve soyadınızı girin"
                          className="mt-3 w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-4 text-white outline-none transition placeholder:text-white/20 focus:border-[#c9a35b]/60"
                        />
                      </div>

                      <div className="mt-6">
                        <label
                          htmlFor="customerPhone"
                          className="text-xs font-semibold tracking-[0.15em] text-white/45"
                        >
                          TELEFON *
                        </label>

                        <input
                          id="customerPhone"
                          type="tel"
                          value={customerPhone}
                          onChange={(event) =>
                            setCustomerPhone(
                              event.target.value
                            )
                          }
                          placeholder="05XX XXX XX XX"
                          className="mt-3 w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-4 text-white outline-none transition placeholder:text-white/20 focus:border-[#c9a35b]/60"
                        />
                      </div>

                      <div className="mt-6">
                        <label
                          htmlFor="customerNote"
                          className="text-xs font-semibold tracking-[0.15em] text-white/45"
                        >
                          NOT
                          <span className="ml-2 font-normal text-white/20">
                            (İsteğe bağlı)
                          </span>
                        </label>

                        <textarea
                          id="customerNote"
                          value={customerNote}
                          onChange={(event) =>
                            setCustomerNote(
                              event.target.value
                            )
                          }
                          placeholder="Eklemek istediğiniz bir not varsa yazabilirsiniz."
                          rows={4}
                          className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-[#141414] px-4 py-4 text-white outline-none transition placeholder:text-white/20 focus:border-[#c9a35b]/60"
                        />
                      </div>
                    </div>

                    {/* KÜÇÜK ÖZET */}
                    <div className="rounded-2xl border border-[#c9a35b]/20 bg-[#c9a35b]/[0.05] p-6">
                      <p className="text-xs tracking-[0.25em] text-[#c9a35b]">
                        SEÇİMİN
                      </p>

                      <div className="mt-6 space-y-5">
                        <SummaryRow
                          label="Hizmet"
                          value={selectedService}
                        />

                        <SummaryRow
                          label="Tarih"
                          value={
                            selectedDateInfo?.fullLabel ||
                            selectedDate
                          }
                        />

                        <SummaryRow
                          label="Saat"
                          value={selectedTime}
                        />

                        <SummaryRow
                          label="Süre"
                          value={
                            selectedServiceInfo
                              ? `${selectedServiceInfo.duration_minutes} dk`
                              : `${appointmentInterval} dk`
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCustomerContinue}
                    disabled={
                      !customerName.trim() ||
                      !customerPhone.trim()
                    }
                    className={`mt-8 w-full rounded-xl py-4 font-bold transition ${
                      customerName.trim() &&
                      customerPhone.trim()
                        ? "bg-[#c9a35b] text-black hover:bg-[#dfbd76]"
                        : "cursor-not-allowed bg-white/5 text-white/20"
                    }`}
                  >
                    Randevu Özetine Geç →
                  </button>
                </section>
              )}

              {/* =============================================
                  5 - ÖZET / ONAY
              ============================================= */}

              {appointmentStep === 5 && (
                <section className="mt-12">
                  <div>
                    <p className="text-xs tracking-[0.3em] text-[#c9a35b]">
                      SON ADIM
                    </p>

                    <h2 className="mt-2 text-2xl font-semibold">
                      Randevunu kontrol et.
                    </h2>

                    <p className="mt-2 text-sm text-white/35">
                      Bilgiler doğruysa randevuyu oluştur.
                    </p>
                  </div>

                  <div className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]">
                    <div className="border-b border-white/10 bg-[#c9a35b]/[0.06] p-6 md:p-8">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-xs tracking-[0.25em] text-[#c9a35b]">
                            RANDEVU ÖZETİ
                          </p>

                          <h3 className="mt-2 text-2xl font-bold">
                            {selectedService}
                          </h3>
                        </div>

                        <div className="rounded-xl border border-[#c9a35b]/30 bg-[#c9a35b]/10 px-5 py-3 text-center">
                          <p className="text-xs text-white/35">
                            SAAT
                          </p>

                          <p className="mt-1 text-xl font-bold text-[#c9a35b]">
                            {selectedTime}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-0 md:grid-cols-2">
                      <div className="space-y-5 p-6 md:border-r md:border-white/10 md:p-8">
                        <SummaryRow
                          label="Ad Soyad"
                          value={customerName}
                        />

                        <SummaryRow
                          label="Telefon"
                          value={customerPhone}
                        />

                        {customerNote.trim() && (
                          <SummaryRow
                            label="Not"
                            value={customerNote}
                          />
                        )}
                      </div>

                      <div className="space-y-5 border-t border-white/10 p-6 md:border-t-0 md:p-8">
                        <SummaryRow
                          label="Hizmet"
                          value={selectedService}
                        />

                        <SummaryRow
                          label="Tarih"
                          value={
                            selectedDateInfo?.fullLabel ||
                            selectedDate
                          }
                        />

                        <SummaryRow
                          label="Saat"
                          value={selectedTime}
                        />

                        <SummaryRow
                          label="Randevu Süresi"
                          value={
                            selectedServiceInfo
                              ? `${selectedServiceInfo.duration_minutes} dk`
                              : `${appointmentInterval} dk`
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <p className="text-xs leading-6 text-white/35">
                      Randevu oluşturulduğunda durumun “Onay Bekliyor”
                      olarak kaydedilir. Aynı tarih ve saat için ikinci
                      aktif randevu veritabanı tarafından engellenir.
                    </p>
                  </div>

                  {appointmentError && (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                      {appointmentError}
                    </div>
                  )}

                  <div className="mt-7 grid gap-3 sm:grid-cols-[0.4fr_1fr]">
                    <button
                      onClick={() => goToStep(4)}
                      className="rounded-xl border border-white/15 px-6 py-4 font-semibold text-white/60 transition hover:border-white/30 hover:text-white"
                    >
                      ← Düzenle
                    </button>

                    <button
                      onClick={handleCreateAppointment}
                      disabled={appointmentSaving}
                      className={`rounded-xl px-6 py-4 font-bold shadow-xl transition ${
                        appointmentSaving
                          ? "cursor-not-allowed bg-[#c9a35b]/50 text-black/60"
                          : "bg-[#c9a35b] text-black hover:bg-[#dfbd76]"
                      }`}
                    >
                      {appointmentSaving
                        ? "Randevu Kaydediliyor..."
                        : "Randevuyu Oluştur ✓"}
                    </button>
                  </div>
                </section>
              )}

              <button
                onClick={goHome}
                className="mt-8 w-full py-3 text-sm text-white/30 transition hover:text-white"
              >
                ← Ana sayfaya dön
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  // =========================================================
  // ANA SAYFA
  // =========================================================

  return (
    <main
      id="anasayfa"
      className="min-h-screen bg-[linear-gradient(rgba(8,8,8,0.45),rgba(8,8,8,0.60)),url('/berber-bg.png')] bg-cover bg-center bg-fixed text-white"
    >
      {/* ÜST MENÜ */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.07] bg-[#080808]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <button onClick={goHome} className="text-left">
            <p className="font-bold tracking-wider">
              MURATHAN YAZAR
            </p>

            <p className="text-[10px] tracking-[0.35em] text-[#c9a35b]">
              BERBER
            </p>
          </button>

          <nav className="hidden items-center gap-8 md:flex">
            <button
              onClick={goHome}
              className="text-sm text-white/60 transition hover:text-white"
            >
              Ana Sayfa
            </button>

            <button
              onClick={() =>
                scrollToSection("hizmetler")
              }
              className="text-sm text-white/60 transition hover:text-white"
            >
              Hizmetler
            </button>

            <button
              onClick={() =>
                scrollToSection("iletisim")
              }
              className="text-sm text-white/60 transition hover:text-white"
            >
              İletişim
            </button>

            <button
              onClick={goAppointment}
              className="rounded-full bg-[#c9a35b] px-6 py-3 text-sm font-bold text-black transition hover:bg-[#dfbd76]"
            >
              Randevu Al
            </button>
          </nav>

          <button
            onClick={goAppointment}
            className="rounded-lg bg-[#c9a35b] px-4 py-2 text-xs font-bold text-black md:hidden"
          >
            Randevu Al
          </button>
        </div>
      </header>

      {/* =====================================================
          HERO
      ====================================================== */}

      <section className="relative flex min-h-screen items-center overflow-hidden px-5 pt-24">
        <div
          className="absolute inset-0 scale-[1.02] bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/berber-bg.png')",
          }}
        />

        <div className="absolute inset-0 bg-black/15" />

        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#080808]" />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[20%] top-[-350px] h-[800px] w-[800px] rounded-full bg-[#c9a35b]/[0.07] blur-[180px]" />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[1.15fr_0.85fr]">
          {/* SOL */}
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-[#c9a35b]/40 bg-black/20 px-4 py-2 shadow-lg backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-[#c9a35b]" />

              <span className="text-xs font-semibold tracking-[0.25em] text-[#c9a35b]">
                MURATHAN YAZAR
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl font-bold leading-[1.05] drop-shadow-[0_5px_25px_rgba(0,0,0,1)] md:text-7xl">
              Tarzına uygun
              <span className="block text-[#c9a35b]">
                kesim.
              </span>
              Sana uygun saat.
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-white/80 drop-shadow-[0_3px_10px_rgba(0,0,0,1)] md:text-lg">
              Randevunu birkaç adımda oluştur.
              Hizmetini, gününü ve sana uygun saati seç.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={goAppointment}
                className="rounded-xl bg-[#c9a35b] px-8 py-4 font-bold text-black shadow-2xl transition hover:-translate-y-0.5 hover:bg-[#dfbd76]"
              >
                Randevu Al
              </button>

              <button
                onClick={() =>
                  scrollToSection("hizmetler")
                }
                className="rounded-xl border border-white/30 bg-black/15 px-8 py-4 font-semibold shadow-xl backdrop-blur-sm transition hover:bg-black/30"
              >
                Hizmetler & Fiyatlar
              </button>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-5 border-t border-white/25 pt-7">
              <div>
                <p className="text-xs tracking-wider text-white/50">
                  RANDEVU
                </p>

                <p className="mt-2 text-sm">
                  Online & Kolay
                </p>
              </div>

              <div>
                <p className="text-xs tracking-wider text-white/50">
                  TELEFON
                </p>

                <a
                  href="tel:+905331288639"
                  className="mt-2 block text-sm transition hover:text-[#c9a35b]"
                >
                  +90 533 128 86 39
                </a>
              </div>

              <div>
                <p className="text-xs tracking-wider text-white/50">
                  INSTAGRAM
                </p>

                <p className="mt-2 text-sm">
                  @murathanyazar
                </p>
              </div>
            </div>
          </div>

          {/* SAĞ KART */}
          <div className="relative hidden lg:block">
            <div className="relative mx-auto h-[470px] max-w-[380px] overflow-hidden rounded-[40px] border border-white/25 bg-black/15 p-8 shadow-2xl backdrop-blur-[3px]">
              <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#c9a35b]/10 blur-[80px]" />

              <div className="relative z-10 flex h-full flex-col justify-between">
                <div className="flex justify-between">
                  <span className="text-xs tracking-[0.3em] text-[#c9a35b]">
                    BERBER
                  </span>

                  <span className="text-3xl text-[#c9a35b]">
                    ✂
                  </span>
                </div>

                <div>
                  <p className="text-sm text-white/60">
                    ONLINE RANDEVU
                  </p>

                  <p className="mt-3 text-4xl font-bold">
                    Sana uygun
                    <span className="block text-[#c9a35b]">
                      zamanı seç.
                    </span>
                  </p>

                  <button
                    onClick={goAppointment}
                    className="mt-8 w-full rounded-xl border border-[#c9a35b]/60 bg-black/15 py-4 font-semibold text-[#c9a35b] backdrop-blur-sm transition hover:bg-[#c9a35b] hover:text-black"
                  >
                    Randevu Oluştur →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          HİZMETLER
      ====================================================== */}

      <section
        id="hizmetler"
        className="scroll-mt-24 border-y border-white/[0.07] bg-[linear-gradient(rgba(8,8,8,0.45),rgba(8,8,8,0.45)),url('/berber-bg.png')] bg-cover bg-center bg-fixed"
      >
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-[0.35em] text-[#c9a35b]">
              HİZMETLER & FİYATLAR
            </p>

            <h2 className="mt-4 text-4xl font-bold">
              Hizmetler
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
              Hizmet ve fiyat bilgileri yönetim panelinden
              güncellenebilecek.
            </p>
          </div>

          {servicesLoading && (
            <div className="mt-12 rounded-2xl border border-white/10 bg-[#111] p-7 text-center text-sm text-white/40">
              Hizmetler yükleniyor...
            </div>
          )}

          {servicesError && (
            <div className="mt-12 rounded-2xl border border-red-500/20 bg-red-500/5 p-7 text-center text-sm text-red-300">
              {servicesError}
            </div>
          )}

          {!servicesLoading && !servicesError && (
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {services.map((service, index) => (
              <div
                key={service.name}
                className={`group rounded-2xl border p-7 transition ${
                  index === 2
                    ? "border-[#c9a35b]/40 bg-[#c9a35b]/10"
                    : "border-white/10 bg-[#111]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#c9a35b]/10 text-xl text-[#c9a35b]">
                    ✂
                  </div>

                  <span className="text-sm font-semibold text-[#c9a35b]">
                    {formatServicePrice(service.price)}
                  </span>
                </div>

                <h3 className="mt-7 text-xl font-semibold">
                  {service.name}
                </h3>

                <p className="mt-2 text-sm text-white/35">
                  ◷ {service.duration_minutes} dk
                </p>

                <button
                  onClick={() =>
                    startAppointmentWithService(
                      service.name
                    )
                  }
                  className="mt-7 text-sm font-semibold text-[#c9a35b] transition group-hover:translate-x-1"
                >
                  Bu hizmet için randevu al →
                </button>
              </div>
            ))}
          </div>
          )}

          <div className="mt-10 text-center">
            <button
              onClick={goAppointment}
              className="rounded-xl bg-[#c9a35b] px-8 py-4 font-bold text-black transition hover:bg-[#dfbd76]"
            >
              Hemen Randevu Al
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================
          İLETİŞİM
      ====================================================== */}

      <section
        id="iletisim"
        className="scroll-mt-24 bg-[linear-gradient(rgba(8,8,8,0.60),rgba(8,8,8,0.60)),url('/berber-bg.png')] bg-cover bg-center bg-fixed"
      >
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-[0.35em] text-[#c9a35b]">
                İLETİŞİM
              </p>

              <h2 className="mt-4 text-4xl font-bold">
                Bize Ulaşın
              </h2>

              <p className="mt-4 max-w-md leading-7 text-white/40">
                Randevu veya bilgi için iletişim
                kanallarından ulaşabilirsin.
              </p>

              <div className="mt-10 space-y-3">
                <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-[#101010] p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c9a35b]/10 text-[#c9a35b]">
                    ☎
                  </div>

                  <div>
                    <p className="text-xs text-white/30">
                      TELEFON
                    </p>

                    <a
                      href="tel:+905331288639"
                      className="mt-1 block font-semibold transition hover:text-[#c9a35b]"
                    >
                      +90 533 128 86 39
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-[#101010] p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c9a35b]/10 text-[#c9a35b]">
                    @
                  </div>

                  <div>
                    <p className="text-xs text-white/30">
                      INSTAGRAM
                    </p>

                    <p className="mt-1 font-semibold">
                      @murathanyazar
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-[#101010] p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c9a35b]/10 text-[#c9a35b]">
                    ◉
                  </div>

                  <div>
                    <p className="text-xs text-white/30">
                      ADRES
                    </p>

                    <p className="mt-1 font-semibold text-white/50">
                      Daha sonra eklenecek
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-[#101010] p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c9a35b]/10 text-[#c9a35b]">
                    ◷
                  </div>

                  <div>
                    <p className="text-xs text-white/30">
                      ÇALIŞMA SAATLERİ
                    </p>

                    <p className="mt-1 font-semibold text-white/50">
                      Daha sonra eklenecek
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-[450px] items-center justify-center rounded-[32px] border border-white/10 bg-[#0e0e0e] p-8">
              <div className="max-w-sm text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a35b]/20 bg-[#c9a35b]/5 text-2xl text-[#c9a35b]">
                  ◉
                </div>

                <p className="mt-6 text-xl font-semibold">
                  Konum
                </p>

                <p className="mt-3 text-sm leading-6 text-white/35">
                  Adres bilgisi eklendiğinde burada harita
                  görüntülenecek.
                </p>

                <button
                  onClick={goAppointment}
                  className="mt-8 rounded-xl bg-[#c9a35b] px-7 py-4 font-bold text-black transition hover:bg-[#dfbd76]"
                >
                  Randevu Al
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-5 py-10 md:flex-row md:items-center">
          <div>
            <p className="font-bold tracking-wider">
              MURATHAN YAZAR
            </p>

            <p className="mt-1 text-[10px] tracking-[0.35em] text-[#c9a35b]">
              BERBER
            </p>
          </div>

          <p className="text-xs text-white/25">
            © 2026 Murathan Yazar
          </p>
        </div>
      </footer>

      {/* MOBİL SABİT RANDEVU */}
      <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
        <button
          onClick={goAppointment}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#c9a35b] py-4 font-bold text-black shadow-2xl"
        >
          <span className="flex items-center justify-center gap-3">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                d="M7 3V6M17 3V6M4.5 9H19.5M6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7C4 5.89543 4.89543 5 6 5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 15L11 17L15.5 12.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Randevu Al</span>
          </span>
        </button>
      </div>
    </main>
  );
}

// =========================================================
// RANDEVU ÖZET SATIRI
// =========================================================

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.2em] text-white/25">
        {label.toUpperCase()}
      </p>

      <p className="mt-1 break-words font-medium capitalize text-white/85">
        {value || "-"}
      </p>
    </div>
  );
}