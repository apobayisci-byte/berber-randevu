"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Service = {
  id: number;
  name: string;
  price: number | null;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
};

export default function SupabaseTestPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadServices() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, price, duration_minutes, is_active, sort_order"
        )
        .order("sort_order", {
          ascending: true,
        });

      if (error) {
        console.error(error);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setServices(data ?? []);
      setLoading(false);
    }

    loadServices();
  }, []);

  return (
    <main className="min-h-screen bg-[#080808] px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.3em] text-[#c9a35b]">
          SUPABASE TEST
        </p>

        <h1 className="mt-3 text-4xl font-bold">
          Veritabanı Bağlantısı
        </h1>

        <p className="mt-3 text-white/40">
          Bu ekran sadece bağlantıyı kontrol etmek için oluşturuldu.
        </p>

        {loading && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-[#111] p-6">
            Supabase&apos;den hizmetler yükleniyor...
          </div>
        )}

        {errorMessage && (
          <div className="mt-10 rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="font-bold text-red-400">
              Bağlantı sırasında hata oluştu
            </p>

            <p className="mt-2 text-sm text-white/60">
              {errorMessage}
            </p>
          </div>
        )}

        {!loading && !errorMessage && (
          <>
            <div className="mt-10 rounded-2xl border border-green-500/30 bg-green-500/10 p-6">
              <p className="font-bold text-green-400">
                ✓ Supabase bağlantısı çalışıyor
              </p>

              <p className="mt-2 text-sm text-white/50">
                Hizmetler doğrudan veritabanından geldi.
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-2xl border border-white/10 bg-[#111] p-6"
                >
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <p className="text-xl font-semibold">
                        {service.name}
                      </p>

                      <p className="mt-2 text-sm text-white/40">
                        Süre: {service.duration_minutes} dakika
                      </p>
                    </div>

                    <p className="font-semibold text-[#c9a35b]">
                      {service.price === null
                        ? "Fiyat belirlenmedi"
                        : `${service.price} TL`}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {services.length === 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-[#111] p-6 text-white/50">
                Bağlantı başarılı fakat services tablosunda hizmet
                bulunamadı.
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}