export const fetcher = async (url: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error('An error occurred while fetching the data.');
    }
    return await res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};
