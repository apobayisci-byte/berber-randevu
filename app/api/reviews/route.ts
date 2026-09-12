import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
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

export async function GET() {
  try {
    const supabaseAdmin = getAdminClient();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik." },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select("id, customer_name, rating, comment, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      console.error("Yorumlar alınamadı:", error);
      return NextResponse.json(
        { error: "Yorumlar şu anda alınamadı." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { reviews: data ?? [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Yorum GET hatası:", error);
    return NextResponse.json(
      { error: "Yorumlar şu anda alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAdmin = getAdminClient();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      appointment_id?: number | null;
      customer_name?: string;
      customer_phone?: string;
      rating?: number;
      comment?: string;
    };

    const appointmentId = body.appointment_id
      ? Number(body.appointment_id)
      : null;
    const customerName = body.customer_name?.trim() ?? "";
    const customerPhone = body.customer_phone?.trim() ?? "";
    const rating = Number(body.rating);
    const comment = body.comment?.trim() ?? "";

    if (customerName.length < 2 || customerName.length > 60) {
      return NextResponse.json(
        { error: "Lütfen geçerli bir ad soyad girin." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Lütfen 1 ile 5 arasında puan verin." },
        { status: 400 }
      );
    }

    if (comment.length < 2 || comment.length > 300) {
      return NextResponse.json(
        { error: "Değerlendirme 2-300 karakter arasında olmalıdır." },
        { status: 400 }
      );
    }

    // Randevu tamamlandıktan sonra bırakılan mevcut yorum akışı.
    if (appointmentId) {
      if (!customerPhone) {
        return NextResponse.json(
          { error: "Telefon bilgisi eksik." },
          { status: 400 }
        );
      }

      const { data: appointment, error: appointmentError } =
        await supabaseAdmin
          .from("appointments")
          .select("id, customer_name, customer_phone")
          .eq("id", appointmentId)
          .maybeSingle();

      if (appointmentError) {
        console.error("Randevu doğrulanamadı:", appointmentError);
        return NextResponse.json(
          { error: "Randevu doğrulanamadı." },
          { status: 500 }
        );
      }

      if (!appointment) {
        return NextResponse.json(
          { error: "Randevu bulunamadı." },
          { status: 404 }
        );
      }

      const normalizePhone = (value: string) =>
        value.replace(/\D/g, "").slice(-10);

      if (
        normalizePhone(appointment.customer_phone ?? "") !==
        normalizePhone(customerPhone)
      ) {
        return NextResponse.json(
          { error: "Randevu bilgileri eşleşmiyor." },
          { status: 403 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .insert({
        appointment_id: appointmentId,
        customer_name: customerName,
        // Basit değerlendirme formunda telefon istemiyoruz.
        // Kolon NOT NULL olduğu için boş metin saklanır; public API bunu hiçbir zaman döndürmez.
        customer_phone: appointmentId ? customerPhone : "",
        rating,
        comment,
        is_active: true,
      })
      .select("id, customer_name, rating, comment, created_at")
      .single();

    if (error) {
      console.error("Yorum kaydedilemedi:", error);

      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Bu randevu için daha önce değerlendirme yapılmış." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Değerlendirmen şu anda kaydedilemedi." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        review: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Yorum POST hatası:", error);
    return NextResponse.json(
      { error: "Değerlendirmen şu anda gönderilemedi." },
      { status: 500 }
    );
  }
}
