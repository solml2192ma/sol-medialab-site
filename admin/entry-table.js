import 'https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js';

globalThis.CMS?.registerStringTransformation?.('photo_count', (gallery, { args: [cover] }) => {
  const photos = Array.isArray(gallery) ? gallery : String(gallery ?? '').split(',');
  const additionalCount = photos.filter((photo) => String(photo ?? '').trim()).length;
  return String(additionalCount + (String(cover ?? '').trim() ? 1 : 0));
});
