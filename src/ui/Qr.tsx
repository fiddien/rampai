import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code, drawn as one SVG path. It is always dark on white, with a white
 * margin, because that is what cameras read best, in dark mode too.
 */
export function QrCode({ value, label, size = 280 }: { value: string; label: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const qr = encode(value, { ecc: "L", border: 3 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, n: qr.size };
  }, [value]);
  return (
    <svg className="qr" role="img" aria-label={label} viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
