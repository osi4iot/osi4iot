// The point of a "blenderTemporary" clip for a sensor value: clipMinValue at the start of the clip and
// clipMaxValue at its end. clipMinValue may be greater than clipMaxValue (a sensor that measures a distance:
// the largest value at rest). The weight is clamped to [0, 1]: a value outside the range (sensor noise, an
// out-of-range reading) must not run the clip past its end, where the mixer would wrap to the other end.
export const clipWeight = (value: number, minValue: number | string, maxValue: number | string): number => {
    const v = Number(value);
    const min = Number(minValue);
    const max = Number(maxValue);
    if (!Number.isFinite(v) || !Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0;
    const weight = (v - min) / (max - min);
    return Math.max(0, Math.min(1, weight));
};
