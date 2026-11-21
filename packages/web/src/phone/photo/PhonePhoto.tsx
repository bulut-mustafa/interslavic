import type { ReactElement } from 'react';
import PhotoEditor from '../../photo/PhotoEditor.tsx';

/**
 * The Photo tool on a phone: the desktop editor's pages, history, saved copy (the same IndexedDB keys, so work saved on a computer opens
 * here), Live Text, cut-out and export, with the phone layout (`phone` prop; see phone/photo/PhonePageView.tsx) instead of the side panels.
 */
export default function PhonePhoto() {
  return <PhotoEditor phone />;
}

/** What phone/registry.ts registers for the `photo` tool. */
export const phonePhoto = (): ReactElement => <PhonePhoto />;
