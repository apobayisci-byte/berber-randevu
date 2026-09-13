import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Murathan Yazar | Berber";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at center, #211a0d 0%, #0d0d0d 48%, #050505 100%)",
          fontFamily: "Arial, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "32px",
            border: "1px solid rgba(201, 163, 91, 0.35)",
            borderRadius: "28px",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <img
            src="https://murathanyazar.com.tr/my-logo.png"
            width="150"
            height="150"
            alt=""
            style={{
              objectFit: "contain",
              marginBottom: "30px",
            }}
          />

          <div
            style={{
              color: "#c9a35b",
              fontSize: "24px",
              letterSpacing: "10px",
              marginBottom: "18px",
              display: "flex",
            }}
          >
            BERBER
          </div>

          <div
            style={{
              color: "#ffffff",
              fontSize: "68px",
              fontWeight: "700",
              letterSpacing: "-2px",
              display: "flex",
            }}
          >
            Murathan Yazar
          </div>

          <div
            style={{
              width: "90px",
              height: "2px",
              background: "#c9a35b",
              marginTop: "25px",
              marginBottom: "25px",
              display: "flex",
            }}
          />

          <div
            style={{
              color: "#d1d1d1",
              fontSize: "27px",
              display: "flex",
            }}
          >
            Online Randevu • Hizmetler • Çalışma Saatleri
          </div>

          <div
            style={{
              color: "#8f8f8f",
              fontSize: "20px",
              marginTop: "20px",
              display: "flex",
            }}
          >
            murathanyazar.com.tr
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}