/**
 * Shared types between main, renderer, and the media-host utilityProcess.
 *
 * The communication shape:
 *   - Renderer requests a job → main.ipc → media-host
 *   - Each job gets a dedicated MessageChannel; main brokers the handshake,
 *     then renderer ↔ utility talk directly over the MessagePort.
 *   - The same shape will host AutoCut, silence removal, captions, compression
 *     in later phases — just new `kind` values.
 */

export type JobKind =
  | 'probe'
  | 'compress'
  | 'silence-analyze'
  | 'multicam-analyze'
  | 'caption-render'
  | 'vertical-export'
  | 'remove-background'

export interface JobSpec_Probe {
  kind: 'probe'
  path: string
}

export type CompressionQuality = 'high' | 'balanced' | 'fast'
export type HevcEncoder =
  | 'auto'
  | 'hevc_nvenc'
  | 'hevc_videotoolbox'
  | 'hevc_amf'
  | 'hevc_qsv'
  | 'libx265'

export interface JobSpec_Compress {
  kind: 'compress'
  inputPath: string
  outputPath: string
  encoder: HevcEncoder // 'auto' resolves inside the worker
  quality: CompressionQuality
}

export interface JobSpec_SilenceAnalyze {
  kind: 'silence-analyze'
  inputPath: string
  /** Threshold in dB below which is silence (default -40). */
  thresholdDb: number
  /** Minimum silence duration in seconds (default 0.5). */
  minSilenceSec: number
  /** Padding kept around speech segments in seconds (default 0.1). */
  paddingSec: number
}

export interface JobSpec_MulticamAnalyze {
  kind: 'multicam-analyze'
  /** One audio path per camera. Order is preserved as the camera index. */
  tracks: Array<{ path: string; label: string }>
  thresholdDb: number
  /** Minimum silence between speech segments. */
  minSilenceSec: number
  /** Stay on a camera at least this long. */
  holdSec: number
  /** Padding around speech segments. */
  paddingSec: number
  /**
   * Variation slider (0–100). Injects gaussian-distributed jitter onto shot
   * boundaries so cuts feel human-edited rather than mechanically uniform.
   * 0 = strict, 100 = heavy stylized.
   */
  variationPct?: number
  /** Maximum length of a single shot before forcing a cut. Seconds. */
  maxCameraSec?: number
  /** Minimum length of any shot — overrides holdSec when lower. Seconds. */
  minCameraSec?: number
  /**
   * Track index designated as the "wide" / group camera, used whenever no
   * single speaker is dominant or when a long shot is forcibly broken up.
   * -1 (default) = no wide assigned.
   */
  wideCameraIndex?: number
}

/** Transparent caption track (.mov) vs captions baked onto the source (.mp4). */
export type CaptionRenderTarget = 'overlay' | 'burnin'

export interface JobSpec_CaptionRender {
  kind: 'caption-render'
  /** Directory of pre-rendered frame_%06d.png frames (written by the renderer). */
  framesDir: string
  outputPath: string
  target: CaptionRenderTarget
  fps: number
  width: number
  height: number
  totalFrames: number
  /** Source video composited under the captions for burn-in (ignored for overlay). */
  sourcePath?: string
}

/** Axis-aligned region in source-video pixel space. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Vertical (9:16) layouts, Twitch-clip style:
 *   'full'    — one region fills the whole output frame.
 *   'stacked' — facecam in one slot, screen/gameplay in the other, vstacked.
 */
export type VerticalLayout = 'full' | 'stacked'

export interface JobSpec_VerticalExport {
  kind: 'vertical-export'
  inputPath: string
  outputPath: string
  /** Output frame size, e.g. 1080 × 1920. */
  outWidth: number
  outHeight: number
  layout: VerticalLayout
  /** Region that fills the frame ('full') or the screen slot ('stacked'). */
  screen: CropRect
  /** Facecam region — required when layout is 'stacked'. */
  camera?: CropRect
  /** Output rows the camera slot occupies (stacked only); screen gets the rest. */
  cameraOutHeight?: number
  /** Where the camera slot sits in the output frame. Default 'bottom'. */
  cameraPosition?: 'top' | 'bottom'
  /**
   * Separate webcam file, for sources where the facecam isn't already
   * composited into `inputPath` (e.g. OBS multi-track recordings). When set,
   * `camera` crops this file instead of `inputPath`.
   */
  cameraInputPath?: string
  /**
   * Seconds into `cameraInputPath` that line up with t=0 of `inputPath`.
   * Positive when the camera recording started earlier than the screen
   * recording; negative when it started later. Ignored unless
   * `cameraInputPath` is set.
   */
  cameraOffsetSec?: number
  /** Which input supplies the output audio track when `cameraInputPath` is set. Default 'screen'. */
  audioSource?: 'screen' | 'camera'
}

/** Local, on-device background removal (@imgly/background-removal-node —
 *  bundled ISNet matting model, no network, no cloud API key). */
export interface JobSpec_RemoveBackground {
  kind: 'remove-background'
  /** Source image as a data URL (data:image/...;base64,...). */
  imageDataUrl: string
  /** Post-process feather on the cutout edge, 0–100 (0 = crisp, default). */
  edgeSoftness?: number
}

export type JobSpec =
  | JobSpec_Probe
  | JobSpec_Compress
  | JobSpec_SilenceAnalyze
  | JobSpec_MulticamAnalyze
  | JobSpec_CaptionRender
  | JobSpec_VerticalExport
  | JobSpec_RemoveBackground

// Messages sent from main → media-host on the inbound port
export type WorkerInbound =
  | { type: 'enqueue'; jobId: string; spec: JobSpec }
  | { type: 'cancel'; jobId: string }

// Messages sent from media-host → renderer on the outbound port (per job)
export type WorkerOutbound =
  | { type: 'progress'; jobId: string; ratio: number; note?: string }
  | { type: 'done'; jobId: string; result: JobResult }
  | { type: 'error'; jobId: string; message: string }
  | { type: 'aborted'; jobId: string }

export type JobResult =
  | ProbeResult
  | CompressResult
  | SilenceAnalyzeResult
  | MulticamAnalyzeResult
  | CaptionRenderResult
  | VerticalExportResult
  | RemoveBackgroundResult

export interface RemoveBackgroundResult {
  kind: 'remove-background'
  /** Cutout PNG (transparent background) as a data URL. */
  imageDataUrl: string
  elapsedMs: number
}

export interface VerticalExportResult {
  kind: 'vertical-export'
  inputPath: string
  outputPath: string
  outputBytes: number
  encoderUsed: string
  elapsedMs: number
}

export interface CaptionRenderResult {
  kind: 'caption-render'
  outputPath: string
  target: CaptionRenderTarget
  outputBytes: number
  encoderUsed: string
  elapsedMs: number
}

export interface MulticamShot {
  startSec: number
  endSec: number
  /** Index into the input tracks array. -1 = no active speaker. */
  trackIndex: number
  trackLabel: string
}

export interface MulticamTrackStats {
  trackIndex: number
  label: string
  path: string
  totalSilenceSec: number
  totalSpeechSec: number
}

export interface MulticamAnalyzeResult {
  kind: 'multicam-analyze'
  totalDurationSec: number
  tracks: MulticamTrackStats[]
  shots: MulticamShot[]
}

export interface CompressResult {
  kind: 'compress'
  inputPath: string
  outputPath: string
  inputBytes: number
  outputBytes: number
  /** Compression ratio in % (positive = file got smaller). */
  ratioPct: number
  elapsedMs: number
  encoderUsed: Exclude<HevcEncoder, 'auto'>
  encoderLabel: string
  isHardwareAccelerated: boolean
  fallbackUsed: boolean
}

export interface SilenceSegment {
  startSec: number
  endSec: number
  durationSec: number
}

export interface SilenceAnalyzeResult {
  kind: 'silence-analyze'
  inputPath: string
  /** Total duration analyzed. */
  totalDurationSec: number
  /** Silent regions detected (after padding/min-duration filters). */
  silences: SilenceSegment[]
  /** Speech regions (the complement of silences, with padding). */
  keep: SilenceSegment[]
  totalSilenceSec: number
}

export interface ProbeStream {
  index: number
  codec_type: 'video' | 'audio' | 'subtitle' | 'data' | 'other'
  codec_name: string | null
  width: number | null
  height: number | null
  frame_rate: number | null // computed from r_frame_rate fraction
  channels: number | null
  sample_rate: number | null
}

export interface ProbeResult {
  kind: 'probe'
  path: string
  durationSec: number | null
  sizeBytes: number | null
  bitrate: number | null
  formatName: string | null
  streams: ProbeStream[]
}
