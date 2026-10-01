/**
 * The app mark: a cake with a candle on a teal tile. Pure boxes so it renders identically in
 * the browser and in ImageResponse (which needs no font for it).
 */
export function AppIconArt({ size, padding = 0 }: { size: number; padding?: number }) {
  const s = (n: number) => Math.round((n / 100) * (size - padding * 2));
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#ef4056",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: padding ? 0 : Math.round(size * 0.22),
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: s(6), height: s(10), background: "#fde68a", borderRadius: s(3) }} />
        <div style={{ width: s(4), height: s(12), background: "#ffffff", marginBottom: s(2) }} />
        <div style={{ width: s(44), height: s(16), background: "#ffffff", borderRadius: `${s(6)}px ${s(6)}px 0 0` }} />
        <div style={{ width: s(44), height: s(4), background: "#fecdd3" }} />
        <div style={{ width: s(58), height: s(18), background: "#ffffff", borderRadius: `${s(4)}px ${s(4)}px ${s(6)}px ${s(6)}px` }} />
      </div>
    </div>
  );
}
