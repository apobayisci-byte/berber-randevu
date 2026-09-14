import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Önce giriş yapılmış kullanıcıyı doğrula.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Oturum bulunamadı." },
        { status: 401 }
      );
    }

    // Kullanıcının gerçekten admin olduğunu doğrula.
    const { data: isAdmin, error: adminError } =
      await supabase.rpc("is_admin");

    if (adminError || !isAdmin) {
      return NextResponse.json(
        { error: "Bu işlem için admin yetkisi gerekiyor." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as PushSubscriptionBody;

    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const auth = body.keys?.auth?.trim();

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Geçersiz push aboneliği." },
        { status: 400 }
      );
    }

    const { error: saveError } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "endpoint",
        }
      );

    if (saveError) {
      console.error("Push subscription save error:", saveError);

      return NextResponse.json(
        { error: "Bildirim aboneliği kaydedilemedi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Bildirimler başarıyla etkinleştirildi.",
    });
  } catch (error) {
    console.error("Push subscribe API error:", error);

    return NextResponse.json(
      { error: "Beklenmeyen bir sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}