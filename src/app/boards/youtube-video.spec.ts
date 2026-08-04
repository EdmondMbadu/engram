import { youtubePrivacyEmbedUrl, youtubeVideoIdFromReference, youtubeWatchUrl } from './youtube-video';

describe('YouTube video references', () => {
  const id = 'M7lc1UVf-VE';

  it('accepts supported YouTube URL shapes', () => {
    expect(youtubeVideoIdFromReference(id)).toBe(id);
    expect(youtubeVideoIdFromReference(`https://www.youtube.com/watch?v=${id}&t=12`)).toBe(id);
    expect(youtubeVideoIdFromReference(`https://youtu.be/${id}`)).toBe(id);
    expect(youtubeVideoIdFromReference(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(youtubeVideoIdFromReference(`https://www.youtube.com/embed/${id}`)).toBe(id);
  });

  it('rejects arbitrary and malformed references', () => {
    expect(youtubeVideoIdFromReference('https://example.com/watch?v=M7lc1UVf-VE')).toBe('');
    expect(youtubeVideoIdFromReference('javascript:alert(1)')).toBe('');
    expect(youtubeVideoIdFromReference('too-short')).toBe('');
  });

  it('builds fixed-origin watch and privacy-enhanced embed URLs', () => {
    expect(youtubeWatchUrl(id)).toBe(`https://www.youtube.com/watch?v=${id}`);
    expect(youtubePrivacyEmbedUrl(id)).toContain(`https://www.youtube-nocookie.com/embed/${id}`);
    expect(youtubePrivacyEmbedUrl(id)).toContain('autoplay=1');
  });
});
