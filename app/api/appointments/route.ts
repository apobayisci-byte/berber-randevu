import { NextResponse } from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

type AppointmentRequest = {
  service_id?: number;
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

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
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

  if (subscriptions.length === 0) {
    return;
  }

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

export async function POST(request: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "Supabase sunucu environment değişkenleri eksik."
      );

      return NextResponse.json(
        {
          error: "Sunucu yapılandırması eksik.",
        },
        {
          status: 500,
        }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const body =
      (await request.json()) as AppointmentRequest;

    const serviceId = Number(body.service_id);

    const customerName =
      body.customer_name?.trim() ?? "";

    const customerPhone =
      body.customer_phone?.trim() ?? "";

    const customerNote =
      body.customer_note?.trim() || null;

    const appointmentDate =
      body.appointment_date?.trim() ?? "";

    const appointmentTime =
      body.appointment_time?.trim().slice(0, 5) ?? "";

    if (
      !Number.isInteger(serviceId) ||
      serviceId <= 0 ||
      !customerName ||
      !customerPhone ||
      !appointmentDate ||
      !appointmentTime
    ) {
      return NextResponse.json(
        {
          error:
            "Eksik veya geçersiz randevu bilgisi.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      customerName.length < 2 ||
      customerName.length > 80
    ) {
      return NextResponse.json(
        {
          error: "Ad soyad bilgisi geçersiz.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      customerPhone.length < 7 ||
      customerPhone.length > 25
    ) {
      return NextResponse.json(
        {
          error: "Telefon numarası geçersiz.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      customerNote &&
      customerNote.length > 500
    ) {
      return NextResponse.json(
        {
          error: "Randevu notu çok uzun.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        appointmentDate
      )
    ) {
      return NextResponse.json(
        {
          error: "Randevu tarihi geçersiz.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^\d{2}:\d{2}$/.test(
        appointmentTime
      )
    ) {
      return NextResponse.json(
        {
          error: "Randevu saati geçersiz.",
        },
        {
          status: 400,
        }
      );
    }

    const requestedMinutes =
      timeToMinutes(appointmentTime);

    if (
      !Number.isFinite(requestedMinutes) ||
      requestedMinutes < 0 ||
      requestedMinutes >= 24 * 60
    ) {
      return NextResponse.json(
        {
          error: "Randevu saati geçersiz.",
        },
        {
          status: 400,
        }
      );
    }

    const now = getIstanbulNow();

    if (
      appointmentDate < now.date ||
      (
        appointmentDate === now.date &&
        appointmentTime <= now.time
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Geçmiş bir tarih veya saat için randevu oluşturulamaz.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: service,
      error: serviceError,
    } = await supabaseAdmin
      .from("services")
      .select("id, name, is_active")
      .eq("id", serviceId)
      .eq("is_active", true)
      .maybeSingle();

    if (serviceError) {
      console.error(
        "Hizmet kontrolü başarısız:",
        serviceError
      );

      return NextResponse.json(
        {
          error:
            "Hizmet bilgisi kontrol edilemedi.",
        },
        {
          status: 500,
        }
      );
    }

    if (!service) {
      return NextResponse.json(
        {
          error:
            "Seçilen hizmet artık kullanılamıyor.",
        },
        {
          status: 400,
        }
      );
    }

    const dayOfWeek =
      getDayOfWeek(appointmentDate);

    const {
      data: workingHour,
      error: workingHourError,
    } = await supabaseAdmin
      .from("working_hours")
      .select(
        "day_of_week, is_open, open_time, close_time"
      )
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();

    if (workingHourError) {
      console.error(
        "Çalışma saatleri kontrol edilemedi:",
        workingHourError
      );

      return NextResponse.json(
        {
          error:
            "Çalışma saatleri kontrol edilemedi.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !workingHour ||
      !workingHour.is_open
    ) {
      return NextResponse.json(
        {
          error:
            "Berber seçilen gün çalışmıyor.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: settings,
      error: settingsError,
    } = await supabaseAdmin
      .from("business_settings")
      .select("appointment_interval")
      .eq("id", 1)
      .maybeSingle();

    if (settingsError) {
      console.error(
        "İşletme ayarları kontrol edilemedi:",
        settingsError
      );

      return NextResponse.json(
        {
          error:
            "Randevu ayarları kontrol edilemedi.",
        },
        {
          status: 500,
        }
      );
    }

    const appointmentInterval =
      Number(
        settings?.appointment_interval
      ) || 45;

    if (
      !Number.isInteger(
        appointmentInterval
      ) ||
      appointmentInterval <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Randevu aralığı yapılandırması geçersiz.",
        },
        {
          status: 500,
        }
      );
    }

    const openMinutes =
      timeToMinutes(
        workingHour.open_time
      );

    const closeMinutes =
      timeToMinutes(
        workingHour.close_time
      );

    if (
      requestedMinutes < openMinutes ||
      requestedMinutes >= closeMinutes
    ) {
      return NextResponse.json(
        {
          error:
            "Seçilen saat çalışma saatleri dışında.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      (requestedMinutes - openMinutes) %
        appointmentInterval !==
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Seçilen saat geçerli bir randevu aralığı değil.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: appointment,
      error: insertError,
    } = await supabaseAdmin
      .from("appointments")
      .insert({
        service_id: serviceId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_note: customerNote,
        appointment_date:
          appointmentDate,
        appointment_time:
          appointmentTime,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(
        "Randevu oluşturulamadı:",
        insertError
      );

      if (
        insertError.code === "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Bu saat az önce başka bir müşteri tarafından alındı.",
            code: "SLOT_TAKEN",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "Randevu şu anda oluşturulamadı. Lütfen tekrar deneyin.",
        },
        {
          status: 500,
        }
      );
    }

    await sendPushNotifications(
      supabaseAdmin,
      {
        customerName,
        date: appointmentDate,
        time: appointmentTime,
        serviceName: service.name,
      }
    );

    return NextResponse.json(
      {
        success: true,
        appointment_id:
          appointment.id,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Appointment API hatası:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Beklenmeyen bir sunucu hatası oluştu. Lütfen tekrar deneyin.",
      },
      {
        status: 500,
      }
    );
  }
}
