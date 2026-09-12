import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik." },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("reviews")
      .select("id, customer_name, rating, comment, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Yorumlar alınamadı:", error);

      return NextResponse.json(
        { error: "Yorumlar alınamadı." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reviews: data ?? [],
    });
  } catch (error) {
    console.error("Reviews GET hatası:", error);

    return NextResponse.json(
      { error: "Yorumlar alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const appointmentId = Number(body.appointment_id);
    const customerName = String(body.customer_name ?? "").trim();
    const customerPhone = String(body.customer_phone ?? "").trim();
    const rating = Number(body.rating);
    const comment = String(body.comment ?? "").trim();

    if (
      !Number.isInteger(appointmentId) ||
      appointmentId <= 0 ||
      customerName.length < 2 ||
      customerName.length > 80 ||
      customerPhone.length < 7 ||
      customerPhone.length > 25 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      comment.length < 2 ||
      comment.length > 300
    ) {
      return NextResponse.json(
        { error: "Yorum bilgileri geçersiz." },
        { status: 400 }
      );
    }

    const { data: appointment, error: appointmentError } =
      await supabase
        .from("appointments")
        .select("id, customer_name, customer_phone, status")
        .eq("id", appointmentId)
        .maybeSingle();

    if (appointmentError || !appointment) {
      return NextResponse.json(
        { error: "Randevu doğrulanamadı." },
        { status: 400 }
      );
    }

    if (
      appointment.customer_name.trim() !== customerName ||
      appointment.customer_phone.trim() !== customerPhone
    ) {
      return NextResponse.json(
        { error: "Randevu bilgileri eşleşmiyor." },
        { status: 400 }
      );
    }

    if (!["approved", "completed"].includes(appointment.status)) {
      return NextResponse.json(
        { error: "Bu randevu için değerlendirme yapılamıyor." },
        { status: 400 }
      );
    }

    const { data: review, error } = await supabase
      .from("reviews")
      .insert({
        appointment_id: appointmentId,
        customer_name: customerName,
        customer_phone: customerPhone,
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
          { error: "Bu randevu için daha önce yorum yapılmış." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Yorum şu anda kaydedilemedi." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        review,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Reviews POST hatası:", error);

    return NextResponse.json(
      { error: "Yorum şu anda kaydedilemedi." },
      { status: 500 }
    );
  }
}