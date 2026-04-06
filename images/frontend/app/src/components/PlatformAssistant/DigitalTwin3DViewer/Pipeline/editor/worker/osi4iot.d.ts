interface Message {
    payload: Record<string, any>;
    topic?: string;
    [key: string]: any;
}

/** Logger instance */
interface Logger {
    /** Logs a simple message. */
    Msg(message: Message): void;

    /** Logs a formatted info message. */
    Infof(format: string, ...args: any[]): void;

    /** Logs a formatted error message. */
    Errorf(format: string, ...args: any[]): void;
}

/** Time instance */
interface Time {
    /** Add a duration to the time */
    Add(d: TimeDuration | number): Time;

    /** Subtract a duration from the time */
    Sub(t: Time): TimeDuration;

    /** Format the time */
    Format(layout: string): string;

    /** Returns Unix timestamp in seconds */
    Unix(): number;

    /** Returns Unix timestamp in milliseconds */
    UnixMilli(): number;

    /** Returns Unix timestamp in microseconds */
    UnixMicro(): number;

    /** Returns the hour [0,23] */
    Hour(): number;

    /** Returns the minute [0,59] */
    Minute(): number;

    /** Returns the second [0,59] */
    Second(): number;

    /** Returns the year */
    Year(): number;

    /** Returns the month */
    Month(): TimeMonth;

    /** Returns the day */
    Day(): number;

    /** Returns the weekday */
    Weekday(): TimeWeekday;

    /** Check if time is before t */
    Before(t: Time): boolean;

    /** Check if time is after t */
    After(t: Time): boolean;

    /** Check if time equals t */
    Equal(t: Time): boolean;

    /** Check if time is zero */
    IsZero(): boolean;

    /** Returns time in a location */
    In(loc: TimeLocation): Time;

    /** Returns t in UTC */
    UTC(): Time;

    /** Returns t in local time */
    Local(): Time;

    /** Returns ISO 8601 week number */
    ISOWeek(): number[];

    /** Get current time in RFC3339 format */
    GetCurrentTime(): string;
}

/** TimePackage-level functions and constants */
interface TimePackage {
    /** Get the current time */
    Now(): Time;

    /** Parses a formatted string */
    Parse(layout: string, value: string): Time;

    /** Parse a duration string */
    ParseDuration(s: string): TimeDuration;

    /** Duration since a specific time */
    Since(t: Time): TimeDuration;

    /** Sleep for a duration */
    Sleep(d: TimeDuration | number): void;

    /** RFC3339 time format */
    readonly RFC3339: string;

    /** RFC3339Nano time format */
    readonly RFC3339Nano: string;

    /** ANSIC time format */
    readonly ANSIC: string;

    /** Unix date format */
    readonly UnixDate: string;

    /** One second duration */
    readonly Second: number;

    /** One minute duration */
    readonly Minute: number;

    /** One hour duration */
    readonly Hour: number;

    /** One millisecond duration */
    readonly Millisecond: number;

    /** One nanosecond duration */
    readonly Nanosecond: number;

    /** UTC location */
    readonly UTC: TimeLocation;

    /** Local location */
    readonly Local: TimeLocation;

    /** January month */
    readonly January: TimeMonth;

    /** February month */
    readonly February: TimeMonth;

    /** March month */
    readonly March: TimeMonth;

    /** April month */
    readonly April: TimeMonth;

    /** May month */
    readonly May: TimeMonth;

    /** June month */
    readonly June: TimeMonth;

    /** July month */
    readonly July: TimeMonth;

    /** August month */
    readonly August: TimeMonth;

    /** September month */
    readonly September: TimeMonth;

    /** October month */
    readonly October: TimeMonth;

    /** November month */
    readonly November: TimeMonth;

    /** December month */
    readonly December: TimeMonth;

    /** Monday weekday */
    readonly Monday: TimeWeekday;

    /** Tuesday weekday */
    readonly Tuesday: TimeWeekday;

    /** Wednesday weekday */
    readonly Wednesday: TimeWeekday;

    /** Thursday weekday */
    readonly Thursday: TimeWeekday;

    /** Friday weekday */
    readonly Friday: TimeWeekday;

    /** Saturday weekday */
    readonly Saturday: TimeWeekday;

    /** Sunday weekday */
    readonly Sunday: TimeWeekday;
}

/** TimeDuration instance */
interface TimeDuration {
    /** Duration in hours */
    Hours(): number;

    /** Duration in minutes */
    Minutes(): number;

    /** Duration in seconds */
    Seconds(): number;

    /** Duration in milliseconds */
    Milliseconds(): number;

    /** String representation */
    String(): string;

    /** Rounds the duration */
    Round(d: TimeDuration | number): TimeDuration;

    /** Absolute value */
    Abs(): TimeDuration;

    /** Truncate to multiple of d */
    Truncate(d: TimeDuration | number): TimeDuration;
}

/** TimeLocation instance */
interface TimeLocation {
    /** Returns timezone name */
    String(): string;
}

/** TimeMonth instance */
interface TimeMonth {
    /** Returns month name */
    String(): string;
}

/** TimeWeekday instance */
interface TimeWeekday {
    /** Returns weekday name */
    String(): string;
}

/** Utils instance */
interface Utils {
    /** Get topic by reference */
    GetTopicByRef(topicRef: string): string;

    /** Get topic from message */
    GetTopicFromMessage(msg: Message): string;

    /** Get topic type from message */
    GetTopicTypeFromMessage(msg: Message): string;

    /** Get topic ref from message */
    GetTopicRefFromMessage(msg: Message): string;

    /** Get full topic from message */
    GetFullTopicFromMessage(msg: Message): string;

    /** Return nil */
    Nil(): any;
}

/** Http instance */
interface Http {
    /** GET request */
    Get(url: string): any;

    /** POST request */
    Post(url: string, data: any): any;

    /** PATCH request */
    Patch(url: string, data: any): any;

    /** DELETE request */
    Delete(url: string): any;

    /** GET with JWT */
    GetWithJwt(url: string, token: string): any;

    /** POST with JWT */
    PostWithJwt(url: string, data: any, token: string): any;

    /** PATCH with JWT */
    PatchWithJwt(url: string, data: any, token: string): any;

    /** DELETE with JWT */
    DeleteWithJwt(url: string, token: string): any;
}

/** KvStore instance */
interface KvStore {
    /** Get string value */
    GetStringValue(key: string): string;

    /** Get number value */
    GetNumberValue(key: string): number;

    /** Get boolean value */
    GetBooleanValue(key: string): boolean;

    /** Get object value */
    GetObjectValue(key: string): any;

    /** Get array value */
    GetArrayValue(key: string): any[];

    /** Set a value */
    SetValue(key: string, value: any): void;

    /** Delete a value */
    DeleteEntry(key: string): void;

    /** Delete all entries */
    DeleteAllEntries(): void;

    /** Check key exists */
    ExistsKey(key: string): boolean;

    /** List all keys */
    ListKeys(): string[];
}

/** Yolo instance */
interface Yolo {
    /** Preprocesses image */
    Preprocess(pic: ImagePackage): number[];

    /** Postprocesses YOLO output */
    Postprocess(output: number[], w: number, h: number): YoloBoundingBox[];

    /** Draws bounding boxes */
    DrawBoundingBoxes(pic: ImagePackage, boxes: YoloBoundingBox[], fontSize: number, opacity: number): ImagePackage;

    /** Returns YOLO class name */
    GetYoloClass(index: number): string;

    /** Returns YOLO color */
    GetYoloColor(index: number): ColorRGBA;

    /** Creates a bounding box */
    NewBoundingBox(x1: number, y1: number, x2: number, y2: number, confidence: number): YoloBoundingBox;
}

/** YoloBoundingBox instance */
interface YoloBoundingBox {
    /** Returns intersection area */
    Intersection(box: YoloBoundingBox): number;

    /** Returns IoU */
    Iou(box: YoloBoundingBox): number;

    /** Returns rectangle area */
    RectArea(box: YoloBoundingBox): number;

    /** Converts to rectangle */
    ToRect(box: YoloBoundingBox): ImageRectangle;

    /** Returns union area */
    Union(box: YoloBoundingBox): number;
}

type ExtrapolationMode = "zero" | "constant" | "linear";

/** Dsp instance */
interface DSP {
    /** Computes PSD */
    WelchPSD(x: number[], cfg: DspWelchConfig): [number[], number[], number];

    /** Creates WelchConfig with defaults */
    GetDefaultWelchConfig(fs: number): DspWelchConfig;

    /** Returns a WelchConfig */
    GetWelchConfig(
        fs: number,
        winLen: number,
        overlap: number,
        nfft: number,
        zeroPad: boolean,
        minFreq: number,
        maxFreq: number,
        minProm: number,
        minDist: number,
        smoothBins: number,
    ): DspWelchConfig;

    /** Detects peaks in Welch PSD */
    FindWelchPeaks(freq: number[], psd: number[], df: number, cfg: DspWelchConfig): DspPeak[];

    /** Returns InterpolationConfig */
    GetInterpolationConfig(
        targetFs: number,
        startTime: number,
        endTime: number,
        extrapolMode: ExtrapolationMode,
    ): DspInterpolationConfig;

    /** Interpolates to uniform grid */
    InterpolateToUniform(times: number[], values: number[], config: DspInterpolationConfig): number[];

    /** Sorts time series data */
    SortTimeSeriesData(times: number[], values: number[]): [number[], number[]];

    /** Removes linear trend */
    DetrendInPlace(x: number[]): number;

    /** Estimates uniform sampling rate */
    EstimateUniformSamplingRate(times: number[], method: string): number;
}

/** DspWelchConfig instance */
interface DspWelchConfig {
    /* Frequency resolution in Hz of the PSD estimate */
    Fs: number;

    /* Number of samples per window (e.g. ≈ Fs * window_duration) */
    WinLen: number;

    /* Fraction of overlap between windows (0.0..0.95) */
    Overlap: number;

    /* Number of FFT points (>= WinLen; if 0 => smallest 2^k >= WinLen) */
    NFFT: number;

    /* If true, use NFFT>=WinLen (recommended) */
    ZeroPadToNFFT: boolean;

    /* Min frequency of the band of interest [Hz], 0 to ignore */
    MinFreq: number;

    /* Max frequency of the band of interest [Hz], 0 to ignore */
    MaxFreq: number;

    /* Minimum prominence of peaks in dB, e.g., 6..12 dB */
    MinProminenceDB: number;

    /* Minimum separation between peaks in Hz */
    MinDistanceHz: number;

    /* Local median smoothing window size in bins (odd), e.g., 9..21 */
    SmoothBins: number;
}

/** DspPeak instance */
interface DspPeak {
    /* Frequency of the peak in Hz (interpolated) */
    Freq: number;

    /* Power of the peak in PSD units (e.g., μV^2/Hz) */
    Power: number;

    /* Power of the peak in dB (10*log10(PSD)) */
    PowerdB: number;

    /* Prominence of the peak in dB relative to local background */
    PromdB: number;

    /* -3 dB bandwidth of the peak in Hz */
    BandwidthHz: number;

    /* Quality factor of the peak (f0 / BW) */
    Q: number;

    /* Damping ratio of the peak (≈ 1/(2Q)) */
    Zeta: number;

    /* Bin index of the peak (for traceability) */
    Idx: number;
}

/** DspInterpolationConfig instance */
interface DspInterpolationConfig {
    /* Target sampling rate in Hz */
    TargetFs: number;

    /* Start time for interpolation (0 for automatic) */
    StartTime: number;

    /* End time for interpolation (0 for automatic) */
    EndTime: number;

    /* Extrapolation mode for out-of-bounds values: "zero", "constant", "linear" */
    ExtrapolMode: ExtrapolationMode;
}

type ImageFormat = "png" | "jpg" | "jpeg" | "gif";

interface ImagePackage {
    /** Decodes a base64-encoded image. */
    DecodeImageFromBase64(base64String: string): ImagePackage;

    /** Encodes an image to a base64 string. */
    EncodeImageToBase64(img: ImagePackage, format: ImageFormat, quality: number): string;

    // ── Constructors ───────────────────────────────────────────────────────────
    /** Creates a new RGBA image with the given bounds. */
    NewRGBA(r: ImageRectangle): ImageRGBA;

    /** Creates a new RGBA64 image with the given bounds. */
    NewRGBA64(r: ImageRectangle): ImageRGBA64;

    /** Creates a new NRGBA image with the given bounds. */
    NewNRGBA(r: ImageRectangle): ImageNRGBA;

    /** Creates a new NRGBA64 image with the given bounds. */
    NewNRGBA64(r: ImageRectangle): ImageNRGBA64;

    /** Creates a new Alpha image with the given bounds. */
    NewAlpha(r: ImageRectangle): ImageAlpha;

    /** Creates a new Alpha16 image with the given bounds. */
    NewAlpha16(r: ImageRectangle): ImageAlpha16;

    /** Creates a new CMYK image with the given bounds. */
    NewCMYK(r: ImageRectangle): ImageCMYK;

    /** Creates a new Gray image with the given bounds. */
    NewGray(r: ImageRectangle): ImageGray;

    /** Creates a new Gray16 image with the given bounds. */
    NewGray16(r: ImageRectangle): ImageGray16;

    /** Creates a new YCbCr image with the given bounds and subsampling ratio. */
    NewYCbCr(r: ImageRectangle, subsampleRatio: ImageYCbCrSubsampleRatio): ImageYCbCr;

    /** Creates a new NYCbCrA image with the given bounds and subsampling ratio. */
    NewNYCbCrA(r: ImageRectangle, subsampleRatio: ImageYCbCrSubsampleRatio): ImageNYCbCrA;

    /** Creates a new Uniform image of the given color. */
    NewUniform(c: ColorPackage): ImageUniform;

    /** Creates a new Paletted image with the given bounds and palette. */
    NewPaletted(r: ImageRectangle, p: ColorPackage[]): ImagePaletted;

    // ── Utility functions ──────────────────────────────────────────────────────

    /** Creates a Rectangle with the given corner coordinates. */
    Rect(x0: number, y0: number, x1: number, y1: number): ImageRectangle;

    /** Creates a Point with the given coordinates. */
    Pt(x: number, y: number): ImagePoint;

    /* UniformBlack is a uniform image of black. */
    readonly UniformBlack: ImageUniform;

    /* UniformWhite is a uniform image of white. */
    readonly UniformWhite: ImageUniform;

    /* UniformTransparent is a uniform image of transparent black. */
    readonly UniformTransparent: ImageUniform;

    /* UniformOpaque is a uniform image of opaque white. */
    readonly UniformOpaque: ImageUniform;

    // ── YCbCr subsampling ratio constants ──────────────────────────────────────

    /** YCbCr 4:4:4 subsampling ratio constant. */
    readonly YCbCrSubsampleRatio444: ImageYCbCrSubsampleRatio;

    /** YCbCr 4:2:2 subsampling ratio constant. */
    readonly YCbCrSubsampleRatio422: ImageYCbCrSubsampleRatio;

    /** YCbCr 4:2:0 subsampling ratio constant. */
    readonly YCbCrSubsampleRatio420: ImageYCbCrSubsampleRatio;

    /** YCbCr 4:4:0 subsampling ratio constant. */
    readonly YCbCrSubsampleRatio440: ImageYCbCrSubsampleRatio;

    /** YCbCr 4:1:1 subsampling ratio constant. */
    readonly YCbCrSubsampleRatio411: ImageYCbCrSubsampleRatio;

    /** YCbCr 4:1:0 subsampling ratio constant. */
    readonly YCbCrSubsampleRatio410: ImageYCbCrSubsampleRatio;
}

/** image.Rectangle instance */
interface ImageRectangle {
    /** Returns the width of the rectangle. */
    Dx(): number;

    /** Returns the height of the rectangle. */
    Dy(): number;

    /** Returns the rectangle's size as a Point. */
    Size(): ImagePoint;

    /** Translates the rectangle by the given point. */
    Add(p: ImagePoint): ImageRectangle;

    /** Translates the rectangle by the negation of the given point. */
    Sub(p: ImagePoint): ImageRectangle;

    /** Returns the smallest rectangle containing both rectangles. */
    Union(s: ImageRectangle): ImageRectangle;

    /** Returns the largest rectangle contained by both rectangles. */
    Intersect(s: ImageRectangle): ImageRectangle;

    /** Returns the rectangle inset by n on each side. */
    Inset(n: number): ImageRectangle;

    /** Reports whether the rectangle is empty. */
    Empty(): boolean;

    /** Reports whether r and s are equal. */
    Eq(s: ImageRectangle): boolean;

    /** Reports whether r overlaps s. */
    Overlaps(s: ImageRectangle): boolean;

    /** Reports whether every point in r is in s. */
    In(s: ImageRectangle): boolean;

    /** Returns the smallest canonical rectangle with the same extent. */
    Canon(): ImageRectangle;

    /** Returns a string representation of the rectangle. */
    String(): string;
}

/** image.Point instance */
interface ImagePoint {
    /** Returns the vector sum of p and q. */
    Add(q: ImagePoint): ImagePoint;

    /** Returns the vector difference of p and q. */
    Sub(q: ImagePoint): ImagePoint;

    /** Returns the vector p scaled by k. */
    Mul(k: number): ImagePoint;

    /** Returns the vector p divided by k. */
    Div(k: number): ImagePoint;

    /** Reports whether p is within r. */
    In(r: ImageRectangle): boolean;

    /** Returns the point q in r closest to p. */
    Mod(r: ImageRectangle): ImagePoint;

    /** Reports whether p and q are equal. */
    Eq(q: ImagePoint): boolean;

    /** Returns a string representation of the point. */
    String(): string;
}

/** image.YCbCrSubsampleRatio instance */
interface ImageYCbCrSubsampleRatio {
    /** Returns a string representation of the subsample ratio. */
    String(): string;
}

/** image.RGBA instance — in-memory image with At method returning color.RGBA values */
interface ImageRGBA {
    /** Returns the RGBA color of the pixel at (x, y). */
    At(x: number, y: number): ColorRGBA;

    /** Returns the specific RGBA color of the pixel at (x, y). */
    RGBAAt(x: number, y: number): ColorRGBA;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the RGBA pixel at (x, y). */
    SetRGBA(x: number, y: number, c: ColorRGBA): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageRGBA;
}

/** image.RGBA64 instance — in-memory image with At method returning color.RGBA64 values */
interface ImageRGBA64 {
    /** Returns the RGBA64 color of the pixel at (x, y). */
    At(x: number, y: number): ColorRGBA64;

    /** Returns the specific RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageNRGBA64;
}

/** image.NRGBA instance — in-memory image with At method returning non-alpha-premultiplied RGBA values */
interface ImageNRGBA {
    /** Returns the NRGBA color of the pixel at (x, y). */
    At(x: number, y: number): ColorNRGBA;

    /** Returns the specific NRGBA color of the pixel at (x, y). */
    NRGBAAt(x: number, y: number): ColorNRGBA;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the NRGBA pixel at (x, y). */
    SetNRGBA(x: number, y: number, c: ColorNRGBA): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageNRGBA;
}

/** image.NRGBA64 instance — in-memory image with At method returning 64-bit non-alpha-premultiplied RGBA values */
interface ImageNRGBA64 {
    /** Returns the NRGBA64 color of the pixel at (x, y). */
    At(x: number, y: number): ColorNRGBA64;

    /** Returns the specific NRGBA64 color of the pixel at (x, y). */
    NRGBA64At(x: number, y: number): ColorNRGBA64;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the NRGBA64 pixel at (x, y). */
    SetNRGBA64(x: number, y: number, c: ColorNRGBA64): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageNRGBA64;
}

/** image.Alpha instance — in-memory image with At method returning color.Alpha values */
interface ImageAlpha {
    /** Returns the Alpha color of the pixel at (x, y). */
    At(x: number, y: number): ColorAlpha;

    /** Returns the specific Alpha color of the pixel at (x, y). */
    AlphaAt(x: number, y: number): ColorAlpha;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the Alpha pixel at (x, y). */
    SetAlpha(x: number, y: number, c: ColorAlpha): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageAlpha;
}

/** image.Alpha16 instance — in-memory image with At method returning color.Alpha16 values */
interface ImageAlpha16 {
    /** Returns the Alpha16 color of the pixel at (x, y). */
    At(x: number, y: number): ColorAlpha16;

    /** Returns the specific Alpha16 color of the pixel at (x, y). */
    Alpha16At(x: number, y: number): ColorAlpha16;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the Alpha16 pixel at (x, y). */
    SetAlpha16(x: number, y: number, c: ColorAlpha16): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageAlpha16;
}

/** image.CMYK instance — in-memory image with At method returning color.CMYK values */
interface ImageCMYK {
    /** Returns the CMYK color of the pixel at (x, y). */
    At(x: number, y: number): ColorCMYK;

    /** Returns the specific CMYK color of the pixel at (x, y). */
    CMYKAt(x: number, y: number): ColorCMYK;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the CMYK pixel at (x, y). */
    SetCMYK(x: number, y: number, c: ColorCMYK): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageCMYK;
}

/** image.Gray instance — in-memory image with At method returning color.Gray values */
interface ImageGray {
    /** Returns the Gray color of the pixel at (x, y). */
    At(x: number, y: number): ColorGray;

    /** Returns the specific Gray color of the pixel at (x, y). */
    GrayAt(x: number, y: number): ColorGray;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the Gray pixel at (x, y). */
    SetGray(x: number, y: number, c: ColorGray): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageGray;
}

/** image.Gray16 instance — in-memory image with At method returning color.Gray16 values */
interface ImageGray16 {
    /** Returns the Gray16 color of the pixel at (x, y). */
    At(x: number, y: number): ColorGray16;

    /** Returns the specific Gray16 color of the pixel at (x, y). */
    Gray16At(x: number, y: number): ColorGray16;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the Gray16 pixel at (x, y). */
    SetGray16(x: number, y: number, c: ColorGray16): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageGray16;
}

/** image.YCbCr instance — in-memory image with At method returning color.YCbCr values */
interface ImageYCbCr {
    /** Returns the YCbCr color of the pixel at (x, y). */
    At(x: number, y: number): ColorYCbCr;

    /** Returns the specific YCbCr color of the pixel at (x, y). */
    YCbCrAt(x: number, y: number): ColorYCbCr;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Returns the index into the Y slice for the pixel at (x, y). */
    YOffset(x: number, y: number): number;

    /** Returns the index into the Cb and Cr slices for the pixel at (x, y). */
    COffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageYCbCr;
}

/** image.NYCbCrA instance — in-memory image with At method returning color.NYCbCrA values */
interface ImageNYCbCrA {
    /** Returns the NYCbCrA color of the pixel at (x, y). */
    At(x: number, y: number): ColorNYCbCrA;

    /** Returns the specific NYCbCrA color of the pixel at (x, y). */
    NYCbCrAAt(x: number, y: number): ColorNYCbCrA;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the index into the alpha slice for the pixel at (x, y). */
    AOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImageNYCbCrA;
}

/** image.Paletted instance — in-memory image with palette-indexed pixels */
interface ImagePaletted {
    /** Returns the color of the pixel at (x, y). */
    At(x: number, y: number): ColorPackage;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image. */
    Bounds(): ImageRectangle;

    /** Sets the pixel at (x, y) to the given color. */
    Set(x: number, y: number, c: ColorPackage): void;

    /** Sets the RGBA64 pixel at (x, y). */
    SetRGBA64(x: number, y: number, c: ColorRGBA64): void;

    /** Returns the palette index of the pixel at (x, y). */
    ColorIndexAt(x: number, y: number): number;

    /** Sets the palette index of the pixel at (x, y). */
    SetColorIndex(x: number, y: number, index: number): void;

    /** Returns the index of the first element of Pix for the pixel at (x, y). */
    PixOffset(x: number, y: number): number;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns a sub-image sharing pixels with the original. */
    SubImage(r: ImageRectangle): ImagePaletted;
}

/** image.Uniform instance — theoretically infinite-sized image of uniform color */
interface ImageUniform {
    /** Returns the color of the pixel at (x, y). */
    At(x: number, y: number): ColorPackage;

    /** Returns the RGBA64 color of the pixel at (x, y). */
    RGBA64At(x: number, y: number): ColorRGBA64;

    /** Returns the bounds of the image (theoretically infinite). */
    Bounds(): ImageRectangle;

    /** Reports whether the image is fully opaque. */
    Opaque(): boolean;

    /** Returns the color's RGBA values as [r, g, b, a]. */
    RGBA(): number[];
}

/** ColorPackage functions and constants (image/color) */
interface ColorPackage {
    // ── Constructors ───────────────────────────────────────────────────────────

    /** Creates a new RGBA color with 8 bits per channel (alpha-premultiplied). */
    NewRGBA(r: number, g: number, b: number, a: number): ColorRGBA;

    /** Creates a new RGBA64 color with 16 bits per channel (alpha-premultiplied). */
    NewRGBA64(r: number, g: number, b: number, a: number): ColorRGBA64;

    /** Creates a new NRGBA color with 8 bits per channel (non-alpha-premultiplied). */
    NewNRGBA(r: number, g: number, b: number, a: number): ColorNRGBA;

    /** Creates a new NRGBA64 color with 16 bits per channel (non-alpha-premultiplied). */
    NewNRGBA64(r: number, g: number, b: number, a: number): ColorNRGBA64;

    /** Creates a new Alpha color with 8-bit alpha channel. */
    NewAlpha(a: number): ColorAlpha;

    /** Creates a new Alpha16 color with 16-bit alpha channel. */
    NewAlpha16(a: number): ColorAlpha16;

    /** Creates a new Gray color with 8-bit luminance. */
    NewGray(y: number): ColorGray;

    /** Creates a new Gray16 color with 16-bit luminance. */
    NewGray16(y: number): ColorGray16;

    /** Creates a new CMYK color with 8 bits per channel. */
    NewCMYK(c: number, m: number, y: number, k: number): ColorCMYK;

    /** Creates a new YCbCr color. */
    NewYCbCr(y: number, cb: number, cr: number): ColorYCbCr;

    /** Creates a new NYCbCrA color (non-alpha-premultiplied Y'CbCr with alpha). */
    NewNYCbCrA(y: number, cb: number, cr: number, a: number): ColorNYCbCrA;

    // ── Conversion functions ───────────────────────────────────────────────────

    /** Converts an RGB triple to a CMYK quadruple. Returns [c, m, y, k]. */
    RGBToCMYK(r: number, g: number, b: number): number[];

    /** Converts a CMYK quadruple to an RGB triple. Returns [r, g, b]. */
    CMYKToRGB(c: number, m: number, y: number, k: number): number[];

    /** Converts an RGB triple to a Y'CbCr triple. Returns [y, cb, cr]. */
    RGBToYCbCr(r: number, g: number, b: number): number[];

    /** Converts a Y'CbCr triple to an RGB triple. Returns [r, g, b]. */
    YCbCrToRGB(y: number, cb: number, cr: number): number[];

    // ── Standard color constants ───────────────────────────────────────────────

    /** Opaque black. */
    readonly Black: ColorGray16;

    /** Opaque white. */
    readonly White: ColorGray16;

    /** Fully transparent color. */
    readonly Transparent: ColorAlpha16;

    /** Fully opaque color. */
    readonly Opaque: ColorAlpha16;
}

/** ColorRGBA instance — traditional 32-bit alpha-premultiplied color, 8 bits per channel */
interface ColorRGBA {
    /** Red channel [0, 255]. */
    readonly R: number;

    /** Green channel [0, 255]. */
    readonly G: number;

    /** Blue channel [0, 255]. */
    readonly B: number;

    /** Alpha channel [0, 255]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorRGBA64 instance — 64-bit alpha-premultiplied color, 16 bits per channel */
interface ColorRGBA64 {
    /** Red channel [0, 65535]. */
    readonly R: number;

    /** Green channel [0, 65535]. */
    readonly G: number;

    /** Blue channel [0, 65535]. */
    readonly B: number;

    /** Alpha channel [0, 65535]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorNRGBA instance — non-alpha-premultiplied 32-bit color, 8 bits per channel */
interface ColorNRGBA {
    /** Red channel [0, 255]. */
    readonly R: number;

    /** Green channel [0, 255]. */
    readonly G: number;

    /** Blue channel [0, 255]. */
    readonly B: number;

    /** Alpha channel [0, 255]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorNRGBA64 instance — non-alpha-premultiplied 64-bit color, 16 bits per channel */
interface ColorNRGBA64 {
    /** Red channel [0, 65535]. */
    readonly R: number;

    /** Green channel [0, 65535]. */
    readonly G: number;

    /** Blue channel [0, 65535]. */
    readonly B: number;

    /** Alpha channel [0, 65535]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorAlpha instance — 8-bit alpha color */
interface ColorAlpha {
    /** Alpha channel [0, 255]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorAlpha16 instance — 16-bit alpha color */
interface ColorAlpha16 {
    /** Alpha channel [0, 65535]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorGray instance — 8-bit grayscale color */
interface ColorGray {
    /** Luminance [0, 255]. */
    readonly Y: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorGray16 instance — 16-bit grayscale color */
interface ColorGray16 {
    /** Luminance [0, 65535]. */
    readonly Y: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorCMYK instance — fully opaque CMYK color, 8 bits per channel */
interface ColorCMYK {
    /** Cyan channel [0, 255]. */
    readonly C: number;

    /** Magenta channel [0, 255]. */
    readonly M: number;

    /** Yellow channel [0, 255]. */
    readonly Y: number;

    /** Black channel [0, 255]. */
    readonly K: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** ColorYCbCr instance — Y'CbCr color, 8 bits per channel. Used by JPEG, VP8, MPEG. */
interface ColorYCbCr {
    /** Luma component [0, 255]. */
    readonly Y: number;

    /** Blue-difference chroma component [0, 255]. */
    readonly Cb: number;

    /** Red-difference chroma component [0, 255]. */
    readonly Cr: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** color.NYCbCrA instance — non-alpha-premultiplied Y'CbCr with alpha, 8 bits per channel */
interface ColorNYCbCrA {
    /** Luma component [0, 255]. */
    readonly Y: number;

    /** Blue-difference chroma component [0, 255]. */
    readonly Cb: number;

    /** Red-difference chroma component [0, 255]. */
    readonly Cr: number;

    /** Alpha channel [0, 255]. */
    readonly A: number;

    /** Returns alpha-premultiplied r, g, b, a values in range [0, 65535]. */
    RGBA(): number[];
}

/** color.Palette instance — a palette of colors */
interface ColorPalette {
    /** Returns the palette color closest to c in Euclidean R,G,B space. */
    Convert(c: Color): Color;

    /** Returns the index of the palette color closest to c in Euclidean R,G,B,A space. */
    Index(c: Color): number;
}

/** Destructuring result of go.All() */
interface GoAllResult {
    color: ColorPackage;
    image: ImagePackage;
    http: Http;
    kvStore: KvStore;
    log: Logger;
    time: TimePackage;
    utils: Utils;
    yolo: Yolo;
    dsp: DSP;
}

/** Root Go() instance */
interface GoRoot {
    /** Returns all package instances for destructuring */
    All(): GoAllResult;

    /** Instance to give access to color package */
    Color(): ColorPackage;

    /** Instance to give access to image package */
    Image(): ImagePackage;

    /** Instance to give access to http package */
    Http(): Http;

    /** Instance to give access to kvstore package */
    KvStore(): KvStore;

    /** Instance to give access to log package */
    Logger(): Logger;

    /** Instance to give access to time package */
    Time(): TimePackage;

    /** Instance to give access to utils package */
    Utils(): Utils;

    /** Instance to give access to yolo package */
    Yolo(): Yolo;

    /** Instance to give access to DSP package */
    Dsp(): DSP;
}

/** Creates the root Go instance */
declare function Go(): GoRoot;

// ─── Entry point function signatures ─────────────────────────────────────────
// Declaring these globally lets the TS Language Service type the `msg`
// parameter automatically when the user writes function process(msg) { ... }

declare function process(msg: Message): any;
declare function start(): void;
declare function init(): void;
