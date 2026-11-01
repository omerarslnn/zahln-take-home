import { create } from 'qrcode';
import { memo, useMemo } from 'react';
import { View } from 'react-native';

/** The QR standard asks for at least four modules of light margin around the code. */
const QUIET_ZONE = 4;

type Run = { dark: boolean; length: number };

/**
 * The order's `qrPayload` as a QR code: black modules on white, with the standard quiet zone.
 * `qrcode` (a widely used encoder) computes the module matrix; each row is drawn as runs of plain
 * Views, a whole number of points per module so no module is blurred. Plain Views rather than an
 * SVG library: react-native-svg is an optional peer of NativeWind's css-interop, and installing it
 * in one app gave the workspace a second css-interop copy that broke styling in the other app.
 * Error correction M survives a scratched or glare-covered screen. The payload names the order,
 * not an amount, so it is safe to show to anyone at the till. Memoized: the till re-renders every
 * second for its countdown, and the code does not change.
 */
export const OrderQr = memo(function OrderQr({
  payload,
  size,
  label,
}: {
  payload: string;
  size: number;
  label: string;
}) {
  const { rows, modules } = useMemo(() => {
    const matrix = create(payload, { errorCorrectionLevel: 'M' }).modules;
    const dark = (row: number, column: number) => matrix.data[row * matrix.size + column] === 1;
    const lines: Run[][] = [];
    for (let row = 0; row < matrix.size; row += 1) {
      const runs: Run[] = [];
      for (let column = 0; column < matrix.size;) {
        const shade = dark(row, column);
        let length = 1;
        while (column + length < matrix.size && dark(row, column + length) === shade) length += 1;
        runs.push({ dark: shade, length });
        column += length;
      }
      lines.push(runs);
    }
    return { rows: lines, modules: matrix.size + QUIET_ZONE * 2 };
  }, [payload]);

  const cell = Math.max(1, Math.floor(size / modules));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ padding: cell * QUIET_ZONE, backgroundColor: '#FFFFFF' }}
    >
      {rows.map((runs, row) => (
        <View key={row} style={{ flexDirection: 'row', height: cell }}>
          {runs.map((run, index) => (
            <View
              key={index}
              style={{
                width: run.length * cell,
                height: cell,
                backgroundColor: run.dark ? '#000000' : '#FFFFFF',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
});
