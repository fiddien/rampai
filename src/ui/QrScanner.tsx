import { useEffect, useRef, useState } from "react";
import { Modal, Text } from "@mantine/core";
import { codeFromText } from "../sync/linkCodes";

type Detect = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | undefined>;

/**
 * The browser's own barcode reader where there is one; otherwise jsQR, loaded
 * only when the scanner opens, reading frames drawn onto a canvas.
 */
async function makeDetector(): Promise<Detect> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: CanvasImageSource): Promise<{ rawValue: string }[]> } & object; }).BarcodeDetector;
  if (Native) {
    try {
      const formats: string[] = await (Native as unknown as { getSupportedFormats(): Promise<string[]> }).getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue;
      }
    } catch {
      // Fall back to jsQR.
    }
  }
  const { default: jsQR } = await import("jsqr");
  return async (video, canvas) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return undefined;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, w, h);
    return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data;
  };
}

/** Point the camera at the other device's QR code; the code found is handed back. */
export function QrScanner({ opened, onClose, onCode, title }: { opened: boolean; onClose: () => void; onCode: (code: string) => void; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [problem, setProblem] = useState("");
  const done = useRef(onCode);
  done.current = onCode;

  useEffect(() => {
    if (!opened) return;
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setProblem("");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setProblem("The camera could not be opened. Allow it for this page, or copy and paste the code instead.");
        return;
      }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      const detect = await makeDetector();
      const tick = async () => {
        if (stopped || !video.current || !canvas.current) return;
        const text = await detect(video.current, canvas.current).catch(() => undefined);
        const code = text && codeFromText(text);
        if (code) {
          stopped = true;
          done.current(code);
          return;
        }
        if (text) setProblem("That QR code is not a Rampai link code.");
        timer = setTimeout(tick, 200);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <video ref={video} className="qr-video" playsInline muted aria-label="Camera" />
      <canvas ref={canvas} hidden />
      <Text c="dimmed" mt="xs">
        {problem || "Hold the other device's QR code inside the frame."}
      </Text>
    </Modal>
  );
}
