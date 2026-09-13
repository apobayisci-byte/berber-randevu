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

type Review = {
  id: number;
  customer_name: string;
  customer_phone: string;
  rating: number;
  comment: string;
  created_at: string;
};

function maskReviewName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase("tr-TR")}.`)
    .join("");
}

function maskReviewPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("90") ? `0${digits.slice(2)}` : digits;
  const firstFour = local.slice(0, 4) || "05XX";
  return `${firstFour} *** ** **`;
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

  // Önümüzdeki 20 açık çalışma gününü göster.
  // Pazar/kapalı günler sayıya dahil edilmez.
  for (let i = 0; dates.length < 20 && i < 40; i++) {
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

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  const [appointmentCreated, setAppointmentCreated] =
    useState(false);
  const [createdAppointmentId, setCreatedAppointmentId] = useState<number | null>(null);
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentError, setAppointmentError] = useState("");

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewAnimating, setReviewAnimating] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewSent, setReviewSent] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [availableTimesLoading, setAvailableTimesLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const dateOptions = useMemo(
    () => createDateOptions(workingHours),
    [workingHours]
  );

  const appointmentInterval = businessSettings?.appointment_interval ?? 45;

  const barberName = businessSettings?.barber_name?.trim() || "Murathan Yazar";
  const phone = businessSettings?.phone?.trim() || "+90 533 128 86 39";
  const phoneHref = `tel:${phone.replace(/[^+\d]/g, "")}`;
  const instagram = businessSettings?.instagram?.trim() || "@murathanyazar";
  const instagramHandle = instagram.replace(/^@/, "");
  const instagramHref = `https://www.instagram.com/${instagramHandle}/`;
  const address = businessSettings?.address?.trim() || "";
  const mapEmbedUrl = address
    ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
    : "";
  const mapOpenUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";

  const workingHoursText = useMemo(() => {
    const openDays = workingHours.filter((day) => day.is_open);

    if (openDays.length === 0) return "Kapalı";

    const hourRanges = new Set(
      openDays.map(
        (day) => `${day.open_time.slice(0, 5)}–${day.close_time.slice(0, 5)}`
      )
    );

    if (hourRanges.size === 1) {
      const firstDay = openDays[0]?.day_name || "";
      const lastDay = openDays[openDays.length - 1]?.day_name || "";
      const dayText =
        openDays.length === 1
          ? firstDay
          : openDays.length === 7
          ? "Her gün"
          : `${firstDay}–${lastDay}`;

      return `${dayText} • ${Array.from(hourRanges)[0]}`;
    }

    return `${openDays.length} gün açık • Saatler güne göre değişiyor`;
  }, [workingHours]);

  const todayWorkingHour = useMemo(() => {
    if (workingHours.length === 0) {
      return "Saat bilgisi yükleniyor";
    }

    const now = new Date();
    const jsDay = now.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const today = workingHours.find(
      (item) => item.day_of_week === dayOfWeek
    );

    if (!today || !today.is_open) {
      return "Bugün kapalı";
    }

    return `Bugün ${today.open_time.slice(0, 5)}–${today.close_time.slice(0, 5)}`;
  }, [workingHours]);

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
    const loadReviews = async () => {
      setReviewsLoading(true);

      try {
        const response = await fetch("/api/reviews", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          reviews?: Review[];
        };

        if (response.ok) {
          setReviews(result.reviews ?? []);
        }
      } catch (error) {
        console.error("Yorumlar alınamadı:", error);
      } finally {
        setReviewsLoading(false);
      }
    };

    loadReviews();
  }, []);

  useEffect(() => {
    if (reviews.length <= 6) {
      setReviewPage(0);
      return;
    }

    const pageCount = Math.ceil(reviews.length / 6);

    const timer = window.setInterval(() => {
      setReviewAnimating(true);

      window.setTimeout(() => {
        setReviewPage((current) => (current + 1) % pageCount);
        setReviewAnimating(false);
      }, 250);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [reviews.length]);

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
    const loadAvailableTimes = async () => {
      if (!selectedDate || selectedServiceIds.length === 0) {
        setAvailableTimes([]);
        setAvailableTimesLoading(false);
        setAvailabilityError("");
        return;
      }

      setAvailableTimesLoading(true);
      setAvailabilityError("");

      try {
        const params = new URLSearchParams({
          date: selectedDate,
          service_ids: selectedServiceIds.join(","),
        });

        const response = await fetch(`/api/appointments?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const result = (await response.json()) as {
          available_times?: string[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.error || "Uygun saatler şu anda alınamadı."
          );
        }

        const times = result.available_times ?? [];
        setAvailableTimes(times);

        if (selectedTime && !times.includes(selectedTime)) {
          setSelectedTime("");
        }
      } catch (error) {
        console.error("Uygun saatler alınamadı:", error);
        setAvailableTimes([]);
        setAvailabilityError(
          "Uygun saatler şu anda alınamadı. Lütfen tekrar deneyin."
        );
      } finally {
        setAvailableTimesLoading(false);
      }
    };

    loadAvailableTimes();
  }, [selectedDate, selectedServiceIds, selectedTime]);

  const selectedDateInfo = dateOptions.find(
    (date) => date.value === selectedDate
  );

  // Saat listesi artık API tarafından dinamik üretiliyor.
  // Böylece 10:00'da 45 dk işlem + 5 dk mola varsa 10:50 de görünür.
  const timeSlots = availableTimes;

  const selectedServices = useMemo(
    () =>
      services.filter((service) =>
        selectedServiceIds.includes(service.id)
      ),
    [services, selectedServiceIds]
  );

  const selectedServicesText = selectedServices
    .map((service) => service.name)
    .join(" + ");

  const totalDuration = selectedServices.reduce(
    (sum, service) => sum + service.duration_minutes,
    0
  );

  const totalPrice = selectedServices.reduce(
    (sum, service) => sum + Number(service.price ?? 0),
    0
  );

  const resetAppointment = () => {
    setAppointmentStep(1);
    setSelectedServiceIds([]);
    setSelectedDate("");
    setSelectedTime("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNote("");
    setAppointmentCreated(false);
    setCreatedAppointmentId(null);
    setReviewRating(5);
    setReviewComment("");
    setReviewSaving(false);
    setReviewError("");
    setReviewSent(false);
    setAppointmentSaving(false);
    setAppointmentError("");
    setAvailableTimes([]);
    setAvailableTimesLoading(false);
    setAvailabilityError("");
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
    const service = services.find((item) => item.name === serviceName);

    setSelectedServiceIds(service ? [service.id] : []);
    setSelectedDate("");
    setSelectedTime("");
    setAppointmentStep(service ? 2 : 1);
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
    if (step === 2 && selectedServiceIds.length === 0) return;
    if (step === 3 && (selectedServiceIds.length === 0 || !selectedDate)) return;

    if (
      step === 4 &&
      (selectedServiceIds.length === 0 || !selectedDate || !selectedTime)
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
    if (selectedServiceIds.length === 0) return;

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
      selectedServiceIds.length === 0 ||
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

    let newAppointmentId: number | null = null;

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service_ids: selectedServiceIds,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_note: customerNote.trim() || null,
          appointment_date: selectedDate,
          appointment_time: selectedTime,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        appointment_id?: number;
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        console.error("Randevu oluşturulamadı:", result);

        if (result.code === "SLOT_TAKEN") {
          setAppointmentError(
            "Bu saat az önce başka bir müşteri tarafından alındı. Lütfen farklı bir saat seç."
          );
          setSelectedTime("");
          setAppointmentStep(3);
        } else {
          setAppointmentError(
            result.error ||
              "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin."
          );
        }

        setAppointmentSaving(false);
        return;
      }

      newAppointmentId = result.appointment_id ?? null;
    } catch (error) {
      console.error("Randevu API bağlantı hatası:", error);
      setAppointmentError(
        "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin."
      );
      setAppointmentSaving(false);
      return;
    }

    setCreatedAppointmentId(newAppointmentId);
    setAppointmentCreated(true);
    setAppointmentSaving(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleSubmitReview = async () => {
    if (
      !createdAppointmentId ||
      !reviewComment.trim() ||
      reviewSaving
    ) {
      return;
    }

    setReviewSaving(true);
    setReviewError("");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appointment_id: createdAppointmentId,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          rating: reviewRating,
          comment: reviewComment.trim(),
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        review?: Review;
        error?: string;
      };

      if (!response.ok) {
        setReviewError(
          result.error || "Yorumunuz şu anda gönderilemedi."
        );
        setReviewSaving(false);
        return;
      }

      if (result.review) {
        setReviews((current) => [result.review as Review, ...current].slice(0, 12));
      }

      setReviewSent(true);
    } catch (error) {
      console.error("Yorum gönderilemedi:", error);
      setReviewError("Yorumunuz şu anda gönderilemedi.");
    } finally {
      setReviewSaving(false);
    }
  };

  // =========================================================
  // GİRİŞ EKRANI
  // =========================================================

  if (intro) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-6 text-white">
        <div
          className="absolute inset-0 scale-[1.02] bg-cover bg-center bg-no-repeat md:hidden"
          style={{
            backgroundImage: "url('/berber-bg-mobile.png')",
          }}
        />
        <div
          className="absolute inset-0 hidden scale-[1.02] bg-cover bg-center bg-no-repeat md:block"
          style={{
            backgroundImage: "url('/berber-bg-desktop.png')",
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
              href={phoneHref}
              className="transition hover:text-[#c9a35b]"
            >
              {phone}
            </a>

            <span>•</span>

            <span>{instagram}</span>
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
        <div
          className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat md:hidden"
          style={{ backgroundImage: "url('/berber-bg-mobile.png')" }}
        />
        <div
          className="pointer-events-none fixed inset-0 hidden bg-cover bg-center bg-no-repeat md:block"
          style={{ backgroundImage: "url('/berber-bg-desktop.png')" }}
        />
        <div className="pointer-events-none fixed inset-0 bg-black/65" />

        <div className="pointer-events-none fixed inset-0">
          <div className="absolute -left-40 top-[20%] h-[500px] w-[500px] rounded-full bg-[#c9a35b]/[0.04] blur-[130px]" />
          <div className="absolute -right-40 top-[50%] h-[500px] w-[500px] rounded-full bg-[#c9a35b]/[0.04] blur-[130px]" />
        </div>

        {/* ÜST MENÜ */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080808]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <button onClick={goHome} className="text-left">
              <p className="font-bold tracking-wider">
                {barberName.toUpperCase()}
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

        <div className="relative z-10 mx-auto max-w-5xl px-4 py-3 md:px-5 md:py-5">
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
                Randevun onaylandı.
              </h1>

              <p className="mx-auto mt-4 max-w-lg leading-7 text-white/45">
                Randevun başarıyla oluşturuldu ve otomatik olarak onaylandı.
                Tarih ve saat bilgilerini aşağıdan kontrol edebilirsin.
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
                    value={selectedServicesText}
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

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] tracking-[0.25em] text-[#c9a35b]">
                      DEĞERLENDİR
                    </p>
                    <p className="mt-1 text-sm text-white/55">
                      Randevu deneyimin için kısa bir yorum bırakabilirsin.
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className={`text-xl ${
                          star <= reviewRating
                            ? "text-[#c9a35b]"
                            : "text-white/15"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                {reviewSent ? (
                  <div className="mt-4 rounded-xl border border-[#c9a35b]/25 bg-[#c9a35b]/10 px-4 py-3 text-sm text-[#c9a35b]">
                    Teşekkürler. Yorumun yayınlandı. ✓
                  </div>
                ) : (
                  <>
                    <textarea
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      maxLength={300}
                      rows={2}
                      placeholder="Değerlendirmeni yaz..."
                      className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#c9a35b]/50"
                    />

                    {reviewError && (
                      <p className="mt-2 text-xs text-red-300">
                        {reviewError}
                      </p>
                    )}

                    <button
                      onClick={handleSubmitReview}
                      disabled={!reviewComment.trim() || reviewSaving || !createdAppointmentId}
                      className={`mt-3 w-full rounded-xl py-3 text-sm font-bold ${
                        reviewComment.trim() && !reviewSaving && createdAppointmentId
                          ? "bg-[#c9a35b] text-black"
                          : "cursor-not-allowed bg-white/5 text-white/20"
                      }`}
                    >
                      {reviewSaving ? "Gönderiliyor..." : "Yorumu Gönder"}
                    </button>
                  </>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={resetAppointment}
                  className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Yeni Randevu Oluştur
                </button>

                <button
                  onClick={goHome}
                  className="rounded-xl bg-[#c9a35b] px-6 py-3 font-bold text-black transition hover:bg-[#dfbd76]"
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
                <div className="mt-3 grid grid-cols-4 gap-2">
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
                <section className="mt-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] tracking-[0.28em] text-[#c9a35b]">
                        01 / HİZMET
                      </p>
                      <h2 className="mt-0.5 text-lg font-semibold">
                        Hizmetlerini seç
                      </h2>
                      <p className="mt-0.5 text-[11px] text-white/35">
                        Bir veya birden fazla hizmet seçebilirsin.
                      </p>
                    </div>

                    {selectedServices.length > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-white/30">
                          {totalDuration} dk
                        </p>
                        <p className="text-sm font-bold text-[#c9a35b]">
                          {formatServicePrice(totalPrice)}
                        </p>
                      </div>
                    )}
                  </div>

                  {servicesLoading && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-[#111] p-4 text-sm text-white/40">
                      Hizmetler yükleniyor...
                    </div>
                  )}

                  {servicesError && (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                      {servicesError}
                    </div>
                  )}

                  {!servicesLoading && !servicesError && (
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {services.slice(0, 10).map((service) => {
                        const active = selectedServiceIds.includes(service.id);

                        return (
                          <button
                            key={service.id}
                            onClick={() => {
                              setSelectedServiceIds((current) =>
                                active
                                  ? current.filter((id) => id !== service.id)
                                  : [...current, service.id]
                              );
                              setSelectedDate("");
                              setSelectedTime("");
                            }}
                            className={`flex min-h-[40px] items-center justify-between rounded-md border px-2 py-1 text-left transition ${
                              active
                                ? "border-[#c9a35b] bg-[#c9a35b]/10"
                                : "border-white/10 bg-[#111]/90 hover:border-white/20"
                            }`}
                          >
                            <div className="min-w-0 pr-1">
                              <p className="truncate text-[10px] font-semibold leading-tight sm:text-[11px]">
                                {service.name}
                              </p>
                              <p className="mt-0.5 text-[8px] leading-none text-white/35">
                                {service.duration_minutes} dk
                              </p>
                            </div>

                            <div className="ml-1 flex shrink-0 items-center gap-1.5">
                              <span className="text-[9px] font-semibold text-[#c9a35b]">
                                {formatServicePrice(service.price)}
                              </span>
                              <span
                                className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[7px] ${
                                  active
                                    ? "border-[#c9a35b] bg-[#c9a35b] font-bold text-black"
                                    : "border-white/20 text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={handleServiceContinue}
                    disabled={selectedServiceIds.length === 0}
                    className={`mt-2.5 w-full rounded-lg py-2.5 text-xs font-bold transition ${
                      selectedServiceIds.length > 0
                        ? "bg-[#c9a35b] text-black hover:bg-[#dfbd76]"
                        : "cursor-not-allowed bg-white/5 text-white/20"
                    }`}
                  >
                    {selectedServiceIds.length > 0
                      ? `${selectedServiceIds.length} hizmet seçildi • Devam Et →`
                      : "Devam etmek için hizmet seç"}
                  </button>
                </section>
              )}

              {/* =============================================
                  2 - TARİH
              ============================================= */}

              {appointmentStep === 2 && (
                <section className="mt-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] tracking-[0.28em] text-[#c9a35b]">
                        02 / TARİH
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        Gününü seç
                      </h2>
                    </div>

                    <button
                      onClick={() => goToStep(1)}
                      className="text-xs text-white/40 transition hover:text-white"
                    >
                      ← Hizmetler
                    </button>
                  </div>

                  {scheduleLoading && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-[#111] p-4 text-sm text-white/40">
                      Çalışma günleri yükleniyor...
                    </div>
                  )}

                  {scheduleError && (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                      {scheduleError}
                    </div>
                  )}

                  {!scheduleLoading && !scheduleError && (
                    <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5">
                      {dateOptions.map((date) => {
                        const active = selectedDate === date.value;

                        return (
                          <button
                            key={date.value}
                            onClick={() => {
                              setSelectedDate(date.value);
                              setSelectedTime("");
                            }}
                            className={`min-w-0 rounded-md border px-0.5 py-1.5 text-center transition ${
                              active
                                ? "border-[#c9a35b] bg-[#c9a35b] text-black"
                                : "border-white/10 bg-[#111]/90 hover:border-[#c9a35b]/40"
                            }`}
                          >
                            <p className={`truncate text-[7px] font-semibold sm:text-[8px] ${
                              active ? "text-black/60" : "text-white/35"
                            }`}>
                              {date.dayName}
                            </p>
                            <p className="mt-0.5 text-[13px] font-bold sm:text-sm">
                              {date.dayNumber}
                            </p>
                            <p className={`truncate text-[7px] sm:text-[8px] ${
                              active ? "text-black/60" : "text-[#c9a35b]"
                            }`}>
                              {date.monthName}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={handleDateContinue}
                    disabled={!selectedDate}
                    className={`mt-3 w-full rounded-xl py-3 text-sm font-bold transition ${
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
                <section className="mt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] tracking-[0.28em] text-[#c9a35b]">
                        03 / SAAT
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        Saatini seç
                      </h2>
                      <p className="mt-1 text-xs text-white/35">
                        Toplam işlem süresi: {totalDuration} dk
                      </p>
                    </div>

                    <button
                      onClick={() => goToStep(2)}
                      className="text-xs text-white/40 transition hover:text-white"
                    >
                      ← Tarih
                    </button>
                  </div>

                  {availableTimesLoading && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-[#111] p-4 text-sm text-white/40">
                      Uygun saatler kontrol ediliyor...
                    </div>
                  )}

                  {availabilityError && (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                      {availabilityError}
                    </div>
                  )}

                  {!availableTimesLoading && !availabilityError && (
                    <>
                      <div className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-10">
                        {timeSlots.map((time) => {
                          const active = selectedTime === time;
                          const available = availableTimes.includes(time);

                          return (
                            <button
                              key={time}
                              disabled={!available}
                              onClick={() => {
                                if (available) setSelectedTime(time);
                              }}
                              className={`min-h-7 rounded-md border px-1 py-1.5 text-[10px] font-semibold leading-none transition ${
                                !available
                                  ? "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-white/15 line-through"
                                  : active
                                  ? "border-[#c9a35b] bg-[#c9a35b] text-black"
                                  : "border-white/10 bg-[#131313] text-white/70 hover:border-[#c9a35b]/40"
                              }`}
                            >
                              {time}
                            </button>
                          );
                        })}
                      </div>

                      {availableTimes.length === 0 && (
                        <p className="mt-4 text-center text-xs text-white/35">
                          Bu tarih için seçtiğin hizmetlere uygun boş saat bulunmuyor.
                        </p>
                      )}
                    </>
                  )}

                  <button
                    onClick={handleTimeContinue}
                    disabled={!selectedTime}
                    className={`mt-3 w-full rounded-xl py-3 text-sm font-bold transition ${
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
                          value={selectedServicesText}
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
                          value={`${totalDuration} dk`}
                        />

                        <SummaryRow
                          label="Toplam"
                          value={formatServicePrice(totalPrice)}
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
                            {selectedServicesText}
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
                          value={selectedServicesText}
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
                          value={`${totalDuration} dk`}
                        />

                        <SummaryRow
                          label="Toplam"
                          value={formatServicePrice(totalPrice)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <p className="text-xs leading-6 text-white/35">
                      Randevu, uygun saat boşsa otomatik olarak onaylanır.
                      Seçtiğin hizmetlerin toplam süresi boyunca çakışan başka
                      randevu oluşturulamaz.
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
      className="relative min-h-screen bg-[#080808] text-white"
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat md:hidden"
        style={{ backgroundImage: "url('/berber-bg-mobile.png')" }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 hidden bg-cover bg-center bg-no-repeat md:block"
        style={{ backgroundImage: "url('/berber-bg-desktop.png')" }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-black/25" />
      {/* ÜST MENÜ */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.07] bg-[#080808]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <button onClick={goHome} className="text-left">
            <p className="font-bold tracking-wider">
              {barberName.toUpperCase()}
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
                scrollToSection("yorumlar")
              }
              className="text-sm text-white/60 transition hover:text-white"
            >
              Yorumlar
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

      <section className="relative z-10 flex min-h-[100svh] items-center overflow-hidden px-5 pb-6 pt-20 md:pb-8 md:pt-24 lg:pt-28">
        
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[20%] top-[-350px] h-[800px] w-[800px] rounded-full bg-[#c9a35b]/[0.07] blur-[180px]" />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          {/* SOL */}
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-[#c9a35b]/40 bg-black/20 px-4 py-2 shadow-lg backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-[#c9a35b]" />

              <span className="text-xs font-semibold tracking-[0.25em] text-[#c9a35b]">
                {barberName.toUpperCase()}
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
                  scrollToSection("yorumlar")
                }
                className="rounded-xl border border-white/30 bg-black/15 px-8 py-4 font-semibold shadow-xl backdrop-blur-sm transition hover:bg-black/30"
              >
                Müşteri Yorumları
              </button>
            </div>

            <div className="mt-4 grid max-w-3xl grid-cols-3 gap-1.5 border-t border-white/20 pt-3 md:mt-6 md:pt-4">
              <a
                href={phoneHref}
                className="group rounded-lg border border-white/15 bg-black/25 px-2 py-2 backdrop-blur-sm transition hover:border-[#c9a35b]/60 hover:bg-black/40"
              >
                <p className="text-[8px] font-semibold tracking-[0.12em] text-white/50">
                  TEK DOKUNUŞLA
                </p>
                <p className="mt-1 text-[10px] font-semibold text-white transition group-hover:text-[#c9a35b]">
                  ☎ Ara
                </p>
                <p className="mt-0.5 text-[8px] text-white/55">
                  {phone}
                </p>
              </a>

              <a
                href={instagramHref}
                target="_blank"
                rel="noreferrer"
                className="group rounded-lg border border-white/15 bg-black/25 px-2 py-2 backdrop-blur-sm transition hover:border-[#c9a35b]/60 hover:bg-black/40"
              >
                <p className="text-[8px] font-semibold tracking-[0.12em] text-white/50">
                  INSTAGRAM
                </p>
                <p className="mt-1 text-[10px] font-semibold text-white transition group-hover:text-[#c9a35b]">
                  {instagram}
                </p>
                <p className="mt-0.5 text-[8px] text-white/55">
                  Profili aç →
                </p>
              </a>

              <div className="rounded-lg border border-white/15 bg-black/25 px-2 py-2 backdrop-blur-sm">
                <p className="text-[8px] font-semibold tracking-[0.12em] text-white/50">
                  BUGÜNKÜ SAAT
                </p>
                <p className="mt-1 text-[10px] font-semibold text-[#c9a35b]">
                  {todayWorkingHour}
                </p>
                <p className="mt-0.5 text-[8px] text-white/55">
                  Çalışma saatine göre
                </p>
              </div>
            </div>
          </div>

          {/* SAĞ KART */}
          <div className="relative hidden lg:block">
            <div className="relative mx-auto h-[560px] max-w-[380px] overflow-hidden rounded-[40px] border border-white/25 bg-black/15 p-8 shadow-2xl backdrop-blur-[3px]">
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

                  <div className="mt-7 space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#c9a35b]/45 text-xs font-bold text-[#c9a35b]">
                        1
                      </span>
                      <span className="text-sm text-white/80">
                        Hizmetini seç
                      </span>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#c9a35b]/45 text-xs font-bold text-[#c9a35b]">
                        2
                      </span>
                      <span className="text-sm text-white/80">
                        Gün &amp; saat seç
                      </span>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#c9a35b]/45 text-xs font-bold text-[#c9a35b]">
                        3
                      </span>
                      <span className="text-sm text-white/80">
                        Randevunu oluştur
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={goAppointment}
                    className="mt-6 w-full rounded-xl border border-[#c9a35b]/60 bg-black/15 py-4 font-semibold text-[#c9a35b] backdrop-blur-sm transition hover:bg-[#c9a35b] hover:text-black"
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
          MÜŞTERİ YORUMLARI
      ====================================================== */}

      <section
        id="yorumlar"
        className="relative z-10 flex min-h-[100svh] scroll-mt-24 items-center overflow-hidden border-y border-white/[0.07] bg-transparent"
      >
        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] text-[#c9a35b] md:text-sm">
                MÜŞTERİ YORUMLARI
              </p>
              <h2 className="mt-2 text-3xl font-bold md:text-4xl">
                Değerlendirmeler
              </h2>
            </div>

            <div className="text-right">
              <p className="text-[8px] text-white/25">
                Son {Math.min(reviews.length, 12)} yorum
              </p>
              {reviews.length > 6 && (
                <div className="mt-1 flex justify-end gap-1">
                  {Array.from({
                    length: Math.ceil(Math.min(reviews.length, 12) / 6),
                  }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        index === reviewPage
                          ? "w-3 bg-[#c9a35b]"
                          : "w-1 bg-white/20"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {reviewsLoading ? (
            <div className="mt-2 rounded-lg border border-white/10 bg-[#111]/80 p-3 text-xs text-white/35">
              Yorumlar yükleniyor...
            </div>
          ) : reviews.length === 0 ? (
            <div className="mt-2 rounded-lg border border-white/10 bg-[#111]/80 p-3 text-center text-xs text-white/35">
              Henüz müşteri yorumu bulunmuyor.
            </div>
          ) : (
            <div
              className={`mt-8 grid min-h-[360px] grid-cols-1 content-center gap-3 transition-all duration-300 sm:grid-cols-2 sm:grid-rows-3 md:min-h-[420px] md:gap-4 ${
                reviewAnimating
                  ? "-translate-y-1 opacity-0"
                  : "translate-y-0 opacity-100"
              }`}
            >
              {reviews
                .slice(0, 12)
                .slice(reviewPage * 6, reviewPage * 6 + 6)
                .map((review) => (
                  <div
                    key={review.id}
                    className="min-h-0 min-w-0 overflow-hidden rounded-2xl border border-white/[0.11] bg-[#0b0b0b]/80 px-4 py-4 md:px-5 md:py-5"
                  >
                    <div className="flex items-center gap-2">
                      <p className="shrink-0 text-sm font-bold text-white/85 md:text-base">
                        {maskReviewName(review.customer_name)}
                      </p>

                      <p className="shrink-0 whitespace-nowrap text-xs text-[#c9a35b] md:text-sm">
                        {"★".repeat(review.rating)}
                      </p>
                    </div>

                    <p className="mt-2 line-clamp-3 overflow-hidden text-xs leading-5 text-white/55 md:text-sm md:leading-6">
                      {review.comment}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          İLETİŞİM
      ====================================================== */}

      <section
        id="iletisim"
        className="relative z-10 flex min-h-[100svh] scroll-mt-24 items-center overflow-hidden bg-transparent"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
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
                      href={phoneHref}
                      className="mt-1 block font-semibold transition hover:text-[#c9a35b]"
                    >
                      {phone}
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

                    <a
                      href={instagramHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block font-semibold transition hover:text-[#c9a35b]"
                    >
                      {instagram}
                    </a>
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

                    <p className="mt-1 font-semibold text-white/70">
                      {scheduleLoading ? "Yükleniyor..." : address || "Adres henüz eklenmedi"}
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

                    <p className="mt-1 font-semibold text-white/70">
                      {scheduleLoading ? "Yükleniyor..." : workingHoursText}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-[450px] overflow-hidden rounded-[32px] border border-white/10 bg-[#0e0e0e]">
              {address ? (
                <div className="flex h-full min-h-[450px] flex-col">
                  <iframe
                    title="Berber konumu"
                    src={mapEmbedUrl}
                    className="min-h-[350px] w-full flex-1 border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />

                  <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs tracking-[0.2em] text-[#c9a35b]">KONUM</p>
                      <p className="mt-1 text-sm text-white/65">{address}</p>
                    </div>

                    <a
                      href={mapOpenUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-xl bg-[#c9a35b] px-5 py-3 text-center text-sm font-bold text-black transition hover:bg-[#dfbd76]"
                    >
                      Haritada Aç
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[450px] items-center justify-center p-8">
                  <div className="max-w-sm text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a35b]/20 bg-[#c9a35b]/5 text-2xl text-[#c9a35b]">
                      ◉
                    </div>

                    <p className="mt-6 text-xl font-semibold">Konum</p>

                    <p className="mt-3 text-sm leading-6 text-white/35">
                      {scheduleLoading
                        ? "Adres bilgisi yükleniyor..."
                        : "Admin panelinden adres eklendiğinde harita burada otomatik görüntülenecek."}
                    </p>

                    <button
                      onClick={goAppointment}
                      className="mt-8 rounded-xl bg-[#c9a35b] px-7 py-4 font-bold text-black transition hover:bg-[#dfbd76]"
                    >
                      Randevu Al
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-5 py-10 md:flex-row md:items-center">
          <div>
            <p className="font-bold tracking-wider">
              {barberName.toUpperCase()}
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