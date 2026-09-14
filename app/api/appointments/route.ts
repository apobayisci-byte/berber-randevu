import { NextResponse } from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

type AppointmentRequest = {
  service_ids?: number[];
  customer_name?: string;
  customer_phone?: string;
  customer_note?: string | null;
  appointment_date?: string;
  appointment_time?: string;
};

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type ServiceRow = {
  id: number;
  name: string;
  price: number | null;
  duration_minutes: number;
  is_active: boolean;
};

type ExistingAppointment = {
  appointment_time: string;
  total_duration_minutes: number | null;
};

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getIstanbulNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function getDayOfWeek(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  const jsDay = parsed.getUTCDay();

  return jsDay === 0 ? 7 : jsDay;
}

function rangesOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
) {
  const endA = startA + durationA;
  const endB = startB + durationB;

  return startA < endB && startB < endA;
}

function normalizeServiceIds(input: unknown) {
  if (!Array.isArray(input)) return [];

  return Array.from(
    new Set(
      input
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

async function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function writeErrorLog(
  supabaseAdmin: SupabaseClient<any, "public", any> | null,
  log: {
    endpoint: string;
    stage: string;
    httpStatus: number;
    errorCode?: string | null;
    customerMessage: string;
    technicalMessage?: string | null;
    appointmentDate?: string | null;
    appointmentTime?: string | null;
    serviceIds?: number[] | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  if (!supabaseAdmin) return;

  try {
    const { error } = await supabaseAdmin.from("error_logs").insert({
      endpoint: log.endpoint,
      stage: log.stage,
      http_status: log.httpStatus,
      error_code: log.errorCode ?? null,
      customer_message: log.customerMessage,
      technical_message: log.technicalMessage ?? null,
      appointment_date: log.appointmentDate ?? null,
      appointment_time: log.appointmentTime ?? null,
      service_ids: log.serviceIds ?? null,
      metadata: log.metadata ?? {},
    });

    if (error) {
      console.error("Hata logu kaydedilemedi:", error);
    }
  } catch (logError) {
    console.error("Hata logu yazılırken ek hata oluştu:", logError);
  }
}

async function getServices(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  serviceIds: number[]
) {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id, name, price, duration_minutes, is_active")
    .in("id", serviceIds)
    .eq("is_active", true);

  if (error) {
    throw new Error(`SERVICES:${error.message}`);
  }

  const services = (data ?? []) as ServiceRow[];

  if (services.length !== serviceIds.length) {
    return null;
  }

  const order = new Map(serviceIds.map((id, index) => [id, index]));
  return services.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

async function getDayConfiguration(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  appointmentDate: string
) {
  const dayOfWeek = getDayOfWeek(appointmentDate);

  // Önce normal haftalık çalışma düzenini ve randevu aralığını al.
  const [workingHourResult, settingsResult] = await Promise.all([
    supabaseAdmin
      .from("working_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("day_of_week", dayOfWeek)
      .maybeSingle(),
    supabaseAdmin
      .from("business_settings")
      .select("appointment_interval")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (workingHourResult.error || settingsResult.error) {
    console.error(
      "Normal çalışma planı okunamadı:",
      workingHourResult.error,
      settingsResult.error
    );
    throw new Error("SCHEDULE");
  }

  const appointmentInterval =
    Number(settingsResult.data?.appointment_interval) || 45;

  if (!Number.isInteger(appointmentInterval) || appointmentInterval <= 0) {
    return null;
  }

  const workingHour = workingHourResult.data;

  if (
    !workingHour ||
    !workingHour.is_open ||
    !workingHour.open_time ||
    !workingHour.close_time
  ) {
    return null;
  }

  return {
    workingHour,
    slotAnchorTime: workingHour.open_time,
    appointmentInterval,
  };
}

async function getExistingAppointments(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  appointmentDate: string,
  fallbackDuration: number
) {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("appointment_time, total_duration_minutes")
    .eq("appointment_date", appointmentDate)
    .in("status", ["pending", "approved"])
    .eq("is_archived", false);

  if (error) {
    throw new Error(`APPOINTMENTS:${error.message}`);
  }

  return ((data ?? []) as ExistingAppointment[]).map((appointment) => ({
    start: timeToMinutes(appointment.appointment_time),
    duration:
      Number(appointment.total_duration_minutes) > 0
        ? Number(appointment.total_duration_minutes)
        : fallbackDuration,
  }));
}

async function getBlockedTimeRanges(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  appointmentDate: string
) {
  const { data, error } = await supabaseAdmin
    .from("blocked_time_ranges")
    .select("start_time, end_time")
    .eq("block_date", appointmentDate);

  if (error) throw new Error(`BLOCKED_RANGES:${error.message}`);

  return (data ?? []).map((item) => ({
    start: timeToMinutes(item.start_time),
    end: timeToMinutes(item.end_time),
  }));
}

async function sendPushNotifications(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  appointment: {
    customerName: string;
    date: string;
    time: string;
    serviceName: string;
  }
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.error("VAPID environment değişkenleri eksik.");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("Push abonelikleri okunamadı:", error);
    return;
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];

  const payload = JSON.stringify({
    title: "Yeni randevu 🔔",
    body: `${appointment.customerName} • ${appointment.time} • ${appointment.serviceName}`,
    url: "/admin",
    tag: `appointment-${appointment.date}-${appointment.time}`,
  });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload
        );
      } catch (error: unknown) {
        const pushError = error as {
          statusCode?: number;
          message?: string;
        };

        console.error(
          "Push gönderilemedi:",
          pushError.statusCode,
          pushError.message
        );

        if (
          pushError.statusCode === 404 ||
          pushError.statusCode === 410
        ) {
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        }
      }
    })
  );
}

export async function GET(request: Request) {
  try {
    const supabaseAdmin = await createAdminClient();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik." },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const appointmentDate = url.searchParams.get("date")?.trim() ?? "";
    const serviceIds = normalizeServiceIds(
      (url.searchParams.get("service_ids") ?? "")
        .split(",")
        .filter(Boolean)
    );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) ||
      serviceIds.length === 0
    ) {
      return NextResponse.json(
        { error: "Tarih veya hizmet bilgisi geçersiz." },
        { status: 400 }
      );
    }

    const services = await getServices(supabaseAdmin, serviceIds);

    if (!services) {
      return NextResponse.json(
        { error: "Seçilen hizmetlerden biri artık kullanılamıyor." },
        { status: 400 }
      );
    }

    const totalDuration = services.reduce(
      (sum, service) => sum + service.duration_minutes,
      0
    );

    const configuration = await getDayConfiguration(
      supabaseAdmin,
      appointmentDate
    );

    if (!configuration) {
      return NextResponse.json({ available_times: [] });
    }

    const { workingHour, slotAnchorTime, appointmentInterval } =
      configuration;
    const openMinutes = timeToMinutes(workingHour.open_time);
    const closeMinutes = timeToMinutes(workingHour.close_time);
    const slotAnchorMinutes = timeToMinutes(slotAnchorTime);
    const existingAppointments = await getExistingAppointments(
      supabaseAdmin,
      appointmentDate,
      appointmentInterval
    );
    const blockedRanges = await getBlockedTimeRanges(
      supabaseAdmin,
      appointmentDate
    );

    const now = getIstanbulNow();
    const nowMinutes = timeToMinutes(now.time);

    // Randevu başlangıçları business_settings.appointment_interval değerine
    // göre üretilir. Şu an bu değer 15 dakikadır:
    // 10:00, 10:15, 10:30, 10:45 ...
    const availableTimes: string[] = [];

    for (
      let start = slotAnchorMinutes;
      start + totalDuration <= closeMinutes;
      start += appointmentInterval
    ) {
      if (start < openMinutes) continue;

      if (
        appointmentDate < now.date ||
        (appointmentDate === now.date && start <= nowMinutes)
      ) {
        continue;
      }

      const overlaps = existingAppointments.some((existing) =>
        rangesOverlap(
          start,
          totalDuration,
          existing.start,
          existing.duration
        )
      );

      const blocked = blockedRanges.some((range) =>
        start < range.end && range.start < start + totalDuration
      );

      if (!overlaps && !blocked) {
        availableTimes.push(minutesToTime(start));
      }
    }

    return NextResponse.json({
      available_times: availableTimes,
      total_duration_minutes: totalDuration,
    });
  } catch (error) {
    console.error("Availability API hatası:", error);

    return NextResponse.json(
      { error: "Uygun saatler şu anda alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let logAdmin: SupabaseClient<any, "public", any> | null = null;
  let logAppointmentDate: string | null = null;
  let logAppointmentTime: string | null = null;
  let logServiceIds: number[] = [];

  try {
    const supabaseAdmin = await createAdminClient();
    logAdmin = supabaseAdmin;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AppointmentRequest;
    const serviceIds = normalizeServiceIds(body.service_ids);

    const customerName = body.customer_name?.trim() ?? "";
    const customerPhone = body.customer_phone?.trim() ?? "";
    const customerNote = body.customer_note?.trim() || null;
    const appointmentDate = body.appointment_date?.trim() ?? "";
    const appointmentTime =
      body.appointment_time?.trim().slice(0, 5) ?? "";

    logAppointmentDate = appointmentDate || null;
    logAppointmentTime = appointmentTime || null;
    logServiceIds = serviceIds;

    if (
      serviceIds.length === 0 ||
      !customerName ||
      !customerPhone ||
      !appointmentDate ||
      !appointmentTime
    ) {
      return NextResponse.json(
        { error: "Eksik veya geçersiz randevu bilgisi." },
        { status: 400 }
      );
    }

    if (serviceIds.length > 10) {
      return NextResponse.json(
        { error: "En fazla 10 hizmet seçilebilir." },
        { status: 400 }
      );
    }

    if (customerName.length < 2 || customerName.length > 80) {
      return NextResponse.json(
        { error: "Ad soyad bilgisi geçersiz." },
        { status: 400 }
      );
    }

    if (customerPhone.length < 7 || customerPhone.length > 25) {
      return NextResponse.json(
        { error: "Telefon numarası geçersiz." },
        { status: 400 }
      );
    }

    if (customerNote && customerNote.length > 500) {
      return NextResponse.json(
        { error: "Randevu notu çok uzun." },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
      return NextResponse.json(
        { error: "Randevu tarihi geçersiz." },
        { status: 400 }
      );
    }

    if (!/^\d{2}:\d{2}$/.test(appointmentTime)) {
      return NextResponse.json(
        { error: "Randevu saati geçersiz." },
        { status: 400 }
      );
    }

    const requestedMinutes = timeToMinutes(appointmentTime);
    const now = getIstanbulNow();

    if (
      appointmentDate < now.date ||
      (appointmentDate === now.date && appointmentTime <= now.time)
    ) {
      return NextResponse.json(
        { error: "Geçmiş bir tarih veya saat için randevu oluşturulamaz." },
        { status: 400 }
      );
    }

    const services = await getServices(supabaseAdmin, serviceIds);

    if (!services) {
      return NextResponse.json(
        { error: "Seçilen hizmetlerden biri artık kullanılamıyor." },
        { status: 400 }
      );
    }

    const totalDuration = services.reduce(
      (sum, service) => sum + service.duration_minutes,
      0
    );
    const totalPrice = services.reduce(
      (sum, service) => sum + Number(service.price ?? 0),
      0
    );

    const configuration = await getDayConfiguration(
      supabaseAdmin,
      appointmentDate
    );

    if (!configuration) {
      return NextResponse.json(
        { error: "Berber seçilen gün çalışmıyor." },
        { status: 400 }
      );
    }

    const { workingHour, slotAnchorTime, appointmentInterval } =
      configuration;
    const openMinutes = timeToMinutes(workingHour.open_time);
    const closeMinutes = timeToMinutes(workingHour.close_time);
    const slotAnchorMinutes = timeToMinutes(slotAnchorTime);

    const existingAppointments = await getExistingAppointments(
      supabaseAdmin,
      appointmentDate,
      appointmentInterval
    );
    const blockedRanges = await getBlockedTimeRanges(
      supabaseAdmin,
      appointmentDate
    );

    if (
      requestedMinutes < openMinutes ||
      requestedMinutes + totalDuration > closeMinutes ||
      (requestedMinutes - slotAnchorMinutes) % appointmentInterval !== 0
    ) {
      return NextResponse.json(
        { error: "Seçilen saat bu hizmetler için uygun değil." },
        { status: 400 }
      );
    }

    const blocked = blockedRanges.some((range) =>
      requestedMinutes < range.end &&
      range.start < requestedMinutes + totalDuration
    );

    if (blocked) {
      return NextResponse.json(
        { error: "Seçilen saat işletme tarafından kapatıldı.", code: "SLOT_BLOCKED" },
        { status: 409 }
      );
    }

    const overlaps = existingAppointments.some((existing) =>
      rangesOverlap(
        requestedMinutes,
        totalDuration,
        existing.start,
        existing.duration
      )
    );

    if (overlaps) {
      return NextResponse.json(
        {
          error: "Bu saat az önce başka bir müşteri tarafından alındı.",
          code: "SLOT_TAKEN",
        },
        { status: 409 }
      );
    }

    const primaryService = services[0];

    const appointmentServices = services.map((service) => ({
      service_id: service.id,
      service_name: service.name,
      price_at_booking: Number(service.price ?? 0),
      duration_minutes: service.duration_minutes,
    }));

    // Son çakışma kontrolü + ana randevu + seçilen hizmetler tek DB
    // transaction'ında oluşturulur. Böylece aynı anda gelen çakışan
    // rezervasyonlardan yalnızca biri başarılı olabilir.
    const { data: appointmentIdData, error: atomicError } =
      await supabaseAdmin.rpc("create_appointment_atomic", {
        p_service_id: primaryService.id,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_customer_note: customerNote,
        p_appointment_date: appointmentDate,
        p_appointment_time: appointmentTime,
        p_total_price: totalPrice,
        p_total_duration_minutes: totalDuration,
        p_fallback_duration: appointmentInterval,
        p_services: appointmentServices,
      });

    if (atomicError) {
      console.error("Atomik randevu oluşturulamadı:", atomicError);

      const errorText = `${atomicError.message ?? ""} ${
        atomicError.details ?? ""
      } ${atomicError.hint ?? ""}`;

      if (
        errorText.includes("SLOT_TAKEN") ||
        atomicError.code === "23505"
      ) {
        return NextResponse.json(
          {
            error: "Bu saat az önce başka bir müşteri tarafından alındı.",
            code: "SLOT_TAKEN",
          },
          { status: 409 }
        );
      }

      await writeErrorLog(supabaseAdmin, {
        endpoint: "/api/appointments",
        stage: "create_appointment_atomic",
        httpStatus: 500,
        errorCode: atomicError.code ?? "ATOMIC_ERROR",
        customerMessage: "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin.",
        technicalMessage: [atomicError.message, atomicError.details, atomicError.hint]
          .filter(Boolean)
          .join(" | "),
        appointmentDate,
        appointmentTime,
        serviceIds,
        metadata: {
          total_duration_minutes: totalDuration,
          appointment_interval: appointmentInterval,
          service_count: services.length,
        },
      });

      return NextResponse.json(
        {
          error:
            "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin.",
        },
        { status: 500 }
      );
    }

    const appointmentId = Number(appointmentIdData);

    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      console.error(
        "Atomik randevu fonksiyonu geçersiz ID döndürdü:",
        appointmentIdData
      );

      await writeErrorLog(supabaseAdmin, {
        endpoint: "/api/appointments",
        stage: "invalid_appointment_id",
        httpStatus: 500,
        errorCode: "INVALID_APPOINTMENT_ID",
        customerMessage: "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin.",
        technicalMessage: `RPC geçersiz randevu ID döndürdü: ${String(appointmentIdData)}`,
        appointmentDate,
        appointmentTime,
        serviceIds,
        metadata: { returned_value_type: typeof appointmentIdData },
      });

      return NextResponse.json(
        {
          error:
            "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin.",
        },
        { status: 500 }
      );
    }

    await sendPushNotifications(supabaseAdmin, {
      customerName,
      date: appointmentDate,
      time: appointmentTime,
      serviceName: services.map((service) => service.name).join(" + "),
    });

    return NextResponse.json(
      {
        success: true,
        appointment_id: appointmentId,
        status: "approved",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Appointment API hatası:", error);

    const technicalMessage =
      error instanceof Error ? error.message : String(error);

    await writeErrorLog(logAdmin, {
      endpoint: "/api/appointments",
      stage: "post_unhandled_exception",
      httpStatus: 500,
      errorCode: "UNHANDLED_EXCEPTION",
      customerMessage:
        "Beklenmeyen bir sunucu hatası oluştu. Lütfen tekrar deneyin.",
      technicalMessage,
      appointmentDate: logAppointmentDate,
      appointmentTime: logAppointmentTime,
      serviceIds: logServiceIds,
      metadata: { error_type: error instanceof Error ? error.name : typeof error },
    });

    return NextResponse.json(
      {
        error:
          "Beklenmeyen bir sunucu hatası oluştu. Lütfen tekrar deneyin.",
      },
      { status: 500 }
    );
  }
}
