import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Appointment = {
  id: number;
  customer_name: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  appointment_services:
    | {
        service_name: string;
      }[]
    | null;
};

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

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
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function getTomorrowDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  const tomorrow = new Date(
    Date.UTC(year, month - 1, day + 1, 12, 0, 0)
  );

  return tomorrow.toISOString().slice(0, 10);
}

function getPushStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    return Number(
      (error as { statusCode?: number }).statusCode
    );
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");

    if (!cronSecret) {
      console.error("CRON_SECRET is missing.");

      return NextResponse.json(
        { error: "CRON_SECRET tanımlı değil." },
        { status: 500 }
      );
    }

    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Yetkisiz istek." },
        { status: 401 }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const vapidPublicKey =
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    const vapidPrivateKey =
      process.env.VAPID_PRIVATE_KEY;

    const vapidSubject =
      process.env.VAPID_SUBJECT;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !vapidPublicKey ||
      !vapidPrivateKey ||
      !vapidSubject
    ) {
      console.error(
        "Appointment reminder environment variables missing."
      );

      return NextResponse.json(
        { error: "Sunucu bildirim ayarları eksik." },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    );

    const requestUrl = new URL(request.url);

    /*
     * =========================================================
     * TEST MODU
     * =========================================================
     *
     * Gerçek randevulara ve reminder loglarına dokunmaz.
     */
    if (requestUrl.searchParams.get("test") === "1") {
      const {
        data: subscriptionsData,
        error: subscriptionsError,
      } = await supabase
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth");

      if (subscriptionsError) {
        console.error(
          "Test push subscriptions query error:",
          subscriptionsError
        );

        return NextResponse.json(
          { error: "Push abonelikleri alınamadı." },
          { status: 500 }
        );
      }

      const subscriptions =
        (subscriptionsData ?? []) as PushSubscriptionRow[];

      if (subscriptions.length === 0) {
        return NextResponse.json({
          success: false,
          test: true,
          notificationsSent: 0,
          message:
            "Kayıtlı bildirim cihazı bulunamadı.",
        });
      }

      const payload = JSON.stringify({
        title: "🔔 10 DK • Test",
        body: "15:30 • Saç Kesim",
        url: "/admin",
        tag: `appointment-reminder-test-${Date.now()}`,
      });

      let notificationsSent = 0;
      let failedNotifications = 0;
      let removedSubscriptions = 0;

      for (const subscription of subscriptions) {
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

          notificationsSent++;
        } catch (pushError: unknown) {
          const statusCode =
            getPushStatusCode(pushError);

          if (
            statusCode === 404 ||
            statusCode === 410
          ) {
            const { error: deleteError } =
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", subscription.id);

            if (deleteError) {
              console.error(
                "Expired test push subscription could not be deleted:",
                deleteError
              );
            } else {
              removedSubscriptions++;
            }

            continue;
          }

          failedNotifications++;

          console.error(
            "Test push notification failed:",
            pushError
          );
        }
      }

      return NextResponse.json({
        success: notificationsSent > 0,
        test: true,
        subscriptions: subscriptions.length,
        notificationsSent,
        failedNotifications,
        removedSubscriptions,
      });
    }

    /*
     * =========================================================
     * GERÇEK 10 DAKİKA HATIRLATMA SİSTEMİ
     * =========================================================
     */

    const now = getIstanbulNow();

    const currentMinutes =
      now.hour * 60 + now.minute;

    let targetMinutes =
      currentMinutes + 10;

    let targetDate = now.date;

    if (targetMinutes >= 24 * 60) {
      targetMinutes -= 24 * 60;
      targetDate = getTomorrowDate(now.date);
    }

    const targetHour =
      Math.floor(targetMinutes / 60);

    const targetMinute =
      targetMinutes % 60;

    const targetTime =
      `${String(targetHour).padStart(2, "0")}:` +
      `${String(targetMinute).padStart(2, "0")}`;

    /*
     * Cron/Vercel çağrısı tek bir dakikada timeout olursa randevu
     * kaçmasın diye son 3 dakikalık hedefleri de kontrol ediyoruz.
     *
     * Örnek:
     * 11:50 çağrısı timeout oldu ve 12:00 randevusunu kaçırdıysa,
     * 11:51 -> 11:58-12:01 aralığını kontrol eder ve 12:00'ı yakalar.
     *
     * appointment_reminder_logs aynı randevu/saat için tekrar
     * bildirim gönderilmesini engellemeye devam eder.
     */
    const windowStartMinutes = currentMinutes + 7;
    const windowEndMinutes = currentMinutes + 10;

    function toDateAndTime(totalMinutes: number) {
      let minutes = totalMinutes;
      let date = now.date;

      if (minutes >= 24 * 60) {
        minutes -= 24 * 60;
        date = getTomorrowDate(now.date);
      }

      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;

      return {
        date,
        time:
          `${String(hour).padStart(2, "0")}:` +
          `${String(minute).padStart(2, "0")}:00`,
      };
    }

    const windowStart = toDateAndTime(windowStartMinutes);
    const windowEnd = toDateAndTime(windowEndMinutes);

    let appointmentsData: unknown[] | null = null;
    let appointmentsError: unknown = null;

    if (windowStart.date === windowEnd.date) {
      const result = await supabase
        .from("appointments")
        .select(`
          id,
          customer_name,
          appointment_date,
          appointment_time,
          status,
          appointment_services (
            service_name
          )
        `)
        .eq("appointment_date", windowStart.date)
        .gte("appointment_time", windowStart.time)
        .lte("appointment_time", windowEnd.time)
        .not(
          "status",
          "in",
          '("cancelled","rejected")'
        );

      appointmentsData = result.data;
      appointmentsError = result.error;
    } else {
      const [todayResult, tomorrowResult] = await Promise.all([
        supabase
          .from("appointments")
          .select(`
            id,
            customer_name,
            appointment_date,
            appointment_time,
            status,
            appointment_services (
              service_name
            )
          `)
          .eq("appointment_date", windowStart.date)
          .gte("appointment_time", windowStart.time)
          .not(
            "status",
            "in",
            '("cancelled","rejected")'
          ),
        supabase
          .from("appointments")
          .select(`
            id,
            customer_name,
            appointment_date,
            appointment_time,
            status,
            appointment_services (
              service_name
            )
          `)
          .eq("appointment_date", windowEnd.date)
          .lte("appointment_time", windowEnd.time)
          .not(
            "status",
            "in",
            '("cancelled","rejected")'
          ),
      ]);

      appointmentsError =
        todayResult.error || tomorrowResult.error;

      appointmentsData = [
        ...(todayResult.data ?? []),
        ...(tomorrowResult.data ?? []),
      ];
    }

    if (appointmentsError) {
      console.error(
        "Reminder appointments query error:",
        appointmentsError
      );

      return NextResponse.json(
        { error: "Randevular kontrol edilemedi." },
        { status: 500 }
      );
    }

    const appointments =
      (appointmentsData ?? []) as unknown as Appointment[];

    if (appointments.length === 0) {
      return NextResponse.json({
        success: true,

        checkedAt:
          `${now.date} ` +
          `${String(now.hour).padStart(2, "0")}:` +
          `${String(now.minute).padStart(2, "0")}`,

        target:
          `${targetDate} ${targetTime}`,

        window:
          `${windowStart.date} ${windowStart.time.slice(0, 5)} - ` +
          `${windowEnd.date} ${windowEnd.time.slice(0, 5)}`,

        appointments: 0,
        notificationsSent: 0,
      });
    }

    const {
      data: subscriptionsData,
      error: subscriptionsError,
    } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth");

    if (subscriptionsError) {
      console.error(
        "Push subscriptions query error:",
        subscriptionsError
      );

      return NextResponse.json(
        { error: "Push abonelikleri alınamadı." },
        { status: 500 }
      );
    }

    const subscriptions =
      (subscriptionsData ?? []) as PushSubscriptionRow[];

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        target: `${targetDate} ${targetTime}`,
        appointments: appointments.length,
        notificationsSent: 0,
        message:
          "Kayıtlı bildirim cihazı bulunamadı.",
      });
    }

    let notificationsSent = 0;
    let skippedAlreadySent = 0;
    let failedNotifications = 0;
    let removedSubscriptions = 0;

    for (const appointment of appointments) {
      const appointmentTime =
        appointment.appointment_time.slice(0, 5);

      const {
        data: existingReminder,
        error: reminderCheckError,
      } = await supabase
        .from("appointment_reminder_logs")
        .select("id")
        .eq(
          "appointment_id",
          appointment.id
        )
        .eq(
          "reminder_type",
          "10_minutes"
        )
        .eq(
          "appointment_date",
          appointment.appointment_date
        )
        .eq(
          "appointment_time",
          `${appointmentTime}:00`
        )
        .maybeSingle();

      if (reminderCheckError) {
        console.error(
          `Reminder log check failed for appointment ${appointment.id}:`,
          reminderCheckError
        );

        failedNotifications++;
        continue;
      }

      if (existingReminder) {
        skippedAlreadySent++;
        continue;
      }

      /*
       * Bildirimden hemen önce randevunun hâlâ
       * aktif ve aynı saatte olduğunu tekrar kontrol et.
       */
      const {
        data: freshAppointment,
        error: freshError,
      } = await supabase
        .from("appointments")
        .select(
          "id,status,appointment_date,appointment_time"
        )
        .eq("id", appointment.id)
        .single();

      if (
        freshError ||
        !freshAppointment
      ) {
        continue;
      }

      if (
        ["cancelled", "rejected"].includes(
          freshAppointment.status
        )
      ) {
        continue;
      }

      if (
        freshAppointment.appointment_date !==
          appointment.appointment_date ||
        freshAppointment.appointment_time.slice(
          0,
          5
        ) !== appointmentTime
      ) {
        continue;
      }

      const serviceNames =
        appointment.appointment_services
          ?.map(
            (item) => item.service_name
          )
          .filter(Boolean)
          .join(" + ") ||
        "Randevu";

      /*
       * KISA TELEFON BİLDİRİMİ
       *
       * Örnek:
       * 🔔 10 DK • Samet Yiğit
       * 15:30 • Saç Kesim
       */
      const payload = JSON.stringify({
        title:
          `🔔 10 DK • ${appointment.customer_name}`,

        body:
          `${appointmentTime} • ${serviceNames}`,

        url: "/admin",

        tag:
          `appointment-reminder-` +
          `${appointment.id}-` +
          `${appointment.appointment_date}-` +
          `${appointmentTime}`,
      });

      let deliveredToAtLeastOneDevice =
        false;

      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint:
                subscription.endpoint,
              keys: {
                p256dh:
                  subscription.p256dh,
                auth:
                  subscription.auth,
              },
            },
            payload
          );

          notificationsSent++;
          deliveredToAtLeastOneDevice =
            true;
        } catch (pushError: unknown) {
          const statusCode =
            getPushStatusCode(pushError);

          if (
            statusCode === 404 ||
            statusCode === 410
          ) {
            const { error: deleteError } =
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", subscription.id);

            if (deleteError) {
              console.error(
                "Expired push subscription could not be deleted:",
                deleteError
              );
            } else {
              removedSubscriptions++;
            }

            continue;
          }

          failedNotifications++;

          console.error(
            `Reminder push failed for appointment ${appointment.id}:`,
            pushError
          );
        }
      }

      if (deliveredToAtLeastOneDevice) {
        const { error: logError } =
          await supabase
            .from("appointment_reminder_logs")
            .insert({
              appointment_id:
                appointment.id,

              reminder_type:
                "10_minutes",

              appointment_date:
                appointment.appointment_date,

              appointment_time:
                `${appointmentTime}:00`,
            });

        if (
          logError &&
          logError.code !== "23505"
        ) {
          console.error(
            `Reminder log insert failed for appointment ${appointment.id}:`,
            logError
          );
        }
      }
    }

    return NextResponse.json({
      success: true,

      checkedAt:
        `${now.date} ` +
        `${String(now.hour).padStart(2, "0")}:` +
        `${String(now.minute).padStart(2, "0")}`,

      target:
        `${targetDate} ${targetTime}`,

      window:
        `${windowStart.date} ${windowStart.time.slice(0, 5)} - ` +
        `${windowEnd.date} ${windowEnd.time.slice(0, 5)}`,

      appointments:
        appointments.length,

      notificationsSent,

      skippedAlreadySent,

      failedNotifications,

      removedSubscriptions,
    });
  } catch (error) {
    console.error(
      "Appointment reminder route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Randevu hatırlatma sistemi çalıştırılamadı.",
      },
      { status: 500 }
    );
  }
}