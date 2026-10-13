import { useEffect, useRef, useState } from 'react';

interface Detector {
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Native BarcodeDetector on Android Chrome; a free WebAssembly ZXing fallback on iPhone/Safari. */
async function makeDetector(): Promise<Detector> {
  const Native = (globalThis as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS });
    } catch {
      /* fall through */
    }
  }
  const { BarcodeDetector } = await import('barcode-detector/ponyfill');
  return new BarcodeDetector({ formats: FORMATS as any }) as unknown as Detector;
}

export default function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    let raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detector = await makeDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = v.readyState >= 2 ? await detector.detect(v) : [];
            if (codes[0]?.rawValue) {
              stopped = true;
              navigator.vibrate?.(60);
              onCode(codes[0].rawValue);
              return;
            }
          } catch {
            /* transient decode errors are normal */
          }
          raf = window.setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setError('Camera unavailable. Allow camera access (the app must be served over HTTPS), or type the barcode below.');
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="scanner">
      {error ? <p className="muted small">{error}</p> : <video ref={video} playsInline muted className="scanner-video" />}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <input inputMode="numeric" placeholder="Or type barcode digits" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn">Look up</button>
      </form>
    </div>
  );
}
