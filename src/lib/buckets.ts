// Centralized Supabase Storage bucket names (with defaults). The buckets must
// already exist in Supabase and be public.
export const buckets = {
    avatars: process.env.STORAGE_BUCKET ?? 'avatars',
    courseBanners: process.env.BANNER_BUCKET ?? 'course-banners',
    newsBanners: process.env.NEWS_BANNER_BUCKET ?? 'news-banners',
};
