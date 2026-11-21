import type { ReactElement } from 'react';
import type { Tool } from '../studio/tools.tsx';
import { phonePhoto } from './photo/PhonePhoto.tsx';
import { phoneVideo } from './video/PhoneVideo.tsx';

/**
 * Phone editors by Studio tool slug. A tool with no entry renders its desktop
 * component inside the phone's full-screen frame. Later steps add entries:
 *
 *   PHONE_TOOLS.photo = () => <PhonePhoto />;
 *
 * (or edit this object directly). Entries are called on every render of the
 * frame, so they should return a cheap element.
 */
export const PHONE_TOOLS: Record<string, () => ReactElement> = { photo: phonePhoto, video: phoneVideo };

/** The element to show for a tool on a phone. */
export const phoneElementFor = (tool: Tool): ReactElement => (PHONE_TOOLS[tool.slug] ?? tool.element)();
