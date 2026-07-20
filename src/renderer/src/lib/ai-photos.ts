/**
 * Renderer-side AI Photos constants. Mirrors lib/ai-photos-constants.ts
 * from the webapp so the desktop sends identical model/aspect/size +
 * preset prompts. Update both sides together when the webapp changes.
 */
import {
  Lightbulb, Sparkles, SmilePlus, PartyPopper, CircleAlert, Focus,
  Frown, Eye, Hand, ShieldAlert, Star, Brain, ScanEye, EyeOff,
  AlertOctagon, Trophy, ThumbsDown, Laugh,
} from 'lucide-react'

// Keep in sync with the webapp's lib/ai-photos-constants.ts. Every id here
// must also be whitelisted in app/api/generate-reaction/route.ts (ALLOWED_MODELS).
export const IMAGE_MODELS = [
  { id: 'google/gemini-3.1-flash-image', label: 'Gemini 3.1 Flash' },
  { id: 'google/gemini-3-pro-image', label: 'Gemini 3 Pro' },
  { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash' },
  { id: 'openai/gpt-5-image', label: 'ChatGPT (GPT-5)' },
  { id: 'openai/gpt-5-image-mini', label: 'ChatGPT Mini' },
  { id: 'openai/gpt-5.4-image-2', label: 'ChatGPT (GPT-5.4)' },
] as const

export type ImageModelId = (typeof IMAGE_MODELS)[number]['id']

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'google/gemini-3.1-flash-image'

export const ASPECT_RATIOS = [
  '21:9', '16:9', '3:2', '5:4', '4:3',
  '1:1', '3:4', '4:5', '2:3', '9:16',
] as const
export type AspectRatioValue = (typeof ASPECT_RATIOS)[number]
export const DEFAULT_ASPECT_RATIO: AspectRatioValue = '16:9'

export const IMAGE_SIZES = ['1K', '2K', '4K'] as const
export type ImageSizeValue = (typeof IMAGE_SIZES)[number]
export const DEFAULT_IMAGE_SIZE: ImageSizeValue = '1K'

export const MODEL_CAPABILITIES: Record<string, { supportsImageSize: boolean }> = {
  'google/gemini-3.1-flash-image': { supportsImageSize: true },
  'google/gemini-3-pro-image': { supportsImageSize: true },
  'google/gemini-2.5-flash-image': { supportsImageSize: false },
  'openai/gpt-5-image': { supportsImageSize: false },
  'openai/gpt-5-image-mini': { supportsImageSize: false },
  'openai/gpt-5.4-image-2': { supportsImageSize: false },
}

// One-click outpainting prompt: turns a horizontal 16:9 YouTube thumbnail into
// a 9:16 Shorts/Reels/TikTok thumbnail without cropping the subject. Mirror of
// the webapp's VERTICAL_THUMBNAIL_PROMPT — update both together.
export const VERTICAL_THUMBNAIL_PROMPT =
  'Reframe this horizontal 16:9 YouTube thumbnail into a vertical 9:16 image for YouTube Shorts, TikTok, and Reels. Keep the main subject, faces, and any large title text fully visible, sharp, and centered — never crop, cut off, or distort the subject or text. Intelligently extend the existing background upward and downward to fill the taller vertical canvas, seamlessly matching the original colors, lighting, textures, and art style with no visible seams, borders, or repetition. Keep the original focal point centered in the frame. Output a single high-quality vertical image.'

const BASE_INSTRUCTIONS =
  'Keep the subject exactly the same, without cropping or distortion. Extend the background seamlessly in a photorealistic way, matching the original style, details, colors, lighting, and textures. Ensure smooth blending with no visible edges, borders, or repetition.'

export const REACTION_PRESETS = [
  {
    id: 'curious',
    label: 'Curious / Thinking',
    icon: Lightbulb,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. Their head is slightly tilted, and one hand is thoughtfully placed on their chin with eyebrows raised in a curious expression as they explore an idea. Their upper body is visible from the chest up, with both shoulders in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct eye contact with the camera. The background is a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'mindblown',
    label: 'Mind-Blown',
    icon: Sparkles,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. Their eyes are wide with astonishment and both hands are on the sides of their head in a 'mind-blown' gesture. Their upper body is visible from the chest up, with both shoulders in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct eye contact with the camera. The background is a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'confident',
    label: 'Confident / Smirk',
    icon: SmilePlus,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a confident smirk on their face and one eyebrow is slightly raised in a knowing look. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'excited',
    label: 'Excited / Happy',
    icon: PartyPopper,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a natural, big, and excited smile, with their eyes wide and bright. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'surprised',
    label: 'Surprised / Impressed',
    icon: CircleAlert,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have an expression of being impressed, with wide eyes and their mouth slightly open in surprise. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'focused',
    label: 'Focused / Serious',
    icon: Focus,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a focused and serious expression with a straight face and intense eyes. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'confused',
    label: 'Confused / Frustrated',
    icon: Frown,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a confused and frustrated expression, with their brows furrowed and a slight frown on their face. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'suspicious',
    label: 'Suspicious / Skeptical',
    icon: Eye,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a skeptical expression, with one eyebrow raised and their eyes giving a slight side-eye glance toward the camera. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'pointing',
    label: 'Pointing Reaction',
    icon: Hand,
    prompt: `A medium close-up portrait of the subject from the reference image, centered in the frame. With an engaging expression, they are pointing their index finger directly forward toward the camera, as if highlighting a key piece of information. Their upper body is visible from the chest up, with both shoulders in the shot. Their hair and clothing are complete and well-defined. They are making direct eye contact. The background is a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'secret',
    label: '"Secret Hack" Look',
    icon: ShieldAlert,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a slight, knowing smile and are holding one index finger to their lips in a 'secret' or 'shushing' gesture. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'excited-hands-cheeks',
    label: 'Excited - Hands on Cheeks',
    icon: Star,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have an extremely excited and delighted expression with wide eyes and a big smile. Both of their hands are placed on their cheeks in an amazed, overwhelmed gesture, as if they just heard incredible news. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'thinking-chin',
    label: 'Thinking - Hand on Chin',
    icon: Brain,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a thoughtful, contemplative expression with one hand gently resting on their chin, fingers along their jawline, as if deeply considering something important. Their eyes are focused and engaged. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'thinking-thumb-camera',
    label: 'Thinking - Thumb on Head (Looking)',
    icon: ScanEye,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a pensive, analytical expression with their thumb resting on the side of their head or temple, as if processing complex information. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera with an engaged, thoughtful gaze. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'thinking-thumb-away',
    label: 'Thinking - Thumb on Head (Away)',
    icon: EyeOff,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a deeply contemplative expression with their thumb resting on the side of their head or temple, appearing lost in thought. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are NOT looking at the camera - instead, their gaze is directed to the side or slightly downward, as if pondering something privately. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'shocked-horror',
    label: 'Shocked / Horror',
    icon: AlertOctagon,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a shocked and horrified expression with extremely wide eyes and mouth open in disbelief. Both hands are covering their mouth or placed on their cheeks in a gasping, shocked gesture, as if witnessing something unbelievable or scary. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'victory-celebrating',
    label: 'Victory / Celebrating',
    icon: Trophy,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a triumphant, victorious expression with a huge genuine smile and bright, excited eyes. One or both arms are raised up in a celebrating victory gesture with fists pumped or arms in the air, expressing pure joy and achievement. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'disappointed-sad',
    label: 'Disappointed / Sad',
    icon: ThumbsDown,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a disappointed and sad expression with downturned lips in a pout or frown, and eyes that convey sadness or letdown. Their eyebrows may be slightly furrowed in disappointment. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward, making direct and clear eye contact with the camera with a melancholic gaze. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
  {
    id: 'laughing-joy',
    label: 'Laughing / Joyful',
    icon: Laugh,
    prompt: `A medium close-up portrait of the subject from the reference image, perfectly centered. They have a genuine, hearty laughing expression with their mouth wide open in laughter, eyes crinkled with joy, and head may be slightly tilted back naturally in the moment of laughter. Their expression radiates pure happiness and infectious joy. Their upper body is completely visible from the chest up, with both shoulders fully rendered and in the shot. Their hair and clothing are complete and well-defined. They are looking forward or slightly upward, expressing uncontained laughter and delight. The entire background is replaced with a solid, light gray, neutral color. Expand the background to fill the extra space. ${BASE_INSTRUCTIONS}`,
  },
] as const

/** Strip `data:image/<type>;base64,` prefix to match the API contract. */
export function stripBase64Prefix(s: string): string {
  return s.replace(/^data:image\/[a-zA-Z+]+;base64,/, '')
}

/** Read a File to a base64 string (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('file-read-failed'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') return reject(new Error('file-read-not-string'))
      resolve(stripBase64Prefix(result))
    }
    reader.readAsDataURL(file)
  })
}
