/**
 * The speech models offered, and what is known about each.
 *
 * `wer` is the word error rate (%) the Whisper paper reports for each model
 * size on read speech in the FLEURS test set (Radford et al., "Robust Speech
 * Recognition via Large-Scale Weak Supervision", Table 13,
 * https://cdn.openai.com/papers/whisper.pdf). Real recordings - music, noise,
 * several speakers - do worse, and the page runs the 8-bit quantised files,
 * which the paper did not measure.
 *
 * `downloadMb` is the size of the two quantised files the browser fetches
 * (encoder_model_quantized + decoder_model_merged_quantized) from the
 * onnx-community repositories on Hugging Face, read from the repositories'
 * file listings. Whisper's code and weights are MIT-licensed
 * (https://github.com/openai/whisper/blob/main/LICENSE).
 */

export type Lang = 'en' | 'ru' | 'uk';

export interface WhisperModel {
  id: 'base' | 'small';
  label: string;
  repo: string;
  downloadMb: number;
  wer: Record<Lang, number>;
}

export const MODELS: WhisperModel[] = [
  { id: 'base', label: 'Base - quicker, rougher', repo: 'onnx-community/whisper-base', downloadMb: 73, wer: { en: 8.9, ru: 20.5, uk: 37.7 } },
  { id: 'small', label: 'Small - slower, better', repo: 'onnx-community/whisper-small', downloadMb: 238, wer: { en: 6.1, ru: 11.4, uk: 19.3 } },
];

/** Whisper's own names for the languages (transformers.js: models/whisper/common_whisper.js). */
export const WHISPER_LANGUAGE: Record<Lang, string> = { en: 'english', ru: 'russian', uk: 'ukrainian' };
