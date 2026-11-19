/**
 * A made-up shop sign, drawn on the spot, so the editor can be tried without a
 * photo of your own. Nothing is downloaded; it is painted on a canvas.
 */
export async function samplePicture(): Promise<File> {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 800;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#285a78';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1d4560';
  ctx.fillRect(0, 560, c.width, 240);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 96px Helvetica, Arial, sans-serif';
  ctx.fillText('GRAND OPENING', 110, 190);
  ctx.fillStyle = '#ffd878';
  ctx.font = '400 78px Helvetica, Arial, sans-serif';
  ctx.fillText('Welcome to our shop', 110, 370);
  ctx.fillStyle = '#ffffff';
  ctx.font = '400 52px Helvetica, Arial, sans-serif';
  ctx.fillText('Open every day, 9 to 5', 110, 620);
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The sample could not be made.'))), 'image/png'));
  return new File([blob], 'sample-sign.png', { type: 'image/png' });
}
